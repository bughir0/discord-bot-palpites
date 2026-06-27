"use client";

import { useMemo, useState, useEffect, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { PageHeader } from "@/components/PageHeader";
import { SiteMain } from "@/components/SiteMain";
import { ACTIVE_CHAIN } from "@/lib/chains";
import { api } from "@/lib/api";
import { partidaAbertaParaPalpite } from "@/lib/partida";
import { CopaXSimulator } from "@/components/CopaXSimulator";

type ScoreMap = Record<number, { mandante: string; visitante: string }>;

const GUILD_ID = process.env.NEXT_PUBLIC_DISCORD_GUILD_ID;

export default function PalpitesPage() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const [scores, setScores] = useState<ScoreMap>({});
  const [feedback, setFeedback] = useState<string | null>(null);

  const estado = useQuery({
    queryKey: ["site-estado", GUILD_ID],
    queryFn: () => api.getSiteEstado(GUILD_ID),
    refetchInterval: 20_000,
  });

  const rodada = estado.data?.rodada ?? null;
  const partidas = estado.data?.partidas ?? [];
  const ranking = estado.data?.ranking ?? [];
  const redeErrada = isConnected && chainId !== ACTIVE_CHAIN.id;

  const meusPalpites = useQuery({
    queryKey: ["site-palpites", rodada?.id, address],
    queryFn: () => api.getSitePalpites(rodada!.id, address!),
    enabled: Boolean(rodada?.id && address),
    retry: false,
  });

  useEffect(() => {
    if (!partidas.length) return;
    const next: ScoreMap = {};
    for (const p of partidas) {
      next[p.partidaId] = { mandante: "", visitante: "" };
    }
    for (const p of meusPalpites.data?.palpites ?? []) {
      next[p.partidaId] = {
        mandante: String(p.mandante),
        visitante: String(p.visitante),
      };
    }
    setScores(next);
  }, [partidas, meusPalpites.data]);

  const partidasAbertas = useMemo(
    () =>
      partidas.filter((p) =>
        partidaAbertaParaPalpite(p.status, p.dataIso, p.processada),
      ),
    [partidas],
  );

  const partidasEncerradas = useMemo(
    () =>
      partidas.filter(
        (p) => !partidaAbertaParaPalpite(p.status, p.dataIso, p.processada),
      ),
    [partidas],
  );

  const salvarMutation = useMutation({
    mutationFn: async () => {
      if (!rodada?.id || !address) throw new Error("Rodada ou wallet ausente.");

      const palpites = partidasAbertas
        .map((p) => {
          const item = scores[p.partidaId] ?? { mandante: "", visitante: "" };
          if (item.mandante === "" || item.visitante === "") return null;
          return {
            partidaId: p.partidaId,
            mandante: Number(item.mandante),
            visitante: Number(item.visitante),
          };
        })
        .filter(
          (v): v is { partidaId: number; mandante: number; visitante: number } =>
            v !== null,
        );

      if (palpites.length === 0) {
        throw new Error("Preencha pelo menos um palpite antes de salvar.");
      }

      return api.salvarSitePalpites(rodada.id, address, palpites);
    },
    onSuccess: (data) => {
      setFeedback(`Palpites salvos com sucesso (${data.totalPalpites}).`);
      void meusPalpites.refetch();
      void estado.refetch();
    },
    onError: (err) => {
      setFeedback((err as Error).message);
    },
  });

  const preenchidos = useMemo(
    () =>
      partidasAbertas.filter((p) => {
        const s = scores[p.partidaId];
        return s?.mandante !== "" && s?.visitante !== "";
      }).length,
    [partidasAbertas, scores],
  );

  const palpitePorJogo = useMemo(() => {
    const map = new Map<
      number,
      { mandante: number; visitante: number; pontos: number }
    >();
    for (const p of meusPalpites.data?.palpites ?? []) {
      map.set(p.partidaId, p);
    }
    return map;
  }, [meusPalpites.data]);

  const walletNaoVinculada =
    isConnected &&
    meusPalpites.isError &&
    (meusPalpites.error as Error)?.message.includes("404");

  const meuDiscordId = meusPalpites.data?.discordUserId;
  const meuResumo = meusPalpites.data?.resumo;

  const podeSalvar =
    Boolean(
      rodada &&
        rodada.status === "aberta" &&
        partidasAbertas.length > 0 &&
        isConnected &&
        !redeErrada,
    ) && !salvarMutation.isPending;

  const entradaChz = rodada?.entradaCHZWei
    ? Number(BigInt(rodada.entradaCHZWei) / 10n ** 18n).toString()
    : "-";

  return (
    <>
      <PageHeader />
      <SiteMain className="pb-16">
        {/* Page hero */}
        <section className="animate-fade-up mb-8">
          <div className="badge-pill mb-4">
            <span className="badge-pill-dot" />
            Copa do Mundo · Modo CHZ
          </div>
          <h1 className="text-3xl font-black sm:text-5xl">
            Palpitar no site{" "}
            <span className="glow-text-animated">igual Discord</span>
          </h1>
          <p className="mt-3 max-w-2xl text-zinc-400">
            Conecte a wallet vinculada ao Discord — ela funciona como seu &quot;login&quot;.
            Palpites, pontos e ranking são os mesmos do servidor.
          </p>
        </section>

        <CopaXSimulator />

        {estado.isLoading && <Aviso tone="info">Carregando rodada...</Aviso>}
        {estado.error && (
          <Aviso tone="erro">{(estado.error as Error).message}</Aviso>
        )}

        {rodada && (
          <section className="glass-panel-strong animate-fade-up animate-fade-up-delay-1 mb-6 rounded-3xl p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
                  Rodada ativa
                </p>
                <p className="mt-1 text-2xl font-bold">
                  {rodada.numeroRodada}ª rodada
                  <StatusBadge status={rodada.status} />
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <MiniStat label="Entrada CHZ" value={entradaChz} highlight />
                <MiniStat label="Partidas" value={String(partidas.length)} />
                <MiniStat
                  label="Abertas"
                  value={String(partidasAbertas.length)}
                />
                <MiniStat
                  label="Preenchidos"
                  value={`${preenchidos}/${partidasAbertas.length}`}
                />
              </div>
            </div>
          </section>
        )}

        {isConnected && redeErrada && (
          <button
            onClick={() => switchChain({ chainId: ACTIVE_CHAIN.id })}
            className="btn-primary mb-6 w-full sm:w-auto"
          >
            Trocar para {ACTIVE_CHAIN.name}
          </button>
        )}

        {!isConnected && (
          <Aviso tone="info">
            <strong>Passo 1:</strong> conecte a wallet no topo.{" "}
            <strong>Passo 2:</strong> no Discord, use{" "}
            <code className="rounded bg-black/40 px-1">/wallet vincular</code> e
            assine com a mesma wallet. Assim o site sabe quem você é e mostra sua
            pontuação.
          </Aviso>
        )}

        {walletNaoVinculada && (
          <Aviso tone="erro">
            Wallet conectada, mas não vinculada ao Discord. Abra o Discord do
            bolão, use <code className="rounded bg-black/40 px-1">/wallet vincular</code>,
            conecte esta mesma wallet e assine a mensagem. Depois recarregue esta
            página.
          </Aviso>
        )}

        {isConnected && meuResumo && !walletNaoVinculada && (
          <section className="glass-panel-strong animate-fade-up mb-6 rounded-3xl border border-chiliz/20 p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-chiliz-gold">
                  Minha pontuação
                </p>
                <p className="mt-1 text-lg font-bold">
                  {meusPalpites.data?.discordUsername ?? "Você"}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  Conta ligada à wallet · mesmo ranking do Discord
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <MiniStat
                  label="Total de pontos"
                  value={String(meuResumo.totalPontos)}
                  highlight
                />
                <MiniStat
                  label="Posição"
                  value={
                    meuResumo.posicao
                      ? `#${meuResumo.posicao} de ${meuResumo.totalParticipantes}`
                      : "—"
                  }
                />
                <MiniStat
                  label="Placares exatos"
                  value={String(meuResumo.acertosExatos)}
                />
                <MiniStat
                  label="Acertou vencedor"
                  value={String(meuResumo.acertosVencedor)}
                />
              </div>
            </div>
          </section>
        )}

        {rodada && partidas.length > 0 && (
          <section className="glass-panel animate-fade-up animate-fade-up-delay-2 mb-8 rounded-3xl p-5 sm:p-6">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold">Seus palpites</h2>
                <p className="text-sm text-zinc-500">
                  {rodada.status !== "aberta"
                    ? "Rodada fechada — palpites bloqueados."
                    : partidasAbertas.length === 0
                      ? "Nenhum jogo aberto para palpite no momento."
                      : "Preencha os placares dos jogos abertos e salve antes do início."}
                </p>
              </div>
              {partidasAbertas.length > 0 && (
                <button
                  onClick={() => salvarMutation.mutate()}
                  disabled={!podeSalvar}
                  className="btn-primary disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
                >
                  {salvarMutation.isPending ? "Salvando..." : "Salvar palpites"}
                </button>
              )}
            </div>

            {partidasAbertas.length > 0 ? (
              <div className="space-y-3">
                {partidasAbertas.map((p, idx) => {
                  const value = scores[p.partidaId] ?? { mandante: "", visitante: "" };
                  const bloqueado = rodada.status !== "aberta";
                  return (
                    <div
                      key={p.partidaId}
                      className="match-card animate-fade-up"
                      style={{ animationDelay: `${Math.min(idx * 60, 400)}ms` }}
                    >
                      <div className="mb-3 flex items-center justify-between text-xs text-zinc-500">
                        <span className="rounded-full bg-white/5 px-2 py-0.5">
                          Jogo #{p.partidaId}
                        </span>
                        <span>
                          {p.dataIso
                            ? new Date(p.dataIso).toLocaleString("pt-BR")
                            : "-"}
                        </span>
                      </div>

                      <div className="grid grid-cols-[1fr_auto_auto_auto_1fr] items-center gap-2 sm:gap-4">
                        <TeamSide
                          escudo={p.escudoMandante}
                          nome={p.siglaMandante ?? p.timeMandante}
                        />
                        <input
                          type="number"
                          min={0}
                          max={20}
                          value={value.mandante}
                          onChange={(e) =>
                            setScores((old) => ({
                              ...old,
                              [p.partidaId]: { ...value, mandante: e.target.value },
                            }))
                          }
                          className="score-input"
                          disabled={bloqueado}
                          aria-label={`Gols ${p.siglaMandante ?? p.timeMandante}`}
                        />
                        <span className="score-divider">×</span>
                        <input
                          type="number"
                          min={0}
                          max={20}
                          value={value.visitante}
                          onChange={(e) =>
                            setScores((old) => ({
                              ...old,
                              [p.partidaId]: { ...value, visitante: e.target.value },
                            }))
                          }
                          className="score-input"
                          disabled={bloqueado}
                          aria-label={`Gols ${p.siglaVisitante ?? p.timeVisitante}`}
                        />
                        <TeamSide
                          escudo={p.escudoVisitante}
                          nome={p.siglaVisitante ?? p.timeVisitante}
                          invert
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-zinc-400">
                Todos os jogos desta rodada já começaram ou foram finalizados.
              </p>
            )}

            {partidasEncerradas.length > 0 && (
              <div className="mt-8 border-t border-white/5 pt-6">
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-500">
                  Jogos encerrados
                </h3>
                <div className="space-y-2">
                  {partidasEncerradas.map((p) => {
                    const value = scores[p.partidaId] ?? { mandante: "", visitante: "" };
                    const salvo = palpitePorJogo.get(p.partidaId);
                    const temPalpite =
                      salvo != null ||
                      (value.mandante !== "" && value.visitante !== "");
                    const temPlacar =
                      p.placarMandante !== null && p.placarVisitante !== null;
                    const palpiteMandante = salvo?.mandante ?? value.mandante;
                    const palpiteVisitante = salvo?.visitante ?? value.visitante;
                    return (
                      <div
                        key={p.partidaId}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/5 bg-black/30 px-4 py-3 opacity-80"
                      >
                        <span className="text-sm font-medium">
                          {p.siglaMandante ?? p.timeMandante}{" "}
                          {temPlacar ? (
                            <span className="text-chiliz-gold">
                              {p.placarMandante} × {p.placarVisitante}
                            </span>
                          ) : temPalpite ? (
                            <span className="text-zinc-400">
                              {palpiteMandante} × {palpiteVisitante}
                            </span>
                          ) : (
                            <span className="text-zinc-600">— × —</span>
                          )}{" "}
                          {p.siglaVisitante ?? p.timeVisitante}
                          {temPalpite && temPlacar && (
                            <span className="ml-2 text-xs text-zinc-500">
                              (palpite: {palpiteMandante}×{palpiteVisitante})
                            </span>
                          )}
                        </span>
                        <div className="flex items-center gap-2">
                          {salvo && p.processada && (
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                                salvo.pontos > 0
                                  ? "bg-emerald-500/15 text-emerald-300"
                                  : "bg-zinc-800 text-zinc-500"
                              }`}
                            >
                              {salvo.pontos > 0
                                ? `+${salvo.pontos} pts`
                                : "0 pts"}
                            </span>
                          )}
                          <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
                            {p.status === "finalizado" || p.processada
                              ? "Finalizado"
                              : "Encerrado"}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        )}

        {feedback && (
          <div className="mb-6 animate-fade-up">
            <Aviso tone={feedback.includes("sucesso") ? "sucesso" : "erro"}>
              {feedback}
            </Aviso>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="glass-panel card-hover rounded-3xl p-5 sm:p-6">
            <h2 className="mb-1 text-lg font-bold">Resultados</h2>
            <p className="mb-4 text-sm text-zinc-500">Jogos finalizados nesta rodada</p>
            {partidasEncerradas.filter((p) => p.processada).length === 0 ? (
              <p className="text-sm text-zinc-400">
                Ainda sem jogos finalizados nesta rodada.
              </p>
            ) : (
              <div className="space-y-2">
                {partidasEncerradas
                  .filter((p) => p.processada)
                  .map((j) => (
                  <div
                    key={j.partidaId}
                    className="flex items-center justify-between rounded-xl border border-white/5 bg-black/30 px-4 py-3 transition hover:border-chiliz/20"
                  >
                    <span className="text-sm font-medium">
                      {j.siglaMandante ?? j.timeMandante}{" "}
                      <span className="text-chiliz-gold">
                        {j.placarMandante} × {j.placarVisitante}
                      </span>{" "}
                      {j.siglaVisitante ?? j.timeVisitante}
                    </span>
                    <span className="text-xs text-zinc-500">{j.status}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="glass-panel card-hover rounded-3xl p-5 sm:p-6">
            <h2 className="mb-1 text-lg font-bold">Ranking da rodada</h2>
            <p className="mb-4 text-sm text-zinc-500">
              Top 10 · procure seu nome do Discord
            </p>
            {ranking.length === 0 ? (
              <p className="text-sm text-zinc-400">Sem pontuação ainda.</p>
            ) : (
              <div className="space-y-2">
                {ranking.slice(0, 10).map((r, idx) => {
                  const souEu = meuDiscordId === r.discord_user_id;
                  return (
                  <div
                    key={r.discord_user_id}
                    className={`flex items-center justify-between rounded-xl border px-4 py-3 ${
                      souEu
                        ? "border-chiliz/50 bg-chiliz/10 ring-1 ring-chiliz/30"
                        : idx === 0
                        ? "rank-gold"
                        : idx === 1
                          ? "rank-silver"
                          : idx === 2
                            ? "rank-bronze"
                            : "border-white/5 bg-black/30"
                    }`}
                  >
                    <span className="text-sm">
                      <span className="mr-2 font-bold text-zinc-500">
                        #{String(idx + 1).padStart(2, "0")}
                      </span>
                      {r.discord_username ?? r.discord_user_id}
                      {souEu && (
                        <span className="ml-2 text-xs font-semibold text-chiliz-gold">
                          (você)
                        </span>
                      )}
                    </span>
                    <span className="font-bold text-chiliz-gold">
                      {r.total_pontos} pts
                    </span>
                  </div>
                );
                })}
              </div>
            )}
          </section>
        </div>

        {!rodada && !estado.isLoading && !estado.error && (
          <section className="glass-panel mt-8 rounded-3xl p-8 text-center">
            <p className="text-4xl">⚽</p>
            <h2 className="mt-3 text-xl font-bold">Nenhuma rodada da Copa aberta</h2>
            <p className="mt-2 text-sm text-zinc-400">
              Aguarde o admin abrir uma rodada no Discord ou volte mais tarde.
            </p>
            <Link href="/" className="btn-secondary mt-6 inline-flex">
              Voltar ao início
            </Link>
          </section>
        )}
      </SiteMain>
    </>
  );
}

function StatusBadge({ status }: { status: string }) {
  const open = status === "aberta";
  return (
    <span
      className={`ml-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
        open
          ? "bg-emerald-500/15 text-emerald-300"
          : "bg-zinc-500/15 text-zinc-400"
      }`}
    >
      <span
        className={`size-1.5 rounded-full ${open ? "bg-emerald-400 animate-pulse" : "bg-zinc-500"}`}
      />
      {status}
    </span>
  );
}

function MiniStat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-center">
      <p className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</p>
      <p
        className={`text-sm font-bold ${highlight ? "text-chiliz-gold" : "text-zinc-200"}`}
      >
        {value}
      </p>
    </div>
  );
}

function TeamSide({
  escudo,
  nome,
  invert = false,
}: {
  escudo: string | null;
  nome: string;
  invert?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2 ${invert ? "flex-row-reverse text-right" : ""}`}
    >
      {escudo ? (
        <Image
          src={escudo}
          alt={nome}
          width={32}
          height={32}
          unoptimized
          className="drop-shadow-md"
        />
      ) : (
        <div className="size-8 rounded-lg bg-zinc-800" />
      )}
      <span className="truncate text-sm font-semibold text-zinc-200">{nome}</span>
    </div>
  );
}

function Aviso({
  children,
  tone,
}: {
  children: ReactNode;
  tone: "info" | "sucesso" | "erro";
}) {
  const cls =
    tone === "sucesso"
      ? "border-emerald-500/40 bg-emerald-950/30 text-emerald-200"
      : tone === "erro"
        ? "border-red-500/40 bg-red-950/30 text-red-200"
        : "border-white/10 bg-white/5 text-zinc-300";
  return (
    <div className={`mb-6 rounded-xl border px-4 py-3 text-sm backdrop-blur-sm ${cls}`}>
      {children}
    </div>
  );
}
