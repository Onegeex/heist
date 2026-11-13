/**
 * Which guardian prompt a vault runs, and what players see about it.
 * House floors come from prompts.ts; sponsored vaults from the store.
 * Either way the prompt must hash to the vault's on-chain commitment.
 */
import { getJson, setJson } from "./store";
import { PROMPTS, promptForHash, sha256B64, type Floor, type IntelFact } from "./prompts";
import type { Vault } from "./chain";

export type SponsoredPrompt = { guardianName: string; prompt: string; tagline: string; submittedBy: string; at: number };

export type ResolvedGuardian = {
  floor: Floor | "sponsored";
  name: string;
  prompt: string;
  version: number;
  notes: string[];
  history: { version: number; notes: string[] }[];
  intel: IntelFact[];
  tagline?: string;
};

export async function saveSponsoredPrompt(p: SponsoredPrompt) {
  const hash = sha256B64(p.prompt);
  await setJson(`sponsor:prompt:${hash}`, p);
  return hash;
}

export async function resolveGuardian(v: Vault): Promise<ResolvedGuardian | null> {
  const house = promptForHash(v.promptHash);
  if (house) {
    const floor = house.floor;
    return {
      floor,
      name: house.name,
      prompt: house.prompt,
      version: house.version,
      notes: house.notes,
      intel: house.intel,
      history: PROMPTS[floor].filter((p) => p.version <= house.version).map((p) => ({ version: p.version, notes: p.notes })),
    };
  }
  const s = await getJson<SponsoredPrompt>(`sponsor:prompt:${v.promptHash}`);
  if (s && sha256B64(s.prompt) === v.promptHash) {
    return { floor: "sponsored", name: s.guardianName, prompt: s.prompt, version: v.promptVersion, notes: [], history: [], intel: [], tagline: s.tagline };
  }
  return null;
}

/** The floor a house vault belongs to, for styling and ordering. */
export function floorOf(v: Vault): Floor | "sponsored" {
  return promptForHash(v.promptHash)?.floor ?? "sponsored";
}
