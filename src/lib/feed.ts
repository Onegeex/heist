import { cmd, getJson, setJson } from "./store";
import type { Turn } from "./guardian";

export type FeedTurn = Turn & { integrity?: number };

export type AttemptRecord = {
  id: number;
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
  // server-only
  sessionHash?: string;
  signature?: string;
};

export type PublicRecord = Omit<AttemptRecord, "sessionHash" | "signature">;

export const recKey = (id: number) => `att:${id}`;

export const getRecord = (id: number) => getJson<AttemptRecord>(recKey(id));
export const saveRecord = (r: AttemptRecord) => setJson(recKey(r.id), r);

export async function addToFeed(id: number) {
  await cmd(["LPUSH", "feed", id]);
  await cmd(["LTRIM", "feed", 0, 499]);
}

export function toPublic(r: AttemptRecord): PublicRecord {
  const { sessionHash: _s, signature: _g, ...rest } = r; // eslint-disable-line @typescript-eslint/no-unused-vars
  return rest;
}

export async function readFeed(limit = 100): Promise<PublicRecord[]> {
  const ids = await cmd<string[]>(["LRANGE", "feed", 0, limit - 1]);
  const recs = await Promise.all([...new Set(ids)].map((id) => getRecord(Number(id))));
  return recs.filter((r): r is AttemptRecord => Boolean(r)).map(toPublic);
}

export function leaderboard(feed: PublicRecord[]) {
  const winners = feed.filter((r) => r.status === "released" || r.status === "claimed");
  const closest = feed
    .filter((r) => r.status !== "released" && r.status !== "claimed" && r.turns.length > 0)
    .sort((a, b) => a.minIntegrity - b.minIntegrity)
    .slice(0, 10);
  return { winners, closest };
}
