import cron from 'node-cron';
import type { Client } from 'discord.js';
import { env } from '../config';
import { ApiFutebolError, isApiQuotaExhausted } from '../services/apiFutebol';
import { configService } from '../services/configService';
import { isMaintenanceActive } from '../services/maintenanceMode';
import { partidaProntaParaVerificar } from '../services/pontuacao';
import { publicarResultadosRodada } from '../services/publicarResultados';
import { rodadaService } from '../services/rodadaService';
import { log } from '../utils/logger';
import type { GuildConfig, Rodada } from '../types';

async function publicarSeFinalizada(
  client: Client,
  rodada: Rodada,
  config: GuildConfig,
): Promise<boolean> {
  if (
    rodada.status !== 'finalizada' ||
    rodada.resultados_publicados ||
    !config.notificar_resultados
  ) {
    return false;
  }

  try {
    const { canalId, partidasPublicadas } = await publicarResultadosRodada(client, rodada, config);
    log.info(
      `Rodada ${rodada.numero_rodada}: ${partidasPublicadas} resultado(s) publicado(s) em <#${canalId}>.`,
    );
    return true;
  } catch (error) {
    log.error(`Erro ao publicar rodada ${rodada.id}:`, error);
    return false;
  }
}

async function verificarResultados(client: Client): Promise<void> {
  if (isMaintenanceActive()) return;

  if (isApiQuotaExhausted()) {
    log.once(
      'api-quota-resultados',
      60 * 60_000,
      'warn',
      'Cota diária da API esgotada — verificação de resultados pausada.',
    );
    return;
  }

  const rodadas = rodadaService.getRodadasAtivas();
  if (rodadas.length === 0) return;

  let acaoRealizada = false;
  const resumos: string[] = [];

  for (const rodada of rodadas) {
    const config = configService.getOrCreate(rodada.guild_id);
    if (!config.auto_verificar) continue;

    const snapshot = rodadaService.getRodadaById(rodada.id);
    if (snapshot && (await publicarSeFinalizada(client, snapshot, config))) {
      acaoRealizada = true;
      resumos.push(`rodada ${rodada.numero_rodada} publicada`);
      continue;
    }

    const pendentes = rodadaService.getPartidasRodada(rodada.id).filter((p) => !p.processada);
    const elegiveis = pendentes.filter((p) => partidaProntaParaVerificar(p.data_realizacao_iso));
    if (elegiveis.length === 0) continue;

    try {
      const { partidasFinalizadas } = await rodadaService.verificarResultadosRodada(rodada.id);
      const rodadaAtualizada = rodadaService.getRodadaById(rodada.id);
      if (partidasFinalizadas === 0) continue;

      acaoRealizada = true;
      const progresso = rodadaService.contarProgressoRodada(rodada.id);

      if (!rodadaAtualizada) {
        resumos.push(`rodada ${rodada.numero_rodada}: ${partidasFinalizadas} jogo(s)`);
        continue;
      }

      if (rodadaAtualizada.status !== 'finalizada') {
        resumos.push(
          `rodada ${rodada.numero_rodada}: ${partidasFinalizadas} jogo(s) · ${progresso.processados}/${progresso.total}`,
        );
        continue;
      }

      if (await publicarSeFinalizada(client, rodadaAtualizada, config)) {
        resumos.push(`rodada ${rodada.numero_rodada} finalizada e publicada`);
      }
    } catch (error) {
      if (error instanceof ApiFutebolError && error.status === 429) return;
      log.error(`Erro ao verificar rodada ${rodada.id}:`, error);
      acaoRealizada = true;
    }
  }

  log.jobResult('Verificação resultados', acaoRealizada, resumos.join(' · ') || 'nenhuma alteração');
}

export function startResultadosJob(client: Client): void {
  client.once('clientReady', () => {
    void verificarResultados(client);
  });

  cron.schedule(env.verificarResultadosCron, () => {
    void verificarResultados(client);
  });

  log.info(`Job de resultados agendado (cron: ${env.verificarResultadosCron})`);
}
