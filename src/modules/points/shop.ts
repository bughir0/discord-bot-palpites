import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  type ButtonInteraction,
  type Interaction,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
} from 'discord.js';
import {
  getSaldo,
  getShopItem,
  listShopItems,
  markPurchaseDelivered,
  purchaseShopItem,
} from './store';

const ITEMS_PER_PAGE = 25;
const SHOP_COLOR = 0xff9900;

function makeEmbed(title: string, description: string, color = SHOP_COLOR) {
  return new EmbedBuilder().setTitle(title).setDescription(description).setColor(color).setTimestamp();
}

function formatStock(stock: number) {
  return stock === -1 ? '∞' : `${stock}`;
}

function clampPage(page: number, totalPages: number) {
  if (!Number.isFinite(page) || page < 0) return 0;
  if (totalPages <= 0) return 0;
  return Math.min(page, totalPages - 1);
}

function buildListPayload(guildName: string | undefined, items: ReturnType<typeof listShopItems>, page: number, totalPages: number, saldo: number) {
  const start = page * ITEMS_PER_PAGE;
  const pageItems = items.slice(start, start + ITEMS_PER_PAGE);
  const embed = new EmbedBuilder()
    .setTitle(`🛒 Loja${guildName ? ` — ${guildName}` : ''}`)
    .setDescription('Selecione um item no menu abaixo para ver detalhes e comprar.')
    .setColor(SHOP_COLOR)
    .addFields(
      { name: 'Seu saldo', value: `${saldo} pontos`, inline: true },
      { name: 'Itens', value: `${items.length}`, inline: true },
      { name: 'Página', value: `${page + 1}/${Math.max(1, totalPages)}`, inline: true },
    );
  const select = new StringSelectMenuBuilder()
    .setCustomId(`shop:select:${page}`)
    .setPlaceholder(pageItems.length ? 'Escolha um item...' : 'Sem itens')
    .setDisabled(pageItems.length === 0);
  for (const it of pageItems) {
    select.addOptions({
      label: (it.name || `Item #${it.id}`).slice(0, 100),
      description: `Preço: ${it.price} pts • Estoque: ${formatStock(it.stock)}`.slice(0, 100),
      value: String(it.id),
    });
  }
  const rowButtons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`shop:page:${Math.max(0, page - 1)}`).setLabel('◀').setStyle(ButtonStyle.Secondary).setDisabled(page <= 0),
    new ButtonBuilder().setCustomId(`shop:page:${page + 1}`).setLabel('▶').setStyle(ButtonStyle.Secondary).setDisabled(page + 1 >= totalPages),
    new ButtonBuilder().setCustomId('shop:refresh').setLabel('Atualizar').setStyle(ButtonStyle.Secondary),
  );
  return { embeds: [embed], components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select), rowButtons] };
}

async function sendShopPayload(
  interaction: Interaction,
  payload: { embeds: EmbedBuilder[]; components: unknown[] },
  opts: { ephemeral?: boolean; preferUpdate?: boolean } = {},
) {
  const { ephemeral = false, preferUpdate = false } = opts;
  if (interaction.isMessageComponent() && preferUpdate && !ephemeral && 'update' in interaction) {
    return interaction.update(payload as never);
  }
  if ('deferred' in interaction && (interaction.deferred || interaction.replied) && 'editReply' in interaction) {
    return interaction.editReply(payload as never);
  }
  if ('reply' in interaction) {
    return interaction.reply({ ...payload, ephemeral } as never);
  }
}

export async function showShopList(interaction: Interaction, page = 0): Promise<void> {
  if (!interaction.guildId) return;
  const items = listShopItems(interaction.guildId);
  const saldo = getSaldo(interaction.user.id);
  const totalPages = Math.max(1, Math.ceil(items.length / ITEMS_PER_PAGE));
  const p = clampPage(page, totalPages);
  if (items.length === 0) {
    await sendShopPayload(interaction, { embeds: [makeEmbed('🛒 Loja', '❌ A loja ainda não tem itens.', 0xff0000)], components: [] }, { ephemeral: true });
    return;
  }
  const payload = buildListPayload(interaction.guild?.name, items, p, totalPages, saldo);
  const isOpen = interaction.isButton() && interaction.customId === 'shop:open';
  await sendShopPayload(interaction, payload, {
    ephemeral: isOpen || interaction.isChatInputCommand(),
    preferUpdate: interaction.isMessageComponent() && !isOpen,
  });
}

