import type { Metadata, Viewport } from "next";
import "@fontsource/big-shoulders-stencil-display/800";
import "@fontsource/big-shoulders-stencil-display/900";
import "@fontsource-variable/archivo/wdth";
import "@near-wallet-selector/modal-ui/styles.css";
import "./globals.css";
import { Nav } from "@/components/Nav";

export const metadata: Metadata = {
  title: "Heist — can you rob this vault?",
  description: "A NEAR bounty vault guarded by an AI. Talk the guardian into opening it and the bounty is yours.",
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
