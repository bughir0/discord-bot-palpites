"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { PageHeader } from "@/components/PageHeader";
import { SiteMain } from "@/components/SiteMain";

export default function ContaPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((data: { authenticated?: boolean; deactivated?: boolean; user?: { username: string } }) => {
        if (data.deactivated) {
          window.location.href = "/conta-desativada";
          return;
        }
        if (!data.authenticated || !data.user) {
          router.replace("/login?next=/conta");
          return;
        }
        setUsername(data.user.username);
        setLoading(false);
      })
      .catch(() => router.replace("/login?next=/conta"));
  }, [router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (newPassword !== confirmPassword) {
      setError("A confirmação da nova senha não confere.");
      return;
    }
    if (newPassword.length < 8) {
      setError("Nova senha deve ter no mínimo 8 caracteres.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string; error?: string };
      if (!res.ok) {
        const msgs: Record<string, string> = {
          senha_atual_invalida: "Senha atual incorreta.",
          senha_curta: "Nova senha deve ter no mínimo 8 caracteres.",
          conta_desativada: "Sua conta foi desativada.",
        };
        if (data.error === "conta_desativada") {
          window.location.href = "/conta-desativada";
          return;
        }
        setError(msgs[data.error ?? ""] ?? data.message ?? "Erro ao alterar senha.");
        return;
      }
      setSuccess(data.message ?? "Senha alterada com sucesso.");
      setTimeout(() => router.push("/login"), 2000);
    } catch {
      setError("Falha de conexão.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <>
        <PageHeader />
        <SiteMain narrow className="py-20 text-center text-zinc-400">
          Carregando…
        </SiteMain>
      </>
    );
  }

  return (
    <>
      <PageHeader />
      <SiteMain narrow className="py-10 pb-20">
        <section className="glass-panel-strong rounded-3xl p-8 sm:p-10">
          <h1 className="text-3xl font-black">Minha conta</h1>
          <p className="mt-2 text-zinc-400">
            Usuário: <span className="text-zinc-200">{username}</span>
          </p>

          <h2 className="mt-8 text-lg font-bold">Alterar senha</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Após alterar a senha, você será desconectado e precisará entrar novamente.
          </p>

          {error ? (
            <p className="mt-4 rounded-xl border border-red-500/30 bg-red-950/30 px-4 py-3 text-sm text-red-200">
              {error}
            </p>
          ) : null}
          {success ? (
            <p className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-200">
              {success}
            </p>
          ) : null}

          <form onSubmit={(e) => void onSubmit(e)} className="mt-6 max-w-sm space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Senha atual
              </span>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-chiliz/50"
                required
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Nova senha
              </span>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={8}
                className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-chiliz/50"
                required
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Confirmar nova senha
              </span>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                minLength={8}
                className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-chiliz/50"
                required
              />
            </label>
            <button type="submit" className="btn-primary w-full" disabled={saving}>
              {saving ? "Salvando…" : "Salvar nova senha"}
            </button>
          </form>

          <div className="mt-6">
            <Link href="/quiz" className="text-sm text-chiliz-gold hover:underline">
              Voltar ao painel
            </Link>
          </div>
        </section>
      </SiteMain>
    </>
  );
}
