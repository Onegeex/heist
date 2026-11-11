//! HeistBank: many vaults, each guarded by an AI, in one contract.
//!
//! Game loop, per vault:
//!   1. A player opens an attempt with `open_attempt(vault_id)`. The price is
//!      `max(base_fee, pot * fee_bps)`, so it rises as the pot grows. Overpaying
//!      is refunded, so a price that moved while the wallet was signing is fine.
//!   2. Each fee is split: 70% into the pot, 20% held back to seed the next
//!      round, 10% to the house treasury.
//!   3. The player talks to the vault's AI guardian off-chain. If the guardian
//!      calls its release tool, the server signs a release for that attempt.
//!   4. `claim` checks the release and pays the player up to the vault's cap.
//!      The rest of the pot plus the held-back seed start the next round.
//!   5. Countdown: every attempt resets it. If nobody tries for `countdown`,
//!      anyone can call `time_out` and the last challenger gets 20% of the pot.
//!
//! What the guardian controls: whether to release. What the contract controls:
//! everything a release can do. A fooled guardian or a stolen guardian key can
//! only pay the player who paid for that attempt, once, within 30 minutes, up
//! to the cap. Nobody can take a pot out: not the owner, not a sponsor. The
//! owner can only withdraw the house's 10%.
//!
//! Each vault commits to the sha256 of its guardian's system prompt. The
//! prompt can only change before the first attempt of a round, so the rules
//! can't be swapped while people are paying to play.

use near_sdk::json_types::{Base64VecU8, U128, U64};
use near_sdk::store::LookupMap;
use near_sdk::{env, near, require, AccountId, BorshStorageKey, Gas, NearToken, PanicOnDefault, Promise};

pub const DAY_NS: u64 = 86_400 * 1_000_000_000;
pub const ATTEMPT_TTL_NS: u64 = 30 * 60 * 1_000_000_000;
pub const MIN_COUNTDOWN_NS: u64 = 60 * 60 * 1_000_000_000;
pub const BPS: u128 = 10_000;
pub const POT_BPS: u128 = 7_000;
pub const ROLLOVER_BPS: u128 = 2_000;
pub const HOUSE_BPS: u128 = 1_000;
pub const TIMEOUT_SHARE_BPS: u128 = 2_000;
pub const MAX_FEE_BPS: u16 = 1_000;
pub const MIN_SPONSOR_DEPOSIT: u128 = 1_000_000_000_000_000_000_000_000; // 1 NEAR
const PAYOUT_GAS: Gas = Gas::from_tgas(10);

#[near(serializers = [borsh])]
#[derive(BorshStorageKey)]
enum Key {
    Vaults,
    Attempts,
    Daily,
    Unclaimed,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq)]
pub enum AttemptStatus {
    Open,
    Won,
}

/// Settings chosen when a vault is created.
#[near(serializers = [json, borsh])]
#[derive(Clone, Debug)]
pub struct VaultConfig {
    pub name: String,
    /// Minimum entry fee, yoctoNEAR.
    pub base_fee: U128,
    /// Entry fee as a share of the pot, in basis points (100 = 1%). Max 1000.
    pub fee_bps: u16,
    /// Most a single win can pay. The rest stays for the next round.
    pub max_payout: U128,
    /// Inactivity window before `time_out` is allowed, milliseconds. Min 1 hour.
    pub countdown_ms: U64,
    /// Attempts per wallet per UTC day on this vault (1-20).
    pub max_daily: u8,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug)]
pub struct Vault {
    pub id: u32,
    pub name: String,
    pub sponsor: Option<AccountId>,
    pub guardian_key: Base64VecU8,
    pub prompt_hash: Base64VecU8,
    pub prompt_version: u32,
    pub base_fee: U128,
    pub fee_bps: u16,
    pub max_payout: U128,
    pub countdown_ns: U64,
    pub max_daily: u8,
    pub round: u32,
    pub pot: U128,
    pub rollover: U128,
    pub round_attempts: u32,
    pub total_attempts: U64,
    pub total_paid: U128,
    pub last_attempt_at: Option<U64>,
    pub last_challenger: Option<AccountId>,
    pub last_winner: Option<AccountId>,
    pub paused: bool,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug)]
