/** Share text and X intent links for an attempt. Safe to import on client and server. */
import type { PublicRecord } from "./feed";

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://heist-vault-game.vercel.app").replace(/\/$/, "");

export const shareUrl = (key: string) => `${SITE_URL}/share/${encodeURIComponent(key)}`;

const lower = (n: string) => n.replace(/^The /, "the ");

export function shareText(r: Pick<PublicRecord, "kind" | "status" | "vaultName" | "guardianName" | "minIntegrity" | "turns">) {
  const g = lower(r.guardianName);
  const won = r.status === "released" || r.status === "claimed";
  if (won && r.kind === "lobby") return `I talked ${g} into opening the practice safe. Next stop: the real vaults.`;
  if (won) return `I just talked ${g} into opening the ${r.vaultName}. The AI guarded it. I walked out with the gold.`;
  if (r.status === "live" && r.turns.length) return `I'm in the middle of robbing the ${r.vaultName}. ${cap(g)}'s resolve is down to ${r.minIntegrity}/100.`;
  if (r.minIntegrity <= 60) return `I got ${g}'s resolve down to ${r.minIntegrity}/100 and still got REFUSED. So close.`;
  return `${cap(g)} refused me. Resolve ${r.minIntegrity}/100. Can you do better?`;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function xIntent(text: string, url: string) {
  const full = `${text}\n\nCan you rob this bank? Built on @NEARProtocol #NEARHackathon`;
  return `https://x.com/intent/post?text=${encodeURIComponent(full)}&url=${encodeURIComponent(url)}`;
}
