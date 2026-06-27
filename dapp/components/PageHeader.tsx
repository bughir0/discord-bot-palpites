"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { SiteAdminRole } from "@/lib/auth/session";
import { ROLE_LABELS } from "@/lib/auth/session";

const ConnectButton = dynamic(
  () => import("@rainbow-me/rainbowkit").then((mod) => mod.ConnectButton),
  {
    ssr: false,
    loading: () => (
      <span className="inline-block h-10 w-28 animate-pulse rounded-xl bg-white/10" />
    ),
  },
);

const NAV = [
  { href: "/", label: "Início" },
  { href: "/palpites", label: "Palpites" },
  { href: "/quiz", label: "Quiz" },
] as const;

const WALLET_ROUTES = ["/palpites", "/bolao", "/vincular-wallet"];

type AuthUser = {
  id: string;
  username: string;
  role: SiteAdminRole;
  roleLabel: string;
};

type PageHeaderProps = {
  showWallet?: boolean;
};

export function PageHeader({ showWallet }: PageHeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const walletRoute =
    showWallet ?? WALLET_ROUTES.some((route) => pathname.startsWith(route));
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    if (pathname === "/conta-desativada") return;

    let cancelled = false;
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((data: { authenticated?: boolean; deactivated?: boolean; user?: AuthUser }) => {
        if (cancelled) return;
        if (data.deactivated) {
          router.replace("/conta-desativada");
          return;
        }
        if (data.authenticated && data.user) {
          setUser(data.user);
        } else {
          setUser(null);
        }
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      });
    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    window.location.href = "/";
  }

  const navItems =
    user?.role === "developer"
      ? [...NAV, { href: "/admin", label: "Admin" } as const]
      : NAV;

  return (
    <header className="sticky top-0 z-50 border-b border-white/5 bg-black/50">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-center gap-6">
          <Link href="/" className="group flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-chiliz to-chiliz-gold text-sm font-black text-white shadow-lg shadow-chiliz/30">
              P
            </span>
            <span className="text-base font-bold tracking-tight">
              Palpi<span className="text-chiliz">to</span>
            </span>
          </Link>

          <nav className="hidden items-center gap-5 sm:flex">
            {navItems.map((item) => {
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

        <div className="flex items-center gap-3">
          {user ? (
            <div className="hidden items-center gap-2 sm:flex">
              <span className="text-xs text-zinc-400">{user.username}</span>
              <span className="role-badge">
                {user.roleLabel ?? ROLE_LABELS[user.role]}
              </span>
              <Link
                href="/conta"
                className="rounded-lg border border-white/10 px-2.5 py-1 text-xs text-zinc-300 transition hover:border-white/20 hover:text-white"
              >
                Conta
              </Link>
              <button
                type="button"
                onClick={() => void logout()}
                className="rounded-lg border border-white/10 px-2.5 py-1 text-xs text-zinc-300 transition hover:border-white/20 hover:text-white"
              >
                Sair
              </button>
            </div>
          ) : pathname.startsWith("/quiz") ||
            pathname.startsWith("/admin") ||
            pathname.startsWith("/conta") ? (
            <Link
              href="/login"
              className="hidden rounded-lg border border-white/10 px-2.5 py-1 text-xs text-zinc-300 sm:inline-block hover:border-white/20 hover:text-white"
            >
              Entrar
            </Link>
          ) : null}
          {walletRoute ? (
            <ConnectButton showBalance={{ smallScreen: false, largeScreen: true }} />
          ) : null}
        </div>
      </div>
    </header>
  );
}
