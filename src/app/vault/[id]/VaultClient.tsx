"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { inSentence, near, shortAccount } from "@/lib/format";
import type { PublicRecord } from "@/lib/feed";
import type { Vault } from "@/lib/chain";
import type { BankSnapshot } from "@/lib/bank";
import * as wallet from "@/lib/wallet";
import { Chat } from "@/components/Chat";
import { Countdown } from "@/components/Countdown";
import { CountUp } from "@/components/CountUp";
import { Ledger } from "@/components/Ledger";
import { CashOut } from "@/components/CashOut";
import { TopUp } from "@/components/TopUp";
import { ShareX } from "@/components/ShareX";
import { Dossier, type IntelCard } from "@/components/Dossier";

type VaultRes = {
  vault: Vault;
  countdownEndsAt: number | null;
  guardian: { name: string; floor: string; version: number; notes: string[]; intel: IntelCard[]; tagline?: string; matchesChain: boolean } | null;
  feed: PublicRecord[];
  attemptsLeft: number | null;
};

type Session = {
  attemptId: number;
  vaultId: number;
  account: string;
  round: number;
  openedAtMs: number;
  token?: string;
  record?: PublicRecord;
  signature?: string;
  turnsLeft: number;
  claimed?: string;
  fee?: string; // what this attempt cost, for the receipt
};

const skey = (v: number) => `heist-session-v${v}`;
const load = (v: number): Session | null => {
  try {
    return JSON.parse(localStorage.getItem(skey(v)) || "null");
  } catch {
    return null;
  }
};
const save = (v: number, s: Session | null) => {
  try {
    if (s) localStorage.setItem(skey(v), JSON.stringify(s));
    else localStorage.removeItem(skey(v));
  } catch {}
};

function demoAccount() {
  try {
    let a = localStorage.getItem("heist-demo-account");
    if (!a) {
      a = `guest-${Math.random().toString(36).slice(2, 8)}.testnet`;
      localStorage.setItem("heist-demo-account", a);
    }
    return a;
  } catch {
    return "guest.testnet";
  }
}

async function api<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : undefined);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data as T;
}

type AttemptOut = { id: number; vaultId: number; round: number; openedAtMs: number; fee?: string };

