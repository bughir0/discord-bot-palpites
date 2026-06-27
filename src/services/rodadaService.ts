import { getDb } from '../db/database';
import { configService } from './configService';
import {
  ApiFutebolError,
  buscarRodada,
  buscarRodadaAtual,
  isApiQuotaExhausted,
} from './apiFutebol';
import {
  avaliarPalpite,
  partidaAbertaParaPalpite,
  partidaComResultadoDisponivel,
  partidaJaIniciou,
  partidaProntaParaVerificar,
} from './pontuacao';
import { rewardPalpitePoints } from '../modules/points/rewards';
import type {
  Palpite,
  PartidaRodada,
  RankingEntry,
  ResultadoPalpite,
  Rodada,
  RodadaApi,
} from '../types';

export type DetectarRodadaResult =
  | { tipo: 'abrir'; numero: number; rodadaApi: RodadaApi }
  | { tipo: 'ja_em_andamento'; numero: number; status: 'aberta' | 'fechada' }
  | { tipo: 'aguardar'; tentou: number; ultimaFinalizada: number | null }
  | { tipo: 'erro'; motivo: string };

export class RodadaService {
  /** Rodada aberta do Brasileirão/free (ignora Copa — pode coexistir). */
  getRodadaAberta(guildId: string, campeonatoId?: number): Rodada | null {
    if (campeonatoId != null) {
      return this.getRodadaAbertaPorCampeonato(guildId, campeonatoId);
    }
    const row = getDb()
      .prepare(
        `SELECT * FROM rodadas
         WHERE guild_id = ? AND status = 'aberta' AND modalidade != 'copa'
         ORDER BY id DESC LIMIT 1`,
      )
      .get(guildId) as Rodada | undefined;
    return row ?? null;
  }

  getRodadaAbertaPorCampeonato(guildId: string, campeonatoId: number): Rodada | null {
    const row = getDb()
      .prepare(
        `SELECT * FROM rodadas
         WHERE guild_id = ? AND campeonato_id = ? AND status = 'aberta'
         ORDER BY id DESC LIMIT 1`,
      )
      .get(guildId, campeonatoId) as Rodada | undefined;
    return row ?? null;
  }

  getRodadaCopaAberta(guildId: string): Rodada | null {
    const row = getDb()
      .prepare(
        `SELECT * FROM rodadas
         WHERE guild_id = ? AND modalidade = 'copa' AND status = 'aberta'
         ORDER BY id DESC LIMIT 1`,
      )
      .get(guildId) as Rodada | undefined;
    return row ?? null;
  }

  getRodadaById(id: number): Rodada | null {
    const row = getDb().prepare('SELECT * FROM rodadas WHERE id = ?').get(id) as Rodada | undefined;
    return row ?? null;
  }

  getRodadaByNumero(
    guildId: string,
    numeroRodada: number,
    campeonatoId?: number,
  ): Rodada | null {
    const row =
      campeonatoId != null
        ? (getDb()
            .prepare(
              `SELECT * FROM rodadas
               WHERE guild_id = ? AND campeonato_id = ? AND numero_rodada = ?`,
            )
            .get(guildId, campeonatoId, numeroRodada) as Rodada | undefined)
        : (getDb()
            .prepare(
              `SELECT * FROM rodadas WHERE guild_id = ? AND numero_rodada = ?
               ORDER BY id DESC LIMIT 1`,
            )
            .get(guildId, numeroRodada) as Rodada | undefined);
    return row ?? null;
  }

  getPartidasRodada(rodadaId: number): PartidaRodada[] {
    return getDb()
      .prepare('SELECT * FROM partidas_rodada WHERE rodada_id = ? ORDER BY data_realizacao_iso ASC')
      .all(rodadaId) as PartidaRodada[];
  }

  getPartida(rodadaId: number, partidaId: number): PartidaRodada | null {
    const row = getDb()
      .prepare('SELECT * FROM partidas_rodada WHERE rodada_id = ? AND partida_id = ?')
      .get(rodadaId, partidaId) as PartidaRodada | undefined;
    return row ?? null;
  }

  /** Última rodada registrada no DB (qualquer status) para o servidor. */
  getUltimaRodadaDb(guildId: string, campeonatoId: number): Rodada | null {
    const row = getDb()
      .prepare(
        `SELECT * FROM rodadas WHERE guild_id = ? AND campeonato_id = ?
         ORDER BY numero_rodada DESC LIMIT 1`,
      )
      .get(guildId, campeonatoId) as Rodada | undefined;
    return row ?? null;
  }

