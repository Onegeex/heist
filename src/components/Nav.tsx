"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  ["/heist", "Play"],
  ["/feed", "Attempts"],
  ["/rules", "Rules"],
] as const;

export function Nav() {
  const path = usePathname();
  return (
    <nav className="nav" aria-label="Main">
      <Link href="/" className="brand">HEIST</Link>
      {links.map(([href, text]) => (
        <Link key={href} href={href} aria-current={path === href ? "page" : undefined}>
          {text}
        </Link>
      ))}
    </nav>
  );
}
