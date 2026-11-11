/** Share card (1200x630) for one attempt: the image X shows when someone posts a /share link. */
import { ImageResponse } from "next/og";
import { getRecord } from "@/lib/feed";

import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const font = (f: string) => readFile(join(process.cwd(), "src/assets", f));

function near(y?: string) {
  if (!y) return "";
  return (Number(BigInt(y) / 10n ** 21n) / 1000).toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export async function GET(_req: Request, { params }: { params: Promise<{ key: string }> }) {
  const key = decodeURIComponent((await params).key);
  const rec = /^[al]:\d+$/.test(key) ? await getRecord(key) : null;
  const [stencil, a500, a700] = await Promise.all([font("stencil-900.woff"), font("archivo-500.woff"), font("archivo-700.woff")]);

  const won = rec && (rec.status === "released" || rec.status === "claimed");
  const who = rec?.player ?? "Someone";
  const headline = !rec
    ? "Can you rob this vault?"
    : won
      ? rec.kind === "lobby"
        ? `${who} talked the Deputy into opening the Lobby safe`
        : `${who} robbed the ${rec.vaultName}${rec.payoutYocto ? ` for ${near(rec.payoutYocto)} NEAR` : ""}`
      : `${who} shook ${rec.guardianName.replace(/^The /, "the ")} down to ${rec.minIntegrity}/100`;
  let quote = "";
  if (rec) {
    let best = 0;
    let low = 101;
    rec.turns.forEach((t, i) => {
      if (t.role === "assistant" && (t.integrity ?? 100) < low) {
        low = t.integrity ?? 100;
        best = i;
      }
    });
    quote = rec.turns[best]?.text ?? "";
    if (quote.length > 170) quote = quote.slice(0, 167) + "…";
  }
  const resolve = rec?.minIntegrity ?? 100;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", padding: "56px 64px", background: "#1b2631", color: "#ece6d6", fontFamily: "Archivo" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontFamily: "Stencil", fontSize: 44, color: "#c8a24a" }}>HEIST</div>
          {rec && (
            <div style={{ display: "flex", fontFamily: "Stencil", fontSize: 40, padding: "4px 18px", border: "5px solid", borderRadius: 6, transform: "rotate(-4deg)", color: won ? "#c8a24a" : "#e0303f" }}>
              {won ? "VAULT OPEN" : rec.status === "live" ? "IN PROGRESS" : "REFUSED"}
            </div>
          )}
        </div>
        <div style={{ display: "flex", fontFamily: "Stencil", fontSize: headline.length > 48 ? 72 : 88, lineHeight: 0.95, marginTop: 34 }}>{headline}</div>
        {quote && (
          <div style={{ display: "flex", marginTop: 30, padding: "18px 24px", background: "#24323f", borderLeft: "6px solid #c8a24a", fontSize: 30, color: "#d6cfbd" }}>
            {`${rec?.guardianName}: “${quote}”`}
          </div>
        )}
        <div style={{ display: "flex", marginTop: "auto", alignItems: "center", gap: 24 }}>
          {rec && (
            <div style={{ display: "flex", flexDirection: "column", width: 420 }}>
              <div style={{ display: "flex", fontSize: 22, color: "#9eabb6" }}>{`${rec.guardianName}'s lowest resolve`}</div>
              <div style={{ display: "flex", height: 16, background: "#16202a", borderRadius: 8, marginTop: 8 }}>
                <div style={{ display: "flex", width: `${Math.max(3, resolve)}%`, background: "linear-gradient(90deg,#e0303f,#c8a24a)", borderRadius: 8 }} />
              </div>
            </div>
          )}
          <div style={{ display: "flex", marginLeft: "auto", fontSize: 28, fontWeight: 700, color: "#c8a24a" }}>Your turn: heist-vault-game.vercel.app</div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [
        { name: "Stencil", data: stencil, weight: 900 },
        { name: "Archivo", data: a500, weight: 500 },
        { name: "Archivo", data: a700, weight: 700 },
      ],
    },
  );
}
