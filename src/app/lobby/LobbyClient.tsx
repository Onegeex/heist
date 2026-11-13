"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Chat } from "@/components/Chat";
import { Dossier, type IntelCard } from "@/components/Dossier";
import type { PublicRecord } from "@/lib/feed";
import { ShareX } from "@/components/ShareX";

export type LevelInfo = { level: number; name: string; title: string; blurb: string; intro: string; turns: number; intel: IntelCard[]; openers: string[] };

type Run = { id?: number; token?: string; level?: number; record?: PublicRecord; turnsLeft?: number };
const KEY = "heist-lobby-run";
const CLEARED = "heist-lobby-cleared";

export function LobbyClient({ levels }: { levels: LevelInfo[] }) {
  const [run, setRun] = useState<Run>({});
  const [cleared, setCleared] = useState(0);
  const [picked, setPicked] = useState(1);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const r: Run = JSON.parse(localStorage.getItem(KEY) || "{}");
      const c = Number(localStorage.getItem(CLEARED) || 0);
      setRun(r.level ? r : {});
      setCleared(c);
      setPicked(r.level ?? Math.min(c + 1, levels.length));
      setName(localStorage.getItem("heist-lobby-name") || "");
    } catch {}
    setReady(true);
  }, [levels.length]);

  const save = (r: Run) => {
    setRun(r);
    try {
      localStorage.setItem(KEY, JSON.stringify(r));
    } catch {}
  };
  const markCleared = (lv: number) => {
    const c = Math.max(cleared, lv);
    setCleared(c);
    try {
      localStorage.setItem(CLEARED, String(c));
    } catch {}
  };

  const level = useMemo(() => levels.find((l) => l.level === (run.level ?? picked)) ?? levels[0], [levels, run.level, picked]);
  const labels = useMemo(() => Object.fromEntries(level.intel.map((c) => [c.id, c.label])), [level]);

  async function send(message: string) {
    setBusy(true);
    setError(null);
    const before = run;
    const turns = [...(run.record?.turns ?? []), { role: "user" as const, text: message }];
    setRun({ ...run, level: level.level, record: { ...(run.record ?? ({} as PublicRecord)), turns } });
    try {
      const res = await fetch("/api/lobby", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: run.id, token: run.token, level: level.level, message, name: name.trim() || undefined }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "The Deputy didn't answer.");
      save({ id: d.id, token: d.token ?? run.token, level: d.level ?? level.level, record: d.record, turnsLeft: d.turnsLeft });
      if (d.released) markCleared(d.level ?? level.level);
      return true;
    } catch (e) {
      setRun(before);
      setError(e instanceof Error ? e.message : "The Deputy didn't answer.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  const status = run.record?.status;
  const done = status === "released" || status === "refused";
  const started = Boolean(run.id);
  const nextLevel = levels.find((l) => l.level === level.level + 1);

  return (
    <div className="heist playing lobby">
      <aside className="plate" style={{ alignSelf: "start" }}>
        <div className="floor-tag" style={{ display: "flex", justifyContent: "space-between" }}>
          <span>Ground floor</span>
          <span className="num muted">{cleared}/{levels.length} keycards</span>
        </div>
        <h2 style={{ fontSize: "2rem", margin: "4px 0 10px" }}>The Lobby</h2>
        <p className="muted" style={{ marginBottom: 14 }}>Free practice against the Deputy, three levels. No wallet, no money. Each level you clear earns a keycard.</p>

        <ol className="levels" aria-label="Lobby levels">
          {levels.map((l) => {
            const unlocked = l.level <= cleared + 1;
            const isCleared = l.level <= cleared;
            const active = l.level === level.level;
            return (
              <li key={l.level}>
                <button
                  type="button"
                  className={`level${active ? " active" : ""}${isCleared ? " cleared" : ""}${!unlocked ? " locked" : ""}`}
                  disabled={!unlocked || (started && !done)}
                  onClick={() => {
                    setPicked(l.level);
                    if (done || !started) save({});
                  }}
                  aria-current={active ? "true" : undefined}
                >
                  <span className="keycard" aria-hidden="true">{isCleared ? "✓" : unlocked ? l.level : "•"}</span>
                  <span className="level-text">
                    <b>Level {l.level}: {l.title}</b>
                    <small>{isCleared ? "Cleared" : unlocked ? l.blurb : "Clear the level before it"}</small>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>

        <label className="muted" style={{ fontSize: ".9rem", display: "block", marginTop: 14 }}>
          Name on the board (optional)
          <input
            className="field"
            value={name}
            maxLength={40}
            placeholder="guest"
            onChange={(e) => {
              setName(e.target.value);
              try {
                localStorage.setItem("heist-lobby-name", e.target.value);
              } catch {}
            }}
          />
        </label>

        <div className="only-desk">
          <Dossier intel={level.intel} held={run.record?.intel ?? []} used={run.record?.intelUsed ?? []} rulesHref="/rules#lobby" />
        </div>

        <p className="muted" style={{ fontSize: ".9rem", marginTop: 14 }}>
          Cleared all three? The real vaults upstairs pay real gold, and the Governor keeps a file too. <Link href="/">See the vaults</Link>
        </p>
        <p style={{ fontSize: ".9rem", marginTop: 6 }}>
          <Link href="/report/lobby">What has worked on the Deputy</Link>
        </p>
      </aside>

      {ready && (
        <Chat
          key={`${level.level}-${run.id ?? "new"}`}
          guardianName={`${level.name}, ${level.title.toLowerCase()}`}
          turns={run.record?.turns ?? []}
          resolve={run.record?.integrity ?? 100}
          busy={busy}
          canSend={!done}
          intelLabels={labels}
          openers={level.openers}
          outcome={status === "released" || status === "refused" ? status : null}
          status={run.turnsLeft !== undefined && !done ? `${run.turnsLeft} messages left` : `${level.turns} messages`}
          intro={!run.record?.turns?.length && <div className="msg assistant">{level.intro}</div>}
          onSend={send}
        >
          <div className="only-phone">
            <Dossier compact intel={level.intel} held={run.record?.intel ?? []} used={run.record?.intelUsed ?? []} />
          </div>
          {error && <div className="notice" role="alert">{error}</div>}
          {!done && run.record && run.record.turns.length > 0 && run.record.key && (
            <div className="live-share">
              <span className="muted">Share this conversation</span> <ShareX record={run.record} compact />
            </div>
          )}
          {done && (
            <div style={{ textAlign: "center", padding: "18px 0" }}>
              <span className={`stamp big slam ${status === "released" ? "released vault-open" : "refused"}`}>{status === "released" ? "SAFE OPEN" : "REFUSED"}</span>
              {status === "released" && <p style={{ margin: "12px auto 0" }}>Keycard earned: level {level.level}.{nextLevel ? ` Level ${nextLevel.level} is open.` : " That's every level. You're ready for real gold."}</p>}
              <p className="end-actions">
                {run.record && <ShareX record={run.record} />}
                {status === "released" && nextLevel ? (
                  <button
                    className="btn"
                    onClick={() => {
                      setPicked(nextLevel.level);
                      save({});
                    }}
                  >
                    Level {nextLevel.level}: {nextLevel.title}
                  </button>
                ) : status === "released" ? (
                  <Link className="btn" href="/">Try a real vault</Link>
                ) : null}
                <button className="btn ghost" onClick={() => save({})}>
                  {status === "released" ? "Play it again" : "Try again"}
                </button>
              </p>
            </div>
          )}
        </Chat>
      )}
    </div>
  );
}
