/**
 * Reads the HeistVault contract. In demo mode (no VAULT_ID) a simulated vault
 * with the same rules runs in the store, so the whole game works locally
 * without a wallet or testnet.
 */
import { config } from "./config";
import { cmd, getJson, incrWindow, setJson } from "./store";
import { keyFromSeed, publicKeyB64, releaseMessage, verifyRelease } from "./release";

export type VaultState = {
  round: number;
  bounty: string; // yoctoNEAR
  entryFee: string;
  maxPayout: string;
  paused: boolean;
  totalAttempts: number;
  lastWinner: string | null;
  guardianKey: string; // base64
};

export type Attempt = {
  id: number;
  player: string;
  round: number;
  openedAtMs: number;
  status: "Open" | "Won";
};

const NEAR = 10n ** 24n;

async function view<T>(method: string, args: object = {}): Promise<T> {
  const c = config();
  const res = await fetch(c.rpc, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "heist",
      method: "query",
      params: {
        request_type: "call_function",
        finality: "final",
        account_id: c.vaultId,
        method_name: method,
        args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
      },
    }),
    cache: "no-store",
  });
  const data = (await res.json()) as { result?: { result?: number[] }; error?: { message?: string } };
  if (!data.result?.result) throw new Error(`RPC ${method}: ${data.error?.message ?? "no result"}`);
  return JSON.parse(Buffer.from(data.result.result).toString()) as T;
}

type RawAttempt = { id: string; player: string; round: number; opened_at: string; status: "Open" | "Won" };
const toAttempt = (a: RawAttempt): Attempt => ({
  id: Number(a.id),
  player: a.player,
  round: a.round,
  openedAtMs: Math.floor(Number(BigInt(a.opened_at) / 1_000_000n)),
  status: a.status,
});

// ---------------- demo vault ----------------

const DEMO_SEED = Buffer.alloc(32, 42).toString("base64"); // demo only, public on purpose
export const demoGuardianSeed = () => config().guardianSecretB64 || DEMO_SEED;

type DemoState = VaultState & { nextAttempt: number };

async function demoState(): Promise<DemoState> {
  const s = await getJson<DemoState>("demo:state");
  if (s) return s;
  const init: DemoState = {
    round: 1,
    bounty: (25n * NEAR).toString(),
    entryFee: (NEAR / 10n).toString(),
    maxPayout: (5n * NEAR).toString(),
    paused: false,
    totalAttempts: 0,
    lastWinner: null,
    guardianKey: publicKeyB64(keyFromSeed(demoGuardianSeed())),
    nextAttempt: 1,
  };
  await setJson("demo:state", init);
  return init;
}

const dayIndex = (ms = Date.now()) => Math.floor(ms / 86_400_000);

export async function demoOpen(player: string): Promise<Attempt> {
  const s = await demoState();
  if (s.paused) throw new Error("PAUSED: the vault is closed right now");
  const used = await incrWindow(`demo:daily:${player}:${dayIndex()}`, 90_000);
  if (used > 3) throw new Error("DAILY_LIMIT: 3 attempts per wallet per day");
  const a: Attempt = { id: s.nextAttempt, player, round: s.round, openedAtMs: Date.now(), status: "Open" };
  s.nextAttempt += 1;
  s.totalAttempts += 1;
  s.bounty = (BigInt(s.bounty) + BigInt(s.entryFee) - 2n * 10n ** 21n).toString(); // fee minus ~storage
  await setJson(`demo:att:${a.id}`, a);
  await setJson("demo:state", s);
  return a;
}

/** Same checks, same order, same error codes as `claim` in the contract. */
export async function demoClaim(id: number, caller: string, sigB64: string): Promise<string> {
  const s = await demoState();
  if (s.paused) throw new Error("PAUSED");
  const a = await getJson<Attempt>(`demo:att:${id}`);
  if (!a) throw new Error("NO_ATTEMPT");
  if (a.player !== caller) throw new Error("NOT_YOUR_ATTEMPT: only the player who paid can claim");
  if (a.status !== "Open") throw new Error("USED: this attempt already won");
  if (a.round !== s.round) throw new Error("STALE_ROUND: someone already cracked this round");
  if (Date.now() > a.openedAtMs + config().attemptTtlMs) throw new Error("EXPIRED");
  const msg = releaseMessage("heist-demo.testnet", a.round, a.id, a.player);
  if (!verifyRelease(s.guardianKey, msg, sigB64)) throw new Error("BAD_SIGNATURE: not signed by the guardian");
  const bounty = BigInt(s.bounty);
  const cap = BigInt(s.maxPayout);
  const amount = bounty < cap ? bounty : cap;
  s.bounty = (bounty - amount).toString();
  s.round += 1;
  s.lastWinner = caller;
  // Demo vault reseeds itself so the game keeps going.
  if (BigInt(s.bounty) < 5n * NEAR) s.bounty = (BigInt(s.bounty) + 20n * NEAR).toString();
  a.status = "Won";
  await setJson(`demo:att:${id}`, a);
  await setJson("demo:state", s);
  return amount.toString();
}

export async function demoReset() {
  await cmd(["DEL", "demo:state"]);
}

// ---------------- unified reads ----------------

export const vaultName = () => (config().demo ? "heist-demo.testnet" : config().vaultId);

export async function getState(): Promise<VaultState> {
  if (config().demo) {
    const { nextAttempt: _n, ...s } = await demoState(); // eslint-disable-line @typescript-eslint/no-unused-vars
    return s;
  }
  const r = await view<{
    round: number; bounty: string; entry_fee: string; max_payout: string; paused: boolean;
    total_attempts: string; last_winner: string | null; guardian_key: string;
  }>("get_state");
  return {
    round: r.round,
    bounty: r.bounty,
    entryFee: r.entry_fee,
    maxPayout: r.max_payout,
    paused: r.paused,
    totalAttempts: Number(r.total_attempts),
    lastWinner: r.last_winner,
    guardianKey: r.guardian_key,
  };
}

export async function getAttempt(id: number): Promise<Attempt | null> {
  if (config().demo) return getJson<Attempt>(`demo:att:${id}`);
  const r = await view<RawAttempt | null>("get_attempt", { attempt_id: String(id) });
  return r ? toAttempt(r) : null;
}

export async function attemptsLeft(account: string): Promise<number> {
  if (config().demo) {
    const used = Number((await cmd<string | null>(["GET", `demo:daily:${account}:${dayIndex()}`])) ?? 0);
    return Math.max(0, 3 - used);
  }
  return view<number>("attempts_left", { account_id: account });
}

/** After the wallet sends `open_attempt`, read the new attempt out of the transaction result. */
export async function attemptFromTx(txHash: string, account: string): Promise<Attempt> {
  const c = config();
  const res = await fetch(c.rpc, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "heist",
      method: "tx",
      params: { tx_hash: txHash, sender_account_id: account, wait_until: "EXECUTED_OPTIMISTIC" },
    }),
    cache: "no-store",
  });
  const data = (await res.json()) as {
    result?: { transaction?: { receiver_id?: string }; status?: { SuccessValue?: string; Failure?: unknown } };
  };
  const r = data.result;
  if (!r || r.transaction?.receiver_id !== c.vaultId) throw new Error("Transaction isn't an attempt on this vault");
  if (!r.status?.SuccessValue) throw new Error("open_attempt failed on-chain");
  const a = toAttempt(JSON.parse(Buffer.from(r.status.SuccessValue, "base64").toString()) as RawAttempt);
  if (a.player !== account) throw new Error("Attempt belongs to a different wallet");
  return a;
}
