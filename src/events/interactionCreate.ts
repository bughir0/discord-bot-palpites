import {
  Events,
  type Interaction,
  MessageFlags,
  DiscordAPIError,
} from 'discord.js';
import type { Client } from 'discord.js';
import { modules } from '../core/registry';
import { buildErrorEmbed } from '../embeds/builders';
import { log } from '../utils/logger';

const DISCORD_UNKNOWN_INTERACTION = 10062;

export function registerInteractionEvent(client: Client): void {
  client.on(Events.InteractionCreate, async (interaction: Interaction) => {
    try {
      if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;
        await command.execute(interaction);
        return;
      }

      if (interaction.isAutocomplete()) {
        for (const mod of modules) {
          if (mod.handleInteraction && (await mod.handleInteraction(interaction))) return;
        }
        return;
      }

      for (const mod of modules) {
        if (mod.handleInteraction && (await mod.handleInteraction(interaction))) return;
      }
    } catch (error) {
      log.error('Erro na interação:', error);

      if (error instanceof DiscordAPIError && error.code === DISCORD_UNKNOWN_INTERACTION) return;
      if (!interaction.isRepliable()) return;

      const embed = buildErrorEmbed(
        error instanceof Error ? error.message : 'Ocorreu um erro inesperado.',
      );

      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });
        } else {
          await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }
      } catch (replyError) {
        if (
          replyError instanceof DiscordAPIError &&
          replyError.code === DISCORD_UNKNOWN_INTERACTION
        ) {
          return;
        }
        log.error('Falha ao responder interação:', replyError);
      }
    }
  });
}
