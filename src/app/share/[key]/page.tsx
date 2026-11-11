import type { Metadata } from "next";
import Link from "next/link";
import { getRecord, toPublic } from "@/lib/feed";
import { Ledger } from "@/components/Ledger";

export const dynamic = "force-dynamic";

type P = { params: Promise<{ key: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const key = decodeURIComponent((await params).key);
  const rec = /^[al]:\d+$/.test(key) ? await getRecord(key) : null;
  const title = rec
    ? rec.status === "released" || rec.status === "claimed"
      ? `${rec.player} cracked ${rec.vaultName}`
      : `${rec.player} shook ${rec.guardianName.replace(/^The /, "the ")} down to ${rec.minIntegrity}/100`
    : "Heist: can you rob this vault?";
  const image = `/api/card/${encodeURIComponent(key)}`;
  return {
    title,
    description: "An AI guards a NEAR bounty. Talk it into opening the vault and the bounty is yours.",
    openGraph: { title, images: [{ url: image, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title, images: [image] },
  };
}

export default async function SharePage({ params }: P) {
  const key = decodeURIComponent((await params).key);
  const rec = /^[al]:\d+$/.test(key) ? await getRecord(key) : null;
  return (
    <div style={{ padding: "20px 0 40px" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/api/card/${encodeURIComponent(key)}`} alt="" style={{ width: "100%", maxWidth: 900, borderRadius: 8, border: "1px solid var(--rivet)" }} />
      {rec && (
        <section className="block">
          <h2>The full exchange</h2>
          <Ledger items={[toPublic(rec)]} full />
        </section>
      )}
      <p style={{ marginTop: 24 }}>
        <Link className="btn" href={rec?.kind === "vault" && rec.vaultId ? `/vault/${rec.vaultId}` : "/lobby"}>
          Try it yourself
        </Link>
      </p>
    </div>
  );
}
