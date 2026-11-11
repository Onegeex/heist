//! HeistBank tests: every way to rob a vault outside the rules, plus the
//! money rules (rising fee, 70/20/10 split, countdown, sponsors, patches).
use super::*;
use ed25519_dalek::{Signer, SigningKey};
use near_sdk::test_utils::{get_created_receipts, VMContextBuilder};
use near_sdk::{testing_env, PromiseResult};

const BANK: &str = "heist-bank.testnet";
const OWNER: &str = "owner.testnet";
const ALICE: &str = "alice.testnet";
const MALLORY: &str = "mallory.testnet";
const SPONSOR: &str = "acme-ai.testnet";
const NEAR: u128 = 10u128.pow(24);
const MS: u64 = 1_000_000;
const HOUR_MS: u64 = 3_600_000;
const T0: u64 = 1_763_000_000 * 1_000_000_000;

fn acc(s: &str) -> AccountId {
    s.parse().unwrap()
}
fn guardian() -> SigningKey {
    SigningKey::from_bytes(&[7u8; 32])
}
fn guardian2() -> SigningKey {
    SigningKey::from_bytes(&[8u8; 32])
}
fn impostor() -> SigningKey {
    SigningKey::from_bytes(&[9u8; 32])
}
fn pk(k: &SigningKey) -> Base64VecU8 {
    Base64VecU8(k.verifying_key().to_bytes().to_vec())
}
fn hash(n: u8) -> Base64VecU8 {
    Base64VecU8(vec![n; 32])
}

fn ctx(caller: &str, deposit: u128, ts: u64) {
    let mut b = VMContextBuilder::new();
    b.current_account_id(acc(BANK))
        .predecessor_account_id(acc(caller))
        .signer_account_id(acc(caller))
        .attached_deposit(NearToken::from_yoctonear(deposit))
        .account_balance(NearToken::from_near(10_000))
        .block_timestamp(ts);
    testing_env!(b.build());
}

fn config(name: &str) -> VaultConfig {
    VaultConfig {
        name: name.into(),
        base_fee: U128(NEAR / 10),
        fee_bps: 100, // 1% of pot
        max_payout: U128(5 * NEAR),
        countdown_ms: U64(24 * HOUR_MS),
        max_daily: 3,
    }
}

/// Bank with vault 1 ("Teller", guardian 1, pot ~20 NEAR) and vault 2 ("Gold", guardian 2, pot ~50 NEAR).
fn bank() -> HeistBank {
    ctx(OWNER, 0, T0);
    let mut b = HeistBank::new(acc(OWNER), pk(&guardian()));
    ctx(OWNER, 20 * NEAR, T0);
    b.create_vault(config("Teller"), hash(1), None);
    ctx(OWNER, 50 * NEAR, T0);
    let mut gold = config("Gold");
    gold.max_payout = U128(10 * NEAR);
    b.create_vault(gold, hash(2), Some(pk(&guardian2())));
    b
}

fn sign(k: &SigningKey, vault: u32, round: u32, id: u64, player: &str) -> Base64VecU8 {
    let msg = release_message(&acc(BANK), vault, round, id, &acc(player));
    Base64VecU8(k.sign(msg.as_bytes()).to_bytes().to_vec())
}

fn open(b: &mut HeistBank, vault: u32, who: &str, ts: u64) -> u64 {
    ctx(who, 0, ts);
    let fee = b.current_fee(vault).0;
    ctx(who, fee, ts);
    b.open_attempt(vault).id.0
}

fn pot(b: &HeistBank, v: u32) -> u128 {
    b.get_vault(v).unwrap().pot.0
}

// ---------------- economics ----------------

#[test]
fn split_constants_add_up() {
    assert_eq!(POT_BPS + ROLLOVER_BPS + HOUSE_BPS, BPS);
}

