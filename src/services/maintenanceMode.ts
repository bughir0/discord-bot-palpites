import {
  ActivityType,
  EmbedBuilder,
  MessageFlags,
  type Client,
  type Interaction,
} from 'discord.js';
import { getDb } from '../db/database';
import { log } from '../utils/logger';

const META_KEY = 'maintenance_mode';
/** Único usuário autorizado a usar /modo-manutencao */
export const MAINTENANCE_OWNER_ID = '380475076174282753';

function ensureMetaTable(): void {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS bot_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

export function isMaintenanceOwner(userId: string): boolean {
  return userId === MAINTENANCE_OWNER_ID;
}

export function isMaintenanceActive(): boolean {
  ensureMetaTable();
  const row = getDb()
    .prepare('SELECT value FROM bot_meta WHERE key = ?')
    .get(META_KEY) as { value: string } | undefined;
  return row?.value === '1';
}

export function setMaintenanceActive(active: boolean): void {
  ensureMetaTable();
  const wasActive = isMaintenanceActive();
  getDb()
    .prepare(
      `INSERT INTO bot_meta (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(META_KEY, active ? '1' : '0');
  if (active && !wasActive) {
    log.warn('Modo manutenção ATIVADO — comandos, botões e automações pausados.');
  } else if (!active && wasActive) {
    log.success('Modo manutenção DESATIVADO — bot voltou ao normal.');
  }
}

export function buildMaintenanceEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xfaa61a)
    .setAuthor({ name: '🔧 Modo manutenção' })
    .setDescription(
      'O **Palpito** está em manutenção temporária.\n\n' +
        'Comandos, botões e automações estão pausados. Tente novamente em breve.',
    );
}

export async function replyMaintenanceBlocked(interaction: Interaction): Promise<void> {
  if (!interaction.isRepliable()) return;

  try {
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        embeds: [buildMaintenanceEmbed()],
        flags: MessageFlags.Ephemeral,
      });
    } else {
      await interaction.reply({
        embeds: [buildMaintenanceEmbed()],
        flags: MessageFlags.Ephemeral,
      });
    }
  } catch {
    // interação expirada ou já respondida
  }
}

export function applyMaintenancePresence(client: Client): void {
  if (!client.user) return;
  if (isMaintenanceActive()) {
    void client.user.setActivity('🔧 Modo manutenção', { type: ActivityType.Watching });
  } else {
    void client.user.setActivity('Palpito | /quiz /evento', { type: ActivityType.Watching });
  }
}
