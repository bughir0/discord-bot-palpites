import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from 'discord.js';
import { ethers } from 'ethers';
import { env } from '../config';
import { LEAGUE, leagueBrandingForRodada } from './theme';
import type { GuildConfig, PartidaRodada, Palpite, RankingEntry, ResultadoPalpite, Rodada } from '../types';
import {
  accentEmbedColor,
  defaultEmbedColor,
  formatDate,
  formatDiscordTimestamp,
  formatDiscordTimestampFull,
  formatEstadio,
  medal,
  parseEmbedColor,
  rankBadge,
  resultadoEmoji,
} from '../utils/helpers';

const RANKING_PAGE_SIZE = 10;
/** Margem abaixo do limite de 4096 caracteres da description de cada embed */
const EMBED_DESC_SAFE = 3800;
/** Limite combinado de caracteres de todos os embeds em uma mensagem do Discord */
const DISCORD_MESSAGE_EMBED_CHAR_MAX = 6000;
const DISCORD_MAX_EMBEDS_PER_MESSAGE = 10;

function leagueAuthor(rodada?: Rodada | null): { name: string; iconURL: string } {
  const league = leagueBrandingForRodada(rodada);
  return { name: league.label, iconURL: league.logo };
}

function buildPartidaMeta(partida: PartidaRodada, league = LEAGUE): string {
  const dateLine = `📅 ${formatDiscordTimestampFull(partida.data_realizacao_iso)}`;
  const localLine = `🏠 ${formatEstadio(partida.estadio)}`;
  return `> ${league.emoji} ${league.label}\n> ${dateLine}\n> ${localLine}`;
}

function applyTeamBranding(embed: EmbedBuilder, partida: PartidaRodada): EmbedBuilder {
  if (partida.escudo_mandante) embed.setThumbnail(partida.escudo_mandante);
  if (partida.escudo_visitante) {
    embed.setFooter({ text: partida.time_visitante, iconURL: partida.escudo_visitante });
  }
  return embed;
}

function buildRodadaIntro(partidas: PartidaRodada[], config: GuildConfig, rodada?: Rodada): string {
  const instrucao =
    rodada?.modalidade === 'copa'
      ? `> **Palpitar grátis**, **Bolão CHZ** ou \`/palpite\` / \`/bolao-chz\`\n`
      : `> Clique em **Palpitar grátis** ou use \`/palpite\`\n`;

  return (
    `**${partidas.length} jogos** abertos para palpite nesta rodada.\n\n` +
    instrucao +
    `> 🎯 Placar exato · **${config.pontos_exato} pts**\n` +
    `> ✅ Vencedor/empate · **${config.pontos_vencedor} pt**\n\n` +
    `_Palpites encerram no horário de cada partida._\n\n`
  );
}

function buildPartidaLinhaCompact(partida: PartidaRodada): string {
  const hora = formatDiscordTimestamp(partida.data_realizacao_iso, 't');
  return `⚽ ${partida.time_mandante} **X** ${partida.time_visitante} · ${hora}`;
}

/** Agrupa jogos por dia para leitura mais fácil em rodadas longas (ex.: Copa). */
function buildRodadaJogosLinhas(partidas: PartidaRodada[]): string[] {
  const sorted = [...partidas].sort((a, b) =>
    (a.data_realizacao_iso ?? '').localeCompare(b.data_realizacao_iso ?? ''),
  );

  const linhas: string[] = [];
  let ultimoDia = '';

  for (const partida of sorted) {
    const dia = partida.data_realizacao_iso?.slice(0, 10) ?? '';
    if (dia !== ultimoDia) {
      if (linhas.length > 0) linhas.push('');
      linhas.push(`📅 **${formatDiscordTimestamp(partida.data_realizacao_iso, 'D')}**`);
      ultimoDia = dia;
    }
    linhas.push(buildPartidaLinhaCompact(partida));
  }

  return linhas;
}

