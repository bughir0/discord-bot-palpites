import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
} from 'discord.js';
import type {
  ChatInputCommandInteraction,
  ButtonInteraction,
  CommandInteraction,
  ModalSubmitInteraction,
  StringSelectMenuInteraction,
} from 'discord.js';
import { ethers } from 'ethers';
import { env, onchainEnabled } from '../config';
import { rodadaService } from '../services/rodadaService';
import { configService, getCanalPalpites, getCanalResultados } from '../services/configService';
import { sessionStore } from '../services/onchain/sessionStore';
import { walletLinkService } from '../services/onchain/walletLinkService';
import { explorerAddrUrl } from '../blockchain/chiliz';
import { buildErrorEmbed, buildSuccessEmbed, buildPalpiteConfirmEmbed, buildPartidaSelect } from '../embeds/builders';
import { bolaoChzDraftStore } from '../services/onchain/bolaoChzDraftStore';
import { buscarRodadaCopa, listarFasesCopaDisponiveis } from '../services/apiFutebol';
import { partidaAbertaParaPalpite } from '../services/pontuacao';
import {
  publicarEmbedRodada,
  garantirEmbedRodadaPublicado,
} from '../services/publicarRodada';
import type { BotCommand } from '../bot/types';
import { getDb } from '../db/database';
import type { GuildConfig, Rodada, PartidaRodada, RodadaApi } from '../types';

