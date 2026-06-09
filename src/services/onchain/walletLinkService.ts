import { randomBytes } from 'node:crypto';
import { verifyMessage } from 'ethers';
import { env } from '../../config';
import { getDb } from '../../db/database';
import type { VinculacaoWalletPendente, WalletLink } from '../../types';

const TTL_MIN = 10;

class WalletLinkService {
  /** Cria uma vinculacao pendente e retorna o token + mensagem que sera assinada. */
  criarVinculacao(args: {
    discordUserId: string;
    discordUsername: string | null;
  }): VinculacaoWalletPendente {
    const token = randomBytes(16).toString('base64url');
    const now = new Date();
    const expira = new Date(now.getTime() + TTL_MIN * 60_000);
    const mensagem =
      `Vinculando minha wallet ao Palpiter CHZ.\n` +
      `Discord: ${args.discordUserId}\n` +
      `Token: ${token}\n` +
      `Criado: ${now.toISOString()}`;

    getDb()
      .prepare(
        `INSERT INTO vinculacoes_wallet_pendentes
         (token, discord_user_id, discord_username, mensagem, criado_em, expira_em)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        token,
        args.discordUserId,
        args.discordUsername,
        mensagem,
        now.toISOString(),
        expira.toISOString(),
      );

    return {
      token,
      discord_user_id: args.discordUserId,
      discord_username: args.discordUsername,
      mensagem,
      criado_em: now.toISOString(),
      expira_em: expira.toISOString(),
    };
  }

  getVinculacao(token: string): VinculacaoWalletPendente | null {
    const row = getDb()
      .prepare('SELECT * FROM vinculacoes_wallet_pendentes WHERE token = ?')
      .get(token) as VinculacaoWalletPendente | undefined;
    if (!row) return null;
    if (new Date(row.expira_em).getTime() < Date.now()) return null;
    return row;
  }

  /**
   * Confirma a assinatura. Recupera o endereco do signer, compara com `wallet`
   * informado, e grava o link Discord <-> Wallet.
   */
  confirmar(token: string, wallet: string, assinatura: string): WalletLink {
    const pend = this.getVinculacao(token);
    if (!pend) throw new Error('Token de vinculacao invalido ou expirado.');

    const recuperado = verifyMessage(pend.mensagem, assinatura);
    if (recuperado.toLowerCase() !== wallet.toLowerCase()) {
      throw new Error('Assinatura nao corresponde ao endereco informado.');
    }

    const now = new Date().toISOString();
    getDb()
      .prepare(
        `INSERT INTO wallet_links (discord_user_id, wallet_address, signed_message, assinatura, vinculado_em)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(discord_user_id) DO UPDATE SET
           wallet_address = excluded.wallet_address,
           signed_message = excluded.signed_message,
           assinatura = excluded.assinatura,
           vinculado_em = excluded.vinculado_em`,
      )
      .run(pend.discord_user_id, wallet.toLowerCase(), pend.mensagem, assinatura, now);

    getDb()
      .prepare('DELETE FROM vinculacoes_wallet_pendentes WHERE token = ?')
      .run(token);

    return {
      discord_user_id: pend.discord_user_id,
      wallet_address: wallet.toLowerCase(),
      signed_message: pend.mensagem,
      assinatura,
      vinculado_em: now,
    };
  }

  getByDiscord(discordUserId: string): WalletLink | null {
    const row = getDb()
      .prepare('SELECT * FROM wallet_links WHERE discord_user_id = ?')
      .get(discordUserId) as WalletLink | undefined;
    return row ?? null;
  }

  getByWallet(walletAddress: string): WalletLink | null {
    const row = getDb()
      .prepare('SELECT * FROM wallet_links WHERE wallet_address = ?')
      .get(walletAddress.toLowerCase()) as WalletLink | undefined;
    return row ?? null;
  }

  linkVincular(token: string): string {
    const base = env.dappBaseUrl.replace(/\/+$/, '');
    return `${base}/vincular-wallet/${token}`;
  }
}

export const walletLinkService = new WalletLinkService();
