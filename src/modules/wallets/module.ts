import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type ModalSubmitInteraction,
  type TextChannel,
} from 'discord.js';
import type { BotModule } from '../../core/types';
import type { BotCommand } from '../../bot/types';
import { addRegisteredWallet, getUserWallets, listAllWallets } from './store';

const setupWallets: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('setup-wallets')
    .setDescription('Publica embed de registro de wallets no canal')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  execute: async (interaction) => {
    const embed = new EmbedBuilder()
      .setTitle('🔗 Registro de Wallets')
      .setDescription('Clique no botão para registrar sua wallet Socios/Chiliz.')
      .setColor(0x00ff00);
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('co:wallet:register')
        .setLabel('Registrar Wallet')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🏆'),
    );
    await interaction.reply({ content: '✅ Setup publicado!', ephemeral: true });
    if (interaction.channel && 'send' in interaction.channel) {
      await (interaction.channel as TextChannel).send({ embeds: [embed], components: [row] });
    }
  },
};

const minhasWallets: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('minhas-wallets')
    .setDescription('Lista suas wallets registradas'),
  execute: async (interaction) => {
    const wallets = getUserWallets(interaction.user.id);
    const embed = new EmbedBuilder()
      .setTitle('🔗 Suas Wallets')
      .setColor(0x5865f2);
    if (wallets.length === 0) {
      embed.setDescription('Nenhuma wallet registrada.');
    } else {
      embed.setDescription(wallets.map((w, i) => `${i + 1}. \`${w}\``).join('\n'));
    }
    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};

const adminWallets: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('admin-wallets')
    .setDescription('Lista todas as wallets (Admin)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  execute: async (interaction) => {
    const all = listAllWallets();
    const embed = new EmbedBuilder()
      .setTitle('📋 Wallets registradas')
      .setColor(0x5865f2);
    if (all.length === 0) {
      embed.setDescription('Nenhum registro.');
    } else {
      const chunk = all
        .slice(0, 20)
        .map((u) => `**${u.username ?? u.user_id}**: ${u.wallets.length} wallet(s)`)
        .join('\n');
      embed.setDescription(chunk);
    }
    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};

async function handleWalletButton(interaction: ButtonInteraction): Promise<boolean> {
  if (interaction.customId !== 'co:wallet:register') return false;
  const modal = new ModalBuilder()
    .setCustomId('co:wallet:modal')
    .setTitle('Registrar Wallet');
  const input = new TextInputBuilder()
    .setCustomId('wallet_address')
    .setLabel('Endereço da wallet (0x...)')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(64);
  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
  await interaction.showModal(modal);
  return true;
}

async function handleWalletModal(interaction: ModalSubmitInteraction): Promise<boolean> {
  if (interaction.customId !== 'co:wallet:modal') return false;
  const address = interaction.fields.getTextInputValue('wallet_address');
  const result = addRegisteredWallet(interaction.user.id, interaction.user.username, address);
  await interaction.reply({
    content: result.ok ? `✅ ${result.message}` : `❌ ${result.message}`,
    ephemeral: true,
  });
  return true;
}

export const walletsModule: BotModule = {
  id: 'wallets',
  label: 'Registro de Wallets',
  commands: [setupWallets, minhasWallets, adminWallets],
  handleInteraction: async (interaction) => {
    if (interaction.isButton()) return handleWalletButton(interaction);
    if (interaction.isModalSubmit()) return handleWalletModal(interaction);
    return false;
  },
};
