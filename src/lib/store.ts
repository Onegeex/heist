/**
 * Tiny key-value store. Uses Upstash Redis (REST) when configured, so rate
 * limits and budgets survive serverless cold starts. Falls back to memory for
 * local dev and demo mode only.
 */
type Cmd = (string | number)[];

const url = () => process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "";
const token = () => process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "";

export const durable = () => Boolean(url() && token());

const g = globalThis as unknown as { __heistMem?: Map<string, { v: unknown; exp?: number }> };
const mem = (g.__heistMem ??= new Map());

function memGet(k: string) {
  const e = mem.get(k);
  if (!e) return undefined;
  if (e.exp && e.exp < Date.now()) {
    mem.delete(k);
    return undefined;
  }
  return e.v;
}

async function memCmd([op, k, ...rest]: Cmd): Promise<unknown> {
  const key = String(k);
  switch (String(op).toUpperCase()) {
    case "GET":
      return memGet(key) ?? null;
    case "SET": {
      const e: { v: unknown; exp?: number } = { v: String(rest[0]) };
      if (String(rest[1]).toUpperCase() === "EX") e.exp = Date.now() + Number(rest[2]) * 1000;
      if (String(rest[1]).toUpperCase() === "NX" && memGet(key) !== undefined) return null;
      mem.set(key, e);
      return "OK";
    }
    case "INCR": {
      const n = Number(memGet(key) ?? 0) + 1;
      const old = mem.get(key);
      mem.set(key, { v: String(n), exp: old?.exp });
      return n;
    }
    case "EXPIRE": {
      const e = mem.get(key);
      if (e) e.exp = Date.now() + Number(rest[0]) * 1000;
      return 1;
    }
    case "LPUSH": {
      const l = (memGet(key) as string[] | undefined) ?? [];
      l.unshift(...rest.map(String));
      mem.set(key, { v: l });
      return l.length;
    }
    case "LRANGE": {
      const l = (memGet(key) as string[] | undefined) ?? [];
      const end = Number(rest[1]);
      return l.slice(Number(rest[0]), end === -1 ? undefined : end + 1);
    }
    case "LTRIM": {
      const l = (memGet(key) as string[] | undefined) ?? [];
      mem.set(key, { v: l.slice(Number(rest[0]), Number(rest[1]) + 1) });
      return "OK";
    }
    case "DEL":
      mem.delete(key);
      return 1;
  }
  throw new Error(`memory store: unsupported ${op}`);
}

export async function cmd<T = unknown>(c: Cmd): Promise<T> {
  if (!durable()) return (await memCmd(c)) as T;
  const res = await fetch(url(), {
    method: "POST",
    headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
    body: JSON.stringify(c.map(String)),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`store ${res.status}`);
  const data = (await res.json()) as { result: T; error?: string };
  if (data.error) throw new Error(data.error);
  return data.result;
}

export async function getJson<T>(k: string): Promise<T | null> {
  const v = await cmd<string | null>(["GET", k]);
  return v ? (JSON.parse(v) as T) : null;
}

export async function setJson(k: string, v: unknown, ttlSec?: number) {
  return ttlSec ? cmd(["SET", k, JSON.stringify(v), "EX", ttlSec]) : cmd(["SET", k, JSON.stringify(v)]);
}

/** Increment a counter that expires `ttlSec` after it was first created. */
export async function incrWindow(k: string, ttlSec: number): Promise<number> {
  const n = await cmd<number>(["INCR", k]);
  if (n === 1) await cmd(["EXPIRE", k, ttlSec]);
  return n;
}