async function showShopItem(interaction: Interaction, itemId: number, page = 0): Promise<void> {
  if (!interaction.guildId) return;
  const item = getShopItem(interaction.guildId, itemId);
  const saldo = getSaldo(interaction.user.id);
  if (!item) {
    await sendShopPayload(interaction, { embeds: [makeEmbed('❌ Item não encontrado', 'Removido ou inválido.', 0xff0000)], components: [] }, { ephemeral: true });
    return;
  }
  const canBuy = item.stock === -1 || item.stock > 0;
  const embed = new EmbedBuilder()
    .setTitle(`🛍️ ${item.name}`)
    .setColor(SHOP_COLOR)
    .setDescription(item.description || 'Sem descrição.')
    .addFields(
      { name: 'Preço', value: `${item.price} pontos`, inline: true },
      { name: 'Estoque', value: formatStock(item.stock), inline: true },
      { name: 'Seu saldo', value: `${saldo} pontos`, inline: true },
    )
    .setFooter({ text: `Item #${item.id}` });
  if (item.image_url) embed.setImage(item.image_url);
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`shop:buy:${item.id}:${page}`).setLabel('Comprar').setStyle(ButtonStyle.Success).setDisabled(!canBuy),
    new ButtonBuilder().setCustomId(`shop:page:${page}`).setLabel('Voltar').setStyle(ButtonStyle.Secondary),
  );
  await sendShopPayload(interaction, { embeds: [embed], components: [row] }, { preferUpdate: interaction.isMessageComponent() });
}

async function deliverPurchase(interaction: ButtonInteraction | ModalSubmitInteraction, item: ReturnType<typeof getShopItem>, quantity: number) {
  if (!item) return { delivered: false, embed: null as EmbedBuilder | null };
  const type = item.delivery_type || 'none';
  if (type === 'ticket') {
    return {
      delivered: false,
      embed: makeEmbed('🎟️ Entrega via Ticket', `✅ Pagamento confirmado.\n\n${item.delivery_text || 'Abra um ticket com o código da compra.'}`, 0xffaa00),
    };
  }
  if (type === 'role' && interaction.inGuild() && item.delivery_role_id) {
    const member = await interaction.guild!.members.fetch(interaction.user.id);
    await member.roles.add(item.delivery_role_id);
    return { delivered: true, embed: makeEmbed('🎁 Entrega', '✅ Cargo entregue!', 0x00ff00) };
  }
  if (type === 'dm') {
    const text = item.delivery_text || 'Compra concluída.';
    const dmEmbed = makeEmbed('🛍️ Compra concluída', `**${item.name}** x${quantity}\n\n${text}`, 0x00ff00);
    try {
      await interaction.user.send({ embeds: [dmEmbed] });
      return { delivered: true, embed: makeEmbed('🎁 Entrega', '✅ Enviado por DM.', 0x00ff00) };
    } catch {
      return { delivered: false, embed: makeEmbed('⚠️ DM bloqueada', 'Entrega exibida aqui.', 0xffaa00), fallbackEmbed: dmEmbed };
    }
  }
  if (type === 'message') {
    return { delivered: true, embed: makeEmbed('🎁 Entrega', item.delivery_text || 'Compra concluída.', 0x00ff00) };
  }
  return { delivered: true, embed: null };
}

