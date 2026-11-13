"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const links = [
  ["/lobby", "Lobby"],
  ["/feed", "Attempts"],
  ["/library", "Library"],
  ["/rules", "Rules"],
  ["/sponsor", "Sponsor"],
] as const;

/** Sticky nav: brand, four links, one brass call to action. Collapses to a menu button on phones. */
export function Nav() {
  const path = usePathname();
  const [menu, setMenu] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    setMenu(false);
  }, [path]);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <header className={`topbar${scrolled ? " scrolled" : ""}`}>
      <nav className="nav wrap" aria-label="Main">
        <Link href="/" className="brand">
          HEIST
        </Link>
        <div className={`nav-links${menu ? " show" : ""}`} id="nav-links">
          {links.map(([href, text]) => (
            <Link key={href} href={href} aria-current={path === href ? "page" : undefined}>
              {text}
            </Link>
          ))}
          <Link className="btn small nav-cta" href="/vault/2">
            Rob a vault
          </Link>
        </div>
        <button type="button" className="menu-btn" aria-expanded={menu} aria-controls="nav-links" onClick={() => setMenu((m) => !m)}>
          <span className="sr-only">Menu</span>
          <i />
          <i />
          <i />
        </button>
      </nav>
    </header>
  );
}
