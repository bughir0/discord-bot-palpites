import {

  EmbedBuilder,

  PermissionFlagsBits,

  SlashCommandBuilder,

  type ChatInputCommandInteraction,

  type GuildMember,

} from 'discord.js';

import type { BotCommand } from '../../bot/types';

import { getSaldo, setSaldo, transferSaldo, addSaldo } from './store';

import { parseBulkPointsInput } from './parse-bulk-points';



function isAdmin(i: ChatInputCommandInteraction): boolean {

  const m = i.member;

  if (!m || !('permissions' in m)) return false;

  const p = m.permissions;

  if (typeof p === 'string') return false;

  return p.has(PermissionFlagsBits.Administrator);

}



export const verSaldoCommand: BotCommand = {

  data: new SlashCommandBuilder()

    .setName('ver-saldo')

    .setDescription('Consulta saldo de um membro (Admin)')

    .addUserOption((o) => o.setName('membro').setDescription('Membro para consultar o saldo').setRequired(true))

    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  execute: async (interaction) => {

    const user = interaction.options.getUser('membro', true);

    const saldo = getSaldo(user.id);

    await interaction.reply({

      embeds: [new EmbedBuilder().setTitle('💰 Saldo').setDescription(`${user} tem **${saldo}** pts.`).setColor(0xffd700)],

      ephemeral: true,

    });

  },

};



export const enviarPontosCommand: BotCommand = {

  data: new SlashCommandBuilder()

    .setName('enviar-pontos')

    .setDescription('Transfere pontos para outro membro')

    .addUserOption((o) => o.setName('usuario').setDescription('Membro que vai receber os pontos').setRequired(true))

    .addIntegerOption((o) => o.setName('quantidade').setDescription('Quantidade de pontos a enviar').setRequired(true).setMinValue(1)),

  execute: async (interaction) => {

    const dest = interaction.options.getUser('usuario', true);

    const qty = interaction.options.getInteger('quantidade', true);

    if (dest.id === interaction.user.id) {

      await interaction.reply({ content: '❌ Não pode enviar para si mesmo.', ephemeral: true });

      return;

    }

    try {

      transferSaldo(interaction.user.id, dest.id, qty);

      await interaction.reply({

        embeds: [

          new EmbedBuilder()

            .setTitle('✅ Transferência')

            .setDescription(`Você enviou **${qty}** pts para ${dest}.`)

            .addFields(

              { name: 'Seu saldo', value: `${getSaldo(interaction.user.id)} pts`, inline: true },

              { name: 'Saldo deles', value: `${getSaldo(dest.id)} pts`, inline: true },

            ),

        ],

      });

      if (interaction.client.logAction) {

        await interaction.client.logAction('Transferência', `${interaction.user.id} → ${dest.id}: ${qty} pts`, interaction);

      }

    } catch (e) {

      const err = e as Error & { saldoAtual?: number };

      await interaction.reply({ content: `❌ Saldo insuficiente (você tem ${err.saldoAtual ?? 0} pts).`, ephemeral: true });

    }

  },

};



export const adicionarMultiplosCommand: BotCommand = {

  data: new SlashCommandBuilder()

    .setName('adicionar-pontos-multiplos')

    .setDescription('Adiciona pontos a vários membros de uma vez (Admin)')

    .addStringOption((o) =>

      o

        .setName('membros')

        .setDescription(

          'Menções, IDs ou linhas id:pts. Separe por vírgula ou quebra de linha. Ex: @Ana @Bob ou 123:10, 456:5',

        )

        .setRequired(true),

    )

    .addIntegerOption((o) =>

      o

        .setName('quantidade_padrao')

        .setDescription('Pontos para cada membro quando não informar valor individual (padrão: 1)')

        .setMinValue(1),

    )

    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  execute: async (interaction) => {

    if (!isAdmin(interaction)) {

      await interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });

      return;

    }

    if (!interaction.guild) {

      await interaction.reply({ content: '❌ Use em um servidor.', ephemeral: true });

      return;

    }



    await interaction.deferReply({ ephemeral: true });



    const raw = interaction.options.getString('membros', true);

    const defaultQty = interaction.options.getInteger('quantidade_padrao') ?? 1;

    const { entries, errors: parseErrors } = parseBulkPointsInput(raw, defaultQty);



    if (entries.length === 0) {

      const msg = parseErrors.length > 0 ? parseErrors.join('\n') : 'Nenhum usuário válido.';

      await interaction.editReply({ content: `❌ ${msg}` });

      return;

    }



    const ok: { tag: string; before: number; after: number; added: number }[] = [];

    const fail: string[] = [...parseErrors];



    for (const entry of entries) {

      try {

        const member: GuildMember = await interaction.guild.members.fetch(entry.userId);

        const before = getSaldo(entry.userId);

        const after = addSaldo(entry.userId, entry.amount, 'admin_multiplo', interaction.user.id);

        ok.push({

          tag: member.user.tag,

          before,

          after,

          added: entry.amount,

        });

      } catch {

        fail.push(`ID ${entry.userId} — membro não encontrado no servidor`);

      }

    }



    const totalAdded = ok.reduce((s, r) => s + r.added, 0);

    const embed = new EmbedBuilder()

      .setTitle('✅ Pontos adicionados em lote')

      .setColor(0x57f287)

      .setDescription(

        `**${ok.length}** sucesso(s) · **${fail.length}** falha(s) · **+${totalAdded}** pts no total`,

      );



    if (ok.length > 0) {

      const lines = ok.slice(0, 15).map(

        (r) => `• **${r.tag}** — +${r.added} (${r.before} → **${r.after}**)`,

      );

      if (ok.length > 15) lines.push(`… e mais ${ok.length - 15} usuário(s)`);

      embed.addFields({ name: 'Creditados', value: lines.join('\n') });

    }



    if (fail.length > 0) {

      const lines = fail.slice(0, 10);

      if (fail.length > 10) lines.push(`… e mais ${fail.length - 10} erro(s)`);

      embed.addFields({ name: 'Falhas', value: lines.join('\n') });

    }



    await interaction.editReply({ embeds: [embed] });



    if (interaction.client.logAction && ok.length > 0) {

      await interaction.client.logAction(

        'Adição múltipla de pontos',

        `${interaction.user.tag}: +${totalAdded} pts para ${ok.length} membro(s)`,

        interaction,

      );

    }

  },

};


