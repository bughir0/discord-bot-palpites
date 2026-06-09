import type { FastifyInstance } from 'fastify';
import { ethers } from 'ethers';
import { validarTxTransferenciaNaChain } from '../../blockchain/txValidation';
import { env } from '../../config';
import { getDb } from '../../db/database';
import { rodadaService } from '../../services/rodadaService';
import { sessionStore } from '../../services/onchain/sessionStore';
import { walletLinkService } from '../../services/onchain/walletLinkService';

function resolverReceiverAddress(): string | null {
  return env.chilizPaymentReceiverAddress;
}

function resolverEntradaWei(entradaDaRodada: string | null): string {
  if (entradaDaRodada) return entradaDaRodada;
  return ethers.parseEther(env.copaEntradaCHZDefault).toString();
}

export function registerSessionRoutes(app: FastifyInstance): void {
  app.get('/api/sessions/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const session = sessionStore.getOuExpirar(id);
    if (!session) return reply.code(404).send({ error: 'session_nao_encontrada' });

    const rodada = rodadaService.getRodadaById(session.rodada_id);
    if (!rodada) return reply.code(404).send({ error: 'rodada_nao_encontrada' });

    if (rodada.modalidade !== 'copa') {
      return reply
        .code(400)
        .send({ error: 'rodada_nao_e_onchain', detalhe: 'Esta rodada nao usa CHZ.' });
    }
    const receiverAddress = resolverReceiverAddress();
    if (!receiverAddress) {
      return reply.code(500).send({
        error: 'modo_pagamento_nao_configurado',
        detalhe: 'Defina CHILIZ_PAYMENT_RECEIVER_ADDRESS no .env.',
      });
    }

    const partidas = rodadaService.getPartidasRodada(session.rodada_id);
    const palpites = sessionStore.getPalpites(session);

    return {
      sessionId: session.session_id,
      discordUserId: session.discord_user_id,
      discordUsername: session.discord_username ?? '',
      rodadaId: session.rodada_id,
      numeroRodada: rodada.numero_rodada,
      paymentMode: 'transferencia',
      paymentReceiverAddress: receiverAddress,
      entradaCHZWei: resolverEntradaWei(rodada.entrada_chz_wei),
      partidas: partidas.map((p) => ({
        partidaId: p.partida_id,
        timeMandante: p.time_mandante,
        timeVisitante: p.time_visitante,
        siglaMandante: p.sigla_mandante,
        siglaVisitante: p.sigla_visitante,
        escudoMandante: p.escudo_mandante,
        escudoVisitante: p.escudo_visitante,
        dataIso: p.data_realizacao_iso,
        estadio: p.estadio,
      })),
      palpites,
      status: session.status,
      expiraEm: session.expira_em,
    };
  });

  app.post('/api/sessions/:id/confirmar', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { txHash?: string; wallet?: string } | null;
    if (!body?.txHash || !body?.wallet) {
      return reply.code(400).send({ error: 'tx_hash_e_wallet_obrigatorios' });
    }

    const session = sessionStore.getOuExpirar(id);
    if (!session) return reply.code(404).send({ error: 'session_nao_encontrada' });
    if (session.status !== 'pendente') {
      return reply.code(409).send({ error: 'session_ja_processada' });
    }

    const rodada = rodadaService.getRodadaById(session.rodada_id);
    if (!rodada || rodada.modalidade !== 'copa') {
      return reply
        .code(400)
        .send({ error: 'rodada_nao_e_onchain', detalhe: 'Sessao nao pertence a rodada CHZ ativa.' });
    }
    const receiverAddress = resolverReceiverAddress();
    if (!receiverAddress) {
      return reply.code(500).send({
        error: 'modo_pagamento_nao_configurado',
        detalhe: 'Defina CHILIZ_PAYMENT_RECEIVER_ADDRESS no .env.',
      });
    }

    const txHash = body.txHash.trim();
    const wallet = body.wallet.trim().toLowerCase();
    const entradaWei = resolverEntradaWei(rodada.entrada_chz_wei);

    const txJaUsada = getDb()
      .prepare(
        `SELECT session_id
           FROM aposta_sessions
          WHERE tx_hash = ? AND session_id <> ?
          LIMIT 1`,
      )
      .get(txHash, id) as { session_id: string } | undefined;
    if (txJaUsada) {
      return reply.code(409).send({ error: 'tx_hash_ja_utilizado_em_outra_sessao' });
    }

    const vinculo = walletLinkService.getByDiscord(session.discord_user_id);
    if (vinculo && vinculo.wallet_address !== wallet) {
      return reply.code(409).send({
        error: 'wallet_nao_corresponde_ao_usuario_vinculado',
        detalhe: 'A wallet da transacao difere da wallet vinculada ao seu Discord.',
      });
    }

    try {
      await validarTxTransferenciaNaChain({
        txHash,
        wallet,
        receiverAddress,
        valorEsperadoWei: entradaWei,
      });
    } catch (err) {
      return reply.code(422).send({
        error: 'transacao_onchain_invalida',
        detalhe: (err as Error).message,
      });
    }

    const palpites = sessionStore.getPalpites(session);
    for (const palpite of palpites) {
      rodadaService.salvarPalpite(
        session.rodada_id,
        palpite.partidaId,
        session.discord_user_id,
        session.discord_username ?? '',
        palpite.mandante,
        palpite.visitante,
        { walletAddress: wallet, txHash },
      );
    }

    sessionStore.marcarConfirmada(id, txHash, wallet);
    return { ok: true, totalPalpites: palpites.length };
  });
}
