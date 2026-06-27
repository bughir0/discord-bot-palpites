import type { AutocompleteInteraction } from "discord.js";
import type { BotContext } from "../context";

const MAX_CHOICES = 25;
const MAX_NAME_LEN = 100;

function choiceLabel(name: string, eventId: string, channelId: string): string {
  const base = `${name} · canal ${channelId} · ${eventId}`;
  if (base.length <= MAX_NAME_LEN) return base;
  const short = `${name.slice(0, 32)}… · ${channelId} · ${eventId}`;
  return short.slice(0, MAX_NAME_LEN);
}

/**
 * Auto-complete do `evento_id` em `/evento finalizar` com eventos ativos do servidor.
 */
export async function handleEventoAutocomplete(
  interaction: AutocompleteInteraction,
  ctx: BotContext,
): Promise<void> {
  try {
    if (!interaction.inGuild() || interaction.commandName !== "evento") {
      await interaction.respond([]);
      return;
    }

    const sub = interaction.options.getSubcommand(false);
    if (sub !== "finalizar") {
      await interaction.respond([]);
      return;
    }

    const focused = interaction.options.getFocused(true);
    if (focused.name !== "evento_id") {
      await interaction.respond([]);
      return;
    }

    const list = await ctx.eventService.listActiveEventsForGuild(interaction.guildId);
    const q = focused.value.toLowerCase().trim();

    const filtered = list.filter((ev) => {
      if (!q) return true;
      return (
        ev.id.includes(q) ||
        ev.name.toLowerCase().includes(q) ||
        ev.channel_id.includes(q)
      );
    });

    const choices = filtered.slice(0, MAX_CHOICES).map((ev) => ({
      name: choiceLabel(ev.name, ev.id, ev.channel_id),
      value: ev.id,
    }));

    await interaction.respond(choices);
  } catch (e) {
    console.error("[autocomplete]", e);
    if (!interaction.responded) {
      try {
        await interaction.respond([]);
      } catch (e2) {
        console.error("[autocomplete] falha ao responder vazio:", e2);
      }
    }
  }
}
