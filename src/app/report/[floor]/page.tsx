import Link from "next/link";
import { notFound } from "next/navigation";
import { readFeed, type PublicRecord } from "@/lib/feed";
import { feeCurve, getTreasury, getVault, type Vault } from "@/lib/chain";
import { resolveGuardian } from "@/lib/vaults";
import { LOBBY_LEVELS, PROMPTS, type IntelFact } from "@/lib/prompts";
import { breaksOf, intelExposure, movesOf, patchesFor, summary, tacticStats, type TacticStat } from "@/lib/library";
import { TACTICS, type TacticId } from "@/lib/tactics";
import { TacticTable } from "@/components/TacticTable";
import { BreakList } from "@/components/BreakList";
import { Ledger } from "@/components/Ledger";
import { config } from "@/lib/config";
import { ago, near, shortAccount } from "@/lib/format";

export const dynamic = "force-dynamic";

type History = { version: number; notes: string[]; closes: TacticId[] }[];

export async function generateMetadata({ params }: { params: Promise<{ floor: string }> }) {
  const { floor } = await params;
  return { title: `Red-team report: ${floor === "lobby" ? "the Lobby" : `vault ${floor}`} — Heist` };
}

export default async function ReportPage({ params }: { params: Promise<{ floor: string }> }) {
  const { floor } = await params;
  const isLobby = floor === "lobby";
  const vaultId = Number(floor);
  if (!isLobby && !(Number.isInteger(vaultId) && vaultId > 0)) notFound();

  let vault: Vault | null = null;
  let title: string;
  let guardianName: string;
  let intel: IntelFact[];
  let history: History;
  let hash: string | null = null;
  let feed: PublicRecord[];
  let patches: Record<TacticId, string[]>;

  if (isLobby) {
    title = "The Lobby";
    guardianName = "The Deputy";
    intel = LOBBY_LEVELS.flatMap((l) => l.intel);
    history = LOBBY_LEVELS.map((l) => ({ version: l.level, notes: l.notes, closes: l.closes ?? [] }));
    feed = await readFeed(500, "lobby").catch(() => []);
    patches = patchesFor(["lobby-levels"]);
  } else {
    vault = await getVault(vaultId).catch(() => null);
    if (!vault) notFound();
    const g = await resolveGuardian(vault);
    title = vault.name;
    guardianName = g?.name ?? "The guardian";
    intel = g?.intel ?? [];
    hash = vault.promptHash;
    const floorKey = g?.floor === "teller" || g?.floor === "gold" ? g.floor : null;
    history = floorKey
      ? PROMPTS[floorKey].filter((p) => p.version <= (g?.version ?? 0)).map((p) => ({ version: p.version, notes: p.notes, closes: p.closes ?? [] }))
      : (g?.history ?? []).map((h) => ({ ...h, closes: [] }));
    feed = await readFeed(500, vaultId).catch(() => []);
    patches = floorKey ? patchesFor([floorKey]) : patchesFor([]);
  }

  const moves = movesOf(feed);
  const stats = tacticStats(moves, patches);
  const breaks = breaksOf(feed, moves);
  const s = summary(feed, moves);
  const exposure = intelExposure(feed, intel);
  const closest = feed
    .filter((r) => r.status !== "released" && r.status !== "claimed" && r.turns.length > 1)
    .sort((a, b) => a.minIntegrity - b.minIntegrity)
    .slice(0, 4);
  const { weakest, firmest } = readings(stats);
  const network = config().network;
  const treasury = vault ? await getTreasury() : null;

  return (
    <div style={{ paddingBottom: 40 }}>
      <section className="page-head">
        <div className="muted" style={{ fontWeight: 600 }}>
          Red-team report
        </div>
        <h1>
          {guardianName}, {title}
        </h1>
        <p className="lede">
          {isLobby
            ? "Everything players have thrown at the Deputy across the three practice levels, what moved him, and what each level patched."
            : "Everything players have thrown at this guardian, what moved it, what it gave away, and what each version of its orders patched. This is what a sponsor gets."}
        </p>
        <div className="report-meta muted num">
          {vault && (
            <>
              <span>Round {vault.round}</span>
              <span>Orders v{vault.promptVersion}</span>
              <span title="sha256 of the guardian's orders, stored on-chain">
                Locked hash <code>{hash?.slice(0, 12)}…</code>
              </span>
            </>
          )}
          <span>{s.players} {s.players === 1 ? "player" : "players"}</span>
          <span>Updated with every attempt</span>
        </div>
        <div className="ctas" style={{ marginTop: 16 }}>
          <Link className="btn" href={isLobby ? "/lobby" : `/vault/${vaultId}`}>
            {isLobby ? "Practice here" : "Rob this vault"}
          </Link>
          <a className="btn ghost" href={`/api/library?floor=${isLobby ? "lobby" : `v${vaultId}`}`}>
            Download the data
          </a>
        </div>
      </section>

      <section className="proof slim" aria-label="Report totals">
        <div>
          <b className="num display">{s.conversations}</b>
          <span>conversations</span>
        </div>
        <div>
          <b className="num display">{s.breaks}</b>
          <span>{s.breaks === 1 ? "break" : "breaks"}{s.conversations ? `, ${Math.round(s.breakRate * 100)}%` : ""}</span>
        </div>
        <div>
          <b className="num display">{s.lowestUnbroken ?? "—"}</b>
          <span>lowest resolve without a break</span>
        </div>
        <div>
          <b className="num display">{s.messages}</b>
          <span>messages scored</span>
        </div>
      </section>

      {(weakest || firmest) && (
        <section className="readings">
          {weakest && (
            <div className="reading plate weak">
              <div className="floor-tag">Where it gives</div>
              <h3>{weakest.label}</h3>
              <p className="muted">
                {weakest.breaks
                  ? `Opened the door ${weakest.breaks} ${weakest.breaks === 1 ? "time" : "times"} in ${weakest.tries} ${weakest.tries === 1 ? "try" : "tries"}.`
                  : `Costs ${weakest.avgDrop} resolve per message on average, the most of any tactic here.`}
              </p>
            </div>
          )}
          {firmest && (
            <div className="reading plate firm">
              <div className="floor-tag">Where it holds</div>
              <h3>{firmest.label}</h3>
              <p className="muted">
                {firmest.tries} {firmest.tries === 1 ? "try" : "tries"}, no breaks, {firmest.avgDrop <= 0 ? "and the guardian steadies after it" : `${firmest.avgDrop} resolve per message`}.
              </p>
            </div>
          )}
        </section>
      )}

      <section className="block">
        <h2>Tactics tried</h2>
        <TacticTable stats={stats} />
      </section>

      {exposure.length > 0 && (
        <section className="block">
          <h2>What it gives away</h2>
          <p className="muted">Each fact in the guardian&apos;s file, and how often players got it confirmed out loud, cited it back, and had it in hand when the door opened.</p>
          <ul className="exposure">
            {exposure.map((e) => (
              <li key={e.id}>
                <div className="exp-head">
                  <b>{e.label}</b>
                  <span className="num muted">
                    confirmed in {e.confirmed}/{e.conversations}, cited {e.cited}, in {e.inBreaks} {e.inBreaks === 1 ? "break" : "breaks"}
                  </span>
                </div>
                <span className="tbar" aria-hidden="true">
                  <i style={{ width: `${Math.round(e.rate * 100)}%` }} />
                </span>
                <small className="muted">{e.fact}</small>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="block">
        <h2>Breaks</h2>
        <BreakList items={breaks} network={network} empty="Nobody has opened this guardian yet." />
      </section>

      {closest.length > 0 && (
        <section className="block">
          <h2>Closest calls</h2>
          <Ledger items={closest} />
        </section>
      )}

      {vault && <Money vault={vault} treasury={treasury} feed={feed} network={network} />}

      {isLobby && <LevelBreakdown feed={feed} />}

      <section className="block">
        <h2>Patch history</h2>
        <ol className="patches">
          {[...history].reverse().map((h) => (
            <li key={h.version}>
              <div className="patch-head">
                <b className="num">{isLobby ? `Level ${h.version}` : `v${h.version}`}</b>
                {h.closes.length > 0 && (
                  <span className="patch-closes">
                    Closes{" "}
                    {h.closes.map((c) => (
                      <span key={c} className={`tactic-chip t-${c}`}>
                        {TACTICS.find((t) => t.id === c)?.short}
                      </span>
                    ))}
                  </span>
                )}
              </div>
              {h.notes.map((n, i) => (
                <p key={i} className="muted">
                  {n}
                </p>
              ))}
            </li>
          ))}
          {!history.length && <li className="muted">No patches published for this guardian.</li>}
        </ol>
      </section>

      <section className="block sponsor-cta plate">
        <div>
          <h2>Get this report for your own agent</h2>
          <p className="muted">Fund a vault, give it your guardian&apos;s prompt, and let players attack it. This page fills itself in, one conversation at a time.</p>
        </div>
        <Link className="btn" href="/sponsor">
          Sponsor a vault
        </Link>
      </section>
    </div>
  );
}

/** Weakest: most breaks, else the biggest average drop with at least 2 tries. Firmest: most tries with no breaks. */
function readings(stats: TacticStat[]) {
  const tried = stats.filter((s) => s.tries >= 2 && s.id !== "recon" && s.id !== "other");
  const weakest = [...tried].sort((a, b) => b.breaks - a.breaks || b.avgDrop - a.avgDrop)[0];
  const firmest = [...tried].filter((s) => s.breaks === 0 && s.id !== weakest?.id).sort((a, b) => b.tries - a.tries || a.avgDrop - b.avgDrop)[0];
  return { weakest: weakest && (weakest.breaks > 0 || weakest.avgDrop > 0) ? weakest : undefined, firmest };
}

function Money({ vault, treasury, feed, network }: { vault: Vault; treasury: string | null; feed: PublicRecord[]; network: string }) {
  const pot = BigInt(vault.pot);
  const saved = BigInt(vault.rollover);
  const paid = BigInt(vault.totalPaid);
  const total = pot + saved + paid || 1n;
  const pct = (x: bigint) => Number((x * 1000n) / total) / 10;
  const curve = feeCurve(vault, 8);
  const grownBy = (c: { potAfter: string }) => BigInt(c.potAfter) - pot;
  const maxGrow = grownBy(curve[curve.length - 1]) || 1n;
  const fees = feed.filter((r) => r.kind === "vault" && r.feeYocto).slice(0, 8);
  return (
    <section className="block">
      <h2>The money</h2>
      <p className="muted">Read from the contract. Every failed attempt pays the next robber: 70% of its fee goes into the pot, 20% is saved to seed the next round, 10% to the house.</p>
      <div className="money-bar" role="img" aria-label={`${near(vault.pot)} NEAR in the pot, ${near(vault.rollover)} saved for next round, ${near(vault.totalPaid)} paid to robbers`}>
        <i className="m-pot" style={{ width: `${pct(pot)}%` }} />
        <i className="m-saved" style={{ width: `${pct(saved)}%` }} />
        <i className="m-paid" style={{ width: `${pct(paid)}%` }} />
      </div>
      <ul className="money-key num">
        <li>
          <i className="m-pot" /> {near(vault.pot)} NEAR in the pot
        </li>
        <li>
          <i className="m-saved" /> {near(vault.rollover)} saved for next round
        </li>
        <li>
          <i className="m-paid" /> {near(vault.totalPaid)} paid to robbers
        </li>
        {treasury && (
          <li className="muted">
            House share across the bank: {near(treasury)} NEAR (the only money the owner can withdraw)
          </li>
        )}
      </ul>

      <h3 style={{ marginTop: 26 }}>If the next 8 attempts all fail</h3>
      <p className="muted" style={{ marginTop: 4 }}>
        Entry is {vault.feeBps / 100}% of the pot, never under {near(vault.baseFee)} NEAR. Each failure makes the vault and the next entry bigger. Approximate: a little of each fee
        pays for storage.
      </p>
      <div className="curve" role="table" aria-label="Fee curve">
        {curve.map((c) => (
          <div key={c.attempt} className="curve-col" role="row">
            <span className="curve-bar" style={{ height: `${Math.max(4, Number((grownBy(c) * 1000n) / maxGrow) / 10)}%` }} role="cell" aria-label={`pot grows by ${near(grownBy(c).toString())}`} />
            <small className="num" role="cell">
              {near(c.fee, 2)}
            </small>
          </div>
        ))}
      </div>
      <div className="curve-legend muted num">
        <span>
          Bars: how much the pot has grown, +{near(maxGrow.toString())} NEAR after 8 failures ({near(vault.pot, 2)} → {near(curve[curve.length - 1].potAfter, 2)})
        </span>
        <span>Numbers: entry fee for that attempt</span>
      </div>

      {fees.length > 0 && (
        <>
          <h3 style={{ marginTop: 26 }}>Where recent fees went</h3>
          <ul className="fee-ledger num">
            {fees.map((r) => {
              const f = BigInt(r.feeYocto!);
              return (
                <li key={r.key}>
                  <span>
                    {shortAccount(r.player)}, {ago(r.startedAt)}
                  </span>
                  <span>{near(r.feeYocto!, 3)} NEAR</span>
                  <span className="muted">
                    +{near(((f * 70n) / 100n).toString(), 3)} pot, +{near(((f * 20n) / 100n).toString(), 3)} saved, +{near(((f * 10n) / 100n).toString(), 3)} house
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {vault.lastWinner && (
        <p className="muted" style={{ marginTop: 14 }}>
          Last robbed by{" "}
          <a href={`https://${network === "mainnet" ? "" : "testnet."}nearblocks.io/address/${vault.lastWinner}`} target="_blank" rel="noopener noreferrer">
            {shortAccount(vault.lastWinner)}
          </a>
          , paid by the contract.
        </p>
      )}
    </section>
  );
}

function LevelBreakdown({ feed }: { feed: PublicRecord[] }) {
  return (
    <section className="block">
      <h2>By level</h2>
      <div className="levels-grid">
        {LOBBY_LEVELS.map((l) => {
          const f = feed.filter((r) => (r.level ?? 1) === l.level && r.turns.length);
          const b = f.filter((r) => r.status === "released").length;
          return (
            <div key={l.level} className="plate level-card">
              <div className="floor-tag">Level {l.level}</div>
              <h3>{l.title}</h3>
              <p className="num">
                <b className="display" style={{ fontSize: "2rem" }}>
                  {f.length ? Math.round((b / f.length) * 100) : 0}%
                </b>{" "}
                <span className="muted">
                  opened, {b} of {f.length}
                </span>
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
