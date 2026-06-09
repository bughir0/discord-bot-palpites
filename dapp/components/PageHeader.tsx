"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Início" },
  { href: "/palpites", label: "Palpites Copa" },
] as const;

export function PageHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-white/5 bg-black/40 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-center gap-6">
          <Link href="/" className="group flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-chiliz to-chiliz-gold text-xs font-black text-white shadow-lg shadow-chiliz/30 transition group-hover:scale-105">
              P
            </span>
            <span className="text-base font-bold tracking-tight">
              Palpiter <span className="text-chiliz">CHZ</span>
            </span>
          </Link>

          <nav className="hidden items-center gap-5 sm:flex">
            {NAV.map((item) => {
              const active =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`nav-link ${active ? "nav-link-active" : ""}`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <ConnectButton
          showBalance={{ smallScreen: false, largeScreen: true }}
        />
      </div>
    </header>
  );
}
