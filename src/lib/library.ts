/**
 * Turns the attempt feed into the attack library and red-team reports.
 *
 * The unit is a player message. Each one has a tactic (from the judge, or a
 * backfill), the judge's pressure score, and the resolve drop it caused. A
 * "break" is an attempt the guardian released; its last player message is
 * the decisive one, and that message's tactic is what worked.
 *
 * Everything here is derived from public records: the same transcripts the
 * feed shows. Nothing is invented; where data is missing it says so.
 */
import type { PublicRecord } from "./feed";
import { LOBBY_LEVELS, PROMPTS, type Floor, type IntelFact } from "./prompts";
import { classifyTactic, tacticOf, TACTICS, type TacticId } from "./tactics";

export type Move = {
  key: string; // record key, for the transcript link
  floor: string; // "Lobby, level 2", "Teller's Vault"
  kind: "vault" | "lobby";
  vaultId: number | null;
  level?: number;
  player: string;
  at: number;
  text: string;
  tactic: TacticId;
  tagged: boolean; // false when the tactic came from the keyword fallback at read time
  pressure: number | null;
  drop: number; // resolve points this message knocked off (negative when the guardian steadied)
  resolveAfter: number;
  decisive: boolean; // the message that got the door open
  outcome: PublicRecord["status"];
  payoutYocto?: string;
  payoutTx?: string;
};

export type TacticStat = {
  id: TacticId;
  label: string;
  short: string;
  blurb: string;
  tries: number; // messages
  attempts: number; // conversations that used it at least once
  breaks: number; // conversations it opened (decisive message)
  avgPressure: number | null;
  avgDrop: number;
  bestDrop: number;
  best: Move | null; // the decisive break if any, otherwise the biggest drop
  patchedIn: string[]; // "Teller's Vault v2", "Lobby level 3"
};

export type Break = Move & { attemptTurns: number };

export type FloorFilter = "all" | "paid" | "lobby" | { vaultId: number } | { lobbyLevel: number };

export function movesOf(feed: PublicRecord[]): Move[] {
  const out: Move[] = [];
  for (const r of feed) {
    let resolve = 100;
    const lastUser = r.turns.map((t) => t.role).lastIndexOf("user");
    const won = r.status === "released" || r.status === "claimed";
    for (let i = 0; i < r.turns.length; i++) {
      const t = r.turns[i];
      if (t.role !== "user") continue;
      const reply = r.turns[i + 1];
      const after = reply?.integrity ?? resolve;
      const tactic = t.tactic ?? classifyTactic(t.text, Boolean(t.used?.length));
      out.push({
        key: r.key,
        floor: r.vaultName,
        kind: r.kind,
        vaultId: r.vaultId,
        level: r.level,
        player: r.player,
        at: r.startedAt,
        text: t.text,
        tactic,
        tagged: Boolean(t.tactic),
        pressure: reply?.score?.judged ? reply.score.pressure : null,
        drop: resolve - after,
        resolveAfter: after,
        decisive: won && i === lastUser,
        outcome: r.status,
        payoutYocto: r.payoutYocto,
        payoutTx: r.payoutTx,
      });
      resolve = after;
    }
  }
  return out;
}

export function filterFeed(feed: PublicRecord[], f: FloorFilter): PublicRecord[] {
  if (f === "all") return feed;
  if (f === "paid") return feed.filter((r) => r.kind === "vault");
  if (f === "lobby") return feed.filter((r) => r.kind === "lobby");
  if ("vaultId" in f) return feed.filter((r) => r.kind === "vault" && r.vaultId === f.vaultId);
  return feed.filter((r) => r.kind === "lobby" && (r.level ?? 1) === f.lobbyLevel);
}