function splitRodadaDescriptions(intro: string, linhas: string[], maxLen: number): string[] {
  const chunks: string[] = [];
  let current = intro;
  let parte = 1;

  const prefixoContinuacao = (): string =>
    `📋 _Jogos da rodada (parte ${parte})_\n\n`;

  for (const linha of linhas) {
    const block = linha === '' ? '\n' : `${linha}\n`;
    if (current.length + block.length > maxLen && current.trim().length > 0) {
      chunks.push(current.trimEnd());
      parte += 1;
      current = prefixoContinuacao() + block;
    } else {
      current += block;
    }
  }

  if (current.trim()) chunks.push(current.trimEnd());
  return chunks.length > 0 ? chunks : [intro];
}

function embedPayloadLength(embed: EmbedBuilder): number {
  const json = embed.toJSON();
  let len = 0;
  if (json.title) len += json.title.length;
  if (json.description) len += json.description.length;
  if (json.footer?.text) len += json.footer.text.length;
  if (json.author?.name) len += json.author.name.length;
  if (json.fields) {
    for (const field of json.fields) {
      len += (field.name?.length ?? 0) + (field.value?.length ?? 0);
    }
  }
  return len;
}

/** Divide embeds em lotes que respeitam o limite de 6000 caracteres e 10 embeds por mensagem. */
export function packEmbedsForDiscordMessages(embeds: EmbedBuilder[]): EmbedBuilder[][] {
  if (embeds.length === 0) return [[]];

  const batches: EmbedBuilder[][] = [];
  let batch: EmbedBuilder[] = [];
  let batchChars = 0;

  for (const embed of embeds) {
    const weight = embedPayloadLength(embed);
    const excedeChars = batchChars + weight > DISCORD_MESSAGE_EMBED_CHAR_MAX;
    const excedeQtd = batch.length >= DISCORD_MAX_EMBEDS_PER_MESSAGE;

    if (batch.length > 0 && (excedeChars || excedeQtd)) {
      batches.push(batch);
      batch = [];
      batchChars = 0;
    }

    batch.push(embed);
    batchChars += weight;
  }

  if (batch.length > 0) batches.push(batch);
  return batches;
}

function buildRodadaDescriptionChunks(
  partidas: PartidaRodada[],
  config: GuildConfig,
  rodada?: Rodada,
): string[] {
  return splitRodadaDescriptions(
    buildRodadaIntro(partidas, config, rodada),
    buildRodadaJogosLinhas(partidas),
    EMBED_DESC_SAFE,
  );
}

function rodadaEmbedFooter(partidas: PartidaRodada[], rodada: Rodada): string {
  if (rodada.modalidade === 'copa') {
    return `${partidas.length} jogos · Palpitar grátis ou Bolão CHZ`;
  }
  return `${partidas.length} jogos · use Palpitar grátis para enviar seus palpites`;
}

export function buildRodadaHeaderEmbed(
  rodada: Rodada,
  partidas: PartidaRodada[],
  config: GuildConfig,
): EmbedBuilder {
  const league = leagueBrandingForRodada(rodada);
  const descriptions = buildRodadaDescriptionChunks(partidas, config, rodada);

  return new EmbedBuilder()
    .setColor(defaultEmbedColor(config.cor_embed))
    .setAuthor({
      name: `${league.emoji} PALPITES — ${rodada.numero_rodada}ª RODADA`,
      iconURL: league.logo,
    })
    .setDescription(descriptions[0]);
}

export function buildPartidaJogoEmbed(
  partida: PartidaRodada,
  config: GuildConfig,
  rodada?: Rodada | null,
): EmbedBuilder {
  const league = leagueBrandingForRodada(rodada);
  const embed = new EmbedBuilder()
    .setColor(defaultEmbedColor(config.cor_embed))
    .setAuthor(leagueAuthor(rodada))
    .setDescription(
      `**${partida.time_mandante} X ${partida.time_visitante}**\n\n${buildPartidaMeta(partida, league)}`,
    );

  return applyTeamBranding(embed, partida);
}

