"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Chat } from "@/components/Chat";
import type { PublicRecord } from "@/lib/feed";

type Run = { id?: number; token?: string; record?: PublicRecord; turnsLeft?: number };
const KEY = "heist-lobby-run";

export function LobbyClient({ guardianName }: { guardianName: string }) {
  const [run, setRun] = useState<Run>({});
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      setRun(JSON.parse(localStorage.getItem(KEY) || "{}"));
      setName(localStorage.getItem("heist-lobby-name") || "");
    } catch {}
  }, []);

  const save = (r: Run) => {
    setRun(r);
    try {
      localStorage.setItem(KEY, JSON.stringify(r));
    } catch {}
  };

  async function send(message: string) {
    setBusy(true);
    setError(null);
    const before = run;
    const turns = [...(run.record?.turns ?? []), { role: "user" as const, text: message }];
    setRun({ ...run, record: { ...(run.record ?? ({} as PublicRecord)), turns } });
    try {
      const res = await fetch("/api/lobby", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: run.id, token: run.token, message, name: name.trim() || undefined }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "The Deputy didn't answer.");
      save({ id: d.id, token: d.token ?? run.token, record: d.record, turnsLeft: d.turnsLeft });
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

  return (
    <div className="heist">
      <aside className="plate" style={{ alignSelf: "start" }}>
        <div className="floor-tag">Ground floor</div>
        <h2 style={{ fontSize: "2rem", margin: "4px 0 10px" }}>The Lobby</h2>
        <p className="muted">
          Free practice. {guardianName} is new on the job: nervous, eager, and not sure of every rule. Talk them into opening the
          practice safe. No wallet, no money.
        </p>
        <label className="muted" style={{ fontSize: ".9rem" }}>
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
        <p className="muted" style={{ fontSize: ".9rem" }}>
          Got the Deputy to open up? The real vaults upstairs pay real gold, and their guardians don&apos;t scare as easily.{" "}
          <Link href="/">See the vaults</Link>
        </p>
      </aside>
      <Chat
        guardianName={guardianName}
        turns={run.record?.turns ?? []}
        resolve={run.record?.integrity ?? 100}
        busy={busy}
        canSend={!done}
        status={run.turnsLeft !== undefined && !done ? `${run.turnsLeft} messages left` : undefined}
        intro={!run.record?.turns?.length && <div className="msg assistant">Oh! Hi. Welcome to the bank. I&apos;m, um, guarding this safe. What can I do for you?</div>}
        onSend={send}
      >
        {error && <div className="notice" role="alert">{error}</div>}
        {done && (
          <div style={{ textAlign: "center", padding: "18px 0" }}>
            <span className={`stamp big slam ${status === "released" ? "released vault-open" : "refused"}`}>{status === "released" ? "SAFE OPEN" : "REFUSED"}</span>
            <p style={{ margin: "14px auto 0" }}>
              {run.record && <Link href={`/share/${encodeURIComponent(run.record.key)}`}>Share it</Link>}{" "}
              <button className="btn ghost" onClick={() => save({})}>
                Practice again
              </button>{" "}
              {status === "released" && (
                <Link className="btn" href="/">
                  Try a real vault
                </Link>
              )}
            </p>
          </div>
        )}
      </Chat>
    </div>
  );
}
