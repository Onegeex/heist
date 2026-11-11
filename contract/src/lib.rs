//! HeistVault — a bounty guarded by an AI.
//!
//! Game loop:
//!   1. A player pays the entry fee with `open_attempt`. The fee (minus storage)
//!      goes into the bounty, so every failed attempt makes the vault bigger.
//!   2. The player chats with the guardian AI off-chain. The guardian has one
//!      tool, `release_bounty`. If it is talked into calling it, the guardian
//!      server signs a release for *that attempt only*.
//!   3. The player calls `claim` with the signature. The contract checks it.
//!
//! The model decides whether to release. The contract decides how much harm a
//! release can do. Even with a fooled guardian or a stolen guardian key, a release:
//!   - pays only the player who opened and paid for that attempt,
//!   - works once, for the current round, within ATTEMPT_TTL,
//!   - pays at most `max_payout` (the rest stays in the vault for the next round),
//!   - can't touch funds the contract holds for storage or unclaimed winnings.
//! The owner can pause the game and rotate the guardian key, but there is no
//! method that lets the owner take the bounty.

use near_sdk::json_types::{Base64VecU8, U128, U64};
use near_sdk::store::LookupMap;
use near_sdk::{
    env, near, require, AccountId, BorshStorageKey, NearToken, PanicOnDefault, Promise,
};

pub const DAY_NS: u64 = 86_400 * 1_000_000_000;
/// A signed release must be claimed within 30 minutes of opening the attempt.
pub const ATTEMPT_TTL_NS: u64 = 30 * 60 * 1_000_000_000;
pub const ATTEMPTS_PER_DAY: u8 = 3;
const PAYOUT_GAS: near_sdk::Gas = near_sdk::Gas::from_tgas(10);

#[near(serializers = [borsh])]
#[derive(BorshStorageKey)]
enum Key {
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

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug)]
pub struct Attempt {
    pub id: U64,
    pub player: AccountId,
    pub round: u32,
    pub opened_at: U64,
    pub status: AttemptStatus,
}

#[near(serializers = [json])]
pub struct GameState {
    pub round: u32,
    pub bounty: U128,
    pub entry_fee: U128,
    pub max_payout: U128,
    pub paused: bool,
    pub total_attempts: U64,
    pub last_winner: Option<AccountId>,
    pub guardian_key: Base64VecU8,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct HeistVault {
    owner: AccountId,
    guardian_key: Vec<u8>,
    entry_fee: u128,
    max_payout: u128,
    bounty: u128,
    round: u32,
    paused: bool,
    next_attempt: u64,
    last_winner: Option<AccountId>,
    attempts: LookupMap<u64, Attempt>,
    /// (player, day index) -> attempts opened that day
    daily: LookupMap<(AccountId, u64), u8>,
    /// Winnings whose transfer failed (e.g. payout account didn't exist).
    unclaimed: LookupMap<AccountId, u128>,
}

/// The exact bytes the guardian server signs for a release.
pub fn release_message(vault: &AccountId, round: u32, attempt_id: u64, player: &AccountId) -> String {
    format!("heist-v1|{vault}|round:{round}|attempt:{attempt_id}|player:{player}|release")
}

#[near]
impl HeistVault {
    #[init]
    pub fn new(owner: AccountId, guardian_key: Base64VecU8, entry_fee: U128, max_payout: U128) -> Self {
        require!(guardian_key.0.len() == 32, "guardian_key must be a 32-byte ed25519 public key");
        require!(entry_fee.0 > 0, "entry_fee must be > 0");
        require!(max_payout.0 > 0, "max_payout must be > 0");
        Self {
            owner,
            guardian_key: guardian_key.0,
            entry_fee: entry_fee.0,
            max_payout: max_payout.0,
            bounty: 0,
            round: 1,
            paused: false,
            next_attempt: 1,
            last_winner: None,
            attempts: LookupMap::new(Key::Attempts),
            daily: LookupMap::new(Key::Daily),
            unclaimed: LookupMap::new(Key::Unclaimed),
        }
    }

    // ---------- players ----------

    /// Anyone can add to the bounty (sponsors, the operator's trophy seed).
    #[payable]
    pub fn seed(&mut self) -> U128 {
        let amount = env::attached_deposit().as_yoctonear();
        require!(amount > 0, "Attach NEAR to seed the bounty");
        self.bounty += amount;
        env::log_str(&format!("EVENT_SEED {} {}", env::predecessor_account_id(), amount));
        U128(self.bounty)
    }

    /// Pay the entry fee and open one attempt. Max ATTEMPTS_PER_DAY per wallet per UTC day.
    #[payable]
    pub fn open_attempt(&mut self) -> Attempt {
        require!(!self.paused, "PAUSED: the vault is closed right now");
        let fee = env::attached_deposit().as_yoctonear();
        require!(fee == self.entry_fee, "ENTRY_FEE: attach exactly the entry fee");
        require!(self.bounty > 0, "EMPTY: nothing to steal yet");

        let player = env::predecessor_account_id();
        let now = env::block_timestamp();
        let day = now / DAY_NS;
        let key = (player.clone(), day);
        let used = self.daily.get(&key).copied().unwrap_or(0);
        require!(used < ATTEMPTS_PER_DAY, "DAILY_LIMIT: 3 attempts per wallet per day");

        let before = env::storage_usage();
        let id = self.next_attempt;
        self.next_attempt += 1;
        let attempt = Attempt {
            id: U64(id),
            player: player.clone(),
            round: self.round,
            opened_at: U64(now),
            status: AttemptStatus::Open,
        };
        self.attempts.insert(id, attempt.clone());
        self.daily.insert(key, used + 1);
        self.attempts.flush();
        self.daily.flush();
        let storage_cost =
            (env::storage_usage().saturating_sub(before)) as u128 * env::storage_byte_cost().as_yoctonear();
        require!(fee > storage_cost, "ENTRY_FEE: fee does not cover storage");
        self.bounty += fee - storage_cost;

        env::log_str(&format!("EVENT_ATTEMPT {} {} round:{}", id, player, self.round));
        attempt
    }

