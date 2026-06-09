import type { FastifyInstance } from 'fastify';
import { walletLinkService } from '../../services/onchain/walletLinkService';

export function registerWalletRoutes(app: FastifyInstance): void {
  app.get('/api/wallet/vincular/:token', async (request, reply) => {
    const { token } = request.params as { token: string };
    const pend = walletLinkService.getVinculacao(token);
    if (!pend) return reply.code(404).send({ error: 'token_invalido_ou_expirado' });
    return {
      token: pend.token,
      discordUserId: pend.discord_user_id,
      discordUsername: pend.discord_username ?? '',
      mensagem: pend.mensagem,
      expiraEm: pend.expira_em,
    };
  });

  app.post('/api/wallet/vincular/:token/confirmar', async (request, reply) => {
    const { token } = request.params as { token: string };
    const body = request.body as { wallet?: string; assinatura?: string } | null;
    if (!body?.wallet || !body?.assinatura) {
      return reply.code(400).send({ error: 'wallet_e_assinatura_obrigatorias' });
    }
    try {
      walletLinkService.confirmar(token, body.wallet, body.assinatura);
      return { ok: true };
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  });

  app.get('/api/wallet/:discordUserId', async (request, reply) => {
    const { discordUserId } = request.params as { discordUserId: string };
    const link = walletLinkService.getByDiscord(discordUserId);
    if (!link) return reply.code(404).send({ error: 'nao_vinculada' });
    return {
      discordUserId: link.discord_user_id,
      wallet: link.wallet_address,
      vinculadoEm: link.vinculado_em,
    };
  });
}
