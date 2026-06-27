import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import type { BotCommand } from '../bot/types';
import { buildErrorEmbed, buildSuccessEmbed } from '../embeds/builders';
import {
  applyMaintenancePresence,
  isMaintenanceOwner,
  setMaintenanceActive,
} from '../services/maintenanceMode';

export const maintenanceCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('modo-manutencao')
    .setDescription('Ativa ou desativa o modo manutenção do bot (apenas owner)')
    .addBooleanOption((opt) =>
      opt
        .setName('ativo')
        .setDescription('true = pausar tudo · false = voltar ao normal')
        .setRequired(true),
    ),

  async execute(interaction) {
    if (!isMaintenanceOwner(interaction.user.id)) {
      await interaction.reply({
        embeds: [buildErrorEmbed('Apenas o dono do bot pode usar este comando.')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const ativo = interaction.options.getBoolean('ativo', true);
    setMaintenanceActive(ativo);
    applyMaintenancePresence(interaction.client);

    await interaction.reply({
      embeds: [
        ativo
          ? buildSuccessEmbed(
              '🔧 Manutenção ATIVADA',
              'Todos os comandos, botões, mensagens automáticas e API do bot estão **pausados**.\n\n' +
                'O bot continua online. Para voltar: `/modo-manutencao ativo:false`',
              '#FAA61A',
            )
          : buildSuccessEmbed(
              '✅ Manutenção DESATIVADA',
              'O Palpito voltou ao funcionamento normal.',
            ),
      ],
      flags: MessageFlags.Ephemeral,
    });
  },
};
