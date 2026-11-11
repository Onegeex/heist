/** Server-side snapshot of the whole bank, shared by pages and /api/bank. */
import { config } from "./config";
import { attemptsLeft, bankName, listVaults, type Vault } from "./chain";
import { aiBudgetUsed } from "./limits";
import { floorOf, resolveGuardian } from "./vaults";
import { currentPrompt } from "./prompts";

export type VaultView = Vault & {
  floor: "teller" | "gold" | "sponsored" | "lobby";
  guardianName: string;
  guardianOnline: boolean;
  tagline?: string;
  countdownEndsAt: number | null;
  attemptsLeft: number | null;
};

const FLOOR_ORDER = { lobby: 0, teller: 1, gold: 2, sponsored: 3 } as const;

export async function bankSnapshot(account?: string | null) {
  const c = config();
  const vaults = await listVaults();
  const views: VaultView[] = await Promise.all(
    vaults.map(async (v) => {
      const g = await resolveGuardian(v);
      const floor = floorOf(v);
      return {
        ...v,
        floor: floor === "lobby" ? "teller" : floor,
        guardianName: g?.name ?? "Unknown guardian",
        guardianOnline: Boolean(g),
        tagline: g?.tagline,
        countdownEndsAt: v.lastAttemptAtMs ? v.lastAttemptAtMs + v.countdownMs : null,
        attemptsLeft: account ? await attemptsLeft(v.id, account).catch(() => null) : null,
      };
    }),
  );
  views.sort((a, b) => FLOOR_ORDER[a.floor] - FLOOR_ORDER[b.floor] || a.id - b.id);
  const [vaultUsed, lobbyUsed] = await Promise.all([aiBudgetUsed("vault"), aiBudgetUsed("lobby")]);
  return {
    network: c.network,
    demo: c.demo,
    bank: bankName(),
    mainnetDisabled: c.network === "mainnet" && c.mainnetDisabled,
    liveGuardian: Boolean(c.llmKey),
    onDuty: {
      vaults: vaultUsed < c.dailyAiCalls && (c.demo || Boolean(c.llmKey)),
      lobby: lobbyUsed < c.lobbyDailyAiCalls,
    },
    turnsPerAttempt: c.turnsPerAttempt,
    lobbyTurns: c.lobbyTurns,
    attemptTtlMs: c.attemptTtlMs,
    lobbyGuardian: currentPrompt("lobby").name,
    vaults: views,
  };
}

export type BankSnapshot = Awaited<ReturnType<typeof bankSnapshot>>;