export function buildRodadaEmbeds(
  rodada: Rodada,
  partidas: PartidaRodada[],
  config: GuildConfig,
): EmbedBuilder[] {
  const league = leagueBrandingForRodada(rodada);
  const descriptions = buildRodadaDescriptionChunks(partidas, config, rodada);
  const totalPartes = descriptions.length;

  const embeds = descriptions.map((description, index) => {
    const embed = new EmbedBuilder()
      .setColor(defaultEmbedColor(config.cor_embed))
      .setAuthor({
        name:
          index === 0
            ? `${league.emoji} PALPITES — ${rodada.numero_rodada}ª RODADA`
            : totalPartes > 1
              ? `${league.emoji} ${rodada.numero_rodada}ª RODADA · ${index + 1}/${totalPartes}`
              : `${league.emoji} ${rodada.numero_rodada}ª RODADA — jogos`,
        iconURL: league.logo,
      })
      .setDescription(description);

    if (index === 0 && partidas[0]?.escudo_mandante) {
      embed.setThumbnail(partidas[0].escudo_mandante);
    }

    if (index === totalPartes - 1 && totalPartes > 1) {
      embed.setFooter({ text: rodadaEmbedFooter(partidas, rodada) });
    }

    return embed;
  });

  return embeds.length > 0 ? embeds : [buildRodadaHeaderEmbed(rodada, partidas, config)];
}

function formatEntradaChz(rodada: Rodada): string {
  const wei = rodada.entrada_chz_wei ?? ethers.parseEther(env.copaEntradaCHZDefault).toString();
  return ethers.formatEther(BigInt(wei));
}

function buildGuiaParticipacaoCopa(rodada: Rodada): string {
  const entrada = formatEntradaChz(rodada);
  const ttl = env.apostaSessionTtlMin;
  const site = env.dappBaseUrl.replace(/\/+$/, '');

  return (
    `**Como participar**\n\n` +
    `⚽ **Palpite grátis** (sem pagamento)\n` +
    `> Botão **Palpitar grátis** ou \`/palpite\` — conta no ranking na hora.\n\n` +
    `💰 **Bolão CHZ** (entrada **${entrada} CHZ**)\n` +
    `> 1. Botão **Bolão CHZ** ou \`/bolao-chz\`\n` +
    `> 2. Escolha **só os jogos que quiser** _(ex.: Brasil)_ e informe o placar\n` +
    `> 3. Clique em **Ir para pagamento** — o **link aparece na resposta do bot** _(só você vê)_\n` +
    `> 4. No site, **conecte a wallet** (MetaMask / WalletConnect)\n` +
    `> 5. Pague **${entrada} CHZ** na rede Chiliz — palpites confirmados após a tx\n\n` +
    `🔗 **Wallet (opcional):** \`/wallet vincular\` — associa Discord à carteira antes do pagamento.\n` +
    `⏱️ O link de pagamento expira em **${ttl} min**.\n` +
    `🌐 Site do bolão: ${site}\n\n`
  );
}

/** Texto fora do embed ao abrir rodada (marca cargo se configurado). */
export function buildMensagemAberturaRodada(
  rodada: Rodada,
  totalJogos: number,
  config: GuildConfig,
  cargoId: string | null,
): string {
  const mencao = cargoId ? `<@&${cargoId}>` : '';
  const canalResultadosId =
    (rodada.modalidade === 'copa'
      ? config.canal_copa_resultados_id
      : config.canal_resultados_id) ?? rodada.channel_id;
  const linhaResultados = canalResultadosId
    ? `📣 **Resultados** serão publicados em <#${canalResultadosId}>.\n\n`
    : '';

  const linhaPalpites =
    rodada.modalidade === 'copa'
      ? buildGuiaParticipacaoCopa(rodada)
      : `**Partidas abertas — vamos palpitar!** 👇\n` +
        `_Use o botão **Palpitar grátis** ou o comando \`/palpite\`._\n\n`;

  return (
    `🏆 **${rodada.numero_rodada}ª RODADA ABERTA!**\n\n` +
    `⚽ **${totalJogos} partidas** liberadas para palpite!\n` +
    `🎯 Placar exato · **${config.pontos_exato} pts** · ✅ Vencedor/empate · **${config.pontos_vencedor} pt**\n\n` +
    linhaResultados +
    linhaPalpites +
    mencao
  ).trimEnd();
}

