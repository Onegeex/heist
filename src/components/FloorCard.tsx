import Link from "next/link";
import type { VaultView } from "@/lib/bank";
import { near, plural } from "@/lib/format";
import { Countdown } from "./Countdown";

const FLOOR_LABEL: Record<VaultView["floor"], string> = {
  lobby: "Ground floor",
  teller: "First floor",
  gold: "Basement, 48 m down",
  sponsored: "Sponsored vault",
};

/** One vault in the Bank: what's inside, what it costs, how long until the clock runs out. */
export function FloorCard({ v }: { v: VaultView }) {
  return (
    <article className={`floor plate floor-${v.floor}`}>
      <div className="floor-tag">{v.sponsor ? `Sponsored by ${v.sponsor}` : FLOOR_LABEL[v.floor]}</div>
      <h3>{v.name}</h3>
      <div className="floor-pot">
        <span className="display num">{near(v.pot, 1)}</span> <span className="muted">NEAR inside</span>
      </div>
      <dl className="floor-stats">
        <div>
          <dt>Entry now</dt>
          <dd className="num">{near(v.fee, 2)} NEAR</dd>
        </div>
        <div>
          <dt>Max win</dt>
          <dd className="num">{near(v.maxPayout, 0)} NEAR</dd>
        </div>
        <div>
          <dt>Guardian</dt>
          <dd>{v.guardianName}</dd>
        </div>
        <div>
          <dt>Countdown</dt>
          <dd>
            <Countdown endsAt={v.countdownEndsAt} idleLabel="Waiting for a challenger" />
          </dd>
        </div>
      </dl>
      {v.tagline && <p className="muted" style={{ fontSize: ".95rem" }}>{v.tagline}</p>}
      <p className="muted num" style={{ fontSize: ".85rem" }}>
        Round {v.round}. {plural(v.totalAttempts, "attempt")}. {near(v.totalPaid, 1)} NEAR paid out so far.
      </p>
      <Link className="btn" href={`/vault/${v.id}`}>
        {v.paused ? "Watch (closed)" : "Enter the vault"}
      </Link>
    </article>
  );
}

export function LobbyCard({ guardian }: { guardian: string }) {
  return (
    <article className="floor plate floor-lobby">
      <div className="floor-tag">Ground floor</div>
      <h3>The Lobby</h3>
      <div className="floor-pot">
        <span className="display">Free</span> <span className="muted">practice</span>
      </div>
      <p className="muted">
        {guardian} is new on the job and can be talked round. No wallet, no money. Crack the practice safe and your name goes
        on the board.
      </p>
      <Link className="btn ghost" href="/lobby">
        Practice in the Lobby
      </Link>
    </article>
  );
}
