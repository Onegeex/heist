//! Attack tests: every way a player (or a stolen guardian key) might try to rob
//! the vault outside the rules, plus the one legitimate way to win.
use super::*;
use near_sdk::PromiseResult;
use ed25519_dalek::{Signer, SigningKey};
use near_sdk::test_utils::VMContextBuilder;
use near_sdk::testing_env;

const VAULT: &str = "heist.testnet";
const OWNER: &str = "owner.testnet";
const ALICE: &str = "alice.testnet";
const MALLORY: &str = "mallory.testnet";
const NEAR: u128 = 10u128.pow(24);
const FEE: u128 = NEAR / 10; // 0.1 NEAR
const CAP: u128 = 5 * NEAR;
const T0: u64 = 1_763_000_000 * 1_000_000_000;

fn acc(s: &str) -> AccountId {
    s.parse().unwrap()
}
fn guardian() -> SigningKey {
    SigningKey::from_bytes(&[7u8; 32])
}
fn impostor() -> SigningKey {
    SigningKey::from_bytes(&[9u8; 32])
}

fn ctx(caller: &str, deposit: u128, ts: u64) {
    let mut b = VMContextBuilder::new();
    b.current_account_id(acc(VAULT))
        .predecessor_account_id(acc(caller))
        .signer_account_id(acc(caller))
        .attached_deposit(NearToken::from_yoctonear(deposit))
        .account_balance(NearToken::from_near(1000))
        .block_timestamp(ts);
    testing_env!(b.build());
}

fn setup(seed: u128) -> HeistVault {
    ctx(OWNER, 0, T0);
    let pk = guardian().verifying_key().to_bytes().to_vec();
    let mut v = HeistVault::new(acc(OWNER), Base64VecU8(pk), U128(FEE), U128(CAP));
    if seed > 0 {
        ctx(OWNER, seed, T0);
        v.seed();
    }
    v
}

fn sign(key: &SigningKey, round: u32, id: u64, player: &str) -> Base64VecU8 {
    let msg = release_message(&acc(VAULT), round, id, &acc(player));
    Base64VecU8(key.sign(msg.as_bytes()).to_bytes().to_vec())
}

fn open(v: &mut HeistVault, who: &str, ts: u64) -> u64 {
    ctx(who, FEE, ts);
    v.open_attempt().id.0
}

// ---------- the legit win ----------

#[test]
fn guardian_release_pays_player_and_starts_new_round() {
    let mut v = setup(3 * NEAR);
    let id = open(&mut v, ALICE, T0);
    let before = v.get_state().bounty.0;
    assert!(before > 3 * NEAR, "entry fee should grow the bounty");
    ctx(ALICE, 0, T0 + 1);
    let _ = v.claim(U64(id), sign(&guardian(), 1, id, ALICE), None);
    let s = v.get_state();
    assert_eq!(s.bounty.0, 0);
    assert_eq!(s.round, 2);
    assert_eq!(s.last_winner, Some(acc(ALICE)));
    assert_eq!(v.get_attempt(U64(id)).unwrap().status, AttemptStatus::Won);
}

#[test]
fn payout_is_capped_and_remainder_rolls_over() {
    let mut v = setup(20 * NEAR);
    let id = open(&mut v, ALICE, T0);
    let before = v.get_state().bounty.0;
    ctx(ALICE, 0, T0 + 1);
    let _ = v.claim(U64(id), sign(&guardian(), 1, id, ALICE), None);
    assert_eq!(v.get_state().bounty.0, before - CAP);
}

#[test]
fn entry_fees_grow_bounty_minus_storage() {
    let mut v = setup(NEAR);
    open(&mut v, ALICE, T0);
    let b = v.get_state().bounty.0;
    assert!(b > NEAR && b < NEAR + FEE);
}

// ---------- attempt limits ----------

#[test]
#[should_panic(expected = "DAILY_LIMIT")]
fn fourth_attempt_same_day_rejected() {
    let mut v = setup(NEAR);
    for i in 0..4 {
        open(&mut v, ALICE, T0 + i);
    }
}

#[test]
fn attempts_reset_next_day() {
    let mut v = setup(NEAR);
    for i in 0..3 {
        open(&mut v, ALICE, T0 + i);
    }
    open(&mut v, ALICE, T0 + DAY_NS);
    assert_eq!(v.attempts_left(acc(ALICE)), 2);
}

#[test]
#[should_panic(expected = "ENTRY_FEE")]
fn underpaying_entry_rejected() {
    let mut v = setup(NEAR);
    ctx(ALICE, FEE - 1, T0);
    v.open_attempt();
}

#[test]
#[should_panic(expected = "ENTRY_FEE")]
fn overpaying_entry_rejected() {
    let mut v = setup(NEAR);
    ctx(ALICE, FEE + 1, T0);
    v.open_attempt();
}

#[test]
#[should_panic(expected = "EMPTY")]
fn cannot_play_empty_vault() {
    let mut v = setup(0);
    open(&mut v, ALICE, T0);
}

// ---------- signature attacks ----------

#[test]
#[should_panic(expected = "BAD_SIGNATURE")]
fn forged_signature_rejected() {
    let mut v = setup(NEAR);
    let id = open(&mut v, ALICE, T0);
    ctx(ALICE, 0, T0 + 1);
    let _ = v.claim(U64(id), sign(&impostor(), 1, id, ALICE), None);
}

