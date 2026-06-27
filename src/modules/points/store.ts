import type Database from 'better-sqlite3';
import { getDb } from '../../db/database';

export type ShopItem = {
  id: number;
  guild_id: string;
  name: string;
  description: string | null;
  price: number;
  stock: number;
  image_url: string | null;
  delivery_type: string;
  delivery_role_id: string | null;
  delivery_text: string | null;
};

function db(): Database.Database {
  return getDb();
}

export function getSaldo(userId: string): number {
  const row = db()
    .prepare('SELECT saldo FROM community_users WHERE user_id = ?')
    .get(userId) as { saldo: number } | undefined;
  return row?.saldo ?? 0;
}

export function setSaldo(userId: string, saldo: number): void {
  db()
    .prepare(
      `INSERT INTO community_users (user_id, saldo, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(user_id) DO UPDATE SET saldo = excluded.saldo, updated_at = datetime('now')`,
    )
    .run(userId, saldo);
}

export function addSaldo(
  userId: string,
  delta: number,
  source = 'manual',
  reference?: string,
): number {
  db().prepare('INSERT OR IGNORE INTO community_users (user_id, saldo) VALUES (?, 0)').run(userId);
  db()
    .prepare(
      `UPDATE community_users SET saldo = saldo + ?, updated_at = datetime('now') WHERE user_id = ?`,
    )
    .run(delta, userId);
  db()
    .prepare('INSERT INTO points_ledger (user_id, delta, source, reference) VALUES (?, ?, ?, ?)')
    .run(userId, delta, source, reference ?? null);
  return getSaldo(userId);
}

export function transferSaldo(fromId: string, toId: string, amount: number): void {
  const from = getSaldo(fromId);
  if (from < amount) {
    throw Object.assign(new Error('Saldo insuficiente'), { code: 'INSUFFICIENT_FUNDS', saldoAtual: from });
  }
  setSaldo(fromId, from - amount);
  addSaldo(toId, amount, 'transferencia', fromId);
}

export function listShopItems(guildId: string): ShopItem[] {
  return db()
    .prepare('SELECT * FROM shop_items WHERE guild_id = ? ORDER BY id DESC')
    .all(guildId) as ShopItem[];
}

export function getShopItem(guildId: string, itemId: number): ShopItem | undefined {
  return db()
    .prepare('SELECT * FROM shop_items WHERE guild_id = ? AND id = ?')
    .get(guildId, itemId) as ShopItem | undefined;
}

export function addShopItem(
  guildId: string,
  input: {
    name: string;
    description?: string | null;
    price: number;
    stock: number;
    imageUrl?: string | null;
    deliveryType?: string;
    deliveryRoleId?: string | null;
    deliveryText?: string | null;
  },
): number {
  const r = db()
    .prepare(
      `INSERT INTO shop_items (guild_id, name, description, price, stock, image_url, delivery_type, delivery_role_id, delivery_text)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      guildId,
      input.name,
      input.description ?? null,
      input.price,
      input.stock,
      input.imageUrl ?? null,
      input.deliveryType ?? 'none',
      input.deliveryRoleId ?? null,
      input.deliveryText ?? null,
    );
  return Number(r.lastInsertRowid);
}

export function setShopSettings(
  guildId: string,
  channelId: string,
  messageId: string,
  meta: { title?: string | null; description?: string | null; imageUrl?: string | null; color?: string | null } = {},
): void {
  db()
    .prepare(
      `INSERT INTO shop_settings (guild_id, channel_id, message_id, title, description, image_url, color, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(guild_id) DO UPDATE SET
         channel_id = excluded.channel_id,
         message_id = excluded.message_id,
         title = excluded.title,
         description = excluded.description,
         image_url = excluded.image_url,
         color = excluded.color,
         updated_at = datetime('now')`,
    )
    .run(
      guildId,
      channelId,
      messageId,
      meta.title ?? null,
      meta.description ?? null,
      meta.imageUrl ?? null,
      meta.color ?? null,
    );
}

export function purchaseShopItem(
  guildId: string,
  userId: string,
  itemId: number,
  quantity: number,
): {
  purchaseId: number;
  purchaseCode: string;
  item: ShopItem;
  totalPrice: number;
  newSaldo: number;
  remainingStock: number;
} {
  const database = db();
  const tx = database.transaction(() => {
    const item = getShopItem(guildId, itemId);
    if (!item) throw Object.assign(new Error('Item não encontrado'), { code: 'ITEM_NOT_FOUND' });
    const totalPrice = item.price * quantity;
    if (item.stock !== -1 && item.stock < quantity) {
      throw Object.assign(new Error('Sem estoque'), { code: 'OUT_OF_STOCK' });
    }
    const saldo = getSaldo(userId);
    if (saldo < totalPrice) {
      throw Object.assign(new Error('Saldo insuficiente'), { code: 'INSUFFICIENT_FUNDS' });
    }
    setSaldo(userId, saldo - totalPrice);
    if (item.stock !== -1) {
      database
        .prepare('UPDATE shop_items SET stock = stock - ?, updated_at = datetime(\'now\') WHERE id = ? AND guild_id = ?')
        .run(quantity, itemId, guildId);
    }
    const ins = database
      .prepare(
        'INSERT INTO shop_purchases (guild_id, user_id, item_id, quantity, total_price, status) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(guildId, userId, itemId, quantity, totalPrice, 'pending');
    const purchaseId = Number(ins.lastInsertRowid);
    const purchaseCode = `PC-${purchaseId.toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    database.prepare('UPDATE shop_purchases SET purchase_code = ? WHERE id = ?').run(purchaseCode, purchaseId);
    const remainingStock =
      item.stock === -1
        ? -1
        : ((getShopItem(guildId, itemId)?.stock ?? 0) as number);
    return { purchaseId, purchaseCode, item, totalPrice, newSaldo: getSaldo(userId), remainingStock };
  });
  return tx();
}

export function updateShopItem(
  guildId: string,
  itemId: number,
  patch: Partial<{
    name: string;
    description: string | null;
    price: number;
    stock: number;
    imageUrl: string | null;
    deliveryType: string;
    deliveryRoleId: string | null;
    deliveryText: string | null;
  }>,
): { changes: number } {
  const map: Record<string, string> = {
    name: 'name',
    description: 'description',
    price: 'price',
    stock: 'stock',
    imageUrl: 'image_url',
    deliveryType: 'delivery_type',
    deliveryRoleId: 'delivery_role_id',
    deliveryText: 'delivery_text',
  };
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const [k, col] of Object.entries(map)) {
    const key = k as keyof typeof patch;
    if (patch[key] === undefined) continue;
    sets.push(`${col} = ?`);
    params.push(patch[key]);
  }
  if (sets.length === 0) return { changes: 0 };
  params.push(guildId, itemId);
  const r = db()
    .prepare(`UPDATE shop_items SET ${sets.join(', ')}, updated_at = datetime('now') WHERE guild_id = ? AND id = ?`)
    .run(...params);
  return { changes: r.changes };
}