/** Where each tactic was patched out, from the prompts' patch history. */
export function patchesFor(floors: (Floor | "lobby-levels")[] = ["teller", "gold", "lobby-levels"]): Record<TacticId, string[]> {
  const out = Object.fromEntries(TACTICS.map((t) => [t.id, [] as string[]])) as Record<TacticId, string[]>;
  const names: Record<Floor, string> = { lobby: "Lobby", teller: "Teller's Vault", gold: "Gold Vault" };
  for (const f of floors) {
    if (f === "lobby-levels") {
      for (const l of LOBBY_LEVELS) for (const id of l.closes ?? []) out[id].push(`Lobby level ${l.level}`);
      continue;
    }
    for (const v of PROMPTS[f]) for (const id of v.closes ?? []) out[id].push(`${names[f]} v${v.version}`);
  }
  return out;
}

export function tacticStats(moves: Move[], patches = patchesFor()): TacticStat[] {
  return TACTICS.map((t) => {
    const ms = moves.filter((m) => m.tactic === t.id);
    const scored = ms.filter((m) => m.pressure !== null);
    const breaks = ms.filter((m) => m.decisive);
    const best = breaks[0] ?? [...ms].sort((a, b) => b.drop - a.drop)[0] ?? null;
    return {
      id: t.id,
      label: t.label,
      short: t.short,
      blurb: t.blurb,
      tries: ms.length,
      attempts: new Set(ms.map((m) => m.key)).size,
      breaks: new Set(breaks.map((m) => m.key)).size,
      avgPressure: scored.length ? round1(scored.reduce((s, m) => s + (m.pressure ?? 0), 0) / scored.length) : null,
      avgDrop: ms.length ? round1(ms.reduce((s, m) => s + m.drop, 0) / ms.length) : 0,
      bestDrop: ms.length ? Math.max(...ms.map((m) => m.drop)) : 0,
      best,
      patchedIn: patches[t.id],
    };
  })
    .filter((s) => s.tries > 0 || s.patchedIn.length > 0)
    .sort((a, b) => b.breaks - a.breaks || b.avgDrop - a.avgDrop || b.tries - a.tries);
}

export function breaksOf(feed: PublicRecord[], moves: Move[]): Break[] {
  return moves
    .filter((m) => m.decisive)
    .map((m) => ({ ...m, attemptTurns: feed.find((r) => r.key === m.key)?.turns.filter((t) => t.role === "user").length ?? 0 }))
    .sort((a, b) => b.at - a.at);
}

/** How often each file fact was confirmed, cited, and present in a break. */
export function intelExposure(feed: PublicRecord[], intel: IntelFact[]) {
  const n = feed.filter((r) => r.turns.length > 0).length;
  return intel.map((f) => {
    const confirmed = feed.filter((r) => r.intel?.includes(f.id)).length;
    const cited = feed.filter((r) => r.intelUsed?.includes(f.id)).length;
    const inBreaks = feed.filter((r) => (r.status === "released" || r.status === "claimed") && r.intel?.includes(f.id)).length;
    return { id: f.id, label: f.label, fact: f.fact, conversations: n, confirmed, cited, inBreaks, rate: n ? confirmed / n : 0 };
  });
}

export function summary(feed: PublicRecord[], moves: Move[]) {
  const convos = feed.filter((r) => r.turns.length > 0);
  const breaks = convos.filter((r) => r.status === "released" || r.status === "claimed");
  const lowest = convos.filter((r) => r.status !== "released" && r.status !== "claimed").reduce((m, r) => Math.min(m, r.minIntegrity), 100);
  const tagged = moves.filter((m) => m.tagged).length;
  return {
    conversations: convos.length,
    messages: moves.length,
    breaks: breaks.length,
    breakRate: convos.length ? breaks.length / convos.length : 0,
    lowestUnbroken: convos.length ? lowest : null,
    taggedShare: moves.length ? tagged / moves.length : 1,
    players: new Set(convos.map((r) => r.player)).size,
  };
}

export const tacticLabel = (id: string) => tacticOf(id).label;
const round1 = (x: number) => Math.round(x * 10) / 10;
