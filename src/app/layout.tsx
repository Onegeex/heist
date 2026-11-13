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
        <div className="wrap">
          <Nav />
          <main>{children}</main>
          <footer className="site">
            Built at NEAR HACKATHON. Guardian prompt and contract rules are public on{" "}
            <a href="/rules">the rules page</a>. Source:{" "}
            <a href="https://github.com/Onegeex/heist">github.com/Onegeex/heist</a>.
          </footer>
        </div>
      </body>
    </html>
  );
}