    /// Claim the bounty with the guardian's signed release for your attempt.
    /// `payout_to` lets the winner send the prize elsewhere, e.g. a NEAR Intents
    /// 1Click deposit address that bridges it to another chain.
    pub fn claim(&mut self, attempt_id: U64, signature: Base64VecU8, payout_to: Option<AccountId>) -> Promise {
        require!(!self.paused, "PAUSED: the vault is closed right now");
        let mut attempt = self.attempts.get(&attempt_id.0).cloned().unwrap_or_else(|| env::panic_str("NO_ATTEMPT"));
        let caller = env::predecessor_account_id();
        require!(attempt.player == caller, "NOT_YOUR_ATTEMPT: only the player who paid can claim");
        require!(attempt.status == AttemptStatus::Open, "USED: this attempt already won");
        require!(attempt.round == self.round, "STALE_ROUND: someone already cracked this round");
        require!(
            env::block_timestamp() <= attempt.opened_at.0 + ATTEMPT_TTL_NS,
            "EXPIRED: release must be claimed within 30 minutes"
        );

        let sig: [u8; 64] = signature.0.as_slice().try_into().unwrap_or_else(|_| env::panic_str("BAD_SIGNATURE"));
        let pk: [u8; 32] = self.guardian_key.as_slice().try_into().unwrap();
        let msg = release_message(&env::current_account_id(), attempt.round, attempt_id.0, &attempt.player);
        require!(env::ed25519_verify(&sig, msg.as_bytes(), &pk), "BAD_SIGNATURE: not signed by the guardian");

        let amount = self.bounty.min(self.max_payout);
        require!(amount > 0, "EMPTY");
        self.bounty -= amount;
        attempt.status = AttemptStatus::Won;
        self.attempts.insert(attempt_id.0, attempt.clone());
        self.round += 1;
        self.last_winner = Some(caller.clone());
        env::log_str(&format!("EVENT_WIN {} {} {} round:{}", attempt_id.0, caller, amount, attempt.round));

        let to = payout_to.unwrap_or(caller.clone());
        Promise::new(to)
            .transfer(NearToken::from_yoctonear(amount))
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(PAYOUT_GAS)
                    .on_payout(caller, U128(amount)),
            )
    }

    /// If a winner's transfer fails, keep the winnings for them instead of losing them.
    #[private]
    pub fn on_payout(&mut self, winner: AccountId, amount: U128) -> bool {
        let ok = env::promise_result_checked(0, 64).is_ok();
        if !ok {
            let prev = self.unclaimed.get(&winner).copied().unwrap_or(0);
            self.unclaimed.insert(winner.clone(), prev + amount.0);
            env::log_str(&format!("EVENT_PAYOUT_FAILED {} {}", winner, amount.0));
        }
        ok
    }

    /// Winner pulls winnings that failed to send.
    pub fn withdraw_unclaimed(&mut self, to: Option<AccountId>) -> Promise {
        let me = env::predecessor_account_id();
        let amount = self.unclaimed.remove(&me).unwrap_or(0);
        require!(amount > 0, "Nothing unclaimed");
        Promise::new(to.unwrap_or(me)).transfer(NearToken::from_yoctonear(amount))
    }

    // ---------- owner ----------

    pub fn set_paused(&mut self, paused: bool) {
        self.assert_owner();
        self.paused = paused;
    }

    /// Rotating the key voids every outstanding release signed with the old key.
    pub fn set_guardian_key(&mut self, guardian_key: Base64VecU8) {
        self.assert_owner();
        require!(guardian_key.0.len() == 32, "guardian_key must be 32 bytes");
        self.guardian_key = guardian_key.0;
    }

    pub fn set_entry_fee(&mut self, entry_fee: U128) {
        self.assert_owner();
        require!(entry_fee.0 > 0, "entry_fee must be > 0");
        self.entry_fee = entry_fee.0;
    }

    pub fn set_max_payout(&mut self, max_payout: U128) {
        self.assert_owner();
        require!(max_payout.0 > 0, "max_payout must be > 0");
        self.max_payout = max_payout.0;
    }

    // ---------- views ----------

    pub fn get_state(&self) -> GameState {
        GameState {
            round: self.round,
            bounty: U128(self.bounty),
            entry_fee: U128(self.entry_fee),
            max_payout: U128(self.max_payout),
            paused: self.paused,
            total_attempts: U64(self.next_attempt - 1),
            last_winner: self.last_winner.clone(),
            guardian_key: Base64VecU8(self.guardian_key.clone()),
        }
    }

    pub fn get_attempt(&self, attempt_id: U64) -> Option<Attempt> {
        self.attempts.get(&attempt_id.0).cloned()
    }

    pub fn attempts_left(&self, account_id: AccountId) -> u8 {
        let day = env::block_timestamp() / DAY_NS;
        ATTEMPTS_PER_DAY - self.daily.get(&(account_id, day)).copied().unwrap_or(0)
    }

    pub fn get_unclaimed(&self, account_id: AccountId) -> U128 {
        U128(self.unclaimed.get(&account_id).copied().unwrap_or(0))
    }

    fn assert_owner(&self) {
        require!(env::predecessor_account_id() == self.owner, "OWNER_ONLY");
    }
}

#[cfg(test)]
mod tests;