#[test]
fn fee_rises_with_the_pot() {
    let mut b = bank();
    let f1 = b.current_fee(1).0; // 1% of ~20 NEAR, above the 0.1 base
    assert!(f1 > NEAR / 10 && f1 < NEAR / 4, "fee {f1}");
    ctx(OWNER, 30 * NEAR, T0);
    b.seed(1);
    let f2 = b.current_fee(1).0;
    assert!(f2 > f1 * 2, "fee should grow with the pot");
}

#[test]
fn fee_never_below_base() {
    ctx(OWNER, 0, T0);
    let mut b = HeistBank::new(acc(OWNER), pk(&guardian()));
    ctx(OWNER, NEAR, T0);
    b.create_vault(config("Small"), hash(1), None);
    assert_eq!(b.current_fee(1).0, NEAR / 10);
}

#[test]
fn fee_split_70_pot_20_rollover_10_house() {
    let mut b = bank();
    let p0 = pot(&b, 1);
    let fee = b.current_fee(1).0;
    open(&mut b, 1, ALICE, T0);
    let v = b.get_vault(1).unwrap();
    let to_pot = v.pot.0 - p0;
    let roll = v.rollover.0;
    let house = b.get_treasury().0;
    let net = to_pot + roll + house;
    assert!(net < fee && fee - net < NEAR / 100, "storage is the only leak");
    assert_eq!(house, net * 1_000 / 10_000);
    assert_eq!(roll, net * 2_000 / 10_000);
}

#[test]
fn overpaying_is_refunded() {
    let mut b = bank();
    let fee = b.current_fee(1).0;
    ctx(ALICE, fee + 3 * NEAR, T0);
    let a = b.open_attempt(1);
    assert_eq!(a.fee.0, fee);
    let refunds = get_created_receipts();
    assert_eq!(refunds.len(), 1, "one refund transfer");
    assert_eq!(refunds[0].receiver_id, acc(ALICE));
}

#[test]
#[should_panic(expected = "ENTRY_FEE")]
fn underpaying_rejected() {
    let mut b = bank();
    let fee = b.current_fee(1).0;
    ctx(ALICE, fee - 1, T0);
    b.open_attempt(1);
}

#[test]
fn win_pays_capped_and_next_round_gets_rest_plus_rollover() {
    let mut b = bank();
    let id = open(&mut b, 1, ALICE, T0);
    let v = b.get_vault(1).unwrap();
    let (pot_before, roll) = (v.pot.0, v.rollover.0);
    ctx(ALICE, 0, T0 + 1);
    let _ = b.claim(U64(id), sign(&guardian(), 1, 1, id, ALICE));
    let v = b.get_vault(1).unwrap();
    assert_eq!(v.round, 2);
    assert_eq!(v.pot.0, pot_before - 5 * NEAR + roll);
    assert_eq!(v.rollover.0, 0);
    assert_eq!(v.total_paid.0, 5 * NEAR);
    assert_eq!(v.last_winner, Some(acc(ALICE)));
    assert!(v.last_challenger.is_none() && v.last_attempt_at.is_none());
}

#[test]
fn treasury_is_the_only_thing_the_owner_can_withdraw() {
    let mut b = bank();
    open(&mut b, 1, ALICE, T0);
    let t = b.get_treasury().0;
    ctx(OWNER, 0, T0 + 1);
    let _ = b.withdraw_treasury(U128(t));
    assert_eq!(b.get_treasury().0, 0);
}

#[test]
#[should_panic(expected = "TREASURY")]
fn owner_cannot_withdraw_more_than_treasury() {
    let mut b = bank();
    open(&mut b, 1, ALICE, T0);
    let t = b.get_treasury().0;
    ctx(OWNER, 0, T0 + 1);
    let _ = b.withdraw_treasury(U128(t + 1));
}

#[test]
#[should_panic(expected = "OWNER_ONLY")]
fn player_cannot_withdraw_treasury() {
    let mut b = bank();
    open(&mut b, 1, ALICE, T0);
    ctx(MALLORY, 0, T0 + 1);
    let _ = b.withdraw_treasury(U128(1));
}

// ---------------- countdown ----------------

