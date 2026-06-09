import cron from 'node-cron';
import type { Client } from 'discord.js';
import { env } from '../config';
import { ApiFutebolError, getApiUsageToday, isApiQuotaExhausted } from '../services/apiFutebol';
import { configService } from '../services/configService';
import { publicarEmbedRodada } from '../services/publicarRodada';
import { rodadaService } from '../services/rodadaService';
import { log } from '../utils/logger';

async function tentarAbrirRodadas(client: Client): Promise<void> {
  const uso = getApiUsageToday();
  log.job('📅', 'Cron abrir rodada', `API ${uso.count}/${uso.limit}`);

  if (isApiQuotaExhausted()) {
    log.detail('Cota diária esgotada — pulando abertura automática.');
    return;
  }

  const guilds = configService.listAutoAbrirGuilds();
  if (guilds.length === 0) {
    log.detail('Nenhum servidor com auto-abrir ativo e canal de palpites configurado.');
    return;
  }

  for (const config of guilds) {
    try {
      await tentarAbrirRodadaGuild(client, config.guild_id);
    } catch (error) {
      if (error instanceof ApiFutebolError && error.status === 429) return;
      log.error(`Erro ao abrir rodada (${config.guild_id}):`, error);
    }
  }
}

async function tentarAbrirRodadaGuild(client: Client, guildId: string): Promise<void> {
  const config = configService.getOrCreate(guildId);
  if (!config.auto_abrir_rodada || !config.canal_palpites_id) return;

  const resultado = await rodadaService.detectarProximaRodadaAbertaApi(
    guildId,
    config.campeonato_id,
  );

  switch (resultado.tipo) {
    case 'abrir': {
      const canalId = config.canal_palpites_id;
      const { rodada, partidas } = await rodadaService.abrirRodada(
        guildId,
        canalId,
        resultado.numero,
        config.campeonato_id,
        resultado.rodadaApi,
      );
      await publicarEmbedRodada(client, rodada, partidas, config, canalId);
      log.detail(
        `Servidor ${guildId}: ✅ rodada ${resultado.numero} aberta em <#${canalId}> (${partidas.length} jogos).`,
      );
      return;
    }
    case 'ja_em_andamento':
      log.detail(
        `Servidor ${guildId}: rodada ${resultado.numero} já está ${resultado.status} — aguardando jogos terminarem.`,
      );
      return;
    case 'aguardar': {
      const ref = resultado.ultimaFinalizada
        ? ` (última finalizada: ${resultado.ultimaFinalizada})`
        : '';
      log.detail(
        `Servidor ${guildId}: rodada ${resultado.tentou} ainda não tem jogos agendados na API${ref}.`,
      );
      return;
    }
    case 'erro':
      log.detail(`Servidor ${guildId}: ${resultado.motivo}`);
      return;
  }
}

export function startAbrirRodadaJob(client: Client): void {
  client.once('clientReady', () => {
    void tentarAbrirRodadas(client);
  });

  cron.schedule(env.abrirRodadaCron, () => {
    void tentarAbrirRodadas(client);
  });

  log.info(`Job abrir rodada agendado (cron: ${env.abrirRodadaCron})`);
}
