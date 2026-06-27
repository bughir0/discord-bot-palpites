"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { SiteMain } from "@/components/SiteMain";

export default function ContaDesativadaPage() {
  const router = useRouter();

  useEffect(() => {
    fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
  }, []);

  return (
    <>
      <PageHeader />
      <SiteMain narrow className="flex min-h-[calc(100vh-4rem)] flex-col justify-center pb-20 pt-10">
        <section className="glass-panel-strong animate-fade-up rounded-3xl p-8 text-center sm:p-10">
          <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl border border-amber-500/30 bg-amber-950/30 text-2xl">
            ⚠
          </div>
          <h1 className="text-3xl font-black sm:text-4xl">Conta desativada</h1>
          <p className="mx-auto mt-4 max-w-md text-zinc-400">
            Sua conta foi desativada por um administrador. Você foi desconectado e não pode
            acessar o painel até que a conta seja reativada.
          </p>
          <p className="mx-auto mt-4 max-w-md text-sm text-zinc-500">
            Entre em contato com um <strong className="text-zinc-300">Developer</strong> ou{" "}
            <strong className="text-zinc-300">Community Manager</strong> para mais informações.
          </p>
          <p className="mx-auto mt-3 max-w-md text-xs text-zinc-600">
            Contas desativadas são removidas automaticamente após 30 dias.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/" className="btn-secondary inline-flex">
              Voltar ao início
            </Link>
            <button
              type="button"
              className="btn-primary"
              onClick={() => router.push("/login")}
            >
              Ir para login
            </button>
          </div>
        </section>
      </SiteMain>
    </>
  );
}
