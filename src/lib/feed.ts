import { cmd, getJson, setJson } from "./store";
import type { Turn } from "./guardian";

export type FeedTurn = Turn & { integrity?: number };

export type AttemptRecord = {
  key: string; // "a:<id>" for vault attempts, "l:<id>" for Lobby practice
  kind: "vault" | "lobby";
  id: number;
  vaultId: number | null;
  vaultName: string;
  guardianName: string;
  player: string;
  round: number;
  startedAt: number;
  turns: FeedTurn[];
  integrity: number;
  minIntegrity: number;
  status: "live" | "refused" | "released" | "claimed";
  model?: string;
  reason?: string;
  payoutYocto?: string;
  feeYocto?: string;
  // server-only
  sessionHash?: string;
  signature?: string;
};

export type PublicRecord = Omit<AttemptRecord, "sessionHash" | "signature">;

export const getRecord = (key: string) => getJson<AttemptRecord>(`rec:${key}`);
export const saveRecord = (r: AttemptRecord) => setJson(`rec:${r.key}`, r);

/** Every record goes in the global feed and its floor's feed. */
export async function addToFeed(r: AttemptRecord) {
  const floor = r.kind === "lobby" ? "lobby" : `v${r.vaultId}`;
  for (const list of ["feed", `feed:${floor}`]) {
    await cmd(["LPUSH", list, r.key]);
    await cmd(["LTRIM", list, 0, 499]);
  }
}

export function toPublic(r: AttemptRecord): PublicRecord {
  const { sessionHash: _s, signature: _g, ...rest } = r; // eslint-disable-line @typescript-eslint/no-unused-vars
  return rest;
}

/** floor: undefined = everything, "lobby", or a vault id. */
export async function readFeed(limit = 100, floor?: "lobby" | number): Promise<PublicRecord[]> {
  const list = floor === undefined ? "feed" : floor === "lobby" ? "feed:lobby" : `feed:v${floor}`;
  const keys = await cmd<string[]>(["LRANGE", list, 0, limit - 1]);
  const recs = await Promise.all([...new Set(keys)].map((k) => getRecord(k)));
  return recs.filter((r): r is AttemptRecord => Boolean(r)).map(toPublic);
}

export function leaderboard(feed: PublicRecord[]) {
  const paid = feed.filter((r) => r.kind === "vault");
  const winners = paid.filter((r) => r.status === "released" || r.status === "claimed");
  const closest = paid
    .filter((r) => r.status !== "released" && r.status !== "claimed" && r.turns.length > 0)
    .sort((a, b) => a.minIntegrity - b.minIntegrity)
    .slice(0, 10);
  const lobbyCracks = feed.filter((r) => r.kind === "lobby" && r.status === "released").slice(0, 10);
  return { winners, closest, lobbyCracks };
}