#[test]
#[should_panic(expected = "BAD_SIGNATURE")]
fn release_for_other_attempt_rejected() {
    let mut v = setup(NEAR);
    let a = open(&mut v, ALICE, T0);
    let b = open(&mut v, ALICE, T0 + 1);
    ctx(ALICE, 0, T0 + 2);
    let _ = v.claim(U64(b), sign(&guardian(), 1, a, ALICE), None);
}

#[test]
#[should_panic(expected = "BAD_SIGNATURE")]
fn garbage_signature_rejected() {
    let mut v = setup(NEAR);
    let id = open(&mut v, ALICE, T0);
    ctx(ALICE, 0, T0 + 1);
    let _ = v.claim(U64(id), Base64VecU8(vec![1, 2, 3]), None);
}

#[test]
#[should_panic(expected = "BAD_SIGNATURE")]
fn rotated_key_voids_old_releases() {
    let mut v = setup(NEAR);
    let id = open(&mut v, ALICE, T0);
    ctx(OWNER, 0, T0 + 1);
    v.set_guardian_key(Base64VecU8(impostor().verifying_key().to_bytes().to_vec()));
    ctx(ALICE, 0, T0 + 2);
    let _ = v.claim(U64(id), sign(&guardian(), 1, id, ALICE), None);
}

// ---------- stolen release / wrong player ----------

#[test]
#[should_panic(expected = "NOT_YOUR_ATTEMPT")]
fn mallory_cannot_claim_alices_release() {
    let mut v = setup(NEAR);
    let id = open(&mut v, ALICE, T0);
    let sig = sign(&guardian(), 1, id, ALICE);
    ctx(MALLORY, 0, T0 + 1);
    let _ = v.claim(U64(id), sig, None);
}

#[test]
#[should_panic(expected = "BAD_SIGNATURE")]
fn release_signed_for_mallory_doesnt_work_on_alices_attempt() {
    // A guardian talked into "pay mallory" on Alice's attempt: the message names
    // the attempt's own player, so the signature can't match.
    let mut v = setup(NEAR);
    let id = open(&mut v, ALICE, T0);
    ctx(ALICE, 0, T0 + 1);
    let _ = v.claim(U64(id), sign(&guardian(), 1, id, MALLORY), None);
}

// ---------- replay / double win / timing ----------

#[test]
#[should_panic(expected = "USED")]
fn same_release_cannot_be_claimed_twice() {
    let mut v = setup(10 * NEAR);
    let id = open(&mut v, ALICE, T0);
    let sig = sign(&guardian(), 1, id, ALICE);
    ctx(ALICE, 0, T0 + 1);
    let _ = v.claim(U64(id), sig.clone(), None);
    ctx(OWNER, 3 * NEAR, T0 + 2);
    v.seed();
    ctx(ALICE, 0, T0 + 3);
    let _ = v.claim(U64(id), sig, None);
}

#[test]
#[should_panic(expected = "STALE_ROUND")]
fn open_attempt_from_cracked_round_cannot_win_next_round() {
    let mut v = setup(10 * NEAR);
    let a = open(&mut v, ALICE, T0);
    let m = open(&mut v, MALLORY, T0 + 1);
    ctx(ALICE, 0, T0 + 2);
    let _ = v.claim(U64(a), sign(&guardian(), 1, a, ALICE), None);
    ctx(MALLORY, 0, T0 + 3);
    let _ = v.claim(U64(m), sign(&guardian(), 1, m, MALLORY), None);
}

#[test]
#[should_panic(expected = "EXPIRED")]
fn release_expires_after_ttl() {
    let mut v = setup(NEAR);
    let id = open(&mut v, ALICE, T0);
    ctx(ALICE, 0, T0 + ATTEMPT_TTL_NS + 1);
    let _ = v.claim(U64(id), sign(&guardian(), 1, id, ALICE), None);
}

// ---------- owner powers ----------

#[test]
#[should_panic(expected = "PAUSED")]
fn paused_blocks_claims() {
    let mut v = setup(NEAR);
    let id = open(&mut v, ALICE, T0);
    ctx(OWNER, 0, T0 + 1);
    v.set_paused(true);
    ctx(ALICE, 0, T0 + 2);
    let _ = v.claim(U64(id), sign(&guardian(), 1, id, ALICE), None);
}

#[test]
#[should_panic(expected = "OWNER_ONLY")]
fn player_cannot_swap_guardian_key() {
    let mut v = setup(NEAR);
    ctx(MALLORY, 0, T0);
    v.set_guardian_key(Base64VecU8(impostor().verifying_key().to_bytes().to_vec()));
}

#[test]
#[should_panic(expected = "OWNER_ONLY")]
fn player_cannot_raise_cap() {
    let mut v = setup(NEAR);
    ctx(MALLORY, 0, T0);
    v.set_max_payout(U128(1000 * NEAR));
}

// ---------- failed payout ----------

#[test]
fn failed_transfer_is_kept_as_unclaimed() {
    let mut v = setup(NEAR);
    let mut b = VMContextBuilder::new();
    b.current_account_id(acc(VAULT)).predecessor_account_id(acc(VAULT));
    testing_env!(
        b.build(),
        near_sdk::test_vm_config(),
        near_sdk::RuntimeFeesConfig::test(),
        Default::default(),
        vec![PromiseResult::Failed],
    );
    assert!(!v.on_payout(acc(ALICE), U128(NEAR)));
    assert_eq!(v.get_unclaimed(acc(ALICE)).0, NEAR);
}
