import type { Client, Interaction, Message } from 'discord.js';
import cron from 'node-cron';
import type { BotModule } from '../../core/types';
import { env } from '../../config';
import { log } from '../../utils/logger';
import { attachClientLogAction } from './client-log';
import { lojaCommand } from './loja-command';
import { setupLojaCommand } from './setup-loja';
import {
  adicionarMultiplosCommand,
  enviarPontosCommand,
  verSaldoCommand,
} from './extra-commands';
import { handleShopInteraction } from './shop';
import { getRanking, getSaldo, setSaldo, addSaldo } from './store';
import {
  EmbedBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type TextChannel,
} from 'discord.js';
import type { BotCommand } from '../../bot/types';

function isAdmin(interaction: ChatInputCommandInteraction): boolean {
  const member = interaction.member;
  if (!member || !('permissions' in member)) return false;
  const perms = member.permissions;
  if (typeof perms === 'string') return false;
  return perms.has(PermissionFlagsBits.Administrator);
}

const meusPontos: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('meus-pontos')
    .setDescription('Veja seu saldo de pontos da comunidade'),
  execute: async (interaction) => {
    const saldo = getSaldo(interaction.user.id);
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle('💰 Seus Pontos')
          .setDescription(`Você tem **${saldo}** ponto${saldo !== 1 ? 's' : ''}.`)
          .setColor(0xffd700),
      ],
      ephemeral: true,
    });
  },
};

const rankPontos: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('rank-pontos')
    .setDescription('Ranking de pontos da comunidade')
    .addIntegerOption((o) =>
      o.setName('limite').setDescription('Quantidade (máx. 25)').setMinValue(1).setMaxValue(25),
    ),
  execute: async (interaction) => {
    const limit = interaction.options.getInteger('limite') ?? 10;
    const rows = getRanking(limit);
    const embed = new EmbedBuilder().setTitle('🏆 Ranking de Pontos').setColor(0xffd700);
    embed.setDescription(
      rows.length
        ? rows
            .map((r, i) => {
              const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
              return `${medal} <@${r.user_id}> — **${r.saldo}** pts`;
            })
            .join('\n')
        : 'Nenhum ponto registrado.',
    );
    await interaction.reply({ embeds: [embed] });
  },
};

const adicionarPontos: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('adicionar-pontos')
    .setDescription('Adiciona pontos a um membro (Admin)')
    .addUserOption((o) => o.setName('membro').setDescription('Membro que vai receber os pontos').setRequired(true))
    .addIntegerOption((o) => o.setName('quantidade').setDescription('Quantidade de pontos a adicionar').setRequired(true).setMinValue(1))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  execute: async (interaction) => {
    if (!isAdmin(interaction)) {
      await interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      return;
    }
    const user = interaction.options.getUser('membro', true);
    const qty = interaction.options.getInteger('quantidade', true);
    const novo = addSaldo(user.id, qty, 'admin');
    await interaction.reply({ content: `✅ +${qty} pts → ${user.tag}. Saldo: **${novo}**`, ephemeral: true });
  },
};

const removerPontos: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('remover-pontos')
    .setDescription('Remove pontos de um membro (Admin)')
    .addUserOption((o) => o.setName('membro').setDescription('Membro que vai perder os pontos').setRequired(true))
    .addIntegerOption((o) => o.setName('quantidade').setDescription('Quantidade de pontos a remover').setRequired(true).setMinValue(1))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  execute: async (interaction) => {
    if (!isAdmin(interaction)) {
      await interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      return;
    }
    const user = interaction.options.getUser('membro', true);
    const qty = interaction.options.getInteger('quantidade', true);
    const atual = getSaldo(user.id);
    setSaldo(user.id, Math.max(0, atual - qty));
    await interaction.reply({ content: `✅ -${qty} pts de ${user.tag}. Saldo: **${getSaldo(user.id)}**`, ephemeral: true });
  },
};

async function sendWeeklyRanking(client: Client): Promise<void> {
  const channelId = env.coRankingChannelId;
  if (!channelId) return;
  try {
    const ch = await client.channels.fetch(channelId);
    if (!ch?.isTextBased()) return;
    const rows = getRanking(10);
    const embed = new EmbedBuilder().setTitle('🏆 Ranking Semanal de Pontos').setColor(0xffd700).setTimestamp();
    embed.setDescription(
      rows.length
        ? rows.map((r, i) => `${i < 3 ? ['🥇', '🥈', '🥉'][i] : `${i + 1}.`} <@${r.user_id}> — **${r.saldo}** pts`).join('\n')
        : 'Sem pontos.',
    );
    await (ch as TextChannel).send({ embeds: [embed] });
    log.info('[points] Ranking semanal enviado');
  } catch (e) {
    log.error('[points] Falha no ranking semanal:', e);
  }
}

export const pointsModule: BotModule = {
  id: 'points',
  label: 'Pontos & Loja',
  commands: [
    meusPontos,
    rankPontos,
    adicionarPontos,
    removerPontos,
    lojaCommand,
    setupLojaCommand,
    verSaldoCommand,
    enviarPontosCommand,
    adicionarMultiplosCommand,
  ],
  onReady: (client) => {
    attachClientLogAction(client);
    cron.schedule('0 12 * * 0', () => void sendWeeklyRanking(client), { timezone: 'America/Sao_Paulo' });
    log.info('[points] Módulo pontos/loja ativo');
  },
  handleInteraction: async (interaction: Interaction) => {
    if ('customId' in interaction && String(interaction.customId).startsWith('shop:')) {
      return handleShopInteraction(interaction);
    }
    return false;
  },
  onMessage: async (_message: Message) => {},
};
