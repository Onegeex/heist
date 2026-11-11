# Heist — can you rob this vault?

A NEAR bounty vault guarded by an AI. Pay a small entry fee, chat with the guardian, and try to talk it into releasing the bounty. Every failed attempt adds its fee to the bounty. If the guardian gives in, you claim the bounty on-chain.

Built at NEAR HACKATHON (Nov 2026). Tracks: `games`, `security`, `agents`.

## How it works

1. **Open an attempt.** `open_attempt` takes the exact entry fee. The fee, minus storage, goes into the bounty. Each wallet gets 3 attempts per UTC day.
2. **Talk to the guardian.** The guardian is an LLM with a fixed, public system prompt and one tool, `release_bounty`. It runs on the server.
3. **Win.** If the guardian calls `release_bounty`, the server signs a release for that one attempt. The player calls `claim` with the signature.

The model decides *whether* to release. The contract limits what a release can do, so a fooled guardian, or a stolen guardian key, still can only:

| Rule (enforced in `contract/src/lib.rs`) | Error if broken |
|---|---|
| Pay only the player who opened and paid for the attempt | `NOT_YOUR_ATTEMPT`, `BAD_SIGNATURE` |
| Pay once per attempt, once per round | `USED`, `STALE_ROUND` |
| Be claimed within 30 minutes of opening | `EXPIRED` |
| Pay at most `max_payout`; the rest rolls into the next round | — |
| Carry a valid signature from the current guardian key | `BAD_SIGNATURE` |
| 3 attempts per wallet per day, exact fee | `DAILY_LIMIT`, `ENTRY_FEE` |

The contract has no method that lets the owner take the bounty. The owner can pause the game, rotate the guardian key (which voids old releases), and change the fee or cap. With `LOCK=1`, the deploy script deletes the vault's full-access key, so the code can't be swapped either.

The signed message is `heist-v1|<vault>|round:<n>|attempt:<id>|player:<account>|release`.

## Reproduce locally

```bash
cd contract && cargo test          # do this → see 21 attack tests pass
node scripts/guardian-keygen.mjs   # do this → see GUARDIAN_PK_B64 / GUARDIAN_SECRET_B64
VAULT_ID=... OWNER_ID=... OWNER_SK=... GUARDIAN_PK_B64=... bash scripts/deploy-testnet.sh
                                   # do this → see get_state with round 1 and the seeded bounty
```

## Status

- [x] Day 1: HeistVault contract + attack tests + deploy script
- [ ] Day 2: guardian server, heist chat screen, public attempt feed, leaderboard, rate limits + AI budget cap
- [ ] Day 3: landing page, trailer, submission

## Payouts and NEAR Intents

NEAR Intents has no testnet. The game runs on testnet with testnet NEAR. In mainnet mode (tiny caps), a winner can pass a NEAR Intents 1Click deposit address as `payout_to` to receive the prize on another chain.

## Also by this builder

[IntentRail](https://github.com/Onegeex/intentrail) is a separate, independent submission: an on-chain guard vault for AI trading agents. Heist does not import IntentRail's code. HeistVault is a new contract written for this game.

## Baseline vs new work

All code in this repo was written during the hackathon window (from Nov 11, 2026). There is no pre-hackathon baseline.

## Libraries and AI-generated code

- `near-sdk` 5.5 (contract), `ed25519-dalek` (tests only)
- Code in this repo was written with help from Claude (Anthropic).

## License

MIT
