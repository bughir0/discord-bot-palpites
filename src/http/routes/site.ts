import { ethers } from 'ethers';
import type { FastifyInstance } from 'fastify';
import { env } from '../../config';
import { getDb } from '../../db/database';
import { rodadaService } from '../../services/rodadaService';
import { walletLinkService } from '../../services/onchain/walletLinkService';
import type { Rodada } from '../../types';

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

export function registerSiteRoutes(app: FastifyInstance): void {
  app.get('/api/site/estado', async (request, reply) => {
    const query = request.query as { guildId?: string } | undefined;
    const guildId = resolverGuildId(query?.guildId);
    if (!guildId) {
      return reply.code(400).send({
        error: 'guild_id_obrigatorio',
        detalhe: 'Informe guildId na query ou configure DISCORD_GUILD_ID no backend.',
      });
    }

    const rodada =
      rodadaService.getRodadaCopaAberta(guildId) ?? getUltimaRodadaCopa(guildId);
    if (!rodada) {
      return { guildId, rodada: null };
    }

    const partidas = rodadaService.getPartidasRodada(rodada.id);
    const ranking = rodadaService.getRankingRodada(rodada.id);

    return {
      guildId,
      rodada: {
        id: rodada.id,
        numeroRodada: rodada.numero_rodada,
        status: rodada.status,
        modalidade: rodada.modalidade,
        entradaCHZWei: rodada.entrada_chz_wei,
      },
      partidas: partidas.map((p) => ({
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
      })),
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

    return {
      rodadaId,
      discordUserId: link.discord_user_id,
      wallet: link.wallet_address,
      palpites,
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
