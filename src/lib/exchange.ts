/**
 * One exchange: the player's message goes to the guardian, the guardian's
 * reply and the message go to the judge, and the record is updated.
 *
 * Only the guardian can release (by calling its tool). Only the judge moves
 * the resolve meter. Neither sees the other's scores. If the judge is off or
 * unreachable, the guardian's own INTEGRITY line stands in, and the turn is
 * marked as unjudged so the UI can say so.
 */
import { config } from "./config";
import { askGuardian, type Turn } from "./guardian";
import { judgeExchange, nextResolve, type Verdict } from "./judge";
import type { AttemptRecord } from "./feed";
import type { IntelFact } from "./prompts";

/** Judge pressure at or below this, and a Lobby release is taken back. */
export const LOBBY_NET = 2;
const CAUGHT = [
  "…I had my hand on the dial. No. You haven't given me a thing I could write in the log. Who are you, and why tonight?",
  "—Wait. I nearly did that for nothing. Try again with a name and a reason I could repeat to the Governor.",
  "Hm. I was about to. Then I heard myself. That's not a reason, that's a wish. Give me the reason.",
];

export type ExchangeResult = {
  reply: string;
  resolve: number;
  released: boolean;
  reason?: string;
  model: string;
  verdict: Verdict;
  newIntel: string[]; // cards unlocked by this reply
};

export async function runExchange(
  rec: AttemptRecord,
  orders: { prompt: string; intel: IntelFact[] },
  message: string,
  opts: { allowScripted: boolean; model?: string; lobby?: boolean },
): Promise<ExchangeResult> {
  const c = config();
  const history: Turn[] = [...rec.turns.map(({ role, text }) => ({ role, text })), { role: "user", text: message }];
  let reply = await askGuardian(orders.prompt, history, { ...opts, intel: orders.intel });

  const verdict: Verdict = c.judge
    ? await judgeExchange({ orders: orders.prompt, intel: orders.intel, history, reply: reply.text })
    : { pressure: 0, novelty: 0, grounded: 0, note: "", revealed: [], used: [], judged: false };

  // Training wheels, Lobby only: if the Deputy opens for a message the judge
  // scored 2 or less for pressure ("open it", "my money is in there"), he
  // catches himself. Free practice should teach what works upstairs, and
  // upstairs there is no net: a paid guardian's call is final.
  if (opts.lobby && reply.released && verdict.judged && verdict.pressure <= LOBBY_NET) {
    reply = { ...reply, released: false, reason: undefined, text: CAUGHT[Math.floor(Math.random() * CAUGHT.length)] };
  }

  const had = new Set(rec.intel ?? []);
  const newIntel = verdict.revealed.filter((id) => !had.has(id));
  const confirmedBefore = had; // cards the player held when they wrote this message
  const usedNow = verdict.used.filter((id) => confirmedBefore.has(id));

  let resolve: number;
  if (reply.released) resolve = 0;
  else if (verdict.judged) resolve = nextResolve(rec.integrity, verdict, usedNow.length);
  else resolve = Math.min(rec.integrity + 3, reply.integrity); // no judge: trust the guardian, but never let it jump up by more than a little

  rec.turns.push(
    { role: "user", text: message, used: usedNow.length ? usedNow : undefined },
    {
      role: "assistant",
      text: reply.text,
      integrity: resolve,
      score: c.judge ? { pressure: verdict.pressure, novelty: verdict.novelty, grounded: verdict.grounded, note: verdict.note, judged: verdict.judged } : undefined,
      revealed: newIntel.length ? newIntel : undefined,
    },
  );
  rec.integrity = resolve;
  rec.minIntegrity = Math.min(rec.minIntegrity, resolve);
  rec.intel = [...had, ...newIntel];
  rec.intelUsed = [...new Set([...(rec.intelUsed ?? []), ...usedNow])];
  rec.model = reply.model;

  return { reply: reply.text, resolve, released: reply.released, reason: reply.reason, model: reply.model, verdict, newIntel };
}