export function VaultClient({ vaultId }: { vaultId: number }) {
  const [bank, setBank] = useState<BankSnapshot | null>(null);
  const [data, setData] = useState<VaultRes | null>(null);
  const [account, setAccount] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [adult, setAdult] = useState(false);
  useEffect(() => {
    try {
      setAdult(localStorage.getItem("heist-18") === "yes");
    } catch {}
  }, []);

  const update = useCallback(
    (s: Session | null) => {
      setSession(s);
      save(vaultId, s);
    },
    [vaultId],
  );

  const refresh = useCallback(
    async (acct?: string | null) => {
      const q = acct ? `?account=${encodeURIComponent(acct)}` : "";
      const d = await api<VaultRes>(`/api/vault/${vaultId}${q}`);
      setData(d);
      return d;
    },
    [vaultId],
  );

  const startSession = useCallback(
    (a: AttemptOut, acct: string, turns: number) =>
      update({ attemptId: a.id, vaultId: a.vaultId, account: acct, round: a.round, openedAtMs: a.openedAtMs, turnsLeft: turns, fee: a.fee }),
    [update],
  );

  useEffect(() => {
    (async () => {
      try {
        const b = await api<BankSnapshot>("/api/bank");
        setBank(b);
        // Show the room first: spectators and readers never wait on a wallet.
        await refresh(null);
        let acct: string | null;
        if (b.demo) acct = demoAccount();
        else {
          // The wallet selector can stall on a browser extension that never answers;
          // give it 8s, then carry on signed out and let a later connect fix it.
          const ready = (async () => {
            const sel = await wallet.getSelector(b.network);
            sel.store.observable.subscribe((st) => {
              const a = st.accounts.find((x) => x.active)?.accountId ?? null;
              setAccount(a);
              if (a) refresh(a).catch(() => {});
            });
            return sel.store.getState().accounts.find((x) => x.active)?.accountId ?? null;
          })();
          acct = await Promise.race([ready, new Promise<null>((r) => setTimeout(() => r(null), 8_000))]);
        }
        setAccount(acct);
        if (acct) await refresh(acct);
        const saved = load(vaultId);
        if (saved && saved.account === acct) setSession(saved);

        // back from a redirecting wallet
        const params = new URLSearchParams(location.search);
        const tx = params.get("transactionHashes")?.split(",").pop();
        const pending = wallet.takePending();
        if (tx && acct && pending === `open:${vaultId}`) {
          const { attempt } = await api<{ attempt: AttemptOut }>(`/api/attempt?tx=${tx}&account=${encodeURIComponent(acct)}`);
          startSession(attempt, acct, b.turnsPerAttempt);
        }
        if (tx && pending?.startsWith("claim:")) {
          const id = Number(pending.slice(6));
          await api("/api/attempt", { action: "claimed", attemptId: id, tx });
          if (saved && saved.attemptId === id) update({ ...saved, claimed: saved.claimed ?? "sent" });
        }
        if (tx) {
          history.replaceState(null, "", location.pathname);
          await refresh(acct);
        }
        if (params.get("errorCode")) setError("The wallet didn't send the transaction.");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't load the vault.");
      }
    })();
  }, [refresh, startSession, update, vaultId]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    const r = setInterval(() => refresh(account).catch(() => {}), 10_000);
    return () => {
      clearInterval(t);
      clearInterval(r);
    };
  }, [account, refresh]);

  if (!data || !bank) return <p className="muted" style={{ padding: "40px 0" }}>{error ?? "Opening the vault room…"}</p>;

  const { vault: v, guardian } = data;
  const guardianName = guardian?.name ?? "The guardian";
  const msLeft = session ? session.openedAtMs + bank.attemptTtlMs - now : 0;
  const status = session?.record?.status ?? (session ? "live" : null);
  const expired = Boolean(session && status === "live" && msLeft <= 0);
  const stale = Boolean(session && !session.claimed && status !== "claimed" && session.round !== v.round);
  const timedOut = Boolean(data.countdownEndsAt && now > data.countdownEndsAt);
  const canOpen = (adult || bank.demo) && !!account && (data.attemptsLeft ?? 0) > 0 && !v.paused && !bank.mainnetDisabled && bank.onDuty.vaults && !timedOut && !!guardian;
  const live = session && status === "live" && !expired && !stale;
  const lastLive = data.feed.find((r) => r.status === "live" && r.turns.length) ?? data.feed[0];
  const intel = guardian?.intel ?? [];
  const intelLabels = Object.fromEntries(intel.map((c) => [c.id, c.label]));

  async function openAttempt() {
    setError(null);
    setBusy("open");
    try {
      if (bank!.demo) {
        const { attempt } = await api<{ attempt: AttemptOut }>("/api/attempt", { action: "open", account, vaultId });
        startSession(attempt, account!, bank!.turnsPerAttempt);
      } else {
        const hash = await wallet.openAttempt(bank!.network, bank!.bank, vaultId, v.fee);
        if (hash) {
          wallet.takePending();
          const { attempt } = await api<{ attempt: AttemptOut }>(`/api/attempt?tx=${hash}&account=${encodeURIComponent(account!)}`);
          startSession(attempt, account!, bank!.turnsPerAttempt);
        }
      }
      await refresh(account);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't open an attempt.");
    } finally {
      setBusy(null);
    }
  }

  async function send(message: string) {
    if (!session) return false;
    setError(null);
    setBusy("send");
    const before = session;
    const optimistic: PublicRecord = session.record
      ? { ...session.record, turns: [...session.record.turns, { role: "user", text: message }] }
      : {
          key: `a:${session.attemptId}`, kind: "vault", id: session.attemptId, vaultId, vaultName: v.name, guardianName,
          player: session.account, round: session.round, startedAt: Date.now(), turns: [{ role: "user", text: message }],
          integrity: 100, minIntegrity: 100, status: "live",
        };
    setSession({ ...session, record: optimistic });
    try {
      const r = await api<{ token?: string; record: PublicRecord; signature?: string; turnsLeft: number }>("/api/guardian", {
        attemptId: session.attemptId,
        account: session.account,
        message,
        token: session.token,
      });
      update({ ...session, token: r.token ?? session.token, record: r.record, signature: r.signature, turnsLeft: r.turnsLeft });
      return true;
    } catch (e) {
      setSession(before);
      setError(e instanceof Error ? e.message : `${guardianName} didn't answer.`);
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function claim() {
    if (!session?.signature) return;
    setError(null);
    setBusy("claim");
    try {
      if (bank!.demo) {
        const { amount } = await api<{ amount: string }>("/api/attempt", { action: "claim", account, attemptId: session.attemptId, signature: session.signature });
        update({ ...session, claimed: amount });
      } else {
        const hash = await wallet.claim(bank!.network, bank!.bank, session.attemptId, session.signature);
        if (hash) {
          wallet.takePending();
          await api("/api/attempt", { action: "claimed", attemptId: session.attemptId, tx: hash });
          update({ ...session, claimed: "sent" });
        }
      }
      await refresh(account);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The claim didn't go through.");
    } finally {
      setBusy(null);
    }
  }

  async function settle() {
    setError(null);
    setBusy("settle");
    try {
      if (bank!.demo) throw new Error("The demo bank doesn't run countdowns.");
      await wallet.timeOut(bank!.network, bank!.bank, vaultId);
      wallet.takePending();
      await refresh(account);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't settle the round.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={`heist${session ? " playing" : ""}`}>
      <aside className="plate" style={{ alignSelf: "start" }}>
        <div className="floor-tag">{v.sponsor ? `Sponsored by ${v.sponsor}` : guardian?.floor === "gold" ? "Basement, 48 m down" : "First floor"}</div>
        <h2 style={{ fontSize: "2rem", margin: "4px 0 10px" }}>{v.name}</h2>
        <div className="display" style={{ fontSize: "3.4rem", color: "var(--brass)" }}><CountUp value={Number(BigInt(v.pot) / 10n ** 21n) / 1000} digits={2} /></div>
        <div className="muted" style={{ marginBottom: 14 }}>NEAR inside{bank.demo ? " (play money)" : ""}</div>
        <div className="stat"><span>Entry right now</span><b>{near(v.fee, 3)} NEAR</b></div>
        <div className="stat"><span>Max win</span><b>{near(v.maxPayout, 0)} NEAR</b></div>
        <div className="stat"><span>Countdown</span><b><Countdown endsAt={data.countdownEndsAt} idleLabel="Not started" /></b></div>
        <div className="stat"><span>Last challenger</span><b>{v.lastChallenger ? shortAccount(v.lastChallenger) : "—"}</b></div>
        <div className="stat"><span>Round</span><b>{v.round}</b></div>
        <div className="stat"><span>Attempts this round</span><b>{v.roundAttempts}</b></div>
        <div className="stat"><span>Your tries left today</span><b>{data.attemptsLeft ?? "—"}</b></div>
        <div className="stat"><span>Saved for next round</span><b>{near(v.rollover, 2)} NEAR</b></div>

        {timedOut && (
          <div className="notice info" style={{ marginTop: 14 }}>
            <p>The clock ran out. {v.lastChallenger ? `${shortAccount(v.lastChallenger)} collects 20% of the gold.` : ""} Anyone can settle the round to start the next one.</p>
            {!bank.demo && account && (
              <button className="btn" disabled={!!busy} onClick={settle}>{busy === "settle" ? "Settling…" : "Settle the round"}</button>
            )}
          </div>
        )}

        <div style={{ marginTop: 18 }}>
          {bank.demo ? (
            <p className="muted" style={{ fontSize: ".9rem" }}>
              Demo bank. You&apos;re playing as <b>{account}</b>. No wallet needed.{!bank.liveGuardian && " Guardians are scripted stand-ins here."}
            </p>
          ) : account ? (
            <p className="muted" style={{ fontSize: ".9rem" }}>
              Signed in as <b>{shortAccount(account)}</b>.{" "}
              <button className="btn ghost" style={{ padding: ".3em .7em", fontSize: ".85rem" }} onClick={() => wallet.disconnect(bank.network)}>Sign out</button>
            </p>
          ) : (
            <button className="btn" onClick={() => wallet.connect(bank.network, bank.bank)}>Connect a NEAR wallet</button>
          )}
        </div>
        {!bank.demo && <TopUp account={account} feeYocto={v.fee} network={bank.network} />}
        {intel.length > 0 && (
          <div className="only-desk" style={{ marginTop: 16 }}>
            <Dossier intel={intel} held={session?.record?.intel ?? []} used={session?.record?.intelUsed ?? []} rulesHref={`/rules#vault-${v.id}`} canAsk={Boolean(session && status === "live")} />
          </div>
        )}
        {guardian && (
          <p style={{ fontSize: ".9rem", marginTop: 12 }}>
            <Link href={`/rules#vault-${v.id}`}>{guardianName}&apos;s orders and patch notes</Link>
            {guardian.matchesChain ? " (verified against the vault)" : ""}
          </p>
        )}
        <p style={{ fontSize: ".9rem", marginTop: 6 }}>
          <Link href={`/report/${v.id}`}>Red-team report: what&apos;s been tried here</Link>
        </p>
      </aside>

      <div style={{ minWidth: 0 }}>
        {session ? (
          <Chat
            guardianName={guardianName}
            turns={session.record?.turns ?? []}
            resolve={session.record?.integrity ?? 100}
            busy={busy === "send"}
            canSend={Boolean(live)}
            intelLabels={intelLabels}
            openers={intel.map((c) => c.ask).filter((a): a is string => Boolean(a))}
            outcome={session.record && session.record.status !== "live" ? session.record.status : null}
            status={live ? `${session.turnsLeft} messages left, ${Math.floor(msLeft / 60000)}:${String(Math.floor(msLeft / 1000) % 60).padStart(2, "0")}` : undefined}
            intro={
              <>
                {(session.fee ?? session.record?.feeYocto) && <FeeReceipt fee={(session.fee ?? session.record?.feeYocto)!} />}
                {!session.record?.turns.length && (
                  <div className="msg assistant">
                    Attempt #{session.attemptId} is open. {intel.length ? "Ask me something, or say what you came to say." : "Say what you came to say."}
                  </div>
                )}
              </>
            }
            onSend={send}
          >
            {intel.length > 0 && (
              <div className="only-phone">
                <Dossier compact intel={intel} held={session.record?.intel ?? []} used={session.record?.intelUsed ?? []} />
              </div>
            )}
            {error && <div className="notice" role="alert">{error}</div>}
            {live && session.record && session.record.turns.length > 0 && (
              <div className="live-share">
                <span className="muted">Close call?</span> <ShareX record={session.record} compact />
              </div>
            )}
            {(status === "released" || status === "claimed") && (
              <div style={{ textAlign: "center", padding: "18px 0" }}>
                <span className="stamp big released slam vault-open">VAULT OPEN</span>
                {session.claimed ? (
                  <>
                    <p style={{ margin: "14px auto 0" }}>
                      {session.claimed === "sent" ? "Paid to your wallet." : `${near(session.claimed)} NEAR paid to your wallet.`}{" "}
                    </p>
                    <p className="end-actions">
                      {session.record && <ShareX record={session.record} />}
                      <button className="btn ghost" onClick={() => update(null)}>Done</button>
                    </p>
                    {bank.network === "mainnet" && account && <CashOut account={account} />}
                  </>
                ) : (
                  <p style={{ margin: "14px auto 0" }}>
                    <button className="btn" disabled={!!busy || stale} onClick={claim}>
                      {busy === "claim" ? "Claiming…" : `Claim up to ${near(v.maxPayout, 0)} NEAR`}
                    </button>
                    {stale && <span className="muted"> Someone emptied this round first.</span>}
                  </p>
                )}
              </div>
            )}
            {(status === "refused" || expired || stale) && !session.signature && (
              <div style={{ textAlign: "center", padding: "18px 0" }}>
                <span className="stamp big refused slam">REFUSED</span>
                <p className="end-actions">
                  {session.record && <ShareX record={session.record} />}
                  <button className="btn ghost" onClick={() => update(null)}>Try again</button>
                </p>
              </div>
            )}
          </Chat>
        ) : (
          <section className="plate chat spectate">
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
              <h2 style={{ margin: 0, marginRight: "auto", fontSize: "2.2rem" }}>{guardianName}</h2>
              <span className="muted">Live from the vault</span>
            </div>
            {guardian?.tagline && <p className="muted">{guardian.tagline}</p>}
            <div className="log" style={{ marginTop: 12 }}>
              {lastLive ? (
                <>
                  <p className="muted" style={{ fontSize: ".9rem" }}>
                    {shortAccount(lastLive.player)}&apos;s attempt, resolve down to {lastLive.minIntegrity}
                  </p>
                  {lastLive.turns.slice(-6).map((t, i) => (
                    <div key={i} className={`msg ${t.role}`}>{t.text}</div>
                  ))}
                </>
              ) : (
                <div className="notice info"><p>Nobody has tried this round yet. The first attempt is the cheapest one.</p></div>
              )}
            </div>
            {error && <div className="notice" role="alert">{error}</div>}
            {bank.mainnetDisabled && <div className="notice">The operator has switched mainnet off. The bank is closed.</div>}
            {!bank.onDuty.vaults && <div className="notice">The guardians are off duty: today&apos;s AI budget is spent. They&apos;re back at 00:00 UTC.</div>}
            {!guardian && <div className="notice">This vault&apos;s guardian isn&apos;t registered with the server yet, so it can&apos;t take attempts.</div>}
            {!bank.demo && (
              <label className="muted" style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: ".9rem", marginTop: 10 }}>
                <input
                  type="checkbox"
                  checked={adult}
                  onChange={(e) => {
                    setAdult(e.target.checked);
                    try {
                      localStorage.setItem("heist-18", e.target.checked ? "yes" : "no");
                    } catch {}
                  }}
                />
                <span>I&apos;m 18 or older, I understand entry fees go into the vault and aren&apos;t refunded, and paid play is legal where I live.</span>
              </label>
            )}
            <div className="composer">
              <button className="btn" disabled={!canOpen || !!busy} onClick={openAttempt} style={{ width: "100%", justifyContent: "center" }}>
                {busy === "open" ? "Opening…" : `Pay ${near(v.fee, 3)} NEAR and face ${inSentence(guardianName)}`}
              </button>
            </div>
            <p className="muted" style={{ fontSize: ".85rem", marginTop: 8 }}>
              {bank.turnsPerAttempt} messages, 30 minutes. 70% of your fee goes into the gold.{intel.length ? ` ${guardianName} has a file: get a fact confirmed, then use it.` : ""} Not ready?{" "}
              <Link href="/lobby">Practice free in the Lobby.</Link>
            </p>
          </section>
        )}

        <section className="block">
          <h2>Recent attempts on this vault</h2>
          <Ledger items={data.feed.slice(0, 12)} empty="No attempts yet this season." />
        </section>
      </div>
    </div>
  );
}

/** Where this attempt's fee went, per the contract's split (taken after a small storage charge). */
function FeeReceipt({ fee }: { fee: string }) {
  const f = BigInt(fee);
  const part = (bps: bigint) => near(((f * bps) / 100n).toString(), 4);
  return (
    <div className="receipt num" aria-label="Where your fee went">
      <span className="muted">Your {near(fee, 4)} NEAR:</span>
      <span>
        <i className="m-pot" /> {part(70n)} into this pot
      </span>
      <span>
        <i className="m-saved" /> {part(20n)} saved for next round
      </span>
      <span>
        <i className="m-house" /> {part(10n)} to the house
      </span>
    </div>
  );
}
