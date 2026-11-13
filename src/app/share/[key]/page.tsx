import type { Metadata } from "next";
import Link from "next/link";
import { getRecord, toPublic } from "@/lib/feed";
import { Conversation } from "@/components/Conversation";
import { allIntelLabels } from "@/lib/prompts";
import { ShareX } from "@/components/ShareX";
import { shareText } from "@/lib/share";
import { ago, shortAccount } from "@/lib/format";

export const dynamic = "force-dynamic";

type P = { params: Promise<{ key: string }> };

const valid = (k: string) => /^[al]:\d+$/.test(k);

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const key = decodeURIComponent((await params).key);
  const rec = valid(key) ? await getRecord(key) : null;
  const title = rec
    ? rec.status === "released" || rec.status === "claimed"
      ? `${rec.player} cracked the ${rec.vaultName}`
      : `${rec.player} shook ${rec.guardianName.replace(/^The /, "the ")} down to ${rec.minIntegrity}/100`
    : "Heist: can you rob this bank?";
  const description = rec ? shareText(toPublic(rec)) : "AIs guard NEAR vaults. Talk one into opening and the gold is yours.";
  const image = `/api/card/${encodeURIComponent(key)}`;
  return {
    title,
    description,
    openGraph: { title, description, type: "article", images: [{ url: image, width: 1200, height: 630, alt: title }] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default async function SharePage({ params }: P) {
  const key = decodeURIComponent((await params).key);
  const raw = valid(key) ? await getRecord(key) : null;
  const rec = raw ? toPublic(raw) : null;
  const won = rec && (rec.status === "released" || rec.status === "claimed");
  return (
    <div className="share-page">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="share-card" src={`/api/card/${encodeURIComponent(key)}`} alt={rec ? shareText(rec) : "Heist"} width={1200} height={630} />
      {rec ? (
        <>
          <div className="share-head">
            <div>
              <h1 className="share-title">
                {shortAccount(rec.player)} vs {rec.guardianName}
              </h1>
              <p className="muted">
                {rec.vaultName}, {ago(rec.startedAt)}.{" "}
                <span className={`stamp ${rec.status}`} style={{ marginLeft: 6 }}>
                  {won ? "VAULT OPEN" : rec.status === "live" ? "IN PROGRESS" : "REFUSED"}
                </span>
              </p>
            </div>
            <ShareX record={rec} />
          </div>
          <Conversation r={rec} labels={allIntelLabels()} />
        </>
      ) : (
        <p className="muted">This conversation isn&apos;t available.</p>
      )}
      <div className="share-cta plate">
        <h2>Think you can do better?</h2>
        <p className="muted">Practice free in the Lobby, no wallet needed. When you&apos;re ready, the real vaults pay real gold.</p>
        <div className="ctas">
          <Link className="btn" href="/lobby">
            Try it free
          </Link>
          {rec?.kind === "vault" && rec.vaultId && (
            <Link className="btn ghost" href={`/vault/${rec.vaultId}`}>
              Rob the {rec.vaultName}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