export function removeShopItem(guildId: string, itemId: number): { changes: number } {
  const r = db().prepare('DELETE FROM shop_items WHERE guild_id = ? AND id = ?').run(guildId, itemId);
  return { changes: r.changes };
}

export function setShopStock(guildId: string, itemId: number, stock: number): { changes: number } {
  const r = db()
    .prepare('UPDATE shop_items SET stock = ?, updated_at = datetime(\'now\') WHERE guild_id = ? AND id = ?')
    .run(stock, guildId, itemId);
  return { changes: r.changes };
}

export function addShopStock(guildId: string, itemId: number, delta: number): { changes: number } {
  const r = db()
    .prepare(
      'UPDATE shop_items SET stock = stock + ?, updated_at = datetime(\'now\') WHERE guild_id = ? AND id = ? AND stock != -1',
    )
    .run(delta, guildId, itemId);
  return { changes: r.changes };
}

export function markPurchaseDelivered(
  guildId: string,
  purchaseCode: string,
  staffId: string,
  note: string | null = null,
): { changes: number } {
  const r = db()
    .prepare(
      `UPDATE shop_purchases SET status = 'delivered', staff_id = ?, delivered_at = datetime('now'), delivery_note = ?
       WHERE guild_id = ? AND purchase_code = ? AND status = 'pending'`,
    )
    .run(staffId, note, guildId, purchaseCode);
  return { changes: r.changes };
}

export function listPendingPurchases(guildId: string, limit = 20) {
  return db()
    .prepare(
      `SELECT p.*, i.name AS item_name FROM shop_purchases p
       LEFT JOIN shop_items i ON i.id = p.item_id
       WHERE p.guild_id = ? AND p.status = 'pending' ORDER BY p.id DESC LIMIT ?`,
    )
    .all(guildId, limit) as Array<Record<string, unknown>>;
}

export function getPurchaseByCode(guildId: string, purchaseCode: string) {
  return db()
    .prepare(
      `SELECT p.*, i.name AS item_name FROM shop_purchases p
       LEFT JOIN shop_items i ON i.id = p.item_id
       WHERE p.guild_id = ? AND p.purchase_code = ?`,
    )
    .get(guildId, purchaseCode) as Record<string, unknown> | undefined;
}

export function getRanking(limit = 10): Array<{ user_id: string; saldo: number }> {
  return db()
    .prepare('SELECT user_id, saldo FROM community_users WHERE saldo > 0 ORDER BY saldo DESC LIMIT ?')
    .all(limit) as Array<{ user_id: string; saldo: number }>;
}
