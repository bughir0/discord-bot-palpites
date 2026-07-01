import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
  type AutocompleteInteraction,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type GuildMember,
  type ModalSubmitInteraction,
  type TextChannel,
} from 'discord.js';
import type { BotModule } from '../../core/types';
import type { BotCommand } from '../../bot/types';
import { env } from '../../config';
import {
  formatQuizFinishRewardLog,
  rewardQuizFinish,
} from '../points/rewards';
import { postCoLog } from '../points/client-log';
import { quizStore, type Quiz, type QuizQuestion } from './store';

type ActiveQuiz = {
  quizId: string;
  channelId: string;
  currentQuestionIndex: number;
  questionStartTime: number;
  messageId?: string;
  nextTimeout?: ReturnType<typeof setTimeout>;
  participants: Set<string>;
  answeredQuestions: Map<string, Set<number>>;
  answers: Map<string, { questionIndex: number; answerIndex: number }>;
};

const activeQuizzes = new Map<string, ActiveQuiz>();

type PendingQuizRewards = {
  quizId: string;
  quizTitle: string;
  channelId: string;
  scores: [string, number][];
  participants: string[];
  rewarded: boolean;
  createdAt: number;
};

const pendingQuizRewards = new Map<string, PendingQuizRewards>();

function newRewardToken(): string {
  return Math.random().toString(36).slice(2, 10);
}

function isQuizAdmin(member: GuildMember | null): boolean {
  if (!member) return false;
  return (
    member.permissions.has(PermissionFlagsBits.Administrator) ||
    member.permissions.has(PermissionFlagsBits.ManageGuild)
  );
}

function buildQuizScores(active: ActiveQuiz, quiz: Quiz): Map<string, number> {
  const scores = new Map<string, number>();
  active.answers.forEach((ans, key) => {
    const [userId] = key.split('_');
    const q = quiz.perguntas[ans.questionIndex];
    if (q && ans.answerIndex === q.corretaIndex) {
      const pts = q.pontos ?? quiz.pontosPadrao ?? 1;
      scores.set(userId, (scores.get(userId) ?? 0) + pts);
    }
  });
  return scores;
}

function buildRankingEmbed(
  quiz: Quiz,
  ranking: [string, number][],
  extraFields?: { name: string; value: string }[],
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle('🏆 Ranking Final')
    .setDescription(`Quiz: **${quiz.titulo}**`)
    .setColor(0xffd700);
  if (ranking.length === 0) {
    embed.addFields({ name: 'Resultado', value: 'Nenhuma resposta correta.' });
  } else {
    embed.addFields({
      name: 'Top 10',
      value: ranking
        .map(([uid, pts], i) => {
          const medal = i < 3 ? ['🥇', '🥈', '🥉'][i] : `${i + 1}.`;
          return `${medal} <@${uid}> — **${pts}** acerto(s)`;
        })
        .join('\n'),
    });
  }
  for (const field of extraFields ?? []) {
    embed.addFields(field);
  }
  return embed;
}

function rewardSummaryField(rewards: ReturnType<typeof rewardQuizFinish>): { name: string; value: string } {
  const lines: string[] = [];
  if (rewards.top3.length > 0) {
    lines.push(`🥇🥈🥉 Top 3: **+${rewards.top3Points}** pts (${rewards.top3.length})`);
  }
  if (rewards.others.length > 0) {
    lines.push(`👥 Demais: **+${rewards.othersPoints}** pts (${rewards.others.length})`);
  }
  return {
    name: '💰 Recompensas creditadas',
    value: lines.length ? lines.join('\n') : '_Nenhum ponto creditado._',
  };
}

function formatAlternativas(alternativas: string[]): string {
  return alternativas
    .slice(0, 6)
    .map((text, idx) => {
      const letter = String.fromCharCode(65 + idx);
      const clean = text.replace(/^[A-Fa-f]\)\s*/, '').trim();
      return `**${letter})** ${clean}`;
    })
    .join('\n');
}

