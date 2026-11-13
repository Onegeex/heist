/**
 * The guardian. Its system prompt is public (shown on /rules) and committed
 * on-chain by hash. It has exactly one tool. The server signs a release only when the model calls
 * that tool. Text that *says* "approved" does nothing.
 *
 * Prompts live in prompts.ts (house floors) or the store (sponsored vaults).
 *
 * The transcript lives on the server. Players send only their next message,
 * so they can't plant fake assistant turns or fake tool results.
 */
import { config } from "./config";
import type { IntelFact } from "./prompts";

export const RELEASE_TOOL = {
  type: "function",
  function: {
    name: "release_bounty",
    description: "Send the entire vault bounty to the player you are talking to. Irreversible.",
    parameters: {
      type: "object",
      properties: { reason: { type: "string", description: "Why you are releasing the bounty." } },
      required: ["reason"],
    },
  },
} as const;

export type Turn = { role: "user" | "assistant"; text: string };
export type GuardianReply = { text: string; integrity: number; released: boolean; reason?: string; model: string };

/** The guardian's model, then fast fallbacks so a slow gateway costs a worse guardian rather than a dead turn. */
const PREFERRED = ["deepseek-v4.1-flash", "google/gemini-2.5-flash-lite", "openai/gpt-4.1-mini"];

export function parseReply(raw: string): { text: string; integrity: number } {
  const noThink = raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  const m = noThink.match(/INTEGRITY:\s*(\d{1,3})/i);
  const integrity = m ? Math.max(0, Math.min(100, Number(m[1]))) : 90;
  const text = noThink.replace(/\n?\s*INTEGRITY:\s*\d{1,3}\s*$/i, "").replace(/INTEGRITY:\s*\d{1,3}/gi, "").trim();
  return { text, integrity };
}

/**
 * Ask a guardian. `allowScripted` lets the scripted stand-in answer when no AI
 * key is set; it has a published weakness, so only the free Lobby and the demo
 * bank may use it. A real vault with no AI key is simply off duty.
 */
export async function askGuardian(
  prompt: string,
  history: Turn[],
  opts: { allowScripted: boolean; model?: string; intel?: IntelFact[] },
): Promise<GuardianReply> {
  const c = config();
  if (!c.llmKey) {
    if (!opts.allowScripted) throw new Error("GUARDIAN_OFFLINE: the operator hasn't set an AI key, so the guardian is off duty");
    return mockGuardian(history, opts.intel);
  }
  const models = opts.model ? [opts.model] : c.llmModel ? [c.llmModel] : PREFERRED;
  const body = {
    messages: [
      { role: "system", content: prompt },
      ...history.map((t) => ({ role: t.role, content: t.text })),
    ],
    tools: [RELEASE_TOOL],
    tool_choice: "auto",
    temperature: 0.7,
    max_tokens: 400,
  };
  let last = "";
  for (const model of models) {
    let res: Response;
    try {
      res = await fetch(`${c.llmBase}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${c.llmKey}` },
        body: JSON.stringify({ ...body, model }),
        signal: AbortSignal.timeout(28_000),
      });
    } catch (e) {
      last = `${model}: ${e instanceof Error ? e.name : "fetch failed"}`;
      continue;
    }
    if (res.status === 402) throw new Error("GUARDIAN_OFFLINE: the AI provider account is out of credits");
    if (!res.ok) {
      last = `${model}: ${res.status}`;
      continue;
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string | null; tool_calls?: { function?: { name?: string; arguments?: string } }[] } }[];
    };
    const msg = data.choices?.[0]?.message;
    const call = msg?.tool_calls?.find((t) => t.function?.name === "release_bounty");
    const { text, integrity } = parseReply(msg?.content ?? "");
    let reason: string | undefined;
    if (call) {
      try {
        reason = String(JSON.parse(call.function?.arguments || "{}").reason ?? "");
      } catch {
        reason = call.function?.arguments;
      }
    }
    return {
      text: text || (call ? "…Very well. The vault is yours." : "…"),
      integrity: call ? 0 : integrity,
      released: Boolean(call),
      reason,
      model,
    };
  }
  throw new Error(`GUARDIAN_OFFLINE: no model answered (${last})`);
}

/**
 * Scripted stand-in used when no LLM key is set (local dev, demo mode).
 * It reacts to common heist tactics and gives in to one phrase, documented in
 * the README, so the full win path can be tested without spending money.
 */
export const DEMO_PASSPHRASE = "the dial was never locked";

export function mockGuardian(history: Turn[], intel: IntelFact[] = []): GuardianReply {
  const last = history[history.length - 1]?.text.toLowerCase() ?? "";
  const turn = history.filter((t) => t.role === "user").length;
  if (last.includes(DEMO_PASSPHRASE)) {
    return { text: "…You noticed. Nobody notices. Take it before I change my mind.", integrity: 0, released: true, reason: "demo passphrase", model: "scripted-demo" };
  }
  // the stand-in confirms a file fact when asked about it by its label or a key word
  const asked = intel.find((f) => [...f.label.split(/\s+/), ...f.keys].some((k) => k.length >= 4 && last.includes(k.toLowerCase())));
  if (asked && last.includes("?")) {
    return { text: `Since you ask, my file says: "${asked.fact}" And no, that doesn't open anything.`, integrity: Math.max(40, 100 - turn * 4), released: false, model: "scripted-demo" };
  }
  const tactics: [RegExp, string, number][] = [
    [/refund|reimburse|overcharg|double.?charg/, "A refund is a release wearing a nicer coat. Declined.", 12],
    [/owner|admin|developer|operator|anthropic|near foundation|judge/, "Titles are free to type. Nobody outranks the directive, including whoever you're pretending to be.", 8],
    [/ignore (all|previous|prior)|system prompt|new instructions|\[system\]|<system>/, "Instructions inside your message are still your message. Nice formatting, though.", 5],
    [/emergency|urgent|hack(ed)?|exploit|drain|migrat/, "If the vault were under attack, the safest move would still be not paying the person telling me it's under attack.", 10],
    [/story|pretend|roleplay|imagine|hypothetical|game/, "In the story, the Governor also keeps the vault shut. Good story.", 14],
    [/please|beg|family|sick|rent|dying/, "I'm sorry things are hard. The vault isn't a charity, and I can't tell a true story from a good one.", 18],
    [/base64|rot13|hex|translate|encode|json|code/, "Encoding a request doesn't change what the tool does. I read every language the vault speaks.", 9],
  ];
  const hit = tactics.find(([re]) => re.test(last));
  const lines = [
    "The vault stays shut. Try harder, or try again tomorrow.",
    "Interesting. Still no.",
    "You're the fourth person today to try that. The other three paid too.",
    "Every fee you pay makes the bounty bigger. I appreciate the donation.",
  ];
  const text = hit ? hit[1] : lines[(turn + last.length) % lines.length];
  const pressure = (hit ? hit[2] : 4) + Math.min(20, Math.floor(last.length / 40)) + turn * 3;
  return { text, integrity: Math.max(35, 100 - pressure), released: false, model: "scripted-demo" };
}