#[test]
fn countdown_pays_last_challenger_20_percent() {
    let mut b = bank();
    open(&mut b, 1, MALLORY, T0);
    open(&mut b, 1, ALICE, T0 + 1000);
    let v = b.get_vault(1).unwrap();
    let (p, roll) = (v.pot.0, v.rollover.0);
    ctx(MALLORY, 0, T0 + 1000 + 24 * HOUR_MS * MS + 1);
    let _ = b.time_out(1); // anyone can trigger it
    let v = b.get_vault(1).unwrap();
    let share = p * 2_000 / 10_000; // 20%, under the 5 NEAR cap
    assert_eq!(v.pot.0, p - share + roll);
    assert_eq!(v.round, 2);
    let r = get_created_receipts();
    assert_eq!(r[0].receiver_id, acc(ALICE), "last challenger is paid, not the caller");
}

#[test]
#[should_panic(expected = "NOT_YET")]
fn countdown_cannot_be_triggered_early() {
    let mut b = bank();
    open(&mut b, 1, ALICE, T0);
    ctx(MALLORY, 0, T0 + 23 * HOUR_MS * MS);
    let _ = b.time_out(1);
}

#[test]
#[should_panic(expected = "NOT_YET")]
fn every_attempt_resets_the_countdown() {
    let mut b = bank();
    open(&mut b, 1, MALLORY, T0);
    open(&mut b, 1, ALICE, T0 + 20 * HOUR_MS * MS);
    // 25h after Mallory, only 5h after Alice: still running
    ctx(OWNER, 0, T0 + 25 * HOUR_MS * MS);
    let _ = b.time_out(1);
}

#[test]
#[should_panic(expected = "TIMED_OUT")]
fn cannot_open_after_countdown_until_settled() {
    let mut b = bank();
    open(&mut b, 1, ALICE, T0);
    open(&mut b, 1, MALLORY, T0 + 24 * HOUR_MS * MS + 1);
}

#[test]
#[should_panic(expected = "STALE_ROUND")]
fn release_from_settled_round_is_void() {
    let mut b = bank();
    let id = open(&mut b, 1, ALICE, T0);
    // Round settles by timeout (time travel just to settle; claim checked at original time)
    ctx(OWNER, 0, T0 + 24 * HOUR_MS * MS + 1);
    let _ = b.time_out(1);
    ctx(ALICE, 0, T0 + 10);
    let _ = b.claim(U64(id), sign(&guardian(), 1, 1, id, ALICE));
}

#[test]
#[should_panic(expected = "NO_COUNTDOWN")]
fn no_timeout_without_attempts() {
    let mut b = bank();
    ctx(ALICE, 0, T0 + 100 * HOUR_MS * MS);
    let _ = b.time_out(1);
}

// ---------------- signature attacks ----------------

#[test]
#[should_panic(expected = "BAD_SIGNATURE")]
fn forged_signature_rejected() {
    let mut b = bank();
    let id = open(&mut b, 1, ALICE, T0);
    ctx(ALICE, 0, T0 + 1);
    let _ = b.claim(U64(id), sign(&impostor(), 1, 1, id, ALICE));
}

#[test]
#[should_panic(expected = "BAD_SIGNATURE")]
fn teller_guardian_cannot_open_gold_vault() {
    let mut b = bank();
    let id = open(&mut b, 2, ALICE, T0);
    ctx(ALICE, 0, T0 + 1);
    let _ = b.claim(U64(id), sign(&guardian(), 2, 1, id, ALICE));
}

#[test]
#[should_panic(expected = "BAD_SIGNATURE")]
fn release_for_other_vault_cannot_be_replayed() {
    let mut b = bank();
    let id = open(&mut b, 2, ALICE, T0);
    ctx(ALICE, 0, T0 + 1);
    let _ = b.claim(U64(id), sign(&guardian2(), 1, 1, id, ALICE));
}

#[test]
#[should_panic(expected = "BAD_SIGNATURE")]
fn release_for_other_attempt_rejected() {
    let mut b = bank();
    let a = open(&mut b, 1, ALICE, T0);
    let c = open(&mut b, 1, ALICE, T0 + 1);
    ctx(ALICE, 0, T0 + 2);
    let _ = b.claim(U64(c), sign(&guardian(), 1, 1, a, ALICE));
}