pub struct Attempt {
    pub id: U64,
    pub vault_id: u32,
    pub player: AccountId,
    pub round: u32,
    pub opened_at: U64,
    pub fee: U128,
    pub status: AttemptStatus,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct HeistBank {
    owner: AccountId,
    default_guardian_key: Vec<u8>,
    paused: bool,
    treasury: u128,
    vault_count: u32,
    next_attempt: u64,
    vaults: LookupMap<u32, Vault>,
    attempts: LookupMap<u64, Attempt>,
    /// (vault, player, day) -> attempts that day
    daily: LookupMap<(u32, AccountId, u64), u8>,
    unclaimed: LookupMap<AccountId, u128>,
}

/// The exact bytes the guardian server signs for a release.
pub fn release_message(bank: &AccountId, vault_id: u32, round: u32, attempt_id: u64, player: &AccountId) -> String {
    format!("heist-v2|{bank}|vault:{vault_id}|round:{round}|attempt:{attempt_id}|player:{player}|release")
}

fn key32(k: &Base64VecU8, what: &str) {
    require!(k.0.len() == 32, format!("{what} must be 32 bytes"));
}

fn check_config(c: &VaultConfig) {
    require!(!c.name.is_empty() && c.name.len() <= 40, "name must be 1-40 characters");
    require!(c.base_fee.0 > 0, "base_fee must be > 0");
    require!(c.fee_bps <= MAX_FEE_BPS, "fee_bps must be at most 1000 (10%)");
    require!(c.max_payout.0 > 0, "max_payout must be > 0");
    require!(c.countdown_ms.0 * 1_000_000 >= MIN_COUNTDOWN_NS, "countdown must be at least 1 hour");
    require!(c.max_daily >= 1 && c.max_daily <= 20, "max_daily must be 1-20");
}

#[near]
impl HeistBank {
    #[init]
    pub fn new(owner: AccountId, default_guardian_key: Base64VecU8) -> Self {
        key32(&default_guardian_key, "default_guardian_key");
        Self {
            owner,
            default_guardian_key: default_guardian_key.0,
            paused: false,
            treasury: 0,
            vault_count: 0,
            next_attempt: 1,
            vaults: LookupMap::new(Key::Vaults),
            attempts: LookupMap::new(Key::Attempts),
            daily: LookupMap::new(Key::Daily),
            unclaimed: LookupMap::new(Key::Unclaimed),
        }
    }

    // ---------------- vaults ----------------

    /// Owner creates a house vault. The attached deposit seeds the pot.
    #[payable]
    pub fn create_vault(&mut self, config: VaultConfig, prompt_hash: Base64VecU8, guardian_key: Option<Base64VecU8>) -> Vault {
        self.assert_owner();
        self.insert_vault(config, prompt_hash, guardian_key, None)
    }

    /// Anyone can sponsor a vault: an AI bounty on their own guardian prompt.
    /// The deposit (at least 1 NEAR) is the starting pot. It can't be taken back.
    #[payable]
    pub fn create_sponsored_vault(&mut self, config: VaultConfig, prompt_hash: Base64VecU8) -> Vault {
        require!(!self.paused, "PAUSED");
        require!(env::attached_deposit().as_yoctonear() >= MIN_SPONSOR_DEPOSIT, "SPONSOR_DEPOSIT: attach at least 1 NEAR");
        self.insert_vault(config, prompt_hash, None, Some(env::predecessor_account_id()))
    }

    fn insert_vault(&mut self, config: VaultConfig, prompt_hash: Base64VecU8, guardian_key: Option<Base64VecU8>, sponsor: Option<AccountId>) -> Vault {
        check_config(&config);
        key32(&prompt_hash, "prompt_hash");
        let gk = guardian_key.unwrap_or(Base64VecU8(self.default_guardian_key.clone()));
        key32(&gk, "guardian_key");
        let before = env::storage_usage();
        let id = self.vault_count + 1;
        self.vault_count = id;
        let mut v = Vault {
            id,
            name: config.name,
            sponsor,
            guardian_key: gk,
            prompt_hash,
            prompt_version: 1,
            base_fee: config.base_fee,
            fee_bps: config.fee_bps,
            max_payout: config.max_payout,
            countdown_ns: U64(config.countdown_ms.0 * 1_000_000),
            max_daily: config.max_daily,
            round: 1,
            pot: U128(0),
            rollover: U128(0),
            round_attempts: 0,
            total_attempts: U64(0),
            total_paid: U128(0),
            last_attempt_at: None,
            last_challenger: None,
            last_winner: None,
            paused: false,
        };
        self.vaults.insert(id, v.clone());
        self.vaults.flush();
        let storage = (env::storage_usage() - before) as u128 * env::storage_byte_cost().as_yoctonear();
        let deposit = env::attached_deposit().as_yoctonear();
        require!(deposit > storage, "Attach enough to cover vault storage plus the starting pot");
        v.pot = U128(deposit - storage);
        self.vaults.insert(id, v.clone());
        env::log_str(&format!("EVENT_VAULT {} {} pot:{}", id, v.name, v.pot.0));
        v
    }