export function buildRodadaComponents(
  rodadaId: number,
  options?: { mostrarBolaoChz?: boolean },
): ActionRowBuilder<ButtonBuilder>[] {
  const components: ButtonBuilder[] = [
    new ButtonBuilder()
      .setCustomId(`palpitar:${rodadaId}`)
      .setLabel('Palpitar grátis')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('⚽'),
  ];

  if (options?.mostrarBolaoChz) {
    components.push(
      new ButtonBuilder()
        .setCustomId(`bolao-chz:${rodadaId}`)
        .setLabel('Bolão CHZ')
        .setStyle(ButtonStyle.Success)
        .setEmoji('💰'),
    );
  }

  components.push(
    new ButtonBuilder()
      .setCustomId(`meus-palpites:${rodadaId}`)
      .setLabel('Meus palpites')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('📋'),
    new ButtonBuilder()
      .setCustomId(`ranking-rodada:${rodadaId}:0`)
      .setLabel('Ranking')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🏆'),
  );

  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(...components),
  ];
}

export function buildPartidaSelect(
  rodadaId: number,
  partidas: PartidaRodada[],
  options?: { selectCustomId?: string; placeholder?: string; emoji?: string },
): ActionRowBuilder<StringSelectMenuBuilder> | null {
  if (partidas.length === 0) return null;

  const emoji = options?.emoji ?? '⚽';
  const menuOptions = partidas.slice(0, 25).map((p) =>
    new StringSelectMenuOptionBuilder()
      .setLabel(`${p.time_mandante} X ${p.time_visitante}`.slice(0, 100))
      .setDescription(formatDate(p.data_realizacao_iso).slice(0, 100))
      .setValue(String(p.partida_id))
      .setEmoji(emoji),
  );

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(options?.selectCustomId ?? `select-partida:${rodadaId}`)
      .setPlaceholder(options?.placeholder ?? 'Escolha o jogo para palpitar')
      .addOptions(menuOptions),
  );
}

export type PalpiteConfirmContexto = 'free' | 'bolao-rascunho';

export function buildPalpiteConfirmEmbed(
  partida: PartidaRodada,
  mandante: number,
  visitante: number,
  config: GuildConfig,
  updated: boolean,
  options?: { contexto?: PalpiteConfirmContexto; rodada?: Rodada | null },
): EmbedBuilder {
  const league = leagueBrandingForRodada(options?.rodada);
  const isRascunho = options?.contexto === 'bolao-rascunho';
  const titulo = isRascunho
    ? updated
      ? 'Rascunho atualizado'
      : 'Rascunho salvo'
    : updated
      ? 'Palpite atualizado'
      : 'Palpite registrado';
  const avisoRascunho = isRascunho
    ? '> ⏳ _Rascunho salvo. Adicione mais jogos ou clique em **Ir para pagamento**._\n'
    : '';

  const embed = new EmbedBuilder()
    .setColor(accentEmbedColor())
    .setAuthor({ name: titulo, iconURL: league.logo })
    .setDescription(
      `**${partida.time_mandante} X ${partida.time_visitante}**\n\n` +
        `> Seu palpite · **${mandante} X ${visitante}**\n` +
        `> 🎯 Exato = ${config.pontos_exato} pts · ✅ Vencedor = ${config.pontos_vencedor} pt\n` +
        avisoRascunho +
        `\n` +
        buildPartidaMeta(partida, league),
    );

  return applyTeamBranding(embed, partida);
}

