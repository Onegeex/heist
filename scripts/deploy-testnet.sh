#!/usr/bin/env bash
# Deploy HeistVault to NEAR testnet, seed the trophy bounty, and (optionally) lock it.
#
# Needs: near CLI (near-cli-rs), cargo-near, rust target wasm32-unknown-unknown.
#
# Required env (never commit these):
#   VAULT_ID            account to create for the vault, e.g. heist-vault.testnet
#   OWNER_ID / OWNER_SK owner account + its private key (can pause, rotate key, change fee/cap; cannot take the bounty)
#   GUARDIAN_PK_B64     from `node scripts/guardian-keygen.mjs`
# Optional:
#   ENTRY_FEE_NEAR      default 0.1
#   MAX_PAYOUT_NEAR     default 5
#   SEED_NEAR           default 3   (trophy bounty)
#   LOCK=1              delete the vault's full-access key after deploy, so nobody (you included)
#                       can redeploy the code and take the bounty. Do this for the judged deploy.
set -euo pipefail
NET="network-config testnet"
WASM=contract/target/near/heist_vault.wasm
ENTRY_FEE_NEAR=${ENTRY_FEE_NEAR:-0.1}
MAX_PAYOUT_NEAR=${MAX_PAYOUT_NEAR:-5}
SEED_NEAR=${SEED_NEAR:-3}

yocto() { python3 -c "from decimal import Decimal; print(int(Decimal('$1') * 10**24))"; }
say() { printf '\n== %s\n' "$*"; }

: "${VAULT_ID:?}" "${OWNER_ID:?}" "${OWNER_SK:?}" "${GUARDIAN_PK_B64:?}"

say "Build"
(cd contract && cargo near build non-reproducible-wasm)

say "Create $VAULT_ID (faucet-funded)"
near account create-account sponsor-by-faucet-service "$VAULT_ID" \
  autogenerate-new-keypair save-to-legacy-keychain $NET create

say "Deploy + init"
near contract deploy "$VAULT_ID" use-file "$WASM" with-init-call new \
  json-args "{\"owner\":\"$OWNER_ID\",\"guardian_key\":\"$GUARDIAN_PK_B64\",\"entry_fee\":\"$(yocto "$ENTRY_FEE_NEAR")\",\"max_payout\":\"$(yocto "$MAX_PAYOUT_NEAR")\"}" \
  prepaid-gas '100.0 Tgas' attached-deposit '0 NEAR' \
  $NET sign-with-legacy-keychain send

say "Seed trophy bounty: $SEED_NEAR NEAR"
near contract call-function as-transaction "$VAULT_ID" seed json-args '{}' \
  prepaid-gas '30.0 Tgas' attached-deposit "$SEED_NEAR NEAR" \
  sign-as "$OWNER_ID" $NET sign-with-plaintext-private-key "$OWNER_SK" send

if [ "${LOCK:-0}" = "1" ]; then
  say "Lock: deleting the vault's full-access key"
  PK=$(near account list-keys "$VAULT_ID" $NET now 2>/dev/null | grep -o 'ed25519:[A-Za-z0-9]*' | head -1)
  near account delete-keys "$VAULT_ID" public-keys "$PK" $NET sign-with-legacy-keychain send
fi

say "State"
near contract call-function as-read-only "$VAULT_ID" get_state json-args '{}' $NET now
