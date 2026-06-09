"use client";

import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { formatEther } from "viem";
import {
  useAccount,
  useChainId,
  useSendTransaction,
  useSwitchChain,
  useWaitForTransactionReceipt,
} from "wagmi";
import { PageHeader } from "@/components/PageHeader";
import { SiteMain } from "@/components/SiteMain";
import { ACTIVE_CHAIN } from "@/lib/chains";
import { api, type BolaoSession } from "@/lib/api";

export default function BolaoPage() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = params.sessionId;
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["session", sessionId],
    queryFn: () => api.getSession(sessionId),
    refetchInterval: 15_000,
  });

  const {
    sendTransaction,
    data: txHash,
    isPending: isEnviandoTransferencia,
    error: sendError,
  } = useSendTransaction();

  const { isLoading: aguardandoConfirmacao, isSuccess } =
    useWaitForTransactionReceipt({ hash: txHash });

  const [enviandoBackend, setEnviandoBackend] = useState(false);
  const [confirmadoBackend, setConfirmadoBackend] = useState(false);

  useEffect(() => {
    async function notificar() {
      if (isSuccess && txHash && address && !confirmadoBackend) {
        setEnviandoBackend(true);
        try {
          await api.confirmarBolao(sessionId, txHash, address);
          setConfirmadoBackend(true);
          refetch();
        } finally {
          setEnviandoBackend(false);
        }
      }
    }
    notificar();
  }, [isSuccess, txHash, address, confirmadoBackend, sessionId, refetch]);

  if (isLoading) {
    return (
      <Frame>
        <p className="text-zinc-500">Carregando sessão...</p>
      </Frame>
    );
  }

  if (error || !data) {
    return (
      <Frame>
        <Aviso tone="erro">
          Sessão não encontrada ou expirada. Volte ao Discord e use{" "}
          <strong>/bolao-chz</strong> novamente.
        </Aviso>
      </Frame>
    );
  }

  if (data.status === "confirmada" || confirmadoBackend) {
    return (
      <Frame>
        <Aviso tone="sucesso">
          Entrada do bolão confirmada na Chiliz Chain. Pode fechar esta aba e
          acompanhar o ranking no Discord.
        </Aviso>
        {txHash && <TxLink txHash={txHash} />}
      </Frame>
    );
  }

  if (data.status === "expirada") {
    return (
      <Frame>
        <Aviso tone="erro">Sessão expirada. Gere um novo link no Discord.</Aviso>
      </Frame>
    );
  }

  const entrada = BigInt(data.entradaCHZWei);
  const redeErrada = isConnected && chainId !== ACTIVE_CHAIN.id;

  const handlePagar = () => {
    sendTransaction({
      to: data.paymentReceiverAddress as `0x${string}`,
      value: entrada,
    });
  };

  return (
    <Frame>
      <SessionInfo data={data} entrada={entrada} />

      <h2 className="mt-8 mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-500">
        Seus palpites
      </h2>
      <ul className="divide-y divide-zinc-900 rounded-xl border border-zinc-900 bg-zinc-950/60">
        {data.palpites.map((palp) => {
          const p = data.partidas.find((x) => x.partidaId === palp.partidaId);
          if (!p) return null;
          return (
            <li
              key={p.partidaId}
              className="flex items-center justify-between px-4 py-3"
            >
              <Lado
                escudo={p.escudoMandante}
                nome={p.siglaMandante ?? p.timeMandante}
                placar={palp.mandante}
              />
              <span className="px-2 text-zinc-600">vs</span>
              <Lado
                escudo={p.escudoVisitante}
                nome={p.siglaVisitante ?? p.timeVisitante}
                placar={palp.visitante}
                inverter
              />
            </li>
          );
        })}
      </ul>

      <div className="mt-8 space-y-3">
        {!isConnected && (
          <Aviso tone="info">
            Clique em <strong>Connect Wallet</strong> no topo para continuar.
          </Aviso>
        )}

        {isConnected && redeErrada && (
          <button
            onClick={() => switchChain({ chainId: ACTIVE_CHAIN.id })}
            className="w-full rounded-lg bg-yellow-500 px-4 py-3 font-semibold text-black hover:bg-yellow-400"
          >
            Trocar para {ACTIVE_CHAIN.name}
          </button>
        )}

        {isConnected && !redeErrada && (
          <button
            onClick={handlePagar}
            disabled={
              isEnviandoTransferencia ||
              aguardandoConfirmacao ||
              enviandoBackend
            }
            className="w-full rounded-lg bg-chiliz px-4 py-3 font-semibold text-white shadow shadow-chiliz/30 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isEnviandoTransferencia
              ? "Confirme a transferência..."
              : aguardandoConfirmacao
                ? "Confirmando on-chain..."
                : enviandoBackend
                  ? "Avisando o bot..."
                  : `Pagar entrada ${formatEther(entrada)} CHZ`}
          </button>
        )}

        <p className="text-xs text-zinc-500">
          Destino: <code>{data.paymentReceiverAddress}</code>
        </p>

        {sendError && (
          <Aviso tone="erro">{(sendError as Error).message}</Aviso>
        )}
        {txHash && <TxLink txHash={txHash} />}
      </div>
    </Frame>
  );
}

function SessionInfo({
  data,
  entrada,
}: {
  data: BolaoSession;
  entrada: bigint;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs uppercase tracking-wider text-zinc-500">
        Rodada {data.numeroRodada} · {data.discordUsername}
      </p>
      <h1 className="text-3xl font-bold">
        Bolão CHZ{" "}
        <span className="text-chiliz">{formatEther(entrada)} CHZ</span>
      </h1>
      <p className="text-xs text-zinc-500">
        Entrada do bolão via transferência CHZ (jogo de palpites, não aposta
        esportiva).
      </p>
      <p className="text-sm text-zinc-400">
        Sessão expira em {new Date(data.expiraEm).toLocaleString("pt-BR")}.
      </p>
    </div>
  );
}

function Lado({
  escudo,
  nome,
  placar,
  inverter = false,
}: {
  escudo: string | null;
  nome: string;
  placar: number;
  inverter?: boolean;
}) {
  return (
    <div
      className={`flex flex-1 items-center gap-3 ${
        inverter ? "flex-row-reverse text-right" : ""
      }`}
    >
      {escudo ? (
        <Image src={escudo} alt={nome} width={28} height={28} unoptimized />
      ) : (
        <div className="size-7 rounded bg-zinc-800" />
      )}
      <span className="font-medium">{nome}</span>
      <span
        className={`ml-auto text-xl font-bold tabular-nums ${
          inverter ? "ml-0 mr-auto" : ""
        }`}
      >
        {placar}
      </span>
    </div>
  );
}

function TxLink({ txHash }: { txHash: string }) {
  const url = `${ACTIVE_CHAIN.blockExplorers!.default.url}/tx/${txHash}`;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="block text-center text-xs text-chiliz hover:underline"
    >
      Ver transação no Chiliscan →
    </a>
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
  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${cls}`}>{children}</div>
  );
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