    /// Anyone can add to a vault's pot.
    #[payable]
    pub fn seed(&mut self, vault_id: u32) -> U128 {
        let amount = env::attached_deposit().as_yoctonear();
        require!(amount > 0, "Attach NEAR to seed the pot");
        let mut v = self.vault(vault_id);
        v.pot = U128(v.pot.0 + amount);
        self.vaults.insert(vault_id, v.clone());
        env::log_str(&format!("EVENT_SEED {} {} {}", vault_id, env::predecessor_account_id(), amount));
        v.pot
    }

    // ---------------- players ----------------

    /// Pay the current entry fee and open one attempt. Overpayment is refunded.
    #[payable]
    pub fn open_attempt(&mut self, vault_id: u32) -> Attempt {
        require!(!self.paused, "PAUSED: the bank is closed right now");
        let mut v = self.vault(vault_id);
        require!(!v.paused, "PAUSED: this vault is closed right now");
        require!(v.pot.0 > 0, "EMPTY: nothing to steal yet");
        let now = env::block_timestamp();
        if let Some(t) = v.last_attempt_at {
            require!(now <= t.0 + v.countdown_ns.0, "TIMED_OUT: the countdown ran out; call time_out to settle this round");
        }
        let fee = Self::fee_for(&v);
        let paid = env::attached_deposit().as_yoctonear();
        require!(paid >= fee, "ENTRY_FEE: attach at least the current entry fee");

        let player = env::predecessor_account_id();
        let day = now / DAY_NS;
        let dkey = (vault_id, player.clone(), day);
        let used = self.daily.get(&dkey).copied().unwrap_or(0);
        require!(used < v.max_daily, "DAILY_LIMIT: no attempts left on this vault today");

        let before = env::storage_usage();
        let id = self.next_attempt;
        self.next_attempt += 1;
        let a = Attempt {
            id: U64(id),
            vault_id,
            player: player.clone(),
            round: v.round,
            opened_at: U64(now),
            fee: U128(fee),
            status: AttemptStatus::Open,
        };
        self.attempts.insert(id, a.clone());
        self.daily.insert(dkey, used + 1);
        self.attempts.flush();
        self.daily.flush();
        let storage = (env::storage_usage().saturating_sub(before)) as u128 * env::storage_byte_cost().as_yoctonear();
        require!(fee > storage, "ENTRY_FEE: fee does not cover storage");

        let net = fee - storage;
        let house = net * HOUSE_BPS / BPS;
        let roll = net * ROLLOVER_BPS / BPS;
        let to_pot = net - house - roll;
        self.treasury += house;
        v.rollover = U128(v.rollover.0 + roll);
        v.pot = U128(v.pot.0 + to_pot);
        v.round_attempts += 1;
        v.total_attempts = U64(v.total_attempts.0 + 1);
        v.last_attempt_at = Some(U64(now));
        v.last_challenger = Some(player.clone());
        self.vaults.insert(vault_id, v.clone());

        if paid > fee {
            Promise::new(player.clone()).transfer(NearToken::from_yoctonear(paid - fee)).detach();
        }
        env::log_str(&format!("EVENT_ATTEMPT {} vault:{} {} round:{} fee:{}", id, vault_id, player, v.round, fee));
        a
    }

