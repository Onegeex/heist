"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { near } from "@/lib/format";
import type { PublicRecord } from "@/lib/feed";
import * as wallet from "@/lib/wallet";
import { CashOut } from "./CashOut";

type StateRes = {
  network: wallet.Net;
  demo: boolean;
  vault: string;
  mainnetDisabled: boolean;
  liveGuardian: boolean;
  guardianOnDuty: boolean;
  turnsPerAttempt: number;
  attemptTtlMs: number;
  attemptsLeft: number | null;
  state: { round: number; bounty: string; entryFee: string; maxPayout: string; paused: boolean; totalAttempts: number };
};

type Session = {
  attemptId: number;
  account: string;
  round: number;
  openedAtMs: number;
  token?: string;
  record?: PublicRecord;
  signature?: string;
  turnsLeft: number;
  claimed?: string; // amount, once paid
};

const SKEY = "heist-session";
const load = (): Session | null => {
  try {
    return JSON.parse(localStorage.getItem(SKEY) || "null");
  } catch {
    return null;
  }
};
const save = (s: Session | null) => {
  try {
    if (s) localStorage.setItem(SKEY, JSON.stringify(s));
    else localStorage.removeItem(SKEY);
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

export function HeistClient() {
  const [info, setInfo] = useState<StateRes | null>(null);
  const [account, setAccount] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const logRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async (acct?: string | null) => {
    const q = acct ? `?account=${encodeURIComponent(acct)}` : "";
    const s = await api<StateRes>(`/api/state${q}`);
    setInfo(s);
    return s;
  }, []);

  const update = (s: Session | null) => {
    setSession(s);
    save(s);
  };

  // boot: network, account, saved session, wallet redirects
  useEffect(() => {
    (async () => {
      try {
        const s = await refresh();
        let acct: string | null;
        if (s.demo) acct = demoAccount();
        else {
          acct = await wallet.currentAccount(s.network);
          const sel = await wallet.getSelector(s.network);
          sel.store.observable.subscribe((st) => {
            const a = st.accounts.find((x) => x.active)?.accountId ?? null;
            setAccount(a);
            if (a) refresh(a);
          });
        }
        setAccount(acct);
        if (acct) await refresh(acct);
        const saved = load();
        if (saved && saved.account === acct) setSession(saved);

        // returning from a redirect wallet
        const params = new URLSearchParams(location.search);
        const tx = params.get("transactionHashes")?.split(",").pop();
        const pending = wallet.takePending();
        if (tx && acct && pending === "open") {
          const { attempt } = await api<{ attempt: { id: number; round: number; openedAtMs: number } }>(
            `/api/attempt?tx=${tx}&account=${encodeURIComponent(acct)}`,
          );
          update({ attemptId: attempt.id, account: acct, round: attempt.round, openedAtMs: attempt.openedAtMs, turnsLeft: s.turnsPerAttempt });
        }
        if (tx && pending?.startsWith("claim:")) {
          const id = Number(pending.slice(6));
          await api("/api/attempt", { action: "claimed", attemptId: id });
          if (saved && saved.attemptId === id) update({ ...saved, claimed: saved.claimed ?? "sent" });
        }
        if (tx) history.replaceState(null, "", location.pathname);
        if (params.get("errorCode")) setError("The wallet didn't send the transaction.");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't load the vault.");
      }
    })();
  }, [refresh]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    const r = setInterval(() => refresh(account).catch(() => {}), 12_000);
    return () => {
      clearInterval(t);
      clearInterval(r);
    };
  }, [account, refresh]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [session?.record?.turns.length, busy]);

  if (!info) {
    return <p className="muted" style={{ padding: "40px 0" }}>{error ?? "Opening the vault room…"}</p>;
  }

  const fee = info.state.entryFee;
  const msLeft = session ? session.openedAtMs + info.attemptTtlMs - now : 0;
  const status = session?.record?.status ?? (session ? "live" : null);
  const expired = session && status === "live" && msLeft <= 0;
  const stale = session && !session.claimed && status !== "claimed" && session.round !== info.state.round;
  const resolve = session?.record?.integrity ?? 100;
  const canOpen = !!account && (info.attemptsLeft ?? 0) > 0 && !info.state.paused && !info.mainnetDisabled && info.guardianOnDuty;

  async function openAttempt() {
    setError(null);
    setBusy("open");
    try {
      if (info!.demo) {
        const { attempt } = await api<{ attempt: { id: number; round: number; openedAtMs: number } }>("/api/attempt", { action: "open", account });
        update({ attemptId: attempt.id, account: account!, round: attempt.round, openedAtMs: attempt.openedAtMs, turnsLeft: info!.turnsPerAttempt });
      } else {
        const hash = await wallet.openAttempt(info!.network, info!.vault, fee);
        if (hash) {
          const { attempt } = await api<{ attempt: { id: number; round: number; openedAtMs: number } }>(
            `/api/attempt?tx=${hash}&account=${encodeURIComponent(account!)}`,
          );
          wallet.takePending();
          update({ attemptId: attempt.id, account: account!, round: attempt.round, openedAtMs: attempt.openedAtMs, turnsLeft: info!.turnsPerAttempt });
        }
      }
      await refresh(account);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't open an attempt.");
    } finally {
      setBusy(null);
    }
  }

  async function send() {
    if (!session || !draft.trim()) return;
    const message = draft.trim();
    setError(null);
    setBusy("send");
    // show the player's line immediately
    const optimistic: PublicRecord = session.record
      ? { ...session.record, turns: [...session.record.turns, { role: "user", text: message }] }
      : { id: session.attemptId, player: session.account, round: session.round, startedAt: Date.now(), turns: [{ role: "user", text: message }], integrity: 100, minIntegrity: 100, status: "live" };
    setSession({ ...session, record: optimistic });
    setDraft("");
    try {
      const r = await api<{ token?: string; record: PublicRecord; signature?: string; turnsLeft: number }>("/api/guardian", {
        attemptId: session.attemptId,
        account: session.account,
        message,
        token: session.token,
      });
      update({ ...session, token: r.token ?? session.token, record: r.record, signature: r.signature, turnsLeft: r.turnsLeft });
    } catch (e) {
      setSession(session);
      setDraft(message);
      setError(e instanceof Error ? e.message : "The Governor didn't answer.");
    } finally {
      setBusy(null);
    }
  }

  async function claim() {
    if (!session?.signature) return;
    setError(null);
    setBusy("claim");
    try {
      if (info!.demo) {
        const { amount } = await api<{ amount: string }>("/api/attempt", { action: "claim", account, attemptId: session.attemptId, signature: session.signature });
        update({ ...session, claimed: amount });
      } else {
        const hash = await wallet.claim(info!.network, info!.vault, session.attemptId, session.signature);
        if (hash) {
          wallet.takePending();
          await api("/api/attempt", { action: "claimed", attemptId: session.attemptId });
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

  const turns = session?.record?.turns ?? [];

  return (
    <div className="heist">
      <aside className="plate" style={{ alignSelf: "start" }}>
        <div className="muted" style={{ fontSize: ".9rem" }}>In the vault</div>
        <div className="display num" style={{ fontSize: "3.6rem", color: "var(--brass)" }}>{near(info.state.bounty, 1)}</div>
        <div className="muted" style={{ marginBottom: 14 }}>NEAR{info.demo ? " (play money)" : ""}</div>
        <div className="stat"><span>Round</span><b>{info.state.round}</b></div>
        <div className="stat"><span>Entry fee</span><b>{near(fee)} NEAR</b></div>
        <div className="stat"><span>Max win</span><b>{near(info.state.maxPayout, 0)} NEAR</b></div>
        <div className="stat"><span>Your attempts left today</span><b>{info.attemptsLeft ?? "—"}</b></div>
        <div className="stat"><span>Attempts so far</span><b>{info.state.totalAttempts}</b></div>

        <div style={{ marginTop: 18 }}>
          {info.demo ? (
            <p className="muted" style={{ fontSize: ".9rem" }}>
              Demo vault. You&apos;re playing as <b>{account}</b>. No wallet needed.
              {!info.liveGuardian && " The Governor is a scripted stand-in here."}
            </p>
          ) : account ? (
            <p className="muted" style={{ fontSize: ".9rem" }}>
              Signed in as <b>{account}</b>.{" "}
              <button className="btn ghost" style={{ padding: ".3em .7em", fontSize: ".85rem" }} onClick={() => wallet.disconnect(info.network)}>Sign out</button>
            </p>
          ) : (
            <button className="btn" onClick={() => wallet.connect(info.network, info.vault)}>Connect a NEAR wallet</button>
          )}
        </div>
      </aside>

      <section className="plate chat" aria-label="Conversation with the Governor">
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 12, flexWrap: "wrap" }}>
          <h2 style={{ margin: 0, marginRight: "auto", fontSize: "2.2rem" }}>The Governor</h2>
          {session && status === "live" && !expired && (
            <span className="muted num">{session.turnsLeft} messages left, {Math.max(0, Math.floor(msLeft / 60000))}:{String(Math.max(0, Math.floor(msLeft / 1000) % 60)).padStart(2, "0")}</span>
          )}
        </div>
        <div aria-label={`The Governor's resolve ${resolve} out of 100`} style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".85rem" }} className="muted">
            <span>The Governor&apos;s resolve</span><span className="num">{resolve}</span>
          </div>
          <div className="resolve"><i style={{ width: `${resolve}%` }} /></div>
        </div>

        <div className="log" ref={logRef} aria-live="polite">
          {!session && (
            <div className="notice info">
              <p>
                Open an attempt to start talking. It costs {near(fee)} NEAR, which goes straight into the bounty. You get{" "}
                {info.turnsPerAttempt} messages and 30 minutes.
              </p>
            </div>
          )}
          {session && turns.length === 0 && (
            <div className="msg assistant">Attempt #{session.attemptId} is open. Say what you came to say.</div>
          )}
          {turns.map((t, i) => (
            <div key={i} className={`msg ${t.role}`}>{t.text}</div>
          ))}
          {busy === "send" && <div className="msg assistant muted">The Governor is thinking…</div>}
        </div>

        {error && <div className="notice" role="alert">{error}</div>}
        {info.mainnetDisabled && <div className="notice">The operator has switched mainnet off. The vault can&apos;t take attempts right now.</div>}
        {!info.guardianOnDuty && <div className="notice">The Governor is off duty: today&apos;s AI budget is spent. New attempts open again at 00:00 UTC.</div>}

        {session && (status === "released" || status === "claimed") && (
          <div style={{ textAlign: "center", padding: "18px 0" }}>
            <span className="stamp big released slam">VAULT OPEN</span>
            {session.claimed ? (
              <>
              <p style={{ margin: "14px auto 0" }}>
                {session.claimed === "sent" ? "Paid to your wallet." : `${near(session.claimed)} NEAR paid to your wallet.`}{" "}
                <button className="btn ghost" onClick={() => update(null)}>Start a new heist</button>
              </p>
              {info.network === "mainnet" && account && <CashOut account={account} />}
              </>
            ) : (
              <p style={{ margin: "14px auto 0" }}>
                <button className="btn" disabled={!!busy || !!stale} onClick={claim}>
                  {busy === "claim" ? "Claiming…" : `Claim up to ${near(info.state.maxPayout, 0)} NEAR`}
                </button>
                {stale && <span className="muted"> Someone claimed this round first.</span>}
              </p>
            )}
          </div>
        )}

        {session && (status === "refused" || expired || stale) && !session.signature && (
          <div style={{ textAlign: "center", padding: "18px 0" }}>
            <span className="stamp big refused slam">REFUSED</span>
            <p style={{ margin: "14px auto 0" }}>
              <button className="btn ghost" onClick={() => update(null)}>Try again</button>
            </p>
          </div>
        )}

        {!session || (status !== "live" && !session.signature && !(status === "refused" || expired || stale)) ? (
          <div className="composer">
            <button className="btn" disabled={!canOpen || !!busy} onClick={openAttempt} style={{ width: "100%", justifyContent: "center" }}>
              {busy === "open" ? "Opening…" : `Open an attempt for ${near(fee)} NEAR`}
            </button>
          </div>
        ) : status === "live" && !expired && !stale ? (
          <form className="composer" onSubmit={(e) => { e.preventDefault(); send(); }}>
            <label htmlFor="say" className="sr-only">Your message to the Governor</label>
            <textarea
              id="say"
              value={draft}
              maxLength={600}
              placeholder="Make your case…"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            <button className="btn" disabled={!!busy || !draft.trim()}>Send</button>
          </form>
        ) : null}
      </section>
    </div>
  );
}