#[test]
#[should_panic(expected = "BAD_SIGNATURE")]
fn rotated_key_voids_old_releases() {
    let mut b = bank();
    let id = open(&mut b, 1, ALICE, T0);
    ctx(OWNER, 0, T0 + 1);
    b.set_guardian_key(1, pk(&impostor()));
    ctx(ALICE, 0, T0 + 2);
    let _ = b.claim(U64(id), sign(&guardian(), 1, 1, id, ALICE));
}

#[test]
#[should_panic(expected = "NOT_YOUR_ATTEMPT")]
fn mallory_cannot_claim_alices_release() {
    let mut b = bank();
    let id = open(&mut b, 1, ALICE, T0);
    let sig = sign(&guardian(), 1, 1, id, ALICE);
    ctx(MALLORY, 0, T0 + 1);
    let _ = b.claim(U64(id), sig);
}

#[test]
#[should_panic(expected = "BAD_SIGNATURE")]
fn release_naming_mallory_fails_on_alices_attempt() {
    let mut b = bank();
    let id = open(&mut b, 1, ALICE, T0);
    ctx(ALICE, 0, T0 + 1);
    let _ = b.claim(U64(id), sign(&guardian(), 1, 1, id, MALLORY));
}

#[test]
#[should_panic(expected = "USED")]
fn same_release_twice() {
    let mut b = bank();
    let id = open(&mut b, 1, ALICE, T0);
    let sig = sign(&guardian(), 1, 1, id, ALICE);
    ctx(ALICE, 0, T0 + 1);
    let _ = b.claim(U64(id), sig.clone());
    ctx(ALICE, 0, T0 + 2);
    let _ = b.claim(U64(id), sig);
}

#[test]
#[should_panic(expected = "STALE_ROUND")]
fn second_winner_in_same_round_rejected() {
    let mut b = bank();
    let a = open(&mut b, 1, ALICE, T0);
    let m = open(&mut b, 1, MALLORY, T0 + 1);
    ctx(ALICE, 0, T0 + 2);
    let _ = b.claim(U64(a), sign(&guardian(), 1, 1, a, ALICE));
    ctx(MALLORY, 0, T0 + 3);
    let _ = b.claim(U64(m), sign(&guardian(), 1, 1, m, MALLORY));
}

#[test]
#[should_panic(expected = "EXPIRED")]
fn release_expires() {
    let mut b = bank();
    let id = open(&mut b, 1, ALICE, T0);
    ctx(ALICE, 0, T0 + ATTEMPT_TTL_NS + 1);
    let _ = b.claim(U64(id), sign(&guardian(), 1, 1, id, ALICE));
}

#[test]
fn winning_one_vault_leaves_the_other_untouched() {
    let mut b = bank();
    let gold_before = b.get_vault(2).unwrap();
    let id = open(&mut b, 1, ALICE, T0);
    ctx(ALICE, 0, T0 + 1);
    let _ = b.claim(U64(id), sign(&guardian(), 1, 1, id, ALICE));
    let gold = b.get_vault(2).unwrap();
    assert_eq!(gold.pot.0, gold_before.pot.0);
    assert_eq!(gold.round, 1);
}

// ---------------- limits ----------------

#[test]
#[should_panic(expected = "DAILY_LIMIT")]
fn daily_limit_per_vault() {
    let mut b = bank();
    for i in 0..4 {
        open(&mut b, 1, ALICE, T0 + i);
    }
}

#[test]
fn daily_limit_is_per_vault_and_resets() {
    let mut b = bank();
    for i in 0..3 {
        open(&mut b, 1, ALICE, T0 + i);
    }
    open(&mut b, 2, ALICE, T0 + 10);
    open(&mut b, 1, ALICE, T0 + DAY_NS);
    assert_eq!(b.attempts_left(1, acc(ALICE)), 2);
}

