import { ethers } from 'ethers';
import type { FastifyInstance } from 'fastify';
import { env } from '../../config';
import { getDb } from '../../db/database';
import { labelFaseCopa } from '../../embeds/theme';
import { partidaAbertaParaPalpite } from '../../services/pontuacao';
import { rodadaService } from '../../services/rodadaService';
import { walletLinkService } from '../../services/onchain/walletLinkService';
import type { PartidaRodada, Rodada } from '../../types';

function resolverGuildId(queryGuildId?: string): string | null {
  return queryGuildId?.trim() || env.discordGuildId || null;
}

function getUltimaRodadaCopa(guildId: string): Rodada | null {
  const row = getDb()
    .prepare(
      `SELECT * FROM rodadas
       WHERE guild_id = ? AND modalidade = 'copa'
       ORDER BY id DESC LIMIT 1`,
    )
    .get(guildId) as Rodada | undefined;
  return row ?? null;
}

function resolverNomeUsuario(discordUserId: string): string {
  const row = getDb()
    .prepare(
      `SELECT discord_username
         FROM palpites
        WHERE discord_user_id = ? AND discord_username IS NOT NULL
        ORDER BY id DESC LIMIT 1`,
    )
    .get(discordUserId) as { discord_username: string | null } | undefined;

  return row?.discord_username || `usuario-${discordUserId.slice(0, 6)}`;
}

function mapPartidasSite(partidas: PartidaRodada[]) {
  return partidas.map((p) => ({
    partidaId: p.partida_id,
    timeMandante: p.time_mandante,
    timeVisitante: p.time_visitante,
    siglaMandante: p.sigla_mandante,
    siglaVisitante: p.sigla_visitante,
    escudoMandante: p.escudo_mandante,
    escudoVisitante: p.escudo_visitante,
    dataIso: p.data_realizacao_iso,
    status: p.status,
    placarMandante: p.placar_mandante,
    placarVisitante: p.placar_visitante,
    processada: p.processada === 1,
    abertaParaPalpite: partidaAbertaParaPalpite(
      p.status,
      p.data_realizacao_iso,
      p.processada,
    ),
  }));
}

function mapRodadaSite(rodada: Rodada) {
  return {
    id: rodada.id,
    numeroRodada: rodada.numero_rodada,
    nomeFase: labelFaseCopa(rodada.numero_rodada),
    status: rodada.status,
    modalidade: rodada.modalidade,
    entradaCHZWei: rodada.entrada_chz_wei,
  };
}

