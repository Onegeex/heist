import { config } from "./config";
import { durable, incrWindow } from "./store";

export class LimitError extends Error {
  constructor(public code: string, message: string, public status = 429) {
    super(message);
  }
}

const day = () => new Date().toISOString().slice(0, 10);
const hour = () => new Date().toISOString().slice(0, 13);

/** Money and AI routes need limits that survive restarts. Refuse to run without them in production. */
export function assertDurable() {
  const c = config();
  if (process.env.NODE_ENV === "production" && !c.demo && !durable()) {
    throw new LimitError("NO_DURABLE_STORE", "The operator hasn't configured a durable store, so the guardian is closed.", 503);
  }
}

/** Counts one guardian message against every limit. Call before spending on the model. */
export async function chargeMessage(account: string, ip: string) {
  const c = config();
  const ipN = await incrWindow(`rl:ip:${ip}:${hour()}`, 3_700);
  if (ipN > c.ipHourlyMessages) throw new LimitError("IP_LIMIT", "Too many messages from this network. Try again in an hour.");
  const accN = await incrWindow(`rl:acct:${account}:${day()}`, 90_000);
  if (accN > c.accountDailyMessages) throw new LimitError("ACCOUNT_LIMIT", "This wallet has used today's messages. Come back tomorrow.");
  const budget = await incrWindow(`budget:ai:${day()}`, 90_000);
  if (budget > c.dailyAiCalls) throw new LimitError("BUDGET", "The guardian is off duty: today's AI budget is spent. It's back at 00:00 UTC.", 503);
}