function buildQuestionEmbed(
  quiz: Quiz,
  q: QuizQuestion,
  qIndex: number,
  tempo: number,
  startedAtMs: number,
): EmbedBuilder {
  const endsAt = Math.floor((startedAtMs + tempo * 1000) / 1000);
  const hasNext = qIndex + 1 < quiz.perguntas.length;
  const nextStartsAt = endsAt;

  let tempoField =
    `**Termina:** <t:${endsAt}:R>\n` +
    `**Tempo:** ${tempo}s`;
  if (hasNext) {
    tempoField += `\n**Próxima pergunta em:** <t:${nextStartsAt}:R>`;
  }

  return new EmbedBuilder()
    .setTitle(`📝 Pergunta ${qIndex + 1}/${quiz.perguntas.length}`)
    .setDescription(q.enunciado)
    .addFields(
      { name: '📌 Alternativas', value: formatAlternativas(q.alternativas) || '_Sem alternativas_' },
      { name: '⏱️ Tempo', value: tempoField },
    )
    .setColor(0x5865f2);
}

function buildAnswerRows(quizId: string, qIndex: number, alternativas: string[]) {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  let row = new ActionRowBuilder<ButtonBuilder>();
  alternativas.slice(0, 6).forEach((_, idx) => {
    if (row.components.length >= 5) {
      rows.push(row);
      row = new ActionRowBuilder<ButtonBuilder>();
    }
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`quiz_answer_${quizId}_${qIndex}_${idx}`)
        .setLabel(String.fromCharCode(65 + idx))
        .setStyle(ButtonStyle.Primary),
    );
  });
  if (row.components.length) rows.push(row);
  return rows;
}

function updateQuizStatus(quiz: Quiz, q: QuizQuestion, qIndex: number, active: ActiveQuiz, tempo: number): void {
  const startedAt = active.questionStartTime;
  const endsAt = startedAt + tempo * 1000;
  const hasNext = qIndex + 1 < quiz.perguntas.length;
  const nextQ = hasNext ? quiz.perguntas[qIndex + 1] : undefined;

  quizStore.setStatus({
    quizId: quiz.id,
    quizTitle: quiz.titulo,
    channelId: active.channelId,
    currentQuestionIndex: qIndex,
    totalQuestions: quiz.perguntas.length,
    participantes: active.participants.size,
    startTime: startedAt,
    progresso: (qIndex + 1) / quiz.perguntas.length,
    currentQuestion: {
      numero: qIndex + 1,
      total: quiz.perguntas.length,
      enunciado: q.enunciado,
      tempoRestante: tempo,
      tempoTotal: tempo,
      startsAt: startedAt,
      endsAt,
    },
    nextQuestion: nextQ
      ? {
          numero: qIndex + 2,
          enunciado: nextQ.enunciado,
          prevista: tempo,
          startsAt: endsAt,
        }
      : undefined,
  });
}

async function disableQuestionMessage(channel: TextChannel, messageId: string | undefined): Promise<void> {
  if (!messageId) return;
  try {
    const msg = await channel.messages.fetch(messageId);
    await msg.edit({ components: [] });
  } catch {
    /* mensagem apagada ou sem permissão */
  }
}

async function stopActiveQuiz(channel: TextChannel): Promise<boolean> {
  const active = activeQuizzes.get(channel.id);
  if (!active) return false;

  if (active.nextTimeout) {
    clearTimeout(active.nextTimeout);
    active.nextTimeout = undefined;
  }

  await disableQuestionMessage(channel, active.messageId);
  activeQuizzes.delete(channel.id);
  quizStore.setStatus(null);
  return true;
}

