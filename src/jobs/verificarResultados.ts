import cron from 'node-cron';
import type { Client } from 'discord.js';
import { env } from '../config';
import { ApiFutebolError, getApiUsageToday, isApiQuotaExhausted } from '../services/apiFutebol';
import { configService } from '../services/configService';
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
    log.detail(
      `Rodada ${rodada.numero_rodada}: ${partidasPublicadas} resultado(s) publicado(s) em <#${canalId}>.`,
    );
    return true;
  } catch (error) {
    log.error(`Erro ao publicar rodada ${rodada.id}:`, error);
    return false;
  }
}

async function verificarResultados(client: Client): Promise<void> {
  const uso = getApiUsageToday();
  log.job('⏰', 'Verificação resultados', `API ${uso.count}/${uso.limit}`);

  if (isApiQuotaExhausted()) {
    log.detail('Cota diária esgotada — pulando verificação.');
    return;
  }

  const rodadas = rodadaService.getRodadasAtivas();
  if (rodadas.length === 0) {
    log.detail('Nenhuma rodada aberta/fechada no banco.');
    return;
  }

  for (const rodada of rodadas) {
    const config = configService.getOrCreate(rodada.guild_id);
    if (!config.auto_verificar) {
      log.detail(`Rodada ${rodada.numero_rodada}: auto-verificar desligado.`);
      continue;
    }

    // Catch-up: rodada já finalizada mas resultados nunca publicados (bot offline antes).
    const snapshot = rodadaService.getRodadaById(rodada.id);
    if (snapshot && (await publicarSeFinalizada(client, snapshot, config))) {
      continue;
    }

    const pendentes = rodadaService.getPartidasRodada(rodada.id).filter((p) => !p.processada);
    const elegiveis = pendentes.filter((p) => partidaProntaParaVerificar(p.data_realizacao_iso));
    if (elegiveis.length === 0) {
      log.detail(
        `Rodada ${rodada.numero_rodada}: ${pendentes.length} jogo(s) pendente(s), nenhum passou de ~105 min do horário — sem request.`,
      );
      continue;
    }

    try {
      log.detail(
        `Rodada ${rodada.numero_rodada}: consultando API (${elegiveis.length} jogo(s) elegível(is))…`,
      );
      const { partidasFinalizadas } = await rodadaService.verificarResultadosRodada(rodada.id);
      const rodadaAtualizada = rodadaService.getRodadaById(rodada.id);
      const progresso = rodadaService.contarProgressoRodada(rodada.id);

      if (partidasFinalizadas === 0) {
        log.detail(`Rodada ${rodada.numero_rodada}: nenhum jogo com resultado disponível ainda.`);
        continue;
      }

      if (!rodadaAtualizada) continue;

      if (rodadaAtualizada.status !== 'finalizada') {
        log.detail(
          `Rodada ${rodada.numero_rodada}: ${partidasFinalizadas} jogo(s) processado(s) · ${progresso.processados}/${progresso.total} concluídos · publicação no fim da rodada.`,
        );
        continue;
      }

      await publicarSeFinalizada(client, rodadaAtualizada, config);
    } catch (error) {
      if (error instanceof ApiFutebolError && error.status === 429) return;
      log.error(`Erro ao verificar rodada ${rodada.id}:`, error);
    }
  }
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
