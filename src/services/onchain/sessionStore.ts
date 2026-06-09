import { randomBytes } from 'node:crypto';
import { env } from '../../config';
import { getDb } from '../../db/database';
import type { ApostaSession } from '../../types';

export type PalpiteSession = {
  partidaId: number;
  mandante: number;
  visitante: number;
};

function novoSessionId(): string {
  return randomBytes(16).toString('base64url');
}

class SessionStore {
  criar(args: {
    discordUserId: string;
    discordUsername: string | null;
    rodadaId: number;
    palpites: PalpiteSession[];
  }): ApostaSession {
    const db = getDb();
    const sessionId = novoSessionId();
    const now = new Date();
    const expira = new Date(now.getTime() + env.apostaSessionTtlMin * 60_000);
    const palpitesJson = JSON.stringify(args.palpites);

    db.prepare(
      `INSERT INTO aposta_sessions
        (session_id, discord_user_id, discord_username, rodada_id, palpites_json, status, criado_em, expira_em)
       VALUES (?, ?, ?, ?, ?, 'pendente', ?, ?)`,
    ).run(
      sessionId,
      args.discordUserId,
      args.discordUsername,
      args.rodadaId,
      palpitesJson,
      now.toISOString(),
      expira.toISOString(),
    );

    return this.getOuExpirar(sessionId)!;
  }

  getOuExpirar(sessionId: string): ApostaSession | null {
    const row = getDb()
      .prepare('SELECT * FROM aposta_sessions WHERE session_id = ?')
      .get(sessionId) as ApostaSession | undefined;
    if (!row) return null;
    if (row.status === 'pendente' && new Date(row.expira_em).getTime() < Date.now()) {
      getDb()
        .prepare(`UPDATE aposta_sessions SET status = 'expirada' WHERE session_id = ?`)
        .run(sessionId);
      return { ...row, status: 'expirada' };
    }
    return row;
  }

  marcarConfirmada(sessionId: string, txHash: string, wallet: string): void {
    getDb()
      .prepare(
        `UPDATE aposta_sessions
         SET status = 'confirmada', tx_hash = ?, wallet_address = ?, confirmado_em = ?
         WHERE session_id = ?`,
      )
      .run(txHash, wallet.toLowerCase(), new Date().toISOString(), sessionId);
  }

  getPalpites(session: ApostaSession): PalpiteSession[] {
    return JSON.parse(session.palpites_json) as PalpiteSession[];
  }

  linkBolao(sessionId: string): string {
    const base = env.dappBaseUrl.replace(/\/+$/, '');
    return `${base}/bolao/${sessionId}`;
  }
}

export const sessionStore = new SessionStore();
