import type { Client } from 'discord.js';
import { buildResultadoRodadaPublicacao } from '../embeds/builders';
import { getCanalResultados } from './configService';
import type { GuildConfig, Rodada } from '../types';
import { rodadaService } from './rodadaService';

/** Publica um único embed com todos os resultados da rodada (só quando a rodada está completa). */
export async function publicarResultadosRodada(
  client: Client,
  rodada: Rodada,
  config: GuildConfig,
): Promise<{ canalId: string; partidasPublicadas: number }> {
  const canalId = getCanalResultados(config, rodada.modalidade) ?? rodada.channel_id;
  const rodadaAtualizada = rodadaService.getRodadaById(rodada.id);

  if (!rodadaAtualizada || rodadaAtualizada.status !== 'finalizada') {
    throw new Error('A rodada ainda não terminou — aguarde todos os jogos serem concluídos.');
  }

  if (rodadaAtualizada.resultados_publicados) {
    return { canalId, partidasPublicadas: 0 };
  }

  const channel = await client.channels.fetch(canalId).catch(() => null);
  if (!channel?.isSendable()) {
    throw new Error(
      rodada.modalidade === 'copa'
        ? 'Canal de resultados da Copa inválido. Configure com `/config canal-copa-resultados`.'
        : 'Canal de resultados do Brasileirão inválido. Configure com `/config canal-resultados`.',
    );
  }

  const partidas = rodadaService.getPartidasRodada(rodada.id).filter((p) => p.processada);
  const ranking = rodadaService.getRankingRodada(rodada.id);
  const { embed, components } = buildResultadoRodadaPublicacao(
    rodadaAtualizada,
    partidas,
    ranking,
    config,
  );

  await channel.send({
    embeds: [embed],
    components,
  });

  rodadaService.marcarResultadosPublicados(rodada.id);

  return { canalId, partidasPublicadas: partidas.length };
}
