import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  MessageFlags,
} from 'discord.js';
import type {
  CommandInteraction,
  ButtonInteraction,
  StringSelectMenuInteraction,
  ModalSubmitInteraction,
} from 'discord.js';
import {
  ApiFutebolError,
  buscarRodada,
  buscarRodadaAtual,
  getApiUsageToday,
  isApiQuotaExhausted,
} from '../services/apiFutebol';
import { configService } from '../services/configService';
import { formatMotivoPendencia, partidaAbertaParaPalpite, partidaJaIniciou } from '../services/pontuacao';
import { publicarResultadosRodada } from '../services/publicarResultados';
import { rodadaService } from '../services/rodadaService';
import { publicarEmbedRodada } from '../services/publicarRodada';
import {
  buildConfigEmbed,
  buildErrorEmbed,
  buildMeusPalpitesEmbed,
  buildPalpiteConfirmEmbed,
  buildPartidaSelect,
  buildProximosJogosEmbeds,
  buildRankingComponents,
  buildRankingEmbed,
  buildResultadoPartidaEmbed,
  buildRodadaComponents,
  buildRodadaEmbeds,
  buildRodadaFechadaEmbed,
  buildSuccessEmbed,
} from '../embeds/builders';
import type { BotCommand } from '../bot/types';
import type { PartidaRodada, RodadaApi } from '../types';

function isAdmin(interaction: CommandInteraction | ButtonInteraction): boolean {
  const member = interaction.member;
  if (!member || !('permissions' in member)) return false;
  const perms = member.permissions;
  if (typeof perms === 'string') return false;
  return perms.has(PermissionFlagsBits.ManageGuild);
}

async function denyUnlessAdmin(interaction: CommandInteraction): Promise<boolean> {
  if (isAdmin(interaction)) return true;
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply({
      embeds: [buildErrorEmbed('Apenas administradores podem usar este comando.')],
    });
  } else {
    await interaction.reply({
      embeds: [buildErrorEmbed('Apenas administradores podem usar este comando.')],
      flags: MessageFlags.Ephemeral,
    });
  }
  return false;
}

function partidasAbertas(partidas: PartidaRodada[]): PartidaRodada[] {
  return partidas.filter((p) => partidaAbertaParaPalpite(p.status, p.data_realizacao_iso));
}

/** Jogos que o membro ainda pode palpitar (abertos e sem palpite registrado) */
function partidasDisponiveisParaUsuario(rodadaId: number, userId: string): PartidaRodada[] {
  const palpitados = new Set(
    rodadaService.getPalpitesUsuario(rodadaId, userId).map((p) => p.partida_id),
  );
  return partidasAbertas(rodadaService.getPartidasRodada(rodadaId)).filter(
    (p) => !palpitados.has(p.partida_id),
  );
}