  /**
   * Detecta qual rodada abrir consultando a API:
   *   1. Última rodada do servidor `finalizada` → tenta `N+1` na API.
   *   2. Última rodada `aberta`/`fechada` → não abre (aguarda fim dos jogos).
   *   3. Nenhuma rodada no servidor → usa `rodada_atual` da API.
   *   4. Confirma na API que a candidata tem jogos `agendados`.
   *
   * Funciona para qualquer rodada futura (17 → 18 → 19 → ...).
   * Consome 1–2 requisições da API por chamada.
   */
  async detectarProximaRodadaAbertaApi(
    guildId: string,
    campeonatoId: number,
  ): Promise<DetectarRodadaResult> {
    if (isApiQuotaExhausted()) {
      return { tipo: 'erro', motivo: 'Cota diária da API esgotada.' };
    }

    const ultima = this.getUltimaRodadaDb(guildId, campeonatoId);
    let candidato: number;

    if (ultima) {
      if (ultima.status !== 'finalizada') {
        return {
          tipo: 'ja_em_andamento',
          numero: ultima.numero_rodada,
          status: ultima.status,
        };
      }
      candidato = ultima.numero_rodada + 1;
    } else {
      try {
        const atual = await buscarRodadaAtual(campeonatoId);
        if (!atual) {
          return { tipo: 'erro', motivo: 'API não retornou a rodada atual do campeonato.' };
        }
        candidato = atual;
      } catch (err) {
        if (err instanceof ApiFutebolError && err.status === 429) {
          return { tipo: 'erro', motivo: 'API retornou 429 (limite). Aguarde.' };
        }
        const msg = err instanceof Error ? err.message : 'Falha ao consultar API.';
        return { tipo: 'erro', motivo: msg };
      }
    }

    try {
      const rodadaApi = await buscarRodada(campeonatoId, candidato);
      const agendados = rodadaApi.partidas.filter((p) =>
        partidaAbertaParaPalpite(p.status, p.data_realizacao_iso),
      );

      if (agendados.length === 0) {
        return {
          tipo: 'aguardar',
          tentou: candidato,
          ultimaFinalizada: ultima?.numero_rodada ?? null,
        };
      }

      return { tipo: 'abrir', numero: candidato, rodadaApi };
    } catch (err) {
      if (err instanceof ApiFutebolError && err.status === 404) {
        return {
          tipo: 'aguardar',
          tentou: candidato,
          ultimaFinalizada: ultima?.numero_rodada ?? null,
        };
      }
      if (err instanceof ApiFutebolError && err.status === 429) {
        return { tipo: 'erro', motivo: 'API retornou 429 (limite). Aguarde.' };
      }
      const msg = err instanceof Error ? err.message : 'Falha ao consultar API.';
      return { tipo: 'erro', motivo: msg };
    }
  }

