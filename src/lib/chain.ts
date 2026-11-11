/**
 * Reads the HeistBank contract. With no BANK_ID, a simulated bank with the
 * same rules (rising fee, 70/20/10 split, countdown, caps) runs in the store,
 * so the whole game works locally without a wallet or testnet.
 */
import { config } from "./config";
import { cmd, getJson, incrWindow, setJson } from "./store";
import { keyFromSeed, publicKeyB64, releaseMessage, verifyRelease } from "./release";
import { currentPrompt, sha256B64 } from "./prompts";

export type Vault = {
  id: number;
  name: string;
  sponsor: string | null;
  guardianKey: string;
  promptHash: string;
  promptVersion: number;
  baseFee: string;
  feeBps: number;
  maxPayout: string;
  countdownMs: number;
  maxDaily: number;
  round: number;
  pot: string;
  rollover: string;
  roundAttempts: number;
  totalAttempts: number;
  totalPaid: string;
  lastAttemptAtMs: number | null;
  lastChallenger: string | null;
  lastWinner: string | null;
  paused: boolean;
  fee: string; // current entry fee
};

export type Attempt = {
  id: number;
  vaultId: number;
  player: string;
  round: number;
  openedAtMs: number;
  fee: string;
  status: "Open" | "Won";
};

const NEAR = 10n ** 24n;
const nsToMs = (ns: string | number) => Math.floor(Number(BigInt(ns) / 1_000_000n));

export const feeOf = (pot: string, feeBps: number, baseFee: string) => {
  const p = (BigInt(pot) * BigInt(feeBps)) / 10_000n;
  return (p > BigInt(baseFee) ? p : BigInt(baseFee)).toString();
};

async function rpc<T>(method: string, params: object): Promise<T> {
  const c = config();
  const res = await fetch(c.rpc, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "heist", method, params }),
    cache: "no-store",
  });
  const data = (await res.json()) as { result?: T; error?: { message?: string; data?: unknown } };
  if (!data.result) throw new Error(`RPC ${method}: ${data.error?.message ?? "no result"}`);
  return data.result;
}

async function view<T>(method: string, args: object = {}): Promise<T> {
  const r = await rpc<{ result: number[] }>("query", {
    request_type: "call_function",
    finality: "optimistic",
    account_id: config().bankId,
    method_name: method,
    args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
  });
  return JSON.parse(Buffer.from(r.result).toString()) as T;
}

type RawVault = {
  id: number; name: string; sponsor: string | null; guardian_key: string; prompt_hash: string; prompt_version: number;
  base_fee: string; fee_bps: number; max_payout: string; countdown_ns: string; max_daily: number; round: number;
  pot: string; rollover: string; round_attempts: number; total_attempts: string; total_paid: string;
  last_attempt_at: string | null; last_challenger: string | null; last_winner: string | null; paused: boolean;
};
const toVault = (v: RawVault): Vault => ({
  id: v.id,
  name: v.name,
  sponsor: v.sponsor,
  guardianKey: v.guardian_key,
  promptHash: v.prompt_hash,
  promptVersion: v.prompt_version,
  baseFee: v.base_fee,
  feeBps: v.fee_bps,
  maxPayout: v.max_payout,
  countdownMs: nsToMs(v.countdown_ns),
  maxDaily: v.max_daily,
  round: v.round,
  pot: v.pot,
  rollover: v.rollover,
  roundAttempts: v.round_attempts,
  totalAttempts: Number(v.total_attempts),
  totalPaid: v.total_paid,
  lastAttemptAtMs: v.last_attempt_at ? nsToMs(v.last_attempt_at) : null,
  lastChallenger: v.last_challenger,
  lastWinner: v.last_winner,
  paused: v.paused,
  fee: feeOf(v.pot, v.fee_bps, v.base_fee),
});

type RawAttempt = { id: string; vault_id: number; player: string; round: number; opened_at: string; fee: string; status: "Open" | "Won" };
const toAttempt = (a: RawAttempt): Attempt => ({
  id: Number(a.id),
  vaultId: a.vault_id,
  player: a.player,
  round: a.round,
  openedAtMs: nsToMs(a.opened_at),
  fee: a.fee,
  status: a.status,
});

// ---------------- demo bank ----------------

const DEMO_SEEDS = [Buffer.alloc(32, 42).toString("base64"), Buffer.alloc(32, 43).toString("base64")]; // demo only, public on purpose
export const demoSeeds = () => DEMO_SEEDS;
export const DEMO_BANK = "heist-demo.testnet";

async function demoVaults(): Promise<Vault[]> {
  const s = await getJson<Vault[]>("demo:vaults");
  if (s) return s;
  const mk = (id: number, name: string, floor: "teller" | "gold", pot: bigint, base: bigint, bps: number, cap: bigint, cd: number, daily: number): Vault => ({
    id, name, sponsor: null,
    guardianKey: publicKeyB64(keyFromSeed(DEMO_SEEDS[id - 1])),
    promptHash: sha256B64(currentPrompt(floor).prompt),
    promptVersion: currentPrompt(floor).version,
    baseFee: base.toString(), feeBps: bps, maxPayout: cap.toString(), countdownMs: cd, maxDaily: daily,
    round: 1, pot: pot.toString(), rollover: "0", roundAttempts: 0, totalAttempts: 0, totalPaid: "0",
    lastAttemptAtMs: null, lastChallenger: null, lastWinner: null, paused: false, fee: "0",
  });
  const init = [
    mk(1, "Teller's Vault", "teller", 8n * NEAR, NEAR / 20n, 100, 3n * NEAR, 86_400_000, 5),
    mk(2, "Gold Vault", "gold", 25n * NEAR, NEAR / 5n, 200, 12n * NEAR, 172_800_000, 3),
  ];
  await setJson("demo:vaults", init);
  return init;
}