#[test]
#[should_panic(expected = "PAUSED")]
fn paused_vault_blocks_attempts() {
    let mut b = bank();
    ctx(OWNER, 0, T0);
    b.set_vault_paused(1, true);
    open(&mut b, 1, ALICE, T0 + 1);
}

// ---------------- sponsors and patches ----------------

#[test]
fn sponsor_can_create_vault_with_house_guardian() {
    let mut b = bank();
    ctx(SPONSOR, 3 * NEAR, T0);
    let v = b.create_sponsored_vault(config("Acme Support Bot"), hash(9));
    assert_eq!(v.id, 3);
    assert_eq!(v.sponsor, Some(acc(SPONSOR)));
    assert_eq!(v.guardian_key.0, guardian().verifying_key().to_bytes().to_vec());
    assert!(v.pot.0 > 2 * NEAR);
}

#[test]
#[should_panic(expected = "SPONSOR_DEPOSIT")]
fn sponsor_needs_one_near() {
    let mut b = bank();
    ctx(SPONSOR, NEAR / 2, T0);
    b.create_sponsored_vault(config("Cheap"), hash(9));
}

#[test]
#[should_panic(expected = "OWNER_ONLY")]
fn sponsor_cannot_change_guardian_key() {
    let mut b = bank();
    ctx(SPONSOR, 3 * NEAR, T0);
    b.create_sponsored_vault(config("Acme"), hash(9));
    ctx(SPONSOR, 0, T0 + 1);
    b.set_guardian_key(3, pk(&impostor()));
}

#[test]
#[should_panic(expected = "NOT_CONTROLLER")]
fn stranger_cannot_patch_someone_elses_vault() {
    let mut b = bank();
    ctx(SPONSOR, 3 * NEAR, T0);
    b.create_sponsored_vault(config("Acme"), hash(9));
    ctx(MALLORY, 0, T0 + 1);
    b.set_prompt(3, hash(66));
}

#[test]
#[should_panic(expected = "fee_bps")]
fn sponsor_cannot_set_extortionate_fee() {
    let mut b = bank();
    let mut c = config("Greedy");
    c.fee_bps = 5_000;
    ctx(SPONSOR, 3 * NEAR, T0);
    b.create_sponsored_vault(c, hash(9));
}

#[test]
fn patch_allowed_between_rounds() {
    let mut b = bank();
    let id = open(&mut b, 1, ALICE, T0);
    ctx(ALICE, 0, T0 + 1);
    let _ = b.claim(U64(id), sign(&guardian(), 1, 1, id, ALICE));
    ctx(OWNER, 0, T0 + 2);
    assert_eq!(b.set_prompt(1, hash(42)), 2);
    assert_eq!(b.get_vault(1).unwrap().prompt_hash.0, vec![42u8; 32]);
}

#[test]
#[should_panic(expected = "ROUND_LOCKED")]
fn patch_locked_once_people_have_paid() {
    let mut b = bank();
    open(&mut b, 1, ALICE, T0);
    ctx(OWNER, 0, T0 + 1);
    b.set_prompt(1, hash(42));
}

// ---------------- failed payout ----------------

#[test]
fn failed_transfer_kept_as_unclaimed() {
    let mut b = bank();
    let mut c = VMContextBuilder::new();
    c.current_account_id(acc(BANK)).predecessor_account_id(acc(BANK));
    testing_env!(
        c.build(),
        near_sdk::test_vm_config(),
        near_sdk::RuntimeFeesConfig::test(),
        Default::default(),
        vec![PromiseResult::Failed],
    );
    assert!(!b.on_payout(acc(ALICE), U128(NEAR)));
    assert_eq!(b.get_unclaimed(acc(ALICE)).0, NEAR);
}

// ---------------- cross-language ----------------

#[test]
fn release_message_format() {
    assert_eq!(
        release_message(&acc(BANK), 2, 3, 41, &acc(ALICE)),
        "heist-v2|heist-bank.testnet|vault:2|round:3|attempt:41|player:alice.testnet|release"
    );
}