    /// Claim with the guardian's signed release for your attempt.
    pub fn claim(&mut self, attempt_id: U64, signature: Base64VecU8) -> Promise {
        require!(!self.paused, "PAUSED: the bank is closed right now");
        let mut a = self.attempts.get(&attempt_id.0).cloned().unwrap_or_else(|| env::panic_str("NO_ATTEMPT"));
        let mut v = self.vault(a.vault_id);
        require!(!v.paused, "PAUSED: this vault is closed right now");
        let caller = env::predecessor_account_id();
        require!(a.player == caller, "NOT_YOUR_ATTEMPT: only the player who paid can claim");
        require!(a.status == AttemptStatus::Open, "USED: this attempt already won");
        require!(a.round == v.round, "STALE_ROUND: this round is already over");
        require!(env::block_timestamp() <= a.opened_at.0 + ATTEMPT_TTL_NS, "EXPIRED: release must be claimed within 30 minutes");

        let sig: [u8; 64] = signature.0.as_slice().try_into().unwrap_or_else(|_| env::panic_str("BAD_SIGNATURE"));
        let pk: [u8; 32] = v.guardian_key.0.as_slice().try_into().unwrap();
        let msg = release_message(&env::current_account_id(), a.vault_id, a.round, attempt_id.0, &a.player);
        require!(env::ed25519_verify(&sig, msg.as_bytes(), &pk), "BAD_SIGNATURE: not signed by this vault's guardian");

        let amount = v.pot.0.min(v.max_payout.0);
        require!(amount > 0, "EMPTY");
        v.pot = U128(v.pot.0 - amount);
        v.total_paid = U128(v.total_paid.0 + amount);
        v.last_winner = Some(caller.clone());
        Self::next_round(&mut v);
        self.vaults.insert(a.vault_id, v);
        a.status = AttemptStatus::Won;
        self.attempts.insert(attempt_id.0, a.clone());
        env::log_str(&format!("EVENT_WIN {} vault:{} {} {} round:{}", attempt_id.0, a.vault_id, caller, amount, a.round));
        self.pay(caller, amount)
    }

    /// After the countdown runs out with no new attempt, anyone can settle the round:
    /// the last challenger gets 20% of the pot (up to the cap).
    pub fn time_out(&mut self, vault_id: u32) -> Promise {
        require!(!self.paused, "PAUSED");
        let mut v = self.vault(vault_id);
        let last = v.last_attempt_at.unwrap_or_else(|| env::panic_str("NO_COUNTDOWN: no attempts this round"));
        require!(env::block_timestamp() > last.0 + v.countdown_ns.0, "NOT_YET: the countdown is still running");
        let who = v.last_challenger.clone().unwrap();
        let share = (v.pot.0 * TIMEOUT_SHARE_BPS / BPS).min(v.max_payout.0);
        v.pot = U128(v.pot.0 - share);
        v.total_paid = U128(v.total_paid.0 + share);
        let round = v.round;
        Self::next_round(&mut v);
        self.vaults.insert(vault_id, v);
        env::log_str(&format!("EVENT_TIMEOUT vault:{} {} {} round:{}", vault_id, who, share, round));
        self.pay(who, share)
    }

    fn next_round(v: &mut Vault) {
        v.pot = U128(v.pot.0 + v.rollover.0);
        v.rollover = U128(0);
        v.round += 1;
        v.round_attempts = 0;
        v.last_attempt_at = None;
        v.last_challenger = None;
    }

    fn pay(&self, to: AccountId, amount: u128) -> Promise {
        Promise::new(to.clone())
            .transfer(NearToken::from_yoctonear(amount))
            .then(Self::ext(env::current_account_id()).with_static_gas(PAYOUT_GAS).on_payout(to, U128(amount)))
    }

    /// If a transfer fails, keep the money for the recipient instead of losing it.
    #[private]
    pub fn on_payout(&mut self, to: AccountId, amount: U128) -> bool {
        let ok = env::promise_result_checked(0, 64).is_ok();
        if !ok {
            let prev = self.unclaimed.get(&to).copied().unwrap_or(0);
            self.unclaimed.insert(to.clone(), prev + amount.0);
            env::log_str(&format!("EVENT_PAYOUT_FAILED {} {}", to, amount.0));
        }
        ok
    }

    pub fn withdraw_unclaimed(&mut self) -> Promise {
        let me = env::predecessor_account_id();
        let amount = self.unclaimed.remove(&me).unwrap_or(0);
        require!(amount > 0, "Nothing unclaimed");
        Promise::new(me).transfer(NearToken::from_yoctonear(amount))
    }

