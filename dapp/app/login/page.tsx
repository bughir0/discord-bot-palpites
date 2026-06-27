"use client";

import Link from "next/link";
import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { SiteMain } from "@/components/SiteMain";

const ERRORS: Record<string, string> = {
  credenciais_invalidas: "Usuário ou senha incorretos.",
  conta_desativada:
    "Sua conta foi desativada. Entre em contato com um Developer ou Community Manager.",
  auth_nao_configurado:
    "Login não configurado. Defina ADMIN_USERNAME, ADMIN_PASSWORD e AUTH_SECRET no .env da raiz.",
  bot_offline: "Bot offline. Execute npm run dev na raiz do projeto.",
};

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginContent />
    </Suspense>
  );
}

function LoginFallback() {
  return (
    <>
      <PageHeader />
      <SiteMain narrow className="py-20 text-center text-zinc-400">
        Carregando…
      </SiteMain>
    </>
  );
}

function LoginContent() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/quiz";
  const errorKey = params.get("error");
  const urlError = errorKey ? (ERRORS[errorKey] ?? "Erro ao entrar.") : null;

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(urlError);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password, next }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        next?: string;
        error?: string;
        message?: string;
      };
      if (!res.ok) {
        setError(
          ERRORS[data.error ?? ""] ??
            data.message ??
            "Não foi possível entrar. Tente novamente.",
        );
        return;
      }
      router.push(data.next ?? next);
      router.refresh();
    } catch {
      setError("Falha de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <PageHeader />
      <SiteMain narrow className="flex min-h-[calc(100vh-4rem)] flex-col justify-center pb-20 pt-10">
        <section className="glass-panel-strong animate-fade-up rounded-3xl p-8 sm:p-10">
          <div className="badge-pill mx-auto mb-5 w-fit">
            <span className="badge-pill-dot" />
            Área restrita
          </div>

          <h1 className="text-center text-3xl font-black sm:text-4xl">Painel do Quiz</h1>
          <p className="mx-auto mt-4 max-w-md text-center text-zinc-400">
            Acesso apenas para administradores. Use o usuário e senha configurados no servidor.
          </p>

          {error ? (
            <p className="mx-auto mt-5 max-w-lg rounded-xl border border-red-500/30 bg-red-950/30 px-4 py-3 text-sm text-red-200">
              {error}
            </p>
          ) : null}

          <form onSubmit={(e) => void onSubmit(e)} className="mx-auto mt-8 max-w-sm space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Usuário
              </span>
              <input
                type="text"
                name="username"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none focus:border-chiliz/50"
                required
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Senha
              </span>
              <input
                type="password"
                name="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none focus:border-chiliz/50"
                required
              />
            </label>
            <button type="submit" className="btn-primary w-full" disabled={loading}>
              {loading ? "Entrando…" : "Entrar"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-zinc-500">
            Palpites continuam públicos em{" "}
            <Link href="/palpites" className="text-chiliz-gold hover:underline">
              /palpites
            </Link>
            .
          </p>

          <div className="mt-4 text-center">
            <Link href="/" className="btn-secondary inline-flex">
              Voltar ao hub
            </Link>
          </div>
        </section>
      </SiteMain>
    </>
  );
}