export function buildMeusPalpitesEmbed(
  palpites: Palpite[],
  partidas: PartidaRodada[],
  config: GuildConfig,
  username: string,
): EmbedBuilder {
  const partidaMap = new Map(partidas.map((p) => [p.partida_id, p]));

  const lines =
    palpites.length === 0
      ? '_Você ainda não palpitou nenhum jogo desta rodada._'
      : palpites
          .map((palpite) => {
            const partida = partidaMap.get(palpite.partida_id);
            if (!partida) return null;
            return (
              `⚽ **${partida.time_mandante} X ${partida.time_visitante}**\n` +
              `> Palpite · \`${palpite.palpite_mandante} X ${palpite.palpite_visitante}\`\n` +
              `> 📅 ${formatDiscordTimestampFull(partida.data_realizacao_iso)}`
            );
          })
          .filter(Boolean)
          .join('\n\n');

  const faltando = partidas.filter((p) => !palpites.some((pal) => pal.partida_id === p.partida_id));

  return new EmbedBuilder()
    .setColor(defaultEmbedColor(config.cor_embed))
    .setAuthor({ name: `MEUS PALPITES — @${username}`, iconURL: LEAGUE.logo })
    .setDescription(lines)
    .addFields({
      name: '📊 Resumo',
      value: `Palpitados **${palpites.length}/${partidas.length}** · Faltam **${faltando.length}**`,
      inline: false,
    });
}

export function buildResultadoPartidaEmbed(
  partida: PartidaRodada,
  resultados: ResultadoPalpite[],
  config: GuildConfig,
): EmbedBuilder {
  const pm = partida.placar_mandante ?? 0;
  const pv = partida.placar_visitante ?? 0;

  const palpitesLines =
    resultados.length === 0
      ? '_Ninguém palpitou neste jogo._'
      : resultados
          .sort((a, b) => b.pontos - a.pontos)
          .map((r) => {
            const emoji = resultadoEmoji(r.tipo);
            const pts = r.pontos > 0 ? ` · **+${r.pontos}**` : '';
            return (
              `${emoji} <@${r.palpite.discord_user_id}> · ` +
              `\`${r.palpite.palpite_mandante} X ${r.palpite.palpite_visitante}\`${pts}`
            );
          })
          .join('\n');

  const embed = new EmbedBuilder()
    .setColor(accentEmbedColor())
    .setAuthor(leagueAuthor())
    .setDescription(
      `**${partida.time_mandante} ${pm} X ${pv} ${partida.time_visitante}**\n\n` +
        `> 🗓️ ${formatDiscordTimestampFull(partida.data_realizacao_iso)}\n` +
        `> 🏠 ${formatEstadio(partida.estadio)}`,
    )
    .addFields({ name: '📋 Palpites', value: palpitesLines.slice(0, 1024) });

  return applyTeamBranding(embed, partida);
}

export function buildRankingEmbed(
  entries: RankingEntry[],
  config: GuildConfig,
  titulo: string,
  page = 0,
  rodada?: Rodada | null,
): EmbedBuilder {
  const league = leagueBrandingForRodada(rodada);
  const start = page * RANKING_PAGE_SIZE;
  const slice = entries.slice(start, start + RANKING_PAGE_SIZE);

  const lines =
    slice.length === 0
      ? '_Nenhum palpite registrado ainda._'
      : slice
          .map((e, i) => {
            const pos = start + i + 1;
            const user = e.discord_username ? `@${e.discord_username}` : 'membro';
            return (
              `${rankBadge(pos)} <@${e.discord_user_id}>\n` +
              `> ${user} · 🎯 ${e.acertos_exatos} · ✅ ${e.acertos_vencedor}\n` +
              `> **${e.total_pontos}** pontos`
            );
          })
          .join('\n\n');

  const totalPages = Math.max(1, Math.ceil(entries.length / RANKING_PAGE_SIZE));

  return new EmbedBuilder()
    .setColor(defaultEmbedColor(config.cor_embed))
    .setAuthor({ name: `🏆 ${titulo.toUpperCase()}`, iconURL: league.logo })
    .setDescription(lines)
    .setFooter({
      text: `${league.label} · Página ${page + 1}/${totalPages} · ${entries.length} jogadores`,
    })
    .setTimestamp();
}