export function registerSiteRoutes(app: FastifyInstance): void {
  app.get('/api/site/estado', async (request, reply) => {
    const query = request.query as { guildId?: string; fase?: string; numeroRodada?: string } | undefined;
    const guildId = resolverGuildId(query?.guildId);
    if (!guildId) {
      return reply.code(400).send({
        error: 'guild_id_obrigatorio',
        detalhe: 'Informe guildId na query ou configure DISCORD_GUILD_ID no backend.',
      });
    }

    const campeonatoId = env.copaCampeonatoId;
    const fasesCadastradas =
      campeonatoId != null ? rodadaService.listarRodadasCopa(guildId, campeonatoId) : [];

    const numeroFaseQuery = Number(query?.fase ?? query?.numeroRodada ?? 0);
    let rodada: Rodada | null = null;
    if (numeroFaseQuery > 0 && campeonatoId != null) {
      rodada = rodadaService.getRodadaCopaPorNumero(guildId, numeroFaseQuery, campeonatoId);
    }
    if (!rodada) {
      rodada =
        rodadaService.getRodadaCopaAberta(guildId) ?? getUltimaRodadaCopa(guildId);
    }

    if (!rodada) {
      return {
        guildId,
        rodada: null,
        fases: fasesCadastradas.map(mapRodadaSite),
      };
    }

    const partidas = rodadaService.getPartidasRodada(rodada.id);
    const ranking = rodadaService.getRankingRodada(rodada.id);

    return {
      guildId,
      rodada: mapRodadaSite(rodada),
      fases: fasesCadastradas.map(mapRodadaSite),
      partidas: mapPartidasSite(partidas),
      ranking: ranking.slice(0, 20),
    };
  });

  app.get('/api/site/palpites', async (request, reply) => {
    const query = request.query as { rodadaId?: string; wallet?: string } | undefined;
    const rodadaId = Number(query?.rodadaId ?? 0);
    const wallet = (query?.wallet ?? '').trim().toLowerCase();

    if (!Number.isInteger(rodadaId) || rodadaId <= 0 || !ethers.isAddress(wallet)) {
      return reply.code(400).send({ error: 'rodada_id_e_wallet_invalidos' });
    }

    const rodada = rodadaService.getRodadaById(rodadaId);
    if (!rodada) return reply.code(404).send({ error: 'rodada_nao_encontrada' });
    if (rodada.modalidade !== 'copa') {
      return reply.code(400).send({ error: 'rodada_nao_e_copa' });
    }

    const link = walletLinkService.getByWallet(wallet);
    if (!link) {
      return reply.code(404).send({
        error: 'wallet_nao_vinculada',
        detalhe: 'Vincule sua wallet no Discord com /wallet vincular antes de palpitar pelo site.',
      });
    }

    const palpites = rodadaService
      .getPalpitesUsuario(rodadaId, link.discord_user_id)
      .map((p) => ({
        partidaId: p.partida_id,
        mandante: p.palpite_mandante,
        visitante: p.palpite_visitante,
        pontos: p.pontos,
      }));

    const ranking = rodadaService.getRankingRodada(rodadaId);
    const posicaoRanking = ranking.findIndex((r) => r.discord_user_id === link.discord_user_id);
    const entradaRanking = posicaoRanking >= 0 ? ranking[posicaoRanking] : null;

    return {
      rodadaId,
      discordUserId: link.discord_user_id,
      discordUsername: entradaRanking?.discord_username ?? resolverNomeUsuario(link.discord_user_id),
      wallet: link.wallet_address,
      palpites,
      resumo: entradaRanking
        ? {
            posicao: posicaoRanking + 1,
            totalParticipantes: ranking.length,
            totalPontos: entradaRanking.total_pontos,
            acertosExatos: entradaRanking.acertos_exatos,
            acertosVencedor: entradaRanking.acertos_vencedor,
            totalPalpites: entradaRanking.total_palpites,
          }
        : {
            posicao: null,
            totalParticipantes: ranking.length,
            totalPontos: palpites.reduce((s, p) => s + p.pontos, 0),
            acertosExatos: 0,
            acertosVencedor: 0,
            totalPalpites: palpites.length,
          },
    };
  });

  app.post('/api/site/palpites', async (request, reply) => {
    const body = request.body as {
      rodadaId?: number;
      wallet?: string;
      palpites?: Array<{
        partidaId: number;
        mandante: number;
        visitante: number;
      }>;
    } | null;

    const rodadaId = Number(body?.rodadaId ?? 0);
    const wallet = (body?.wallet ?? '').trim().toLowerCase();
    const palpites = body?.palpites ?? [];

    if (!Number.isInteger(rodadaId) || rodadaId <= 0 || !ethers.isAddress(wallet)) {
      return reply.code(400).send({ error: 'rodada_id_e_wallet_invalidos' });
    }
    if (!Array.isArray(palpites) || palpites.length === 0) {
      return reply.code(400).send({ error: 'palpites_obrigatorios' });
    }

    const rodada = rodadaService.getRodadaById(rodadaId);
    if (!rodada) return reply.code(404).send({ error: 'rodada_nao_encontrada' });
    if (rodada.modalidade !== 'copa') {
      return reply.code(400).send({ error: 'rodada_nao_e_copa' });
    }
    if (rodada.status !== 'aberta') {
      return reply.code(409).send({ error: 'rodada_fechada' });
    }

    const link = walletLinkService.getByWallet(wallet);
    if (!link) {
      return reply.code(404).send({
        error: 'wallet_nao_vinculada',
        detalhe: 'Vincule sua wallet no Discord com /wallet vincular antes de palpitar pelo site.',
      });
    }

    const username = resolverNomeUsuario(link.discord_user_id);
    for (const palpite of palpites) {
      const partidaId = Number(palpite.partidaId);
      const mandante = Number(palpite.mandante);
      const visitante = Number(palpite.visitante);

      if (
        !Number.isInteger(partidaId) ||
        !Number.isInteger(mandante) ||
        !Number.isInteger(visitante) ||
        mandante < 0 ||
        visitante < 0 ||
        mandante > 20 ||
        visitante > 20
      ) {
        return reply.code(400).send({ error: 'palpite_invalido' });
      }

      const partida = rodadaService.getPartida(rodadaId, partidaId);
      if (!partida) {
        return reply.code(404).send({ error: 'partida_nao_encontrada' });
      }
      if (
        !partidaAbertaParaPalpite(
          partida.status,
          partida.data_realizacao_iso,
          partida.processada,
        )
      ) {
        return reply.code(409).send({
          error: 'palpite_encerrado',
          detalhe: `Palpites encerrados para ${partida.time_mandante} × ${partida.time_visitante}.`,
        });
      }

      rodadaService.salvarPalpite(
        rodadaId,
        partidaId,
        link.discord_user_id,
        username,
        mandante,
        visitante,
      );
    }

    return {
      ok: true,
      rodadaId,
      discordUserId: link.discord_user_id,
      totalPalpites: palpites.length,
    };
  });
}