  async abrirRodada(
    guildId: string,
    channelId: string,
    numeroRodada: number,
    campeonatoId: number,
    rodadaApiCache?: RodadaApi,
  ): Promise<{ rodada: Rodada; partidas: PartidaRodada[] }> {
    const db = getDb();
    const existente = db
      .prepare(
        `SELECT * FROM rodadas WHERE guild_id = ? AND campeonato_id = ? AND numero_rodada = ?`,
      )
      .get(guildId, campeonatoId, numeroRodada) as Rodada | undefined;

    if (existente) {
      throw new Error(`A rodada ${numeroRodada} já foi aberta neste servidor.`);
    }

    const aberta = this.getRodadaAbertaPorCampeonato(guildId, campeonatoId);
    if (aberta) {
      throw new Error(
        `Já existe a rodada ${aberta.numero_rodada} aberta neste campeonato. Feche-a antes de abrir outra.`,
      );
    }

    const rodadaApi = rodadaApiCache ?? (await buscarRodada(campeonatoId, numeroRodada));
    const partidasAgendadas = rodadaApi.partidas.filter((p) =>
      partidaAbertaParaPalpite(p.status, p.data_realizacao_iso),
    );

    if (partidasAgendadas.length === 0) {
      throw new Error(`Nenhum jogo agendado encontrado na rodada ${numeroRodada}.`);
    }

    const insertRodada = db.prepare(`
      INSERT INTO rodadas (guild_id, campeonato_id, numero_rodada, channel_id, status, aberta_em)
      VALUES (?, ?, ?, ?, 'aberta', ?)
    `);

    const insertPartida = db.prepare(`
      INSERT INTO partidas_rodada (
        rodada_id, partida_id, time_mandante, time_visitante,
        sigla_mandante, sigla_visitante, escudo_mandante, escudo_visitante,
        estadio, data_realizacao, hora_realizacao,
        data_realizacao_iso, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const now = new Date().toISOString();

    const tx = db.transaction(() => {
      const result = insertRodada.run(guildId, campeonatoId, numeroRodada, channelId, now);
      const rodadaId = Number(result.lastInsertRowid);

      for (const partida of partidasAgendadas) {
        insertPartida.run(
          rodadaId,
          partida.partida_id,
          partida.time_mandante.nome_popular,
          partida.time_visitante.nome_popular,
          partida.time_mandante.sigla,
          partida.time_visitante.sigla,
          partida.time_mandante.escudo,
          partida.time_visitante.escudo,
          partida.estadio?.nome_popular ?? null,
          partida.data_realizacao,
          partida.hora_realizacao,
          partida.data_realizacao_iso,
          partida.status,
        );
      }

      return rodadaId;
    });

    const rodadaId = tx();
    const rodada = this.getRodadaById(rodadaId)!;
    const partidas = this.getPartidasRodada(rodadaId);
    return { rodada, partidas };
  }

  fecharRodada(guildId: string): Rodada {
    const rodada = this.getRodadaAberta(guildId);
    if (!rodada) throw new Error('Nenhuma rodada aberta no momento.');

    getDb()
      .prepare(`UPDATE rodadas SET status = 'fechada', fechada_em = ? WHERE id = ?`)
      .run(new Date().toISOString(), rodada.id);

    return this.getRodadaById(rodada.id)!;
  }

  setPublicacaoRodada(rodadaId: number, channelId: string, messageId: string): void {
    getDb()
      .prepare('UPDATE rodadas SET channel_id = ?, message_id = ? WHERE id = ?')
      .run(channelId, messageId, rodadaId);
  }

  getDadosRodadaAberta(guildId: string): { rodada: Rodada; partidas: PartidaRodada[] } {
    const rodada = this.getRodadaAberta(guildId);
    if (!rodada) {
      throw new Error('Nenhuma rodada aberta. Use `/abrir-rodada` para abrir uma nova.');
    }

    const partidas = this.getPartidasRodada(rodada.id);
    if (partidas.length === 0) {
      throw new Error('A rodada aberta não tem jogos cadastrados.');
    }

    return { rodada, partidas };
  }

  getDadosRodadaCopaAberta(guildId: string): { rodada: Rodada; partidas: PartidaRodada[] } {
    const rodada = this.getRodadaCopaAberta(guildId);
    if (!rodada) {
      throw new Error('Nenhuma rodada Copa aberta. Use `/abrir-rodada-copa` para abrir uma nova.');
    }

    const partidas = this.getPartidasRodada(rodada.id);
    if (partidas.length === 0) {
      throw new Error('A rodada Copa aberta não tem jogos cadastrados.');
    }

    return { rodada, partidas };
  }

  salvarPalpite(
    rodadaId: number,
    partidaId: number,
    userId: string,
    username: string,
    mandante: number,
    visitante: number,
    onchain?: { walletAddress: string; txHash: string },
  ): Palpite {
    const partida = this.getPartida(rodadaId, partidaId);
    if (!partida) throw new Error('Partida não encontrada nesta rodada.');
    if (
      !partidaAbertaParaPalpite(
        partida.status,
        partida.data_realizacao_iso,
        partida.processada,
      )
    ) {
      throw new Error('Palpites encerrados para este jogo.');
    }

    const db = getDb();
    const now = new Date().toISOString();
    const existente = db
      .prepare(
        `SELECT * FROM palpites WHERE rodada_id = ? AND partida_id = ? AND discord_user_id = ?`,
      )
      .get(rodadaId, partidaId, userId) as Palpite | undefined;

    if (existente) {
      if (onchain) {
        db.prepare(`
          UPDATE palpites SET
            palpite_mandante = ?, palpite_visitante = ?,
            discord_username = ?, atualizado_em = ?,
            wallet_address = ?, tx_hash = ?, onchain_confirmed = 1
          WHERE id = ?
        `).run(
          mandante,
          visitante,
          username,
          now,
          onchain.walletAddress.toLowerCase(),
          onchain.txHash,
          existente.id,
        );
      } else {
        db.prepare(`
          UPDATE palpites SET
            palpite_mandante = ?, palpite_visitante = ?,
            discord_username = ?, atualizado_em = ?
          WHERE id = ?
        `).run(mandante, visitante, username, now, existente.id);
      }

      return db.prepare('SELECT * FROM palpites WHERE id = ?').get(existente.id) as Palpite;
    }

    const result = onchain
      ? db.prepare(`
          INSERT INTO palpites (
            rodada_id, partida_id, discord_user_id, discord_username,
            palpite_mandante, palpite_visitante, criado_em,
            wallet_address, tx_hash, onchain_confirmed
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        `).run(
          rodadaId,
          partidaId,
          userId,
          username,
          mandante,
          visitante,
          now,
          onchain.walletAddress.toLowerCase(),
          onchain.txHash,
        )
      : db.prepare(`
          INSERT INTO palpites (
            rodada_id, partida_id, discord_user_id, discord_username,
            palpite_mandante, palpite_visitante, criado_em
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(rodadaId, partidaId, userId, username, mandante, visitante, now);

    return db
      .prepare('SELECT * FROM palpites WHERE id = ?')
      .get(result.lastInsertRowid) as Palpite;
  }

  getPalpitesUsuario(rodadaId: number, userId: string): Palpite[] {
    return getDb()
      .prepare(
        `SELECT * FROM palpites WHERE rodada_id = ? AND discord_user_id = ? ORDER BY partida_id`,
      )
      .all(rodadaId, userId) as Palpite[];
  }

  getPalpitesPartida(rodadaId: number, partidaId: number): Palpite[] {
    return getDb()
      .prepare(`SELECT * FROM palpites WHERE rodada_id = ? AND partida_id = ?`)
      .all(rodadaId, partidaId) as Palpite[];
  }

  getRankingRodada(rodadaId: number): RankingEntry[] {
    const rodada = this.getRodadaById(rodadaId);
    if (!rodada) return [];

    const config = configService.getOrCreate(rodada.guild_id);
    const palpites = getDb()
      .prepare(`SELECT * FROM palpites WHERE rodada_id = ?`)
      .all(rodadaId) as Palpite[];

    const map = new Map<string, RankingEntry>();

    for (const palpite of palpites) {
      const entry = map.get(palpite.discord_user_id) ?? {
        discord_user_id: palpite.discord_user_id,
        discord_username: palpite.discord_username,
        total_pontos: 0,
        acertos_exatos: 0,
        acertos_vencedor: 0,
        total_palpites: 0,
      };

      entry.discord_username = palpite.discord_username ?? entry.discord_username;
      entry.total_pontos += palpite.pontos;
      entry.total_palpites += 1;
      if (palpite.pontos === config.pontos_exato) entry.acertos_exatos += 1;
      else if (palpite.pontos === config.pontos_vencedor) entry.acertos_vencedor += 1;

      map.set(palpite.discord_user_id, entry);
    }

    return [...map.values()].sort(
      (a, b) => b.total_pontos - a.total_pontos || b.acertos_exatos - a.acertos_exatos,
    );
  }

  getRankingGeral(guildId: string): RankingEntry[] {
    return getDb()
      .prepare(`
        SELECT
          p.discord_user_id,
          MAX(p.discord_username) as discord_username,
          SUM(p.pontos) as total_pontos,
          SUM(CASE WHEN p.pontos = gc.pontos_exato THEN 1 ELSE 0 END) as acertos_exatos,
          SUM(CASE WHEN p.pontos = gc.pontos_vencedor THEN 1 ELSE 0 END) as acertos_vencedor,
          COUNT(*) as total_palpites
        FROM palpites p
        JOIN rodadas r ON r.id = p.rodada_id
        JOIN guild_config gc ON gc.guild_id = r.guild_id
        WHERE r.guild_id = ?
        GROUP BY p.discord_user_id
        ORDER BY total_pontos DESC, acertos_exatos DESC
      `)
      .all(guildId) as RankingEntry[];
  }

  getRodadasAtivas(): Rodada[] {
    return getDb()
      .prepare(`SELECT * FROM rodadas WHERE status IN ('aberta', 'fechada')`)
      .all() as Rodada[];
  }

  /** Rodada aberta/fechada que ainda tem jogos sem processar */
  getRodadaComPendencias(guildId: string): Rodada | null {
    const row = getDb()
      .prepare(`
        SELECT r.* FROM rodadas r
        WHERE r.guild_id = ?
          AND r.status IN ('aberta', 'fechada')
          AND EXISTS (
            SELECT 1 FROM partidas_rodada p
            WHERE p.rodada_id = r.id AND p.processada = 0
          )
        ORDER BY r.id DESC
        LIMIT 1
      `)
      .get(guildId) as Rodada | undefined;
    return row ?? null;
  }

  async verificarResultadosRodada(
    rodadaId: number,
    options?: { verificarTodosPendentes?: boolean },
  ): Promise<{
    resultados: ResultadoPalpite[];
    partidasFinalizadas: number;
  }> {
    const rodada = this.getRodadaById(rodadaId);
    if (!rodada) return { resultados: [], partidasFinalizadas: 0 };
    if (isApiQuotaExhausted()) return { resultados: [], partidasFinalizadas: 0 };

    const config = configService.getOrCreate(rodada.guild_id);
    const partidas = this.getPartidasRodada(rodadaId).filter((p) => {
      if (p.processada) return false;
      if (options?.verificarTodosPendentes) return partidaJaIniciou(p.data_realizacao_iso);
      return partidaProntaParaVerificar(p.data_realizacao_iso);
    });

    if (partidas.length === 0) {
      return { resultados: [], partidasFinalizadas: 0 };
    }

    const rodadaApi = await buscarRodada(rodada.campeonato_id, rodada.numero_rodada);
    const apiPorId = new Map(rodadaApi.partidas.map((p) => [p.partida_id, p]));

    const db = getDb();
    const resultados: ResultadoPalpite[] = [];
    let partidasFinalizadas = 0;

    for (const partida of partidas) {
      const apiPartida = apiPorId.get(partida.partida_id);
      if (!apiPartida) continue;

      db.prepare(`
        UPDATE partidas_rodada SET
          status = ?, placar_mandante = ?, placar_visitante = ?,
          estadio = COALESCE(?, estadio)
        WHERE id = ?
      `).run(
        partidaComResultadoDisponivel(
          apiPartida.status,
          apiPartida.data_realizacao_iso,
          apiPartida.placar_mandante,
          apiPartida.placar_visitante,
        )
          ? 'finalizado'
          : apiPartida.status,
        apiPartida.placar_mandante,
        apiPartida.placar_visitante,
        apiPartida.estadio?.nome_popular ?? null,
        partida.id,
      );

      if (
        !partidaComResultadoDisponivel(
          apiPartida.status,
          apiPartida.data_realizacao_iso,
          apiPartida.placar_mandante,
          apiPartida.placar_visitante,
        )
      ) {
        continue;
      }

      partidasFinalizadas++;
      const partidaAtualizada = this.getPartida(rodadaId, partida.partida_id)!;
      const palpites = this.getPalpitesPartida(rodadaId, partida.partida_id);

      for (const palpite of palpites) {
        const resultado = avaliarPalpite(palpite, partidaAtualizada, config);
        db.prepare('UPDATE palpites SET pontos = ? WHERE id = ?').run(
          resultado.pontos,
          palpite.id,
        );
        if (resultado.pontos > 0) {
          const tipo = resultado.tipo === 'exato' ? 'exato' : 'vencedor';
          rewardPalpitePoints(palpite.discord_user_id, tipo, rodadaId, partida.partida_id);
        }
        resultados.push({ ...resultado, palpite: { ...palpite, pontos: resultado.pontos } });
      }

      db.prepare('UPDATE partidas_rodada SET processada = 1 WHERE id = ?').run(partida.id);
    }

    const pendentes = getDb()
      .prepare(
        `SELECT COUNT(*) as total FROM partidas_rodada WHERE rodada_id = ? AND processada = 0`,
      )
      .get(rodadaId) as { total: number };

    if (pendentes.total === 0) {
      db.prepare(`UPDATE rodadas SET status = 'finalizada' WHERE id = ?`).run(rodadaId);
    }

    return { resultados, partidasFinalizadas };
  }

  contarProgressoRodada(rodadaId: number): { processados: number; total: number } {
    const row = getDb()
      .prepare(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN processada = 1 THEN 1 ELSE 0 END) as processados
        FROM partidas_rodada WHERE rodada_id = ?
      `)
      .get(rodadaId) as { total: number; processados: number | null };

    return { processados: row.processados ?? 0, total: row.total };
  }

  getResultadosPartida(rodadaId: number, partidaId: number): ResultadoPalpite[] {
    const rodada = this.getRodadaById(rodadaId);
    if (!rodada) return [];

    const partida = this.getPartida(rodadaId, partidaId);
    if (!partida) return [];

    const config = configService.getOrCreate(rodada.guild_id);
    const palpites = this.getPalpitesPartida(rodadaId, partidaId);

    return palpites.map((palpite) => avaliarPalpite(palpite, partida, config));
  }

  marcarResultadosPublicados(rodadaId: number): void {
    getDb().prepare(`UPDATE rodadas SET resultados_publicados = 1 WHERE id = ?`).run(rodadaId);
  }
}

export const rodadaService = new RodadaService();
