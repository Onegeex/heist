const num = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) ? Number(v) : d);
const bool = (v: string | undefined, d: boolean) => (v === undefined || v === "" ? d : v === "true" || v === "1");

export type Network = "testnet" | "mainnet";

export function config() {
  const network: Network = process.env.NEAR_NETWORK === "mainnet" ? "mainnet" : "testnet";
  const vaultId = process.env.VAULT_ID || "";
  return {
    network,
    vaultId,
    demo: !vaultId || bool(process.env.HEIST_DEMO, false),
    rpc: process.env.NEAR_RPC_URL || (network === "mainnet" ? "https://rpc.mainnet.near.org" : "https://rpc.testnet.near.org"),
    mainnetDisabled: bool(process.env.MAINNET_DISABLED, true),
    mainnetMaxPayoutYocto: BigInt(Math.round(num(process.env.MAINNET_MAX_PAYOUT_NEAR, 1) * 1e6)) * 10n ** 18n,
    guardianSecretB64: process.env.GUARDIAN_SECRET_B64 || "",
    llmKey: process.env.LLM_API_KEY || "",
    llmBase: (process.env.LLM_BASE_URL || "https://cloud-api.near.ai/v1").replace(/\/$/, ""),
    llmModel: process.env.LLM_MODEL || "",
    dailyAiCalls: num(process.env.DAILY_AI_CALLS, 400),
    accountDailyMessages: num(process.env.ACCOUNT_DAILY_MESSAGES, 24),
    ipHourlyMessages: num(process.env.IP_HOURLY_MESSAGES, 40),
    turnsPerAttempt: num(process.env.TURNS_PER_ATTEMPT, 6),
    oneClickJwt: process.env.ONECLICK_JWT || "",
    attemptTtlMs: 30 * 60 * 1000,
  };
}

/** Why money routes are closed right now, or null if they're open. */
export function moneyRoutesBlocked(): string | null {
  const c = config();
  if (c.network === "mainnet" && c.mainnetDisabled) return "Mainnet is switched off by the operator (MAINNET_DISABLED=true).";
  return null;
}
