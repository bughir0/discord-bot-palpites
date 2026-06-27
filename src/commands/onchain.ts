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
import { buscarRodada, buscarRodadaAtual } from '../services/apiFutebol';
import { partidaAbertaParaPalpite } from '../services/pontuacao';
import { publicarEmbedRodada, sincronizarBotoesRodada } from '../services/publicarRodada';
import type { BotCommand } from '../bot/types';
import { getDb } from '../db/database';
import type { Rodada, PartidaRodada } from '../types';

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
      const canal = interaction.options.getChannel('canal') ?? null;
      const canalId =
        (canal && 'id' in canal ? canal.id : null) ??
        getCanalPalpites(config, 'copa') ??
        interaction.channelId;

      const { rodada, partidas } = rodadaService.getDadosRodadaCopaAberta(interaction.guildId);

      await publicarEmbedRodada(interaction.client, rodada, partidas, config, canalId);

      await interaction.editReply({
        embeds: [
          buildSuccessEmbed(
            '✅ Embed Copa reenviado!',
            `A **${rodada.numero_rodada}ª rodada** da Copa foi publicada novamente em <#${canalId}> com **${partidas.length} jogos**.`,
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

export const abrirRodadaCopaCmd: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('abrir-rodada-copa')
    .setDescription('[Admin] Abre rodada Copa no modo CHZ por transferencia (sem contrato)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addIntegerOption((o) =>
      o.setName('rodada').setDescription('Numero da rodada na API Futebol').setMinValue(1),
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

    let numeroRodada = interaction.options.getInteger('rodada');
    if (numeroRodada == null) {
      const atual = await buscarRodadaAtual(campeonatoId);
      if (!atual) {
        await interaction.editReply({
          embeds: [
            buildErrorEmbed(
              'API nao retornou a rodada atual da Copa. ' +
                'Informe manualmente: `/abrir-rodada-copa rodada:1` (fase de grupos).',
            ),
          ],
        });
        return;
      }
      numeroRodada = atual;
    }

    try {
      const rodadaApi = await buscarRodada(campeonatoId, numeroRodada);
      const partidasAgendadas = rodadaApi.partidas.filter((p) =>
        partidaAbertaParaPalpite(p.status, p.data_realizacao_iso),
      );
      if (partidasAgendadas.length === 0) {
        await interaction.editReply({
          embeds: [buildErrorEmbed(`A rodada ${numeroRodada} nao tem jogos agendados.`)],
        });
        return;
      }

      let rodada = rodadaService.getRodadaByNumero(
        interaction.guildId,
        numeroRodada,
        campeonatoId,
      );
      let partidas = rodada ? rodadaService.getPartidasRodada(rodada.id) : [];

      if (rodada && rodada.modalidade === 'copa') {
        await sincronizarBotoesRodada(interaction.client, rodada);
        await interaction.editReply({
          embeds: [
            buildSuccessEmbed(
              'CHZ ja estava ativo',
              `A rodada ${numeroRodada} ja esta em modo CHZ por transferencia.\n` +
                `Os botoes **Palpitar gratis** e **Bolao CHZ** foram atualizados na mensagem da rodada.`,
            ),
          ],
        });
        return;
      }

      if (!rodada) {
        const abertaCopa = rodadaService.getRodadaAbertaPorCampeonato(
          interaction.guildId,
          campeonatoId,
        );
        if (abertaCopa && abertaCopa.numero_rodada !== numeroRodada) {
          await interaction.editReply({
            embeds: [
              buildErrorEmbed(
                `Ja existe rodada Copa ${abertaCopa.numero_rodada} aberta. Feche-a antes de abrir a ${numeroRodada}.`,
              ),
            ],
          });
          return;
        }

        const abertaComNumero =
          abertaCopa && abertaCopa.numero_rodada === numeroRodada ? abertaCopa : null;
        if (abertaComNumero) {
          rodada = abertaComNumero;
          partidas = rodadaService.getPartidasRodada(rodada.id);
        } else {
          const abertura = await rodadaService.abrirRodada(
            interaction.guildId,
            canalId,
            numeroRodada,
            campeonatoId,
            rodadaApi,
          );
          rodada = abertura.rodada;
          partidas = abertura.partidas;
        }
      }

      getDb()
        .prepare(
          `UPDATE rodadas
           SET modalidade = 'copa', entrada_chz_wei = ?
           WHERE id = ?`,
        )
        .run(entradaWei.toString(), rodada.id);
      rodada.modalidade = 'copa';
      rodada.entrada_chz_wei = entradaWei.toString();

      rodada = rodadaService.getRodadaById(rodada.id)!;

      if (!rodada.message_id) {
        await publicarEmbedRodada(
          interaction.client,
          rodada,
          partidas,
          guildConfig,
          canalId,
        );
        rodada = rodadaService.getRodadaById(rodada.id)!;
      } else {
        await sincronizarBotoesRodada(interaction.client, rodada);
      }

      await interaction.editReply({
        embeds: [
          buildSuccessEmbed(
            'Modo CHZ por transferencia ativado!',
            `Rodada ${numeroRodada} - entrada ${ethers.formatEther(entradaWei)} CHZ\n` +
              `Destino dos pagamentos: \`${env.chilizPaymentReceiverAddress}\`\n\n` +
              `Na mensagem da rodada: **Palpitar gratis** e **Bolao CHZ**.\n` +
              `Ou use \`/palpite\` e \`/bolao-chz\`.\n\n` +
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
