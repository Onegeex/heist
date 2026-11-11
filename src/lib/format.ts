export function near(yocto: string | bigint, digits = 2): string {
  const y = BigInt(yocto);
  const whole = y / 10n ** 24n;
  const frac = Number((y % 10n ** 24n) / 10n ** 18n) / 1e6;
  return (Number(whole) + frac).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function shortAccount(a: string) {
  if (a.length <= 22) return a;
  return `${a.slice(0, 8)}…${a.slice(-8)}`;
}

export function ago(ms: number) {
  const s = Math.max(1, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

/** "The Governor" -> "the Governor" when it sits mid-sentence. */
export const inSentence = (name: string) => name.replace(/^The /, "the ");

export const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;