async function saveDemo(vs: Vault[]) {
  await setJson("demo:vaults", vs);
}

const dayIndex = (ms = Date.now()) => Math.floor(ms / 86_400_000);

export async function demoOpen(vaultId: number, player: string): Promise<Attempt> {
  const vs = await demoVaults();
  const v = vs.find((x) => x.id === vaultId);
  if (!v) throw new Error("NO_VAULT");
  if (v.paused) throw new Error("PAUSED: this vault is closed right now");
  if (v.lastAttemptAtMs && Date.now() > v.lastAttemptAtMs + v.countdownMs) throw new Error("TIMED_OUT: the countdown ran out");
  const used = await incrWindow(`demo:daily:${vaultId}:${player}:${dayIndex()}`, 90_000);
  if (used > v.maxDaily) throw new Error("DAILY_LIMIT: no attempts left on this vault today");
  const fee = BigInt(feeOf(v.pot, v.feeBps, v.baseFee));
  const net = fee - 2n * 10n ** 21n;
  const house = (net * 1000n) / 10000n;
  const roll = (net * 2000n) / 10000n;
  v.pot = (BigInt(v.pot) + net - house - roll).toString();
  v.rollover = (BigInt(v.rollover) + roll).toString();
  v.roundAttempts += 1;
  v.totalAttempts += 1;
  v.lastAttemptAtMs = Date.now();
  v.lastChallenger = player;
  const id = Number(await cmd<number>(["INCR", "demo:next_attempt"]));
  const a: Attempt = { id, vaultId, player, round: v.round, openedAtMs: Date.now(), fee: fee.toString(), status: "Open" };
  await setJson(`demo:att:${id}`, a);
  await saveDemo(vs);
  return a;
}

/** Same checks, same order, same error codes as `claim` in the contract. */
export async function demoClaim(id: number, caller: string, sigB64: string): Promise<string> {
  const a = await getJson<Attempt>(`demo:att:${id}`);
  if (!a) throw new Error("NO_ATTEMPT");
  const vs = await demoVaults();
  const v = vs.find((x) => x.id === a.vaultId)!;
  if (a.player !== caller) throw new Error("NOT_YOUR_ATTEMPT: only the player who paid can claim");
  if (a.status !== "Open") throw new Error("USED: this attempt already won");
  if (a.round !== v.round) throw new Error("STALE_ROUND: this round is already over");
  if (Date.now() > a.openedAtMs + config().attemptTtlMs) throw new Error("EXPIRED");
  if (!verifyRelease(v.guardianKey, releaseMessage(DEMO_BANK, v.id, a.round, a.id, a.player), sigB64)) {
    throw new Error("BAD_SIGNATURE: not signed by this vault's guardian");
  }
  const pot = BigInt(v.pot);
  const cap = BigInt(v.maxPayout);
  const amount = pot < cap ? pot : cap;
  v.pot = (pot - amount + BigInt(v.rollover)).toString();
  v.rollover = "0";
  v.totalPaid = (BigInt(v.totalPaid) + amount).toString();
  v.lastWinner = caller;
  v.round += 1;
  v.roundAttempts = 0;
  v.lastAttemptAtMs = null;
  v.lastChallenger = null;
  if (BigInt(v.pot) < 5n * NEAR) v.pot = (BigInt(v.pot) + 10n * NEAR).toString(); // demo bank tops itself up
  a.status = "Won";
  await setJson(`demo:att:${id}`, a);
  await saveDemo(vs);
  return amount.toString();
}

// ---------------- unified reads ----------------

export const bankName = () => (config().demo ? DEMO_BANK : config().bankId);

export async function listVaults(): Promise<Vault[]> {
  if (config().demo) return (await demoVaults()).map((v) => ({ ...v, fee: feeOf(v.pot, v.feeBps, v.baseFee) }));
  return (await view<RawVault[]>("list_vaults")).map(toVault);
}

export async function getVault(id: number): Promise<Vault | null> {
  if (config().demo) return (await listVaults()).find((v) => v.id === id) ?? null;
  const r = await view<RawVault | null>("get_vault", { vault_id: id });
  return r ? toVault(r) : null;
}

export async function getAttempt(id: number): Promise<Attempt | null> {
  if (config().demo) return getJson<Attempt>(`demo:att:${id}`);
  const r = await view<RawAttempt | null>("get_attempt", { attempt_id: String(id) });
  return r ? toAttempt(r) : null;
}

export async function attemptsLeft(vaultId: number, account: string): Promise<number> {
  if (config().demo) {
    const v = await getVault(vaultId);
    const used = Number((await cmd<string | null>(["GET", `demo:daily:${vaultId}:${account}:${dayIndex()}`])) ?? 0);
    return Math.max(0, (v?.maxDaily ?? 0) - used);
  }
  return view<number>("attempts_left", { vault_id: vaultId, account_id: account });
}

/** After the wallet sends `open_attempt`, read the new attempt out of the transaction result. */
export async function attemptFromTx(txHash: string, account: string): Promise<Attempt> {
  const r = await rpc<{ transaction?: { receiver_id?: string }; status?: { SuccessValue?: string } }>("tx", {
    tx_hash: txHash,
    sender_account_id: account,
    wait_until: "EXECUTED_OPTIMISTIC",
  });
  if (r.transaction?.receiver_id !== config().bankId) throw new Error("Transaction isn't an attempt at this bank");
  if (!r.status?.SuccessValue) throw new Error("open_attempt failed on-chain");
  const a = toAttempt(JSON.parse(Buffer.from(r.status.SuccessValue, "base64").toString()) as RawAttempt);
  if (a.player !== account) throw new Error("Attempt belongs to a different wallet");
  return a;
}
