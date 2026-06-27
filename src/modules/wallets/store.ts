import { getDb } from '../../db/database';

export function addRegisteredWallet(
  userId: string,
  username: string,
  address: string,
  source: 'manual' | 'signed' = 'manual',
): { ok: boolean; message: string } {
  const normalized = address.trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(normalized)) {
    return { ok: false, message: 'Endereço inválido. Use formato 0x...' };
  }
  const dup = getDb()
    .prepare('SELECT 1 FROM registered_wallets WHERE discord_user_id = ? AND wallet_address = ?')
    .get(userId, normalized);
  if (dup) return { ok: false, message: 'Esta wallet já está registrada!' };

  getDb()
    .prepare(
      `INSERT INTO registered_wallets (discord_user_id, discord_username, wallet_address, source, created_at)
       VALUES (?, ?, ?, ?, datetime('now'))`,
    )
    .run(userId, username, normalized, source);
  return { ok: true, message: 'Wallet registrada com sucesso!' };
}

export function getUserWallets(userId: string): string[] {
  const rows = getDb()
    .prepare('SELECT wallet_address FROM registered_wallets WHERE discord_user_id = ? ORDER BY id')
    .all(userId) as { wallet_address: string }[];
  return rows.map((r) => r.wallet_address);
}

export function listAllWallets(): Array<{ user_id: string; username: string | null; wallets: string[] }> {
  const rows = getDb()
    .prepare('SELECT discord_user_id, discord_username, wallet_address FROM registered_wallets ORDER BY discord_user_id')
    .all() as { discord_user_id: string; discord_username: string | null; wallet_address: string }[];
  const map = new Map<string, { username: string | null; wallets: string[] }>();
  for (const r of rows) {
    const cur = map.get(r.discord_user_id) ?? { username: r.discord_username, wallets: [] };
    cur.wallets.push(r.wallet_address);
    map.set(r.discord_user_id, cur);
  }
  return [...map.entries()].map(([user_id, v]) => ({
    user_id,
    username: v.username,
    wallets: v.wallets,
  }));
}
