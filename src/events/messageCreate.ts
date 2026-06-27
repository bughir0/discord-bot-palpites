import { Events, type Client, type Message } from 'discord.js';
import { modules } from '../core/registry';

export function registerMessageEvent(client: Client): void {
  client.on(Events.MessageCreate, async (message: Message) => {
    for (const mod of modules) {
      if (mod.onMessage) {
        try {
          await mod.onMessage(message);
        } catch (e) {
          console.error(`[message:${mod.id}]`, e);
        }
      }
    }
  });
}