async function replyPalpiteSelect(
  interaction: ButtonInteraction,
  rodadaId: number,
): Promise<void> {
  const config = configService.getOrCreate(interaction.guildId!);
  const todasAbertas = partidasAbertas(rodadaService.getPartidasRodada(rodadaId));
  const disponiveis = partidasDisponiveisParaUsuario(rodadaId, interaction.user.id);
  const palpitados = todasAbertas.length - disponiveis.length;

  if (disponiveis.length === 0) {
    await interaction.reply({
      embeds: [
        buildSuccessEmbed(
          '✅ Todos palpitados!',
          todasAbertas.length === 0
            ? '_Nenhum jogo aberto para palpite no momento._'
            : `Você já palpitou em todos os **${todasAbertas.length}** jogos abertos desta rodada.\n\n` +
                'Use **Meus palpites** para revisar ou editar um palpite.',
          config.cor_embed,
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const select = buildPartidaSelect(rodadaId, disponiveis);
  const content =
    palpitados > 0
      ? `⚽ **Escolha o jogo** · **${palpitados}/${todasAbertas.length}** já palpitados _(só aparecem os que faltam)_`
      : '⚽ **Escolha o jogo** que deseja palpitar:';

  await interaction.reply({
    content,
    components: select ? [select] : [],
    flags: MessageFlags.Ephemeral,
  });
}

export const abrirRodada: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('abrir-rodada')
    .setDescription('Abre uma rodada do Brasileirão para palpites')
    .addIntegerOption((opt) =>
      opt
        .setName('rodada')
        .setDescription('Número da rodada (vazio = rodada atual)')
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(38),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    if (!interaction.guildId || !interaction.channelId) return;
    if (!(await denyUnlessAdmin(interaction))) return;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const config = configService.getOrCreate(interaction.guildId);
      const canalId = config.canal_palpites_id ?? interaction.channelId;
      const numeroRodadaOption = interaction.options.getInteger('rodada');

      const abrir = async (numero: number, rodadaApiCache?: RodadaApi): Promise<void> => {
        const { rodada, partidas } = await rodadaService.abrirRodada(
          interaction.guildId!,
          canalId,
          numero,
          config.campeonato_id,
          rodadaApiCache,
        );
        await publicarEmbedRodada(interaction.client, rodada, partidas, config, canalId);
        await interaction.editReply({
          embeds: [
            buildSuccessEmbed(
              '✅ Rodada aberta!',
              `A **${numero}ª rodada** foi publicada em <#${canalId}> com **${partidas.length} jogos**.`,
              config.cor_embed,
            ),
          ],
        });
      };

      if (numeroRodadaOption) {
        await abrir(numeroRodadaOption);
        return;
      }

      const resultado = await rodadaService.detectarProximaRodadaAbertaApi(
        interaction.guildId,
        config.campeonato_id,
      );

      switch (resultado.tipo) {
        case 'abrir':
          await abrir(resultado.numero, resultado.rodadaApi);
          return;
        case 'ja_em_andamento':
          await interaction.editReply({
            embeds: [
              buildErrorEmbed(
                `A **${resultado.numero}ª rodada** já está **${resultado.status}** neste servidor. ` +
                  `Aguarde os jogos terminarem para abrir a próxima.`,
              ),
            ],
          });
          return;
        case 'aguardar':
          await interaction.editReply({
            embeds: [
              buildErrorEmbed(
                `A **${resultado.tentou}ª rodada** ainda não tem jogos agendados na API. ` +
                  `Tente novamente mais tarde ou informe o número manualmente.`,
              ),
            ],
          });
          return;
        case 'erro':
          await interaction.editReply({ embeds: [buildErrorEmbed(resultado.motivo)] });
          return;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido';
      await interaction.editReply({ embeds: [buildErrorEmbed(message)] });
    }
  },
};

export const reenviarRodada: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('reenviar-rodada')
    .setDescription('Republica o embed da rodada aberta (ex.: mensagem apagada)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    if (!interaction.guildId || !interaction.channelId) return;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const config = configService.getOrCreate(interaction.guildId);
      const canalId = config.canal_palpites_id ?? interaction.channelId;
      const { rodada, partidas } = rodadaService.getDadosRodadaAberta(interaction.guildId);

      await publicarEmbedRodada(interaction.client, rodada, partidas, config, canalId);

      await interaction.editReply({
        embeds: [
          buildSuccessEmbed(
            '✅ Embed reenviado!',
            `A **${rodada.numero_rodada}ª rodada** foi publicada novamente em <#${canalId}> (**${partidas.length} jogos**).`,
            config.cor_embed,
          ),
        ],
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido';
      await interaction.editReply({ embeds: [buildErrorEmbed(message)] });
    }
  },
};

export const fecharRodada: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('fechar-rodada')
    .setDescription('Encerra palpites da rodada aberta')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    if (!interaction.guildId) return;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const config = configService.getOrCreate(interaction.guildId);
      const rodada = rodadaService.fecharRodada(interaction.guildId);

      if (rodada.message_id && rodada.channel_id) {
        try {
          const channel = await interaction.client.channels.fetch(rodada.channel_id);
          if (channel?.isTextBased()) {
            const msg = await channel.messages.fetch(rodada.message_id);
            await msg.edit({
              embeds: [buildRodadaFechadaEmbed(rodada, config)],
              components: [],
            });
          }
        } catch {
          // mensagem original pode ter sido apagada
        }
      }

      await interaction.editReply({
        embeds: [
          buildSuccessEmbed(
            '🔒 Rodada fechada',
            `A rodada **${rodada.numero_rodada}** não aceita mais palpites.`,
            config.cor_embed,
          ),
        ],
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido';
      await interaction.editReply({ embeds: [buildErrorEmbed(message)] });
    }
  },
};

export const palpite: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('palpite')
    .setDescription('Registra seu palpite para um jogo')
    .addIntegerOption((opt) =>
      opt.setName('jogo').setDescription('ID do jogo (mostrado no embed da rodada)').setRequired(true),
    )
    .addIntegerOption((opt) =>
      opt.setName('mandante').setDescription('Gols do time mandante').setRequired(true).setMinValue(0).setMaxValue(20),
    )
    .addIntegerOption((opt) =>
      opt.setName('visitante').setDescription('Gols do time visitante').setRequired(true).setMinValue(0).setMaxValue(20),
    ),

  async execute(interaction) {
    if (!interaction.guildId) return;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const rodada = rodadaService.getRodadaAberta(interaction.guildId);
      if (!rodada) {
        await interaction.editReply({ embeds: [buildErrorEmbed('Nenhuma rodada aberta no momento.')] });
        return;
      }

      const partidaId = interaction.options.getInteger('jogo', true);
      const mandante = interaction.options.getInteger('mandante', true);
      const visitante = interaction.options.getInteger('visitante', true);
      const config = configService.getOrCreate(interaction.guildId);

      const existente = rodadaService
        .getPalpitesUsuario(rodada.id, interaction.user.id)
        .find((p) => p.partida_id === partidaId);

      rodadaService.salvarPalpite(
        rodada.id,
        partidaId,
        interaction.user.id,
        interaction.user.username,
        mandante,
        visitante,
      );

      const partida = rodadaService.getPartida(rodada.id, partidaId)!;

      await interaction.editReply({
        embeds: [
          buildPalpiteConfirmEmbed(partida, mandante, visitante, config, Boolean(existente)),
        ],
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido';
      await interaction.editReply({ embeds: [buildErrorEmbed(message)] });
    }
  },
};

export const meusPalpites: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('meus-palpites')
    .setDescription('Mostra seus palpites da rodada atual'),

  async execute(interaction) {
    if (!interaction.guildId) return;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const rodada = rodadaService.getRodadaAberta(interaction.guildId);
    if (!rodada) {
      await interaction.editReply({ embeds: [buildErrorEmbed('Nenhuma rodada aberta no momento.')] });
      return;
    }

    const config = configService.getOrCreate(interaction.guildId);
    const palpites = rodadaService.getPalpitesUsuario(rodada.id, interaction.user.id);
    const partidas = rodadaService.getPartidasRodada(rodada.id);

    await interaction.editReply({
      embeds: [buildMeusPalpitesEmbed(palpites, partidas, config, interaction.user.username)],
    });
  },
};

export const ranking: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('ranking')
    .setDescription('Mostra o ranking de palpiteiros')
    .addStringOption((opt) =>
      opt
        .setName('tipo')
        .setDescription('Ranking da rodada ou geral')
        .setRequired(false)
        .addChoices(
          { name: 'Rodada atual', value: 'rodada' },
          { name: 'Geral (temporada)', value: 'geral' },
        ),
    ),

  async execute(interaction) {
    if (!interaction.guildId) return;
    await interaction.deferReply();

    const config = configService.getOrCreate(interaction.guildId);
    const tipo = interaction.options.getString('tipo') ?? 'rodada';

    if (tipo === 'geral') {
      const entries = rodadaService.getRankingGeral(interaction.guildId);
      await interaction.editReply({
        embeds: [buildRankingEmbed(entries, config, 'Ranking Geral')],
        components: buildRankingComponents('geral', 0, entries.length),
      });
      return;
    }

    const rodada = rodadaService.getRodadaAberta(interaction.guildId);
    if (!rodada) {
      await interaction.editReply({
        embeds: [buildErrorEmbed('Nenhuma rodada aberta. Use `/ranking tipo:Geral`.')],
      });
      return;
    }

    const entries = rodadaService.getRankingRodada(rodada.id);
    await interaction.editReply({
      embeds: [buildRankingEmbed(entries, config, `${rodada.numero_rodada}ª Rodada`, 0, rodada)],
      components: buildRankingComponents(rodada.id, 0, entries.length),
    });
  },
};

export const proximosJogos: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('proximos-jogos')
    .setDescription('Lista os jogos de uma rodada do Brasileirão')
    .addIntegerOption((opt) =>
      opt.setName('rodada').setDescription('Número da rodada (vazio = atual)').setRequired(false).setMinValue(1),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    if (!interaction.guildId) return;
    if (!(await denyUnlessAdmin(interaction))) return;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const config = configService.getOrCreate(interaction.guildId);
      let numeroRodada = interaction.options.getInteger('rodada');

      if (!numeroRodada) {
        numeroRodada = await buscarRodadaAtual(config.campeonato_id);
        if (!numeroRodada) {
          await interaction.editReply({ embeds: [buildErrorEmbed('Rodada atual não encontrada.')] });
          return;
        }
      }

      const rodadaApi = await buscarRodada(config.campeonato_id, numeroRodada);

      const partidas = rodadaApi.partidas.map((p) => ({
        id: 0,
        rodada_id: 0,
        partida_id: p.partida_id,
        time_mandante: p.time_mandante.nome_popular,
        time_visitante: p.time_visitante.nome_popular,
        sigla_mandante: p.time_mandante.sigla,
        sigla_visitante: p.time_visitante.sigla,
        escudo_mandante: p.time_mandante.escudo,
        escudo_visitante: p.time_visitante.escudo,
        estadio: p.estadio?.nome_popular ?? null,
        data_realizacao: p.data_realizacao,
        hora_realizacao: p.hora_realizacao,
        data_realizacao_iso: p.data_realizacao_iso,
        status: p.status,
        placar_mandante: p.placar_mandante,
        placar_visitante: p.placar_visitante,
        processada: 0,
      }));

      await interaction.editReply({
        embeds: buildProximosJogosEmbeds(numeroRodada, partidas, config),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido';
      await interaction.editReply({ embeds: [buildErrorEmbed(message)] });
    }
  },
};

export const configCmd: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('config')
    .setDescription('Configurações do bot de palpites')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) => sub.setName('ver').setDescription('Mostra configurações atuais'))
    .addSubcommand((sub) =>
      sub
        .setName('canal-palpites')
        .setDescription('Canal de palpites do Brasileirão')
        .addChannelOption((opt) =>
          opt.setName('canal').setDescription('Canal para rodadas do Brasileirão').addChannelTypes(ChannelType.GuildText).setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('canal-resultados')
        .setDescription('Canal de resultados do Brasileirão')
        .addChannelOption((opt) =>
          opt.setName('canal').setDescription('Canal para resultados do Brasileirão').addChannelTypes(ChannelType.GuildText).setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('canal-copa-palpites')
        .setDescription('Canal de palpites da Copa CHZ')
        .addChannelOption((opt) =>
          opt.setName('canal').setDescription('Canal para rodadas da Copa').addChannelTypes(ChannelType.GuildText).setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('canal-copa-resultados')
        .setDescription('Canal de resultados da Copa CHZ')
        .addChannelOption((opt) =>
          opt.setName('canal').setDescription('Canal para resultados da Copa').addChannelTypes(ChannelType.GuildText).setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('pontuacao')
        .setDescription('Define pontos por acerto')
        .addIntegerOption((opt) =>
          opt.setName('exato').setDescription('Pontos por placar exato').setRequired(true).setMinValue(1).setMaxValue(100),
        )
        .addIntegerOption((opt) =>
          opt.setName('vencedor').setDescription('Pontos por acertar vencedor/empate').setRequired(true).setMinValue(1).setMaxValue(100),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('cor')
        .setDescription('Cor dos embeds (hex)')
        .addStringOption((opt) =>
          opt.setName('hex').setDescription('Ex: #5B4B8A').setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('auto-verificar')
        .setDescription('Ativa/desativa verificação automática de resultados')
        .addBooleanOption((opt) => opt.setName('ativo').setDescription('Ligado ou desligado').setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('notificar')
        .setDescription('Ativa/desativa notificações de resultados')
        .addBooleanOption((opt) => opt.setName('ativo').setDescription('Ligado ou desligado').setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('auto-abrir-rodada')
        .setDescription('Abre a rodada atual automaticamente no canal de palpites')
        .addBooleanOption((opt) => opt.setName('ativo').setDescription('Ligado ou desligado').setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('cargo-palpites')
        .setDescription('Cargo marcado ao abrir rodada (incentivo para palpitar)')
        .addRoleOption((opt) =>
          opt.setName('cargo').setDescription('Cargo a mencionar (vazio = remover)').setRequired(false),
        ),
    ),

  async execute(interaction) {
    if (!interaction.guildId) return;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const sub = interaction.options.getSubcommand(true);

    try {
      if (sub === 'ver') {
        const config = configService.getOrCreate(interaction.guildId);
        await interaction.editReply({ embeds: [buildConfigEmbed(config)] });
        return;
      }

      if (sub === 'canal-palpites') {
        const canal = interaction.options.getChannel('canal', true);
        configService.update(interaction.guildId, { canal_palpites_id: canal.id });
        await interaction.editReply({
          embeds: [buildSuccessEmbed('✅ Brasileirão', `Canal de palpites: ${canal}`)],
        });
        return;
      }

      if (sub === 'canal-resultados') {
        const canal = interaction.options.getChannel('canal', true);
        configService.update(interaction.guildId, { canal_resultados_id: canal.id });
        await interaction.editReply({
          embeds: [buildSuccessEmbed('✅ Brasileirão', `Canal de resultados: ${canal}`)],
        });
        return;
      }

      if (sub === 'canal-copa-palpites') {
        const canal = interaction.options.getChannel('canal', true);
        configService.update(interaction.guildId, { canal_copa_palpites_id: canal.id });
        await interaction.editReply({
          embeds: [buildSuccessEmbed('✅ Copa CHZ', `Canal de palpites: ${canal}`)],
        });
        return;
      }

      if (sub === 'canal-copa-resultados') {
        const canal = interaction.options.getChannel('canal', true);
        configService.update(interaction.guildId, { canal_copa_resultados_id: canal.id });
        await interaction.editReply({
          embeds: [buildSuccessEmbed('✅ Copa CHZ', `Canal de resultados: ${canal}`)],
        });
        return;
      }

      if (sub === 'pontuacao') {
        const exato = interaction.options.getInteger('exato', true);
        const vencedor = interaction.options.getInteger('vencedor', true);
        configService.update(interaction.guildId, { pontos_exato: exato, pontos_vencedor: vencedor });
        await interaction.editReply({
          embeds: [
            buildSuccessEmbed(
              '✅ Pontuação atualizada',
              `🎯 Placar exato: **${exato} pts**\n✅ Vencedor/empate: **${vencedor} pt**`,
            ),
          ],
        });
        return;
      }

      if (sub === 'cor') {
        const hex = interaction.options.getString('hex', true);
        if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) {
          await interaction.editReply({ embeds: [buildErrorEmbed('Cor inválida. Use formato `#5B4B8A`.')] });
          return;
        }
        configService.update(interaction.guildId, { cor_embed: hex });
        await interaction.editReply({
          embeds: [buildSuccessEmbed('✅ Cor atualizada', `Cor dos embeds: \`${hex}\``, hex)],
        });
        return;
      }

      if (sub === 'auto-verificar') {
        const ativo = interaction.options.getBoolean('ativo', true);
        configService.update(interaction.guildId, { auto_verificar: ativo ? 1 : 0 });
        await interaction.editReply({
          embeds: [
            buildSuccessEmbed(
              '✅ Automação atualizada',
              `Verificação automática: **${ativo ? 'Ativa' : 'Inativa'}**`,
            ),
          ],
        });
        return;
      }

      if (sub === 'notificar') {
        const ativo = interaction.options.getBoolean('ativo', true);
        configService.update(interaction.guildId, { notificar_resultados: ativo ? 1 : 0 });
        await interaction.editReply({
          embeds: [
            buildSuccessEmbed(
              '✅ Notificações atualizadas',
              `Notificar resultados: **${ativo ? 'Ativo' : 'Inativo'}**`,
            ),
          ],
        });
        return;
      }

      if (sub === 'auto-abrir-rodada') {
        const ativo = interaction.options.getBoolean('ativo', true);
        configService.update(interaction.guildId, { auto_abrir_rodada: ativo ? 1 : 0 });
        await interaction.editReply({
          embeds: [
            buildSuccessEmbed(
              '✅ Automação atualizada',
              `Abrir rodada automaticamente: **${ativo ? 'Ativo' : 'Inativo'}**\n\n` +
                (ativo
                  ? '_Configure `/config canal-palpites` se ainda não fez. O bot publica a rodada atual da API (1–2 req/dia)._'
                  : '_Use `/abrir-rodada` manualmente quando quiser._'),
            ),
          ],
        });
        return;
      }

      if (sub === 'cargo-palpites') {
        const cargo = interaction.options.getRole('cargo');
        configService.update(interaction.guildId, { cargo_palpites_id: cargo?.id ?? null });
        await interaction.editReply({
          embeds: [
            buildSuccessEmbed(
              '✅ Cargo configurado',
              cargo
                ? `Ao abrir rodada, o bot marca ${cargo} com incentivo para palpitar.`
                : 'Cargo removido. Usa o padrão do `.env` ou nenhuma menção.',
            ),
          ],
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido';
      await interaction.editReply({ embeds: [buildErrorEmbed(message)] });
    }
  },
};

export const resultado: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('resultado')
    .setDescription('Consulta a API e publica resultados ao fim da rodada (admin)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addIntegerOption((opt) =>
      opt.setName('rodada').setDescription('Número da rodada (vazio = com jogos pendentes)').setRequired(false),
    ),

  async execute(interaction) {
    if (!interaction.guildId) return;
    if (!(await denyUnlessAdmin(interaction))) return;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const config = configService.getOrCreate(interaction.guildId);
    const numeroRodada = interaction.options.getInteger('rodada');

    const rodada = numeroRodada
      ? rodadaService.getRodadaByNumero(interaction.guildId, numeroRodada)
      : rodadaService.getRodadaComPendencias(interaction.guildId);

    if (!rodada) {
      await interaction.editReply({
        embeds: [
          buildSuccessEmbed(
            'Nada pendente',
            numeroRodada
              ? `Rodada **${numeroRodada}** não encontrada ou sem jogos pendentes.`
              : 'Não há rodada com jogos pendentes de resultado.',
          ),
        ],
      });
      return;
    }

    const pendentes = rodadaService.getPartidasRodada(rodada.id).filter((p) => !p.processada);
    if (pendentes.length === 0) {
      await interaction.editReply({
        embeds: [buildSuccessEmbed('Nada pendente', `Rodada **${rodada.numero_rodada}** já está processada.`)],
      });
      return;
    }

    const pendentesIniciados = pendentes.filter((p) => partidaJaIniciou(p.data_realizacao_iso));
    const pendentesFuturos = pendentes.filter((p) => !partidaJaIniciou(p.data_realizacao_iso));

    if (pendentesIniciados.length === 0) {
      await interaction.editReply({
        embeds: [
          buildSuccessEmbed(
            'Jogos ainda não começaram',
            `A **${rodada.numero_rodada}ª rodada** tem **${pendentesFuturos.length}** jogo(s) futuro(s):\n\n` +
              pendentesFuturos.map(formatMotivoPendencia).join('\n'),
          ),
        ],
      });
      return;
    }

    if (isApiQuotaExhausted()) {
      const uso = getApiUsageToday();
      await interaction.editReply({
        embeds: [
          buildErrorEmbed(
            `Cota diária da API esgotada (${uso.count}/${uso.limit}). Tente novamente amanhã ou aguarde o cron automático.`,
          ),
        ],
      });
      return;
    }

    try {
      const { partidasFinalizadas } = await rodadaService.verificarResultadosRodada(
        rodada.id,
        { verificarTodosPendentes: true },
      );

      const rodadaAtualizada = rodadaService.getRodadaById(rodada.id)!;
      const progresso = rodadaService.contarProgressoRodada(rodada.id);

      if (rodadaAtualizada.resultados_publicados) {
        await interaction.editReply({
          embeds: [
            buildSuccessEmbed(
              'Resultados já publicados',
              `A **${rodada.numero_rodada}ª rodada** já teve todos os resultados enviados ao canal.`,
              config.cor_embed,
            ),
          ],
        });
        return;
      }

      if (rodadaAtualizada.status !== 'finalizada') {
        const aindaPendentes = rodadaService
          .getPartidasRodada(rodada.id)
          .filter((p) => !p.processada);
        const detalhes = aindaPendentes.map(formatMotivoPendencia).join('\n');
        const extraFuturos =
          pendentesFuturos.length > 0
            ? `\n\n_Jogos futuros:_\n${pendentesFuturos.map(formatMotivoPendencia).join('\n')}`
            : '';
        const atualizacao =
          partidasFinalizadas > 0
            ? `**${partidasFinalizadas}** jogo(s) atualizado(s) na API.\n\n`
            : '';

        await interaction.editReply({
          embeds: [
            buildSuccessEmbed(
              'Rodada em andamento',
              `${atualizacao}**${progresso.processados}/${progresso.total}** jogos concluídos.\n\n` +
                `Os resultados serão publicados **todos juntos** quando a rodada terminar.\n\n` +
                `_Aguardando:_\n${detalhes}${extraFuturos}`,
              config.cor_embed,
            ),
          ],
        });
        return;
      }

      const { canalId, partidasPublicadas } = await publicarResultadosRodada(
        interaction.client,
        rodadaAtualizada,
        config,
      );

      await interaction.editReply({
        embeds: [
          buildSuccessEmbed(
            '✅ Resultados publicados',
            `**${partidasPublicadas}** jogo(s) da **${rodada.numero_rodada}ª rodada** enviado(s) em <#${canalId}>.`,
            config.cor_embed,
          ),
        ],
      });
    } catch (error) {
      if (error instanceof ApiFutebolError && error.status === 429) {
        await interaction.editReply({
          embeds: [buildErrorEmbed('API retornou limite de requisições (429). Tente mais tarde.')],
        });
        return;
      }
      const message = error instanceof Error ? error.message : 'Erro desconhecido';
      await interaction.editReply({ embeds: [buildErrorEmbed(message)] });
    }
  },
};

export async function handleButton(interaction: ButtonInteraction): Promise<void> {
  if (!interaction.guildId) return;

  const parts = interaction.customId.split(':');
  const action = parts[0];

  if (action === 'palpitar') {
    const rodadaId = Number(parts[1]);
    const rodada = rodadaService.getRodadaById(rodadaId);
    if (!rodada || rodada.status !== 'aberta') {
      await interaction.reply({
        embeds: [buildErrorEmbed('Esta rodada não está mais aberta.')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await replyPalpiteSelect(interaction, rodadaId);
    return;
  }

  if (action === 'bolao-chz' || action === 'apostar-chz') {
    const rodadaId = Number(parts[1]);
    const rodada = rodadaService.getRodadaById(rodadaId);
    if (!rodada || rodada.status !== 'aberta' || rodada.modalidade !== 'copa') {
      await interaction.reply({
        embeds: [buildErrorEmbed('Bolão CHZ indisponivel nesta rodada.')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const { replyBolaoChzSelect } = await import('./onchain');
    await replyBolaoChzSelect(interaction, rodadaId);
    return;
  }

  if (action === 'bolao-chz-pagar') {
    const rodadaId = Number(parts[1]);
    const rodada = rodadaService.getRodadaById(rodadaId);
    if (!rodada || rodada.status !== 'aberta' || rodada.modalidade !== 'copa') {
      await interaction.reply({
        embeds: [buildErrorEmbed('Bolão CHZ indisponivel nesta rodada.')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const { finalizarBolaoChz } = await import('./onchain');
    await finalizarBolaoChz(interaction, rodadaId);
    return;
  }

  if (action === 'ver-acertos') {
    const rodadaId = Number(parts[1]);
    const rodada = rodadaService.getRodadaById(rodadaId);
    if (!rodada || rodada.status !== 'finalizada') {
      await interaction.reply({
        embeds: [buildErrorEmbed('Resultados desta rodada ainda não estão disponíveis.')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const config = configService.getOrCreate(interaction.guildId);
    const partidas = rodadaService.getPartidasRodada(rodadaId).filter((p) => p.processada);

    if (partidas.length === 0) {
      await interaction.reply({
        embeds: [buildErrorEmbed('Nenhum jogo finalizado nesta rodada.')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const embeds = partidas.map((partida) =>
      buildResultadoPartidaEmbed(
        partida,
        rodadaService.getResultadosPartida(rodadaId, partida.partida_id),
        config,
      ),
    );

    await interaction.reply({
      embeds: embeds.slice(0, 10),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (action === 'meus-palpites') {
    const config = configService.getOrCreate(interaction.guildId);
    let rodadaId = Number(parts[1]);
    if (!rodadaId) {
      const aberta = rodadaService.getRodadaAberta(interaction.guildId);
      if (!aberta) {
        await interaction.reply({
          embeds: [buildErrorEmbed('Nenhuma rodada aberta no momento.')],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      rodadaId = aberta.id;
    }

    const palpites = rodadaService.getPalpitesUsuario(rodadaId, interaction.user.id);
    const partidas = rodadaService.getPartidasRodada(rodadaId);

    await interaction.reply({
      embeds: [buildMeusPalpitesEmbed(palpites, partidas, config, interaction.user.username)],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (action === 'ranking-rodada') {
    const config = configService.getOrCreate(interaction.guildId);
    const rodadaId = Number(parts[1]);
    const page = Number(parts[2] ?? 0);
    const entries = rodadaService.getRankingRodada(rodadaId);
    const rodada = rodadaService.getRodadaById(rodadaId);

    await interaction.reply({
      embeds: [
        buildRankingEmbed(entries, config, `${rodada?.numero_rodada ?? '?'}ª Rodada`, page, rodada),
      ],
      components: buildRankingComponents(rodadaId, page, entries.length),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (action === 'ranking-mais') {
    const config = configService.getOrCreate(interaction.guildId);
    const scope = parts[1];
    const page = Number(parts[2] ?? 0);

    if (scope === 'geral') {
      const entries = rodadaService.getRankingGeral(interaction.guildId);
      await interaction.update({
        embeds: [buildRankingEmbed(entries, config, 'Ranking Geral', page)],
        components: buildRankingComponents('geral', page, entries.length),
      });
      return;
    }

    const rodadaId = Number(scope);
    const entries = rodadaService.getRankingRodada(rodadaId);
    const rodada = rodadaService.getRodadaById(rodadaId);

    await interaction.update({
      embeds: [
        buildRankingEmbed(entries, config, `${rodada?.numero_rodada ?? '?'}ª Rodada`, page, rodada),
      ],
      components: buildRankingComponents(rodadaId, page, entries.length),
    });
    return;
  }
}

export async function handleSelectMenu(interaction: StringSelectMenuInteraction): Promise<void> {
  if (!interaction.guildId) return;

  const [action, idStr] = interaction.customId.split(':');

  if (action === 'select-bolao-chz') {
    const { handleBolaoChzSelectMenu } = await import('./onchain');
    await handleBolaoChzSelectMenu(interaction, Number(idStr));
    return;
  }

  if (action !== 'select-partida') return;

  const rodadaId = Number(idStr);
  const partidaId = Number(interaction.values[0]);
  const partida = rodadaService.getPartida(rodadaId, partidaId);

  if (!partida) {
    await interaction.reply({
      embeds: [buildErrorEmbed('Partida não encontrada.')],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const palpiteExistente = rodadaService
    .getPalpitesUsuario(rodadaId, interaction.user.id)
    .find((p) => p.partida_id === partidaId);

  if (palpiteExistente) {
    const config = configService.getOrCreate(interaction.guildId);
    await interaction.reply({
      embeds: [
        buildSuccessEmbed(
          '✅ Já palpitado',
          `**${partida.time_mandante} X ${partida.time_visitante}**\n\n` +
            `> Seu palpite · **${palpiteExistente.palpite_mandante} X ${palpiteExistente.palpite_visitante}**\n\n` +
            '_Este jogo não aparece mais na lista. Clique em **Palpitar grátis** para ver os jogos restantes._',
          config.cor_embed,
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (!partidaAbertaParaPalpite(partida.status, partida.data_realizacao_iso)) {
    await interaction.reply({
      embeds: [buildErrorEmbed('Palpites encerrados para este jogo.')],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId(`modal-palpite:${rodadaId}:${partidaId}`)
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

export async function handleModal(interaction: ModalSubmitInteraction): Promise<void> {
  if (!interaction.guildId) return;

  const parts = interaction.customId.split(':');

  if (parts[0] === 'modal-bolao-chz') {
    const { handleBolaoChzPalpiteModal } = await import('./onchain');
    await handleBolaoChzPalpiteModal(interaction, Number(parts[1]), Number(parts[2]));
    return;
  }

  if (parts[0] !== 'modal-palpite') return;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const rodadaId = Number(parts[1]);
  const partidaId = Number(parts[2]);
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

  try {
    const config = configService.getOrCreate(interaction.guildId);
    const existente = rodadaService
      .getPalpitesUsuario(rodadaId, interaction.user.id)
      .find((p) => p.partida_id === partidaId);

    rodadaService.salvarPalpite(
      rodadaId,
      partidaId,
      interaction.user.id,
      interaction.user.username,
      mandante,
      visitante,
    );

    const rodada = rodadaService.getRodadaById(rodadaId);
    const partida = rodadaService.getPartida(rodadaId, partidaId)!;
    const disponiveis = partidasDisponiveisParaUsuario(rodadaId, interaction.user.id);
    const select = buildPartidaSelect(rodadaId, disponiveis);

    await interaction.editReply({
      embeds: [
        buildPalpiteConfirmEmbed(partida, mandante, visitante, config, Boolean(existente), {
          contexto: 'free',
          rodada,
        }),
      ],
      content:
        disponiveis.length > 0
          ? '⚽ **Próximo jogo** — escolha abaixo ou clique em **Palpitar grátis** de novo:'
          : '✅ **Rodada completa!** Você palpitou em todos os jogos abertos.',
      components: select ? [select] : [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro desconhecido';
    await interaction.editReply({ embeds: [buildErrorEmbed(message)] });
  }
}

import { onchainCommands } from './onchain';

export const commands: BotCommand[] = [
  abrirRodada,
  reenviarRodada,
  fecharRodada,
  palpite,
  meusPalpites,
  ranking,
  proximosJogos,
  configCmd,
  resultado,
  ...onchainCommands,
];

export { isAdmin };
