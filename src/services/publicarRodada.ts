import type { Client } from 'discord.js';
import {
  buildMensagemAberturaRodada,
  buildRodadaComponents,
  buildRodadaEmbeds,
  packEmbedsForDiscordMessages,
} from '../embeds/builders';
import { configService } from './configService';
import type { GuildConfig, PartidaRodada, Rodada } from '../types';
import { rodadaService } from './rodadaService';

export async function publicarEmbedRodada(
  client: Client,
  rodada: Rodada,
  partidas: PartidaRodada[],
  config: GuildConfig,
  canalId: string,
): Promise<void> {
  const channel = await client.channels.fetch(canalId);
  if (!channel?.isSendable()) {
    throw new Error(
      rodada.modalidade === 'copa'
        ? 'Canal de palpites da Copa inválido. Configure com `/config canal-copa-palpites`.'
        : 'Canal de palpites do Brasileirão inválido. Configure com `/config canal-palpites`.',
    );
  }

  const cargoId = configService.getCargoPalpitesId(config);
  const content = buildMensagemAberturaRodada(rodada, partidas.length, config, cargoId);

  const embedBatches = packEmbedsForDiscordMessages(
    buildRodadaEmbeds(rodada, partidas, config),
  );
  const components = buildRodadaComponents(rodada.id, {
    mostrarBolaoChz: rodada.modalidade === 'copa',
  });
  const mentions = cargoId ? { roles: [cargoId] } : { parse: [] as [] };

  const msg = await channel.send({
    content,
    embeds: embedBatches[0],
    components,
    allowedMentions: mentions,
  });

  for (let i = 1; i < embedBatches.length; i++) {
    await channel.send({ embeds: embedBatches[i] });
  }

  rodadaService.setPublicacaoRodada(rodada.id, canalId, msg.id);
}

/** Garante botões corretos (Palpitar grátis + Bolão CHZ) na mensagem publicada da rodada. */
export async function sincronizarBotoesRodada(
  client: Client,
  rodada: Rodada,
): Promise<void> {
  if (!rodada.message_id || !rodada.channel_id) return;

  try {
    const channel = await client.channels.fetch(rodada.channel_id);
    if (!channel?.isTextBased()) return;
    const msg = await channel.messages.fetch(rodada.message_id);
    await msg.edit({
      components: buildRodadaComponents(rodada.id, {
        mostrarBolaoChz: rodada.modalidade === 'copa',
      }),
    });
  } catch {
    // Mensagem apagada ou canal inacessível — ignora.
  }
}