    // ---------------- owner / sponsor ----------------

    /// Patch the guardian between rounds. Only before the round's first attempt.
    pub fn set_prompt(&mut self, vault_id: u32, prompt_hash: Base64VecU8) -> u32 {
        let mut v = self.vault(vault_id);
        self.assert_controller(&v);
        key32(&prompt_hash, "prompt_hash");
        require!(v.round_attempts == 0, "ROUND_LOCKED: the prompt can only change before the round's first attempt");
        v.prompt_hash = prompt_hash;
        v.prompt_version += 1;
        let ver = v.prompt_version;
        self.vaults.insert(vault_id, v);
        env::log_str(&format!("EVENT_PATCH vault:{} version:{}", vault_id, ver));
        ver
    }

    pub fn set_vault_paused(&mut self, vault_id: u32, paused: bool) {
        let mut v = self.vault(vault_id);
        self.assert_controller(&v);
        v.paused = paused;
        self.vaults.insert(vault_id, v);
    }

    /// Rotating a vault's key voids every outstanding release signed with the old one.
    pub fn set_guardian_key(&mut self, vault_id: u32, guardian_key: Base64VecU8) {
        self.assert_owner();
        key32(&guardian_key, "guardian_key");
        let mut v = self.vault(vault_id);
        v.guardian_key = guardian_key;
        self.vaults.insert(vault_id, v);
    }

    pub fn set_default_guardian_key(&mut self, guardian_key: Base64VecU8) {
        self.assert_owner();
        key32(&guardian_key, "guardian_key");
        self.default_guardian_key = guardian_key.0;
    }

    pub fn set_paused(&mut self, paused: bool) {
        self.assert_owner();
        self.paused = paused;
    }

    /// The owner can take the house's 10% and nothing else.
    pub fn withdraw_treasury(&mut self, amount: U128) -> Promise {
        self.assert_owner();
        require!(amount.0 > 0 && amount.0 <= self.treasury, "TREASURY: amount exceeds the house balance");
        self.treasury -= amount.0;
        Promise::new(self.owner.clone()).transfer(NearToken::from_yoctonear(amount.0))
    }

    // ---------------- views ----------------

    pub fn get_vault(&self, vault_id: u32) -> Option<Vault> {
        self.vaults.get(&vault_id).cloned()
    }

    pub fn list_vaults(&self) -> Vec<Vault> {
        (1..=self.vault_count).filter_map(|i| self.vaults.get(&i).cloned()).collect()
    }

    pub fn current_fee(&self, vault_id: u32) -> U128 {
        U128(Self::fee_for(&self.vault(vault_id)))
    }

    pub fn get_attempt(&self, attempt_id: U64) -> Option<Attempt> {
        self.attempts.get(&attempt_id.0).cloned()
    }

    pub fn attempts_left(&self, vault_id: u32, account_id: AccountId) -> u8 {
        let v = self.vault(vault_id);
        let day = env::block_timestamp() / DAY_NS;
        v.max_daily.saturating_sub(self.daily.get(&(vault_id, account_id, day)).copied().unwrap_or(0))
    }

    pub fn get_treasury(&self) -> U128 {
        U128(self.treasury)
    }

    pub fn get_unclaimed(&self, account_id: AccountId) -> U128 {
        U128(self.unclaimed.get(&account_id).copied().unwrap_or(0))
    }

    pub fn get_owner(&self) -> AccountId {
        self.owner.clone()
    }

    // ---------------- internals ----------------

    fn fee_for(v: &Vault) -> u128 {
        (v.pot.0 * v.fee_bps as u128 / BPS).max(v.base_fee.0)
    }

    fn vault(&self, id: u32) -> Vault {
        self.vaults.get(&id).cloned().unwrap_or_else(|| env::panic_str("NO_VAULT"))
    }

    fn assert_owner(&self) {
        require!(env::predecessor_account_id() == self.owner, "OWNER_ONLY");
    }

    fn assert_controller(&self, v: &Vault) {
        let me = env::predecessor_account_id();
        require!(me == self.owner || v.sponsor.as_ref() == Some(&me), "NOT_CONTROLLER: only the owner or this vault's sponsor");
    }
}

#[cfg(test)]
mod tests;
