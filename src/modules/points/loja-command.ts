import {
  EmbedBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { BotCommand } from '../../bot/types';
import { showShopList } from './shop';
import {
  addShopItem,
  addShopStock,
  getPurchaseByCode,
  getShopItem,
  listPendingPurchases,
  listShopItems,
  markPurchaseDelivered,
  removeShopItem,
  setShopStock,
  updateShopItem,
} from './store';

const SHOP_COLOR = 0xff9900;

function isAdmin(i: ChatInputCommandInteraction): boolean {
  const m = i.member;
  if (!m || !('permissions' in m)) return false;
  const p = m.permissions;
  if (typeof p === 'string') return false;
  return p.has(PermissionFlagsBits.Administrator);
}

function adminErr() {
  return new EmbedBuilder().setTitle('❌ Permissão').setDescription('Apenas administradores.').setColor(0xff0000);
}

export const lojaCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('loja')
    .setDescription('Loja virtual com pontos da comunidade')
    .addSubcommand((s) => s.setName('abrir').setDescription('Abre o menu da loja'))
    .addSubcommand((s) =>
      s.setName('item-adicionar').setDescription('Adiciona item (Admin)')
        .addStringOption((o) => o.setName('nome').setDescription('Nome do item').setRequired(true))
        .addIntegerOption((o) => o.setName('preco').setDescription('Preço em pontos').setRequired(true).setMinValue(1))
        .addIntegerOption((o) => o.setName('estoque').setDescription('Estoque inicial (-1 = ilimitado)').setRequired(true).setMinValue(-1))
        .addStringOption((o) => o.setName('descricao').setDescription('Descrição do item'))
        .addStringOption((o) => o.setName('imagem').setDescription('URL da imagem do item'))
        .addStringOption((o) =>
          o.setName('entrega_tipo').setDescription('Como o item é entregue após a compra').addChoices(
            { name: 'Nenhuma', value: 'none' },
            { name: 'Cargo', value: 'role' },
            { name: 'DM', value: 'dm' },
            { name: 'Mensagem', value: 'message' },
            { name: 'Ticket', value: 'ticket' },
          ))
        .addRoleOption((o) => o.setName('cargo').setDescription('Cargo entregue (se entrega_tipo = Cargo)'))
        .addStringOption((o) => o.setName('entrega_texto').setDescription('Texto/conteúdo entregue (DM, mensagem ou ticket)')),
    )
    .addSubcommand((s) =>
      s.setName('item-editar').setDescription('Edita item (Admin)')
        .addIntegerOption((o) => o.setName('id').setDescription('ID do item').setRequired(true).setMinValue(1))
        .addStringOption((o) => o.setName('nome').setDescription('Novo nome'))
        .addIntegerOption((o) => o.setName('preco').setDescription('Novo preço em pontos').setMinValue(1))
        .addIntegerOption((o) => o.setName('estoque').setDescription('Novo estoque (-1 = ilimitado)').setMinValue(-1))
        .addStringOption((o) => o.setName('descricao').setDescription('Nova descrição'))
        .addStringOption((o) => o.setName('imagem').setDescription('Nova URL da imagem'))
        .addStringOption((o) =>
          o.setName('entrega_tipo').setDescription('Como o item é entregue após a compra').addChoices(
            { name: 'Nenhuma', value: 'none' },
            { name: 'Cargo', value: 'role' },
            { name: 'DM', value: 'dm' },
            { name: 'Mensagem', value: 'message' },
            { name: 'Ticket', value: 'ticket' },
          ))
        .addRoleOption((o) => o.setName('cargo').setDescription('Cargo entregue (se entrega_tipo = Cargo)'))
        .addStringOption((o) => o.setName('entrega_texto').setDescription('Texto/conteúdo entregue (DM, mensagem ou ticket)')),
    )
    .addSubcommand((s) =>
      s.setName('item-remover').setDescription('Remove item (Admin)')
        .addIntegerOption((o) => o.setName('id').setDescription('ID do item').setRequired(true).setMinValue(1)),
    )
    .addSubcommand((s) => s.setName('itens').setDescription('Lista itens (Admin)'))
    .addSubcommand((s) =>
      s.setName('estoque-definir').setDescription('Define estoque (Admin)')
        .addIntegerOption((o) => o.setName('id').setDescription('ID do item').setRequired(true).setMinValue(1))
        .addIntegerOption((o) => o.setName('quantidade').setDescription('Novo estoque (-1 = ilimitado)').setRequired(true).setMinValue(-1)),
    )
    .addSubcommand((s) =>
      s.setName('estoque-adicionar').setDescription('Adiciona estoque (Admin)')
        .addIntegerOption((o) => o.setName('id').setDescription('ID do item').setRequired(true).setMinValue(1))
        .addIntegerOption((o) => o.setName('quantidade').setDescription('Quantidade a adicionar').setRequired(true).setMinValue(1)),
    )
    .addSubcommand((s) =>
      s.setName('estoque-remover').setDescription('Remove estoque (Admin)')
        .addIntegerOption((o) => o.setName('id').setDescription('ID do item').setRequired(true).setMinValue(1))
        .addIntegerOption((o) => o.setName('quantidade').setDescription('Quantidade a remover').setRequired(true).setMinValue(1)),
    )
    .addSubcommand((s) => s.setName('compras-pendentes').setDescription('Compras pendentes (Admin)'))
    .addSubcommand((s) =>
      s.setName('compra-info').setDescription('Detalhes da compra (Admin)')
        .addStringOption((o) => o.setName('codigo').setDescription('Código da compra').setRequired(true)),
    )
    .addSubcommand((s) =>
      s.setName('compra-entregar').setDescription('Marca compra entregue (Admin)')
        .addStringOption((o) => o.setName('codigo').setDescription('Código da compra').setRequired(true))
        .addStringOption((o) => o.setName('nota').setDescription('Nota/observação da entrega')),
    ),
  execute: async (interaction) => {
    if (!interaction.inGuild()) {
      await interaction.reply({ content: '❌ Use em um servidor.', ephemeral: true });
      return;
    }
    const sub = interaction.options.getSubcommand();
    if (sub === 'abrir') {
      await showShopList(interaction, 0);
      return;
    }
    if (!isAdmin(interaction)) {
      await interaction.reply({ embeds: [adminErr()], ephemeral: true });
      return;
    }
    const gid = interaction.guildId;

    if (sub === 'item-adicionar') {
      const deliveryType = interaction.options.getString('entrega_tipo') ?? 'none';
      const role = interaction.options.getRole('cargo');
      const id = addShopItem(gid, {
        name: interaction.options.getString('nome', true),
        price: interaction.options.getInteger('preco', true),
        stock: interaction.options.getInteger('estoque', true),
        description: interaction.options.getString('descricao'),
        imageUrl: interaction.options.getString('imagem'),
        deliveryType,
        deliveryRoleId: role?.id ?? null,
        deliveryText: interaction.options.getString('entrega_texto'),
      });
      await interaction.reply({ content: `✅ Item **#${id}** criado.`, ephemeral: true });
      return;
    }
    if (sub === 'item-editar') {
      const id = interaction.options.getInteger('id', true);
      const res = updateShopItem(gid, id, {
        name: interaction.options.getString('nome') ?? undefined,
        price: interaction.options.getInteger('preco') ?? undefined,
        stock: interaction.options.getInteger('estoque') ?? undefined,
        description: interaction.options.getString('descricao') ?? undefined,
        imageUrl: interaction.options.getString('imagem') ?? undefined,
        deliveryType: interaction.options.getString('entrega_tipo') ?? undefined,
        deliveryRoleId: interaction.options.getRole('cargo')?.id,
        deliveryText: interaction.options.getString('entrega_texto') ?? undefined,
      });
      await interaction.reply({
        content: res.changes ? `✅ Item **#${id}** atualizado.` : '❌ Nada alterado.',
        ephemeral: true,
      });
      return;
    }
    if (sub === 'item-remover') {
      const id = interaction.options.getInteger('id', true);
      const res = removeShopItem(gid, id);
      await interaction.reply({ content: res.changes ? `🗑️ Item **#${id}** removido.` : '❌ Não encontrado.', ephemeral: true });
      return;
    }
    if (sub === 'itens') {
      const items = listShopItems(gid);
      const text = items.slice(0, 30).map((it) => `• **#${it.id}** ${it.name} — ${it.price} pts — estoque ${it.stock === -1 ? '∞' : it.stock}`).join('\n') || 'Vazio';
      await interaction.reply({ embeds: [new EmbedBuilder().setTitle('📦 Itens').setDescription(text).setColor(SHOP_COLOR)], ephemeral: true });
      return;
    }
    if (sub === 'estoque-definir') {
      const id = interaction.options.getInteger('id', true);
      const qty = interaction.options.getInteger('quantidade', true);
      const res = setShopStock(gid, id, qty);
      await interaction.reply({ content: res.changes ? `✅ Estoque **#${id}** = ${qty === -1 ? '∞' : qty}` : '❌ Não encontrado.', ephemeral: true });
      return;
    }
    if (sub === 'estoque-adicionar') {
      const id = interaction.options.getInteger('id', true);
      const qty = interaction.options.getInteger('quantidade', true);
      const res = addShopStock(gid, id, qty);
      await interaction.reply({ content: res.changes ? `✅ +${qty} estoque **#${id}**` : '❌ Falhou (ilimitado?).', ephemeral: true });
      return;
    }
    if (sub === 'estoque-remover') {
      const id = interaction.options.getInteger('id', true);
      const qty = interaction.options.getInteger('quantidade', true);
      const res = addShopStock(gid, id, -qty);
      await interaction.reply({ content: res.changes ? `✅ -${qty} estoque **#${id}**` : '❌ Falhou.', ephemeral: true });
      return;
    }
    if (sub === 'compras-pendentes') {
      const rows = listPendingPurchases(gid);
      const text = rows.length
        ? rows.map((r) => `• **${r.purchase_code}** — ${r.item_name} — <@${r.user_id}>`).join('\n')
        : 'Nenhuma pendência.';
      await interaction.reply({ embeds: [new EmbedBuilder().setTitle('🕒 Pendentes').setDescription(text).setColor(SHOP_COLOR)], ephemeral: true });
      return;
    }
    if (sub === 'compra-info') {
      const codigo = interaction.options.getString('codigo', true).trim();
      const p = getPurchaseByCode(gid, codigo);
      if (!p) {
        await interaction.reply({ content: '❌ Compra não encontrada.', ephemeral: true });
        return;
      }
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('🧾 Compra')
            .addFields(
              { name: 'Código', value: String(p.purchase_code) },
              { name: 'Status', value: String(p.status) },
              { name: 'Comprador', value: `<@${p.user_id}>` },
              { name: 'Total', value: `${p.total_price} pts` },
            ),
        ],
        ephemeral: true,
      });
      return;
    }
    if (sub === 'compra-entregar') {
      const codigo = interaction.options.getString('codigo', true).trim();
      const nota = interaction.options.getString('nota');
      const res = markPurchaseDelivered(gid, codigo, interaction.user.id, nota);
      await interaction.reply({ content: res.changes ? `✅ **${codigo}** entregue.` : '❌ Não encontrada ou já entregue.', ephemeral: true });
    }
  },
};