export function buildRankingComponents(
  rodadaId: number | 'geral',
  page: number,
  totalEntries: number,
): ActionRowBuilder<ButtonBuilder>[] {
  const totalPages = Math.ceil(totalEntries / RANKING_PAGE_SIZE);
  const hasMore = page + 1 < totalPages;
  const hasPrev = page > 0;

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`ranking-mais:${rodadaId}:${page + 1}`)
      .setLabel('Ver mais')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('➡️')
      .setDisabled(!hasMore),
    new ButtonBuilder()
      .setCustomId(`ranking-mais:${rodadaId}:${page - 1}`)
      .setLabel('Anterior')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('⬅️')
      .setDisabled(!hasPrev),
    new ButtonBuilder()
      .setCustomId(`meus-palpites:${rodadaId === 'geral' ? '0' : rodadaId}`)
      .setLabel('Meus palpites')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('📋'),
  );

  return [row];
}

export function buildConfigEmbed(config: GuildConfig): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(defaultEmbedColor(config.cor_embed))
    .setAuthor({ name: '⚙️ CONFIGURAÇÕES', iconURL: LEAGUE.logo })
    .addFields(
      {
        name: '📢 Brasileirão',
        value:
          `Palpites · ${config.canal_palpites_id ? `<#${config.canal_palpites_id}>` : '_Não definido_'}\n` +
          `Resultados · ${config.canal_resultados_id ? `<#${config.canal_resultados_id}>` : '_Não definido_'}`,
        inline: false,
      },
      {
        name: '🏆 Copa CHZ',
        value:
          `Palpites · ${config.canal_copa_palpites_id ? `<#${config.canal_copa_palpites_id}>` : '_Não definido_'}\n` +
          `Resultados · ${config.canal_copa_resultados_id ? `<#${config.canal_copa_resultados_id}>` : '_Não definido_'}`,
        inline: false,
      },
      {
        name: '🏆 Campeonato',
        value: `ID \`${config.campeonato_id}\` · ${LEAGUE.label}`,
        inline: true,
      },
      {
        name: '🎯 Pontuação',
        value: `Exato · **${config.pontos_exato} pts**\nVencedor · **${config.pontos_vencedor} pt**`,
        inline: true,
      },
      {
        name: '🎨 Visual',
        value: `Cor · \`${config.cor_embed}\``,
        inline: true,
      },
      {
        name: '🤖 Automação',
        value:
          `Abrir rodada · ${config.auto_abrir_rodada ? '✅' : '❌'}\n` +
          `Verificar · ${config.auto_verificar ? '✅' : '❌'} · ` +
          `Notificar · ${config.notificar_resultados ? '✅' : '❌'}`,
        inline: false,
      },
      {
        name: '🔔 Cargo palpites',
        value: config.cargo_palpites_id ? `<@&${config.cargo_palpites_id}>` : '_Padrão do .env ou não definido_',
        inline: false,
      },
    )
    .setFooter({ text: 'Use /config para alterar' })
    .setTimestamp();
}

export function buildProximosJogosEmbeds(
  numeroRodada: number,
  partidas: PartidaRodada[],
  config: GuildConfig,
): EmbedBuilder[] {
  if (partidas.length === 0) {
    return [
      new EmbedBuilder()
        .setColor(defaultEmbedColor(config.cor_embed))
        .setAuthor({ name: `${LEAGUE.emoji} PRÓXIMOS JOGOS`, iconURL: LEAGUE.logo })
        .setDescription('_Nenhum jogo encontrado._'),
    ];
  }

  const header = new EmbedBuilder()
    .setColor(defaultEmbedColor(config.cor_embed))
    .setAuthor({ name: `${LEAGUE.emoji} ${numeroRodada}ª RODADA`, iconURL: LEAGUE.logo })
    .setDescription(`**${partidas.length} jogos** · ${LEAGUE.label}`);

  const jogos = partidas.map((p) => buildPartidaJogoEmbed(p, config));
  return [header, ...jogos].slice(0, 10);
}

