#!/usr/bin/env bash
# Deploy HeistBank to testnet: fund the owner from faucet accounts, create the Teller's Vault and
# the Gold Vault, then delete the bank's full-access key so nobody can change the code.
#
# Needs near CLI (near-cli-rs), cargo-near, rust target wasm32-unknown-unknown (and a C linker).
# Env (never commit): BANK_ID OWNER_ID OWNER_PK OWNER_SK BANK_PK BANK_SK TAG
#   G_TELLER_PK G_GOLD_PK   guardian public keys (base64), from `npm run keygen` twice
#   H_TELLER H_GOLD         sha256 (base64) of the floor prompts: `npm run prompt-hashes`
set -euo pipefail
cd "$(dirname "$0")/.."; export PATH=$HOME/.cargo/bin:$PATH
N="network-config testnet"; WASM=contract/target/near/heist_bank.wasm
[ -f "$WASM" ] || (cd contract && cargo near build non-reproducible-wasm --no-abi)
: "${BANK_ID:?}" "${OWNER_ID:?}" "${OWNER_PK:?}" "${OWNER_SK:?}" "${BANK_PK:?}" "${BANK_SK:?}" "${G_TELLER_PK:?}" "${G_GOLD_PK:?}" "${H_TELLER:?}" "${H_GOLD:?}" "${TAG:?}"
say() { printf '\n== %s\n' "$*"; }
ok() { grep -iE "$1" | head -3 || true; }
say "accounts"
near account create-account sponsor-by-faucet-service "$OWNER_ID" use-manually-provided-public-key "$OWNER_PK" $N create 2>&1 | ok "created|error"
near account create-account sponsor-by-faucet-service "$BANK_ID" use-manually-provided-public-key "$BANK_PK" $N create 2>&1 | ok "created|error"
for i in 1 2 3; do
  F="heist-fund$i-$TAG.testnet"
  near account create-account sponsor-by-faucet-service "$F" autogenerate-new-keypair save-to-legacy-keychain $N create >/dev/null 2>&1 || echo "faucet $i failed"
  sleep 2
  near tokens "$F" send-near "$OWNER_ID" '9.5 NEAR' $N sign-with-legacy-keychain send 2>&1 | ok "success|error"
done
sleep 3
say "deploy + init"
near contract deploy "$BANK_ID" use-file "$WASM" with-init-call new \
  json-args "{\"owner\":\"$OWNER_ID\",\"default_guardian_key\":\"$G_TELLER_PK\"}" \
  prepaid-gas '100.0 Tgas' attached-deposit '0 NEAR' $N sign-with-plaintext-private-key "$BANK_SK" send 2>&1 | ok "deployed|error"
owner() { near contract call-function as-transaction "$BANK_ID" "$1" json-args "$2" prepaid-gas '100.0 Tgas' attached-deposit "$3" sign-as "$OWNER_ID" $N sign-with-plaintext-private-key "$OWNER_SK" send 2>&1 | ok "EVENT|error|panicked"; }
say "Teller's Vault"
owner create_vault "{\"config\":{\"name\":\"Teller's Vault\",\"base_fee\":\"50000000000000000000000\",\"fee_bps\":100,\"max_payout\":\"3000000000000000000000000\",\"countdown_ms\":\"86400000\",\"max_daily\":5},\"prompt_hash\":\"$H_TELLER\",\"guardian_key\":null}" '8 NEAR'
say "Gold Vault"
owner create_vault "{\"config\":{\"name\":\"Gold Vault\",\"base_fee\":\"200000000000000000000000\",\"fee_bps\":200,\"max_payout\":\"12000000000000000000000000\",\"countdown_ms\":\"172800000\",\"max_daily\":3},\"prompt_hash\":\"$H_GOLD\",\"guardian_key\":\"$G_GOLD_PK\"}" '25 NEAR'
say "lock"
near account delete-keys "$BANK_ID" public-keys "$BANK_PK" $N sign-with-plaintext-private-key "$BANK_SK" send 2>&1 | ok "deleted|error"
say "vaults"
near contract call-function as-read-only "$BANK_ID" list_vaults json-args '{}' $N now 2>&1 | grep -E '"(id|name|pot|round|base_fee|fee_bps|max_payout)"'
near account view-account-summary "$OWNER_ID" $N now 2>&1 | grep -iE "balance" | head -2