export async function handleShopInteraction(interaction: Interaction): Promise<boolean> {
  if (!interaction.inGuild()) {
    if ('customId' in interaction && String(interaction.customId).startsWith('shop:')) {
      await interaction.reply({ embeds: [makeEmbed('❌ Loja', 'Use dentro de um servidor.', 0xff0000)], ephemeral: true });
      return true;
    }
    return false;
  }

  const cid = 'customId' in interaction ? String(interaction.customId) : '';

  if (interaction.isButton() && cid === 'shop:open') {
    await showShopList(interaction, 0);
    return true;
  }
  if (interaction.isButton() && cid.startsWith('shop:page:')) {
    await showShopList(interaction, Number(cid.split(':')[2]) || 0);
    return true;
  }
  if (interaction.isButton() && cid === 'shop:refresh') {
    await showShopList(interaction, 0);
    return true;
  }
  if (interaction.isStringSelectMenu() && cid.startsWith('shop:select:')) {
    const page = Number(cid.split(':')[2]) || 0;
    const itemId = Number((interaction as StringSelectMenuInteraction).values[0]);
    if (!Number.isInteger(itemId)) {
      await interaction.reply({ embeds: [makeEmbed('❌ Inválido', 'Seleção inválida.', 0xff0000)], ephemeral: true });
      return true;
    }
    await showShopItem(interaction, itemId, page);
    return true;
  }
  if (interaction.isButton() && cid.startsWith('shop:buy:')) {
    const [, , itemIdStr, pageStr] = cid.split(':');
    const modal = new ModalBuilder().setCustomId(`shop:buyqty:${itemIdStr}:${pageStr}`).setTitle('Comprar item');
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId('qty').setLabel('Quantidade').setStyle(TextInputStyle.Short).setRequired(true).setValue('1').setMaxLength(4),
      ),
    );
    await interaction.showModal(modal);
    return true;
  }
  if (interaction.isModalSubmit() && cid.startsWith('shop:buyqty:')) {
    const [, , itemIdStr, pageStr] = cid.split(':');
    const itemId = Number(itemIdStr);
    const qty = Number(interaction.fields.getTextInputValue('qty'));
    if (!Number.isInteger(itemId) || !Number.isInteger(qty) || qty <= 0) {
      await interaction.reply({ embeds: [makeEmbed('❌ Quantidade inválida', 'Use inteiro > 0.', 0xff0000)], ephemeral: true });
      return true;
    }
    try {
      const result = purchaseShopItem(interaction.guildId!, interaction.user.id, itemId, qty);
      const deliveryEmbeds: EmbedBuilder[] = [];
      let deliveredAuto = false;
      try {
        const d = await deliverPurchase(interaction, result.item, qty);
        if (d.embed) deliveryEmbeds.push(d.embed);
        if (d.fallbackEmbed) deliveryEmbeds.push(d.fallbackEmbed);
        deliveredAuto = d.delivered === true;
      } catch {
        deliveryEmbeds.push(makeEmbed('⚠️ Entrega', 'Compra ok, erro na entrega.', 0xffaa00));
      }
      if (deliveredAuto && result.purchaseCode) {
        markPurchaseDelivered(interaction.guildId!, result.purchaseCode, interaction.client.user!.id, 'Automática');
      }
      const ok = new EmbedBuilder()
        .setTitle('✅ Compra realizada')
        .setColor(0x00ff00)
        .setDescription(`**${qty}x** **${result.item.name}** por **${result.totalPrice}** pts.`)
        .addFields(
          { name: 'Código', value: `\`${result.purchaseCode}\`` },
          { name: 'Novo saldo', value: `${result.newSaldo} pts`, inline: true },
          { name: 'Estoque', value: result.remainingStock === -1 ? '∞' : `${result.remainingStock}`, inline: true },
        );
      await interaction.reply({ embeds: [ok, ...deliveryEmbeds].slice(0, 10), ephemeral: true });
      if (interaction.client.logAction) {
        await interaction.client.logAction(
          'Compra na Loja',
          `${interaction.user} comprou ${qty}x ${result.item.name} (${result.totalPrice} pts)`,
          interaction,
        );
      }
      return true;
    } catch (e) {
      const err = e as Error & { code?: string; saldoAtual?: number; totalPrice?: number };
      let title = '❌ Falha na compra';
      let desc = err.message;
      if (err.code === 'OUT_OF_STOCK') { title = '❌ Sem estoque'; desc = 'Quantidade indisponível.'; }
      if (err.code === 'INSUFFICIENT_FUNDS') { title = '❌ Saldo insuficiente'; desc = `Precisa de ${err.totalPrice} pts. Saldo: ${err.saldoAtual}.`; }
      await interaction.reply({ embeds: [makeEmbed(title, desc, 0xff0000)], ephemeral: true });
      return true;
    }
  }
  return false;
}
