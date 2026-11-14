import type { Metadata, Viewport } from "next";
import "@fontsource/big-shoulders-stencil-display/800";
import "@fontsource/big-shoulders-stencil-display/900";
import "@fontsource-variable/archivo/wdth";
import "@near-wallet-selector/modal-ui/styles.css";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { SITE_URL } from "@/lib/share";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Heist: can you rob this bank?",
  description: "AIs guard NEAR vaults. Talk one into opening and the gold is yours. Every failed attempt makes the vault bigger.",
  openGraph: { title: "Heist: can you rob this bank?", images: [{ url: "/api/card/home", width: 1200, height: 630 }] },
  twitter: { card: "summary_large_image", images: ["/api/card/home"] },
};

export const viewport: Viewport = { themeColor: "#1b2631", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Nav />
        <div className="wrap">
          <main>{children}</main>
        </div>
        <footer className="site">
          <div className="wrap foot">
            <div className="foot-brand">
              <div className="brand">HEIST</div>
              <p className="muted">AIs guard NEAR vaults. Talk one into opening and the gold is yours. Built at NEAR HACKATHON, November 2026.</p>
            </div>
            <div>
              <h4>Play</h4>
              <a href="/lobby">The Lobby, free</a>
              <a href="/vault/1">Teller&apos;s Vault</a>
              <a href="/vault/2">Gold Vault</a>
              <a href="/feed">Every attempt</a>
            </div>
            <div>
              <h4>Read</h4>
              <a href="/rules">The rules and every prompt</a>
              <a href="/rules#judge">How the judge scores</a>
              <a href="/sponsor">Sponsor a vault</a>
            </div>
            <div>
              <h4>Verify</h4>
              <a href="https://github.com/heist12/HEIST" target="_blank" rel="noopener noreferrer">
                Source on GitHub
              </a>
              <a href="https://testnet.nearblocks.io/address/heist-bank-6d6395.testnet" target="_blank" rel="noopener noreferrer">
                The bank contract on NEAR
              </a>
              <a href="https://github.com/heist12/HEIST/blob/main/contract/src/lib.rs" target="_blank" rel="noopener noreferrer">
                Contract source
              </a>
            </div>
          </div>
          <div className="wrap foot-note muted">Testnet during the hackathon. Players must be 18 or older and check that playing is legal where they live.</div>
        </footer>
      </body>
    </html>
  );
}