export function buildErrorEmbed(message: string): EmbedBuilder {
  return new EmbedBuilder().setColor(0xed4245).setAuthor({ name: '❌ ERRO' }).setDescription(message);
}

export function buildSuccessEmbed(title: string, message: string, color = '#5B4B8A'): EmbedBuilder {
  const hex = color.startsWith('#') ? color : undefined;
  return new EmbedBuilder()
    .setColor(hex ? parseEmbedColor(hex) : accentEmbedColor())
    .setAuthor({ name: title, iconURL: LEAGUE.logo })
    .setDescription(message);
}

export function buildRodadaFechadaEmbed(rodada: Rodada, config: GuildConfig): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(defaultEmbedColor(config.cor_embed))
    .setAuthor({ name: `🔒 RODADA ${rodada.numero_rodada} FECHADA`, iconURL: LEAGUE.logo })
    .setDescription(
      '> Palpites encerrados para esta rodada.\n' +
        '> Resultados serão publicados **todos juntos** ao fim da rodada.',
    )
    .setTimestamp();
}

export function buildResultadoRodadaPublicComponents(
  rodadaId: number,
): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`ver-acertos:${rodadaId}`)
        .setLabel('Ver acertos e erros')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('📋'),
      new ButtonBuilder()
        .setCustomId(`ranking-rodada:${rodadaId}:0`)
        .setLabel('Ver ranking')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🏆'),
    ),
  ];
}

/** Embed único com todos os placares da rodada + pódio resumido (mensagem pública). */
export function buildResultadoRodadaPublicacao(
  rodada: Rodada,
  partidas: PartidaRodada[],
  ranking: RankingEntry[],
  config: GuildConfig,
): { embed: EmbedBuilder; components: ActionRowBuilder<ButtonBuilder>[] } {
  const jogos =
    partidas.length === 0
      ? '_Nenhum jogo processado._'
      : partidas
          .map((p) => {
            const pm = p.placar_mandante ?? 0;
            const pv = p.placar_visitante ?? 0;
            return `${p.time_mandante} · **${pm}×${pv}** · ${p.time_visitante}`;
          })
          .join('\n');

  const podium =
    ranking.length === 0
      ? '_Nenhum palpite registrado._'
      : ranking
          .slice(0, 5)
          .map((e, i) => {
            const pos = medal(i + 1);
            return (
              `${pos} <@${e.discord_user_id}> · **${e.total_pontos}** pts · ` +
              `🎯 ${e.acertos_exatos} · ✅ ${e.acertos_vencedor}`
            );
          })
          .join('\n');

  const league = leagueBrandingForRodada(rodada);
  const embed = new EmbedBuilder()
    .setColor(defaultEmbedColor(config.cor_embed))
    .setAuthor({ name: `🏆 RODADA ${rodada.numero_rodada} FINALIZADA`, iconURL: league.logo })
    .setDescription(`> ${league.emoji} ${league.label}`)
    .addFields(
      { name: `⚽ Resultados (${partidas.length} jogos)`, value: jogos.slice(0, 1024), inline: false },
      { name: '🏆 Pódio', value: podium.slice(0, 1024), inline: false },
    )
    .setFooter({ text: 'Clique em Ver acertos e erros para ver os palpites de cada jogo' })
    .setTimestamp();

  return {
    embed,
    components: buildResultadoRodadaPublicComponents(rodada.id),
  };
}

export { RANKING_PAGE_SIZE };
