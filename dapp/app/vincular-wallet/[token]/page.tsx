"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { PageHeader } from "@/components/PageHeader";
import { SiteMain } from "@/components/SiteMain";
import { api } from "@/lib/api";

export default function VincularWalletPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const { address, isConnected } = useAccount();
  const { signMessageAsync, isPending: assinando } = useSignMessage();
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["vincular", token],
    queryFn: () => api.getVincular(token),
  });

  const handleVincular = async () => {
    if (!data || !address) return;
    setErro(null);
    setEnviando(true);
    try {
      const sig = await signMessageAsync({ message: data.mensagem });
      await api.confirmarVinculo(token, address, sig);
      setFeito(true);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setEnviando(false);
    }
  };

  if (isLoading) {
    return (
      <Frame>
        <p className="text-zinc-500">Carregando...</p>
      </Frame>
    );
  }

  if (!data) {
    return (
      <Frame>
        <Aviso tone="erro">Link invalido ou expirado.</Aviso>
      </Frame>
    );
  }

  if (feito) {
    return (
      <Frame>
        <Aviso tone="sucesso">
          Wallet vinculada com sucesso. Pode voltar ao Discord.
        </Aviso>
      </Frame>
    );
  }

  return (
    <Frame>
      <h1 className="mb-2 text-2xl font-bold">Vincular wallet ao Discord</h1>
      <p className="mb-6 text-sm text-zinc-400">
        Olá <strong>{data.discordUsername}</strong>, conecte sua wallet e
        assine uma mensagem para provar que ela e sua. Nenhum CHZ e gasto
        nesta etapa.
      </p>

      <div className="rounded-xl border border-zinc-900 bg-zinc-950/60 p-5">
        <p className="mb-2 text-xs uppercase tracking-wider text-zinc-500">
          Mensagem que sera assinada
        </p>
        <pre className="whitespace-pre-wrap rounded bg-black/40 p-3 text-xs text-zinc-300">
          {data.mensagem}
        </pre>
      </div>

      <div className="mt-6">
        {!isConnected ? (
          <Aviso tone="info">Conecte sua wallet no topo.</Aviso>
        ) : (
          <button
            onClick={handleVincular}
            disabled={assinando || enviando}
            className="w-full rounded-lg bg-chiliz px-4 py-3 font-semibold text-white shadow shadow-chiliz/30 hover:brightness-110 disabled:opacity-50"
          >
            {assinando
              ? "Assine no MetaMask..."
              : enviando
                ? "Vinculando..."
                : "Assinar e vincular"}
          </button>
        )}
        {erro && (
          <p className="mt-3 text-sm text-red-400">{erro}</p>
        )}
      </div>
    </Frame>
  );
}

function Aviso({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "info" | "sucesso" | "erro";
}) {
  const cls =
    tone === "sucesso"
      ? "border-emerald-700 bg-emerald-950/40 text-emerald-200"
      : tone === "erro"
        ? "border-red-700 bg-red-950/40 text-red-200"
        : "border-zinc-700 bg-zinc-900/40 text-zinc-300";
  return <div className={`rounded-lg border px-4 py-3 text-sm ${cls}`}>{children}</div>;
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PageHeader />
      <SiteMain narrow className="pb-16">
        <div className="glass-panel-strong animate-fade-up rounded-3xl p-6 sm:p-8">
          {children}
        </div>
      </SiteMain>
    </>
  );
}
