import { DEFAULT_GUILD_CONFIG, env } from '../config';
import { getDb } from '../db/database';
import type { GuildConfig, Modalidade } from '../types';

export function getCanalPalpites(
  config: GuildConfig,
  modalidade: Modalidade = 'free',
): string | null {
  return modalidade === 'copa'
    ? config.canal_copa_palpites_id
    : config.canal_palpites_id;
}

export function getCanalResultados(
  config: GuildConfig,
  modalidade: Modalidade = 'free',
): string | null {
  return modalidade === 'copa'
    ? config.canal_copa_resultados_id
    : config.canal_resultados_id;
}

export class ConfigService {
  getOrCreate(guildId: string): GuildConfig {
    const db = getDb();
    let config = db
      .prepare('SELECT * FROM guild_config WHERE guild_id = ?')
      .get(guildId) as GuildConfig | undefined;

    if (!config) {
      db.prepare(`
        INSERT INTO guild_config (
          guild_id, canal_palpites_id, canal_resultados_id,
          canal_copa_palpites_id, canal_copa_resultados_id,
          campeonato_id, pontos_exato, pontos_vencedor,
          cor_embed, notificar_resultados, auto_verificar,
          auto_abrir_rodada, cargo_palpites_id
        ) VALUES (?, NULL, NULL, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        guildId,
        DEFAULT_GUILD_CONFIG.campeonato_id,
        DEFAULT_GUILD_CONFIG.pontos_exato,
        DEFAULT_GUILD_CONFIG.pontos_vencedor,
        DEFAULT_GUILD_CONFIG.cor_embed,
        DEFAULT_GUILD_CONFIG.notificar_resultados,
        DEFAULT_GUILD_CONFIG.auto_verificar,
        DEFAULT_GUILD_CONFIG.auto_abrir_rodada,
        DEFAULT_GUILD_CONFIG.cargo_palpites_id,
      );

      config = db
        .prepare('SELECT * FROM guild_config WHERE guild_id = ?')
        .get(guildId) as GuildConfig;
    }

    return config;
  }

  update(guildId: string, fields: Partial<Omit<GuildConfig, 'guild_id'>>): GuildConfig {
    this.getOrCreate(guildId);
    const db = getDb();
    const entries = Object.entries(fields).filter(([, v]) => v !== undefined);

    if (entries.length === 0) return this.getOrCreate(guildId);

    const setClause = entries.map(([key]) => `${key} = ?`).join(', ');
    const values = entries.map(([, value]) => value);

    db.prepare(`UPDATE guild_config SET ${setClause} WHERE guild_id = ?`).run(...values, guildId);

    return this.getOrCreate(guildId);
  }

  listAutoAbrirGuilds(): GuildConfig[] {
    return getDb()
      .prepare(
        `SELECT * FROM guild_config WHERE auto_abrir_rodada = 1 AND canal_palpites_id IS NOT NULL`,
      )
      .all() as GuildConfig[];
  }

  /** Cargo a marcar ao abrir rodada — primeiro o da guild, depois o padrão do .env. */
  getCargoPalpitesId(config: GuildConfig): string | null {
    return config.cargo_palpites_id ?? env.palpiteCargoId ?? null;
  }
}

export const configService = new ConfigService();
