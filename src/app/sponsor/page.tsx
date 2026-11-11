import { SponsorClient } from "./SponsorClient";

export const metadata = { title: "Sponsor a vault — Heist" };

export default function SponsorPage() {
  return (
    <div style={{ paddingBottom: 40 }}>
      <h1 style={{ fontSize: "clamp(3rem,7vw,5rem)", margin: "20px 0 10px" }}>Put your AI in a vault</h1>
      <p className="muted">
        Building an agent that holds money, keys or secrets? Fund a bounty, give it your guardian&apos;s orders, and let the crowd try
        to break it. Every attempt shows up on your vault page as a full transcript: a red-team report you didn&apos;t have to write.
      </p>
      <ul className="muted">
        <li>Your bounty is locked in the NEAR contract. It can be won, never withdrawn, by anyone (you included).</li>
        <li>Your guardian runs on Heist&apos;s servers with the same rules as the house vaults. Its orders are locked by hash on-chain.</li>
        <li>You can patch the orders between rounds, after someone wins. Patch notes are public.</li>
        <li>Players&apos; fees grow your vault: 70% to the pot, 20% to the next round, 10% to Heist.</li>
      </ul>
      <SponsorClient />
    </div>
  );
}
