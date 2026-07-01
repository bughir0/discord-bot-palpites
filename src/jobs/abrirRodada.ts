import cron from 'node-cron';
import type { Client } from 'discord.js';
import { env } from '../config';
import { ApiFutebolError, isApiQuotaExhausted } from '../services/apiFutebol';
import { configService } from '../services/configService';
import { isMaintenanceActive } from '../services/maintenanceMode';
import { publicarEmbedRodada } from '../services/publicarRodada';
import { rodadaService } from '../services/rodadaService';
import { log } from '../utils/logger';

async function tentarAbrirRodadas(client: Client): Promise<void> {
  if (isMaintenanceActive()) return;

  if (isApiQuotaExhausted()) {
    log.once(
      'api-quota-abrir',
      60 * 60_000,
      'warn',
      'Cota diária da API esgotada — abertura automática pausada.',
    );
    return;
  }

  const guilds = configService.listAutoAbrirGuilds();
  if (guilds.length === 0) return;

  let acaoRealizada = false;
  const resumos: string[] = [];

  for (const config of guilds) {
    try {
      const resultado = await tentarAbrirRodadaGuild(client, config.guild_id);
      if (resultado) {
        acaoRealizada = true;
        resumos.push(resultado);
      }
    } catch (error) {
      if (error instanceof ApiFutebolError && error.status === 429) return;
      log.error(`Erro ao abrir rodada (${config.guild_id}):`, error);
      acaoRealizada = true;
    }
  }

  log.jobResult('Abrir rodada', acaoRealizada, resumos.join(' · ') || 'nenhuma alteração');
}

async function tentarAbrirRodadaGuild(client: Client, guildId: string): Promise<string | null> {
  const config = configService.getOrCreate(guildId);
  if (!config.auto_abrir_rodada || !config.canal_palpites_id) return null;

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
      log.success(
        `Servidor ${guildId}: rodada ${resultado.numero} aberta em <#${canalId}> (${partidas.length} jogos).`,
      );
      return `guild ${guildId}: rodada ${resultado.numero} aberta`;
    }
    case 'ja_em_andamento':
    case 'aguardar':
    case 'erro':
      return null;
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
