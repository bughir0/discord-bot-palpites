import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type TextChannel,
} from 'discord.js';
import type { BotCommand } from '../../bot/types';
import { setShopSettings } from './store';

export const setupLojaCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('setup-loja')
    .setDescription('Publica mensagem da loja com botão Abrir Loja')
    .addStringOption((o) => o.setName('titulo').setDescription('Título do embed'))
    .addStringOption((o) => o.setName('descricao').setDescription('Descrição'))
    .addStringOption((o) => o.setName('imagem').setDescription('URL da imagem'))
    .addStringOption((o) => o.setName('cor').setDescription('Cor HEX (#FF9900)'))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  execute: async (interaction) => {
    if (!interaction.inGuild() || !interaction.channel?.isTextBased()) {
      await interaction.reply({ content: '❌ Use em canal de texto.', ephemeral: true });
      return;
    }
    const title = interaction.options.getString('titulo') ?? '🛒 Loja Palpito';
    const description = interaction.options.getString('descricao') ?? 'Clique para abrir a loja e gastar seus pontos.';
    const imageUrl = interaction.options.getString('imagem');
    const colorHex = interaction.options.getString('cor') ?? '#FF9900';
    const color = Number.parseInt(colorHex.replace('#', ''), 16) || 0xff9900;

    const embed = new EmbedBuilder().setTitle(title).setDescription(description).setColor(color).setTimestamp();
    if (imageUrl) embed.setImage(imageUrl);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('shop:open').setLabel('Abrir Loja').setStyle(ButtonStyle.Primary),
    );

    const msg = await (interaction.channel as TextChannel).send({ embeds: [embed], components: [row] });
    setShopSettings(interaction.guildId, interaction.channelId, msg.id, {
      title,
      description,
      imageUrl,
      color: colorHex,
    });

    await interaction.reply({ content: `✅ Loja publicada em ${interaction.channel}.`, ephemeral: true });
    if (interaction.client.logAction) {
      await interaction.client.logAction('Setup Loja', `Canal ${interaction.channelId}`, interaction);
    }
  },
};