async function sendQuestion(
  channel: TextChannel,
  quiz: Quiz,
  qIndex: number,
  active: ActiveQuiz,
): Promise<void> {
  if (!activeQuizzes.has(channel.id) || activeQuizzes.get(channel.id) !== active) return;

  const q = quiz.perguntas[qIndex];
  if (!q) return;

  await disableQuestionMessage(channel, active.messageId);

  active.currentQuestionIndex = qIndex;
  active.questionStartTime = Date.now();
  const tempo = q.tempo ?? quiz.tempoPadrao ?? 20;
  const startedAt = active.questionStartTime;

  const embed = buildQuestionEmbed(quiz, q, qIndex, tempo, startedAt);
  updateQuizStatus(quiz, q, qIndex, active, tempo);

  const msg = await channel.send({
    embeds: [embed],
    components: buildAnswerRows(quiz.id, qIndex, q.alternativas),
  });
  active.messageId = msg.id;

  if (active.nextTimeout) clearTimeout(active.nextTimeout);
  active.nextTimeout = setTimeout(() => {
    void (async () => {
      if (!activeQuizzes.has(channel.id) || activeQuizzes.get(channel.id) !== active) return;
      if (qIndex + 1 < quiz.perguntas.length) {
        await sendQuestion(channel, quiz, qIndex + 1, active);
      } else {
        await finishQuiz(channel, quiz, active);
        activeQuizzes.delete(channel.id);
        quizStore.setStatus(null);
      }
    })();
  }, tempo * 1000);
}

async function finishQuiz(
  channel: TextChannel,
  quiz: Quiz,
  active: ActiveQuiz,
): Promise<void> {
  if (active.nextTimeout) {
    clearTimeout(active.nextTimeout);
    active.nextTimeout = undefined;
  }
  await disableQuestionMessage(channel, active.messageId);

  const scores = buildQuizScores(active, quiz);
  const ranking = [...scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const embed = buildRankingEmbed(quiz, ranking);

  const canReward =
    env.pointsEnabled && (active.participants.size > 0 || scores.size > 0);
  const components: ActionRowBuilder<ButtonBuilder>[] = [];
  let token: string | null = null;

  if (canReward) {
    token = newRewardToken();
    pendingQuizRewards.set(token, {
      quizId: quiz.id,
      quizTitle: quiz.titulo,
      channelId: channel.id,
      scores: [...scores.entries()],
      participants: [...active.participants],
      rewarded: false,
      createdAt: Date.now(),
    });
    components.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`quiz_reward:${token}`)
          .setLabel('Distribuir pontos')
          .setStyle(ButtonStyle.Success)
          .setEmoji('💰'),
      ),
    );
    embed.setFooter({ text: 'Admin: clique em Distribuir pontos para creditar o saldo.' });
  }

  await channel.send({
    embeds: [embed],
    components,
  });
}


async function handleQuizStart(interaction: ChatInputCommandInteraction): Promise<void> {
  const quizId = interaction.options.getString('quiz_id', true);
  const channel = interaction.options.getChannel('canal') ?? interaction.channel;
  if (!channel || !('send' in channel) || typeof channel.send !== 'function') {
    await interaction.reply({ content: '❌ Canal inválido.', flags: MessageFlags.Ephemeral });
    return;
  }
  if (activeQuizzes.has(channel.id)) {
    await interaction.reply({ content: '❌ Quiz já ativo. Use `/quiz stop`.', flags: MessageFlags.Ephemeral });
    return;
  }
  const quiz = quizStore.getQuiz(quizId);
  if (!quiz?.perguntas.length) {
    await interaction.reply({ content: '❌ Quiz não encontrado ou vazio.', flags: MessageFlags.Ephemeral });
    return;
  }
  const active: ActiveQuiz = {
    quizId: quiz.id,
    channelId: channel.id,
    currentQuestionIndex: 0,
    questionStartTime: Date.now(),
    participants: new Set(),
    answeredQuestions: new Map(),
    answers: new Map(),
  };
  activeQuizzes.set(channel.id, active);
  quizStore.setStatus({
    quizId: quiz.id,
    quizTitle: quiz.titulo,
    channelId: channel.id,
    currentQuestionIndex: 0,
    totalQuestions: quiz.perguntas.length,
    participantes: 0,
    startTime: Date.now(),
    progresso: 0,
  });
  await interaction.reply({ content: `✅ Quiz **${quiz.titulo}** iniciado!`, flags: MessageFlags.Ephemeral });
  await sendQuestion(channel as TextChannel, quiz, 0, active);
}

const quizCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('quiz')
    .setDescription('Quizzes interativos da comunidade')
    .addSubcommand((s) =>
      s
        .setName('start')
        .setDescription('Inicia um quiz')
        .addStringOption((o) =>
          o.setName('quiz_id').setDescription('ID do quiz').setRequired(true).setAutocomplete(true),
        )
        .addChannelOption((o) => o.setName('canal').setDescription('Canal (opcional)')),
    )
    .addSubcommand((s) => s.setName('stop').setDescription('Para o quiz do canal'))
    .addSubcommand((s) => s.setName('list').setDescription('Lista quizzes')),
  execute: async (interaction) => {
    const sub = interaction.options.getSubcommand();
    if (sub === 'start') return handleQuizStart(interaction);
    if (sub === 'list') {
      const list = quizStore.getQuizzes();
      const embed = new EmbedBuilder()
        .setTitle('📚 Quizzes')
        .setDescription(
          list.length
            ? list.map((q) => `**${q.titulo}** — \`${q.id}\` (${q.perguntas.length} perguntas)`).join('\n')
            : `Nenhum quiz. Crie no painel web: ${env.dappBaseUrl}/quiz`,
        )
        .setColor(0x5865f2);
      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      return;
    }
    if (sub === 'stop') {
      const ch = interaction.channel;
      if (!ch?.isTextBased()) {
        await interaction.reply({ content: '❌ Canal inválido.', flags: MessageFlags.Ephemeral });
        return;
      }
      const stopped = await stopActiveQuiz(ch as TextChannel);
      await interaction.reply({
        content: stopped ? '✅ Quiz parado.' : '❌ Nenhum quiz ativo neste canal.',
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};

async function handleQuizAutocomplete(interaction: AutocompleteInteraction): Promise<boolean> {
  if (interaction.commandName !== 'quiz') return false;
  if (interaction.options.getSubcommand() !== 'start') return false;
  const focused = interaction.options.getFocused(true);
  if (focused.name !== 'quiz_id') return false;
  const q = focused.value.toLowerCase();
  const filtered = quizStore
    .getQuizzes()
    .filter((x) => x.id.toLowerCase().includes(q) || x.titulo.toLowerCase().includes(q))
    .slice(0, 25);
  await interaction.respond(filtered.map((x) => ({ name: `${x.titulo} (${x.id})`, value: x.id })));
  return true;
}

async function handleQuizButton(interaction: ButtonInteraction): Promise<boolean> {
  if (interaction.customId.startsWith('quiz_reward:')) {
    return handleQuizRewardButton(interaction);
  }

  const m = interaction.customId.match(/^quiz_answer_(.+)_(\d+)_(\d+)$/);
  if (!m) return false;
  const channel = interaction.channel;
  if (!channel) return false;
  const active = activeQuizzes.get(channel.id);
  if (!active || active.quizId !== m[1]) {
    await interaction.reply({ content: '❌ Quiz inativo.', flags: MessageFlags.Ephemeral });
    return true;
  }
  const qIndex = parseInt(m[2], 10);
  const ansIndex = parseInt(m[3], 10);
  const quiz = quizStore.getQuiz(active.quizId);
  if (!quiz) return true;
  const question = quiz.perguntas[qIndex];
  if (!question || qIndex !== active.currentQuestionIndex) {
    await interaction.reply({ content: '❌ Pergunta expirada.', flags: MessageFlags.Ephemeral });
    return true;
  }
  const userId = interaction.user.id;
  const answered = active.answeredQuestions.get(userId) ?? new Set();
  if (answered.has(qIndex)) {
    await interaction.reply({ content: '❌ Já respondeu.', flags: MessageFlags.Ephemeral });
    return true;
  }
  answered.add(qIndex);
  active.answeredQuestions.set(userId, answered);
  active.participants.add(userId);
  active.answers.set(`${userId}_${qIndex}`, { questionIndex: qIndex, answerIndex: ansIndex });
  const ok = ansIndex === question.corretaIndex;
  await interaction.reply({
    content: ok ? '✅ Correto!' : '❌ Incorreto.',
    flags: MessageFlags.Ephemeral,
  });
  return true;
}

async function handleQuizRewardButton(interaction: ButtonInteraction): Promise<boolean> {
  const token = interaction.customId.slice('quiz_reward:'.length);
  const pending = pendingQuizRewards.get(token);
  if (!pending || pending.rewarded) {
    await interaction.reply({ content: '❌ Esta distribuição já foi feita ou expirou.', flags: MessageFlags.Ephemeral });
    return true;
  }
  if (Date.now() - pending.createdAt > 24 * 60 * 60 * 1000) {
    pendingQuizRewards.delete(token);
    await interaction.reply({ content: '❌ Esta distribuição expirou.', flags: MessageFlags.Ephemeral });
    return true;
  }
  if (!isQuizAdmin(interaction.member as GuildMember | null)) {
    await interaction.reply({
      content: '❌ Apenas administradores podem distribuir pontos.',
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  const modal = new ModalBuilder()
    .setCustomId(`quiz_reward_modal:${token}`)
    .setTitle('Distribuir pontos do quiz');

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId('pontos_top3')
        .setLabel('Pontos para o top 3')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Ex.: 250')
        .setRequired(true)
        .setMaxLength(6),
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId('pontos_demais')
        .setLabel('Pontos para os demais participantes')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Ex.: 100')
        .setRequired(true)
        .setMaxLength(6),
    ),
  );

  await interaction.showModal(modal);
  return true;
}

function parsePointsInput(raw: string): number | null {
  const n = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(n) || n < 0) return null;
  if (n > 1_000_000) return null;
  return n;
}

async function handleQuizRewardModal(interaction: ModalSubmitInteraction): Promise<boolean> {
  const token = interaction.customId.slice('quiz_reward_modal:'.length);
  const pending = pendingQuizRewards.get(token);
  if (!pending || pending.rewarded) {
    await interaction.reply({ content: '❌ Esta distribuição já foi feita ou expirou.', flags: MessageFlags.Ephemeral });
    return true;
  }
  if (!isQuizAdmin(interaction.member as GuildMember | null)) {
    await interaction.reply({
      content: '❌ Apenas administradores podem distribuir pontos.',
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  const top3Points = parsePointsInput(interaction.fields.getTextInputValue('pontos_top3'));
  const othersPoints = parsePointsInput(interaction.fields.getTextInputValue('pontos_demais'));
  if (top3Points == null || othersPoints == null) {
    await interaction.reply({
      content: '❌ Informe valores válidos (números inteiros ≥ 0).',
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const scores = new Map(pending.scores);
  const participants = new Set(pending.participants);
  const rewards = rewardQuizFinish({
    quizId: pending.quizId,
    quizTitle: pending.quizTitle,
    scores,
    participants,
    top3Points,
    othersPoints,
  });

  pending.rewarded = true;
  pendingQuizRewards.delete(token);

  const quiz = quizStore.getQuiz(pending.quizId);
  const ranking = [...scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const embed = buildRankingEmbed(
    quiz ?? { id: pending.quizId, titulo: pending.quizTitle, perguntas: [] },
    ranking,
    [rewardSummaryField(rewards)],
  );
  embed.setFooter({ text: `Pontos distribuídos por ${interaction.user.tag}` });

  try {
    if (interaction.message?.editable) {
      await interaction.message.edit({ embeds: [embed], components: [] });
    }
  } catch {
    /* mensagem apagada */
  }

  await postCoLog(
    interaction.client,
    'Quiz finalizado',
    `${formatQuizFinishRewardLog(pending.quizTitle, pending.quizId, rewards)}\n\n_Por <@${interaction.user.id}>_`,
    interaction.guild ? `#${interaction.guild.name}` : undefined,
  );

  await interaction.editReply({
    content: `✅ Pontos creditados — top 3: **+${top3Points}**, demais: **+${othersPoints}**. Log enviado.`,
  });
  return true;
}

export const quizModule: BotModule = {
  id: 'quiz',
  label: 'Quiz',
  commands: [quizCommand],
  handleInteraction: async (interaction) => {
    if (interaction.isAutocomplete()) return handleQuizAutocomplete(interaction);
    if (interaction.isButton()) return handleQuizButton(interaction);
    if (interaction.isModalSubmit() && interaction.customId.startsWith('quiz_reward_modal:')) {
      return handleQuizRewardModal(interaction);
    }
    return false;
  },
};