function ensureOnchainRead(interaction: CommandInteraction): boolean {
  if (!onchainEnabled) {
    void interaction.reply({
      embeds: [
        buildErrorEmbed(
          'Modo CHZ nao esta configurado. Defina CHILIZ_PAYMENT_RECEIVER_ADDRESS no .env.',
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return false;
  }
  return true;
}

function isAdmin(interaction: ChatInputCommandInteraction): boolean {
  const member = interaction.member;
  if (!member || !('permissions' in member)) return false;
  const perms = member.permissions;
  if (typeof perms === 'string') return false;
  return perms.has(PermissionFlagsBits.ManageGuild);
}

// =====================================================================
// /wallet
// =====================================================================

export const walletCmd: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('wallet')
    .setDescription('Vincule sua wallet Chiliz Chain ao seu Discord')
    .addSubcommand((s) => s.setName('vincular').setDescription('Gera link para conectar sua wallet'))
    .addSubcommand((s) => s.setName('ver').setDescription('Mostra sua wallet vinculada'))
    .addSubcommand((s) => s.setName('remover').setDescription('Remove o vinculo da sua wallet')),
  async execute(interaction) {
    if (!ensureOnchainRead(interaction)) return;
    const sub = interaction.options.getSubcommand();

    if (sub === 'vincular') {
      const pend = walletLinkService.criarVinculacao({
        discordUserId: interaction.user.id,
        discordUsername: interaction.user.username,
      });
      const link = walletLinkService.linkVincular(pend.token);
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('Vincular wallet')
            .setColor(0xdc0728)
            .setDescription(
              `Clique no link abaixo, conecte sua wallet (MetaMask) e assine a mensagem.\nO link expira em 10 minutos.\n\n[Abrir tela de vinculacao](${link})`,
            )
            .setFooter({ text: 'Nenhum CHZ e gasto. So uma assinatura.' }),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (sub === 'ver') {
      const link = walletLinkService.getByDiscord(interaction.user.id);
      if (!link) {
        await interaction.reply({
          embeds: [buildErrorEmbed('Voce ainda nao vinculou nenhuma wallet. Use `/wallet vincular`.')],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('Sua wallet')
            .setColor(0xdc0728)
            .setDescription(
              `\`${link.wallet_address}\`\n\n[Ver no Chiliscan](${explorerAddrUrl(link.wallet_address)})`,
            )
            .setFooter({ text: `Vinculada em ${new Date(link.vinculado_em).toLocaleString('pt-BR')}` }),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (sub === 'remover') {
      getDb()
        .prepare('DELETE FROM wallet_links WHERE discord_user_id = ?')
        .run(interaction.user.id);
      await interaction.reply({
        embeds: [buildSuccessEmbed('Wallet desvinculada', 'Voce pode vincular outra com `/wallet vincular`.')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
  },
};

// =====================================================================
// /bolao-chz (modal de palpites + link de pagamento CHZ)
// =====================================================================

export const bolaoChzCmd: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('bolao-chz')
    .setDescription('Participa do bolão CHZ da rodada Copa (palpites + entrada on-chain)'),
  async execute(interaction) {
    if (!ensureOnchainRead(interaction)) return;
    await replyBolaoChzSelect(interaction);
  },
};

function partidasAbertasBolao(partidas: PartidaRodada[]): PartidaRodada[] {
  return partidas.filter((p) =>
    partidaAbertaParaPalpite(p.status, p.data_realizacao_iso, p.processada),
  );
}

function buildBolaoChzComponents(
  rodadaId: number,
  partidas: PartidaRodada[],
  draftCount: number,
): ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] = [];

  const select = buildPartidaSelect(rodadaId, partidas, {
    selectCustomId: `select-bolao-chz:${rodadaId}`,
    placeholder: 'Escolha o jogo para palpitar',
    emoji: '💰',
  });
  if (select) rows.push(select);

  rows.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`bolao-chz-pagar:${rodadaId}`)
        .setLabel('Ir para pagamento')
        .setStyle(ButtonStyle.Success)
        .setEmoji('💳')
        .setDisabled(draftCount === 0),
    ),
  );

  return rows;
}

function buildBolaoChzPainelContent(draftCount: number, totalJogos: number): string {
  const resumo =
    draftCount === 0
      ? 'Nenhum jogo no rascunho ainda.'
      : `**${draftCount}** jogo${draftCount === 1 ? '' : 's'} no rascunho` +
        (draftCount < totalJogos ? ` _(de ${totalJogos} disponíveis)_` : '');

  return (
    `💰 **Bolão CHZ** — escolha **só os jogos que quiser** (ex.: Brasil).\n` +
    `${resumo}\n` +
    `Quando terminar, clique em **Ir para pagamento** — o link aparece **aqui nesta mensagem** (só você vê).`
  );
}

export async function replyBolaoChzSelect(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  rodadaId?: number,
): Promise<void> {
  if (!interaction.guildId) return;
  const rodada = rodadaId
    ? rodadaService.getRodadaById(rodadaId)
    : rodadaService.getRodadaCopaAberta(interaction.guildId);

  if (!rodada || rodada.status !== 'aberta' || rodada.modalidade !== 'copa') {
    await interaction.reply({
      embeds: [buildErrorEmbed('Bolão CHZ indisponivel nesta rodada.')],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const partidas = rodadaService.getPartidasRodada(rodada.id);
  const abertas = partidasAbertasBolao(partidas);
  if (abertas.length === 0) {
    await interaction.reply({
      embeds: [buildErrorEmbed('Nenhum jogo aberto para palpite nesta rodada.')],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const draftCount = bolaoChzDraftStore.count(interaction.user.id, rodada.id);

  await interaction.reply({
    content: buildBolaoChzPainelContent(draftCount, abertas.length),
    embeds: [
      new EmbedBuilder()
        .setColor(0xdc0728)
        .setDescription(
          '_Você não precisa palpitar em todos os jogos — escolha apenas os que quiser participar no bolão._',
        ),
    ],
    components: buildBolaoChzComponents(rodada.id, abertas, draftCount),
    flags: MessageFlags.Ephemeral,
  });
}

export async function handleBolaoChzSelectMenu(
  interaction: StringSelectMenuInteraction,
  rodadaId: number,
): Promise<void> {
  const partidaId = Number(interaction.values[0]);
  const partida = rodadaService.getPartida(rodadaId, partidaId);

  if (!partida) {
    await interaction.reply({
      embeds: [buildErrorEmbed('Partida não encontrada.')],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (
    !partidaAbertaParaPalpite(partida.status, partida.data_realizacao_iso, partida.processada)
  ) {
    await interaction.reply({
      embeds: [buildErrorEmbed('Palpites encerrados para este jogo.')],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId(`modal-bolao-chz:${rodadaId}:${partidaId}`)
    .setTitle(`${partida.time_mandante} X ${partida.time_visitante}`.slice(0, 45));

  const mandanteInput = new TextInputBuilder()
    .setCustomId('mandante')
    .setLabel(`Gols — ${partida.time_mandante}`)
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Ex: 2')
    .setRequired(true)
    .setMaxLength(2);

  const visitanteInput = new TextInputBuilder()
    .setCustomId('visitante')
    .setLabel(`Gols — ${partida.time_visitante}`)
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Ex: 1')
    .setRequired(true)
    .setMaxLength(2);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(mandanteInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(visitanteInput),
  );

  await interaction.showModal(modal);
}

export async function handleBolaoChzPalpiteModal(
  interaction: ModalSubmitInteraction,
  rodadaId: number,
  partidaId: number,
): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const mandanteStr = interaction.fields.getTextInputValue('mandante');
  const visitanteStr = interaction.fields.getTextInputValue('visitante');
  const mandante = Number(mandanteStr);
  const visitante = Number(visitanteStr);

  if (
    Number.isNaN(mandante) ||
    Number.isNaN(visitante) ||
    mandante < 0 ||
    visitante < 0 ||
    mandante > 20 ||
    visitante > 20
  ) {
    await interaction.editReply({
      embeds: [buildErrorEmbed('Placar inválido. Use números de 0 a 20.')],
    });
    return;
  }

  const rodada = rodadaService.getRodadaById(rodadaId);
  if (!rodada || rodada.modalidade !== 'copa') {
    await interaction.editReply({ embeds: [buildErrorEmbed('Rodada invalida.')] });
    return;
  }

  const partida = rodadaService.getPartida(rodadaId, partidaId);
  if (!partida) {
    await interaction.editReply({ embeds: [buildErrorEmbed('Partida não encontrada.')] });
    return;
  }

  if (
    !partidaAbertaParaPalpite(partida.status, partida.data_realizacao_iso, partida.processada)
  ) {
    await interaction.editReply({
      embeds: [buildErrorEmbed('Palpites encerrados para este jogo.')],
    });
    return;
  }

  const config = configService.getOrCreate(interaction.guildId!);
  const partidas = rodadaService.getPartidasRodada(rodadaId);
  const abertas = partidasAbertasBolao(partidas);
  const jaPalpitado = bolaoChzDraftStore.getPalpitados(interaction.user.id, rodadaId).has(partidaId);

  bolaoChzDraftStore.salvar(interaction.user.id, rodadaId, partidaId, mandante, visitante);

  const draftCount = bolaoChzDraftStore.count(interaction.user.id, rodadaId);

  await interaction.editReply({
    embeds: [
      buildPalpiteConfirmEmbed(partida, mandante, visitante, config, jaPalpitado, {
        contexto: 'bolao-rascunho',
        rodada,
      }),
    ],
    content: buildBolaoChzPainelContent(draftCount, abertas.length),
    components: buildBolaoChzComponents(rodadaId, abertas, draftCount),
  });
}

export async function finalizarBolaoChz(
  interaction: ChatInputCommandInteraction | ButtonInteraction | ModalSubmitInteraction,
  rodadaId: number,
  options?: {
    ultimoPalpite?: {
      partida: PartidaRodada;
      mandante: number;
      visitante: number;
      updated: boolean;
    };
  },
): Promise<void> {
  const rodada = rodadaService.getRodadaById(rodadaId);
  if (!rodada || rodada.modalidade !== 'copa') {
    const payload = { embeds: [buildErrorEmbed('Rodada invalida.')] };
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(payload);
    } else {
      await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
    }
    return;
  }

  const palpites = bolaoChzDraftStore
    .toPalpiteSessions(interaction.user.id, rodadaId)
    .filter((p) => {
      const partida = rodadaService.getPartida(rodadaId, p.partidaId);
      return (
        partida &&
        partidaAbertaParaPalpite(
          partida.status,
          partida.data_realizacao_iso,
          partida.processada,
        )
      );
    });

  if (palpites.length === 0) {
    const payload = {
      embeds: [
        buildErrorEmbed(
          'Nenhum jogo aberto no rascunho. Escolha partidas que ainda não começaram ou já encerraram.',
        ),
      ],
    };
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(payload);
    } else {
      await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
    }
    return;
  }

  const session = sessionStore.criar({
    discordUserId: interaction.user.id,
    discordUsername: interaction.user.username,
    rodadaId,
    palpites,
  });

  bolaoChzDraftStore.limpar(interaction.user.id, rodadaId);

  const link = sessionStore.linkBolao(session.session_id);
  const entradaCHZ = ethers.formatEther(
    BigInt(
      rodada.entrada_chz_wei ?? ethers.parseEther(env.copaEntradaCHZDefault).toString(),
    ),
  );

  const embeds = [
    new EmbedBuilder()
      .setTitle('Link de pagamento do bolão')
      .setColor(0xdc0728)
      .setDescription(
        `**${palpites.length}** jogo${palpites.length === 1 ? '' : 's'} neste bolão · entrada **${entradaCHZ} CHZ**\n` +
          `Expira em **${env.apostaSessionTtlMin} min**.\n\n` +
          `👇 **Clique aqui para pagar:**\n${link}\n\n` +
          `_Abra no navegador, conecte a wallet e confirme a transferência CHZ._`,
      )
      .setFooter({ text: 'Transferencia CHZ validada na blockchain — nao e aposta esportiva.' }),
  ];

  if (options?.ultimoPalpite) {
    const config = configService.getOrCreate(interaction.guildId!);
    embeds.unshift(
      buildPalpiteConfirmEmbed(
        options.ultimoPalpite.partida,
        options.ultimoPalpite.mandante,
        options.ultimoPalpite.visitante,
        config,
        options.ultimoPalpite.updated,
        { contexto: 'bolao-rascunho', rodada },
      ),
    );
  }

  const payload = {
    embeds,
    content: '✅ **Link gerado!** Só você vê esta mensagem — use o link acima para pagar.',
    components: [],
  };

  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(payload);
  } else {
    await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
  }
}

// =====================================================================
// /reenviar-rodada-copa (admin) - republica embed da rodada Copa aberta
// =====================================================================

export const reenviarRodadaCopaCmd: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('reenviar-rodada-copa')
    .setDescription('Republica o embed da rodada Copa aberta (ex.: mensagem apagada ou embed desatualizado)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addIntegerOption((o) =>
      o
        .setName('rodada')
        .setDescription('Fase da Copa (1=Grupos, 2=Segunda Fase…). Vazio = todas abertas')
        .setMinValue(1)
        .setMaxValue(7),
    )
    .addChannelOption((o) =>
      o
        .setName('canal')
        .setDescription('Canal de destino (padrao: canal-copa-palpites do /config)')
        .addChannelTypes(ChannelType.GuildText),
    ),
  async execute(interaction) {
    if (!interaction.guildId || !interaction.channelId) return;
    if (!isAdmin(interaction)) {
      await interaction.reply({
        embeds: [buildErrorEmbed('Apenas administradores podem usar este comando.')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const config = configService.getOrCreate(interaction.guildId);
      const campeonatoId = env.copaCampeonatoId ?? config.campeonato_id;
      const canal = interaction.options.getChannel('canal') ?? null;
      const canalId =
        (canal && 'id' in canal ? canal.id : null) ??
        getCanalPalpites(config, 'copa') ??
        interaction.channelId;

      const faseOption = interaction.options.getInteger('rodada');
      const rodadasAlvo: Rodada[] =
        faseOption != null
          ? [rodadaService.getRodadaCopaPorNumero(interaction.guildId, faseOption, campeonatoId)].filter(
              (r): r is Rodada => r != null,
            )
          : (getDb()
              .prepare(
                `SELECT * FROM rodadas
             WHERE guild_id = ? AND campeonato_id = ? AND modalidade = 'copa' AND status = 'aberta'
             ORDER BY numero_rodada ASC`,
              )
              .all(interaction.guildId, campeonatoId) as Rodada[]);

      if (rodadasAlvo.length === 0) {
        await interaction.editReply({
          embeds: [
            buildErrorEmbed(
              faseOption != null
                ? `Fase ${faseOption} da Copa nao encontrada ou nao esta aberta.`
                : 'Nenhuma fase da Copa aberta. Use `/abrir-rodada-copa` primeiro.',
            ),
          ],
        });
        return;
      }

      const linhas: string[] = [];
      for (const rodada of rodadasAlvo) {
        const partidasAntes = rodadaService.getPartidasRodada(rodada.id).length;
        const sync = await rodadaService.sincronizarPartidasApi(rodada.id);
        const partidas = rodadaService.getPartidasRodada(rodada.id);
        await publicarEmbedRodada(interaction.client, rodada, partidas, config, canalId);
        const syncMsg = sync.adicionadas > 0 ? ` (+${sync.adicionadas} da API)` : '';
        linhas.push(
          `• Fase **${rodada.numero_rodada}** — **${partidas.length}** jogos${syncMsg} _(antes: ${partidasAntes})_`,
        );
      }

      await interaction.editReply({
        embeds: [
          buildSuccessEmbed(
            '✅ Embed(s) Copa reenviado(s)!',
            `Publicado em <#${canalId}>:\n\n${linhas.join('\n')}`,
            config.cor_embed,
          ),
        ],
      });
    } catch (err) {
      await interaction.editReply({
        embeds: [buildErrorEmbed((err as Error).message)],
      });
    }
  },
};

// =====================================================================
// /abrir-rodada-copa (admin) - abre rodada CHZ sem contrato
// =====================================================================

type ResultadoFaseCopa =
  | { status: 'aberta' | 'republicada' | 'ja_ativa'; numeroFase: number; nomeFase: string; jogos: number }
  | { status: 'sem_jogos'; numeroFase: number; nomeFase: string; jogos: number };

async function ativarFaseCopaChz(
  interaction: ChatInputCommandInteraction,
  guildConfig: GuildConfig,
  campeonatoId: number,
  canalId: string,
  entradaWei: bigint,
  numeroFase: number,
  rodadaApi: RodadaApi,
): Promise<ResultadoFaseCopa> {
  let rodada = rodadaService.getRodadaByNumero(interaction.guildId!, numeroFase, campeonatoId);
  let partidas = rodada ? rodadaService.getPartidasRodada(rodada.id) : [];
  let jaExistia = Boolean(rodada?.modalidade === 'copa');

  if (rodada && rodada.modalidade === 'copa') {
    await rodadaService.sincronizarPartidasApi(rodada.id);
    partidas = rodadaService.getPartidasRodada(rodada.id);
  }

  if (!rodada) {
    const abertura = await rodadaService.abrirRodadaCopa(
      interaction.guildId!,
      canalId,
      numeroFase,
      campeonatoId,
      rodadaApi,
    );
    rodada = abertura.rodada;
    partidas = abertura.partidas;
    jaExistia = false;
  } else if (rodada.modalidade !== 'copa') {
    partidas = rodadaService.getPartidasRodada(rodada.id);
  }

  getDb()
    .prepare(
      `UPDATE rodadas
       SET modalidade = 'copa', entrada_chz_wei = ?, channel_id = ?
       WHERE id = ?`,
    )
    .run(entradaWei.toString(), canalId, rodada.id);
  rodada.modalidade = 'copa';
  rodada.entrada_chz_wei = entradaWei.toString();
  rodada.channel_id = canalId;

  rodada = rodadaService.getRodadaById(rodada.id)!;

  const pub = await garantirEmbedRodadaPublicado(
    interaction.client,
    rodada,
    partidas,
    guildConfig,
    canalId,
  );
  rodada = rodadaService.getRodadaById(rodada.id)!;

  if (pub.publicado && !jaExistia) {
    return { status: 'aberta', numeroFase, nomeFase: rodadaApi.nome, jogos: partidas.length };
  }
  if (pub.publicado && jaExistia) {
    return { status: 'republicada', numeroFase, nomeFase: rodadaApi.nome, jogos: partidas.length };
  }
  return { status: 'ja_ativa', numeroFase, nomeFase: rodadaApi.nome, jogos: partidas.length };
}

export const abrirRodadaCopaCmd: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('abrir-rodada-copa')
    .setDescription('[Admin] Abre fase(s) da Copa no modo CHZ por transferencia (sem contrato)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addIntegerOption((o) =>
      o
        .setName('rodada')
        .setDescription('Fase da Copa (1=Grupos, 2=Segunda Fase, 3=Oitavas…). Vazio = todas disponiveis')
        .setMinValue(1)
        .setMaxValue(7),
    )
    .addStringOption((o) =>
      o
        .setName('entrada-chz')
        .setDescription(`Entrada em CHZ (padrao ${env.copaEntradaCHZDefault})`),
    )
    .addChannelOption((o) =>
      o
        .setName('canal')
        .setDescription('Canal para publicar a rodada (padrao: canal-copa-palpites do /config)')
        .addChannelTypes(ChannelType.GuildText),
    ),
  async execute(interaction) {
    if (!ensureOnchainRead(interaction)) return;
    if (!interaction.guildId) return;
    if (!isAdmin(interaction)) {
      await interaction.reply({
        embeds: [buildErrorEmbed('Apenas administradores podem usar este comando.')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const guildConfig = configService.getOrCreate(interaction.guildId);
    const campeonatoId = env.copaCampeonatoId ?? guildConfig.campeonato_id;
    const canal = interaction.options.getChannel('canal') ?? null;
    const canalId =
      (canal && 'id' in canal ? canal.id : null) ??
      getCanalPalpites(guildConfig, 'copa') ??
      interaction.channelId;

    const entradaInput =
      interaction.options.getString('entrada-chz') ?? env.copaEntradaCHZDefault;
    let entradaWei: bigint;
    try {
      entradaWei = ethers.parseEther(entradaInput);
    } catch {
      await interaction.editReply({
        embeds: [buildErrorEmbed(`Valor invalido: "${entradaInput}". Use formato como "10" ou "5.5".`)],
      });
      return;
    }

    const numeroFaseOption = interaction.options.getInteger('rodada');

    try {
      const fasesParaAbrir =
        numeroFaseOption != null
          ? [
              {
                numeroFase: numeroFaseOption,
                rodadaApi: await buscarRodadaCopa(campeonatoId, numeroFaseOption),
              },
            ]
          : await listarFasesCopaDisponiveis(campeonatoId);

      if (fasesParaAbrir.length === 0) {
        await interaction.editReply({
          embeds: [
            buildErrorEmbed(
              numeroFaseOption != null
                ? `A fase ${numeroFaseOption} nao tem jogos agendados na API.`
                : 'Nenhuma fase da Copa com jogos agendados no momento. Tente informar uma fase: `/abrir-rodada-copa rodada:2`.',
            ),
          ],
        });
        return;
      }

      const resultados: ResultadoFaseCopa[] = [];
      for (const fase of fasesParaAbrir) {
        const { numeroFase, rodadaApi } = fase;
        const agendadas = rodadaApi.partidas.filter((p) =>
          partidaAbertaParaPalpite(p.status, p.data_realizacao_iso),
        );
        if (agendadas.length === 0) {
          resultados.push({
            status: 'sem_jogos',
            numeroFase,
            nomeFase: rodadaApi.nome,
            jogos: 0,
          });
          continue;
        }
        const apiComAgendadas = { ...rodadaApi, partidas: agendadas };
        const resultado = await ativarFaseCopaChz(
          interaction,
          guildConfig,
          campeonatoId,
          canalId,
          entradaWei,
          numeroFase,
          apiComAgendadas,
        );
        resultados.push(resultado);
      }

      const abertas = resultados.filter((r) => r.status === 'aberta');
      const republicadas = resultados.filter((r) => r.status === 'republicada');
      const jaAtivas = resultados.filter((r) => r.status === 'ja_ativa');

      const linhas = resultados.map((r) => {
        if (r.status === 'sem_jogos') return `• **${r.nomeFase}** — sem jogos agendados`;
        if (r.status === 'republicada') {
          return `• **${r.nomeFase}** (fase ${r.numeroFase}) — embed republicado (**${r.jogos}** jogos)`;
        }
        if (r.status === 'ja_ativa') {
          return `• **${r.nomeFase}** (fase ${r.numeroFase}) — ja ativa, botoes atualizados (${r.jogos} jogos)`;
        }
        return `• **${r.nomeFase}** (fase ${r.numeroFase}) — aberta com **${r.jogos}** jogos`;
      });

      const titulo =
        abertas.length > 0
          ? `Copa CHZ — ${abertas.length} fase(s) aberta(s)`
          : republicadas.length > 0
            ? `Copa CHZ — ${republicadas.length} embed(s) republicado(s)`
            : jaAtivas.length > 0
              ? 'Copa CHZ — fases ja estavam ativas'
              : 'Copa CHZ — nenhuma fase aberta';

      await interaction.editReply({
        embeds: [
          buildSuccessEmbed(
            titulo,
            `Entrada ${ethers.formatEther(entradaWei)} CHZ por fase\n` +
              `Destino: \`${env.chilizPaymentReceiverAddress}\`\n\n` +
              `${linhas.join('\n')}\n\n` +
              `Publicado em <#${canalId}>.\n` +
              `Resultados: <#${getCanalResultados(guildConfig, 'copa') ?? canalId}>`,
          ),
        ],
      });
    } catch (err) {
      await interaction.editReply({
        embeds: [buildErrorEmbed(`Erro: ${(err as Error).message}`)],
      });
    }
  },
};

export const onchainCommands: BotCommand[] = [
  walletCmd,
  bolaoChzCmd,
  reenviarRodadaCopaCmd,
  abrirRodadaCopaCmd,
];
