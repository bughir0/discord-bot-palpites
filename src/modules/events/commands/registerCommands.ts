import { SlashCommandBuilder } from "discord.js";

/**
 * Definição do comando `/evento` e subcomandos (registro na API do Discord).
 */
export function buildEventoSlashCommand() {
  return new SlashCommandBuilder()
    .setName("evento")
    .setDescription("Gestão de eventos, participação e relatórios")
    .addSubcommand((s) =>
      s
        .setName("iniciar")
        .setDescription("Inicia um evento neste canal (embed + botão de participação)")
        .addStringOption((o) =>
          o
            .setName("nome")
            .setDescription(
              "Nome base do evento (a data e hora de início são acrescentadas automaticamente ao nome)",
            )
            .setRequired(true)
            .setMaxLength(100),
        )
        .addStringOption((o) =>
          o.setName("descricao").setDescription("Descrição").setMaxLength(2000),
        )
        .addIntegerOption((o) =>
          o
            .setName("duracao_minutos")
            .setDescription("Duração planejada (informativa); deixe vazio se não souber")
            .setMinValue(1)
            .setMaxValue(10080),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("finalizar")
        .setDescription("Finaliza o evento (canal atual ou ID) e publica o resumo")
        .addStringOption((o) =>
          o
            .setName("evento_id")
            .setDescription("Evento ativo (auto-complete) ou ID numérico")
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("listar")
        .setDescription("Lista eventos do mês (início ou encerramento)")
        .addIntegerOption((o) =>
          o.setName("mes").setDescription("1–12").setMinValue(1).setMaxValue(12),
        )
        .addIntegerOption((o) =>
          o.setName("ano").setDescription("Ano (ex.: 2025)").setMinValue(2020).setMaxValue(2100),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("detalhes")
        .setDescription("Detalhes e participantes de um evento")
        .addStringOption((o) =>
          o.setName("evento_id").setDescription("ID do evento").setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("relatorio")
        .setDescription("Relatório e estatísticas agregadas do mês")
        .addIntegerOption((o) =>
          o.setName("mes").setDescription("1–12").setMinValue(1).setMaxValue(12),
        )
        .addIntegerOption((o) =>
          o.setName("ano").setDescription("Ano").setMinValue(2020).setMaxValue(2100),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("participacao")
        .setDescription("Quantos eventos um membro já participou neste servidor")
        .addUserOption((o) =>
          o.setName("membro").setDescription("Membro (omitir = você)"),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("ranking")
        .setDescription("Ranking de membros por mensagens em eventos finalizados no mês")
        .addIntegerOption((o) =>
          o.setName("mes").setDescription("1–12").setMinValue(1).setMaxValue(12),
        )
        .addIntegerOption((o) =>
          o.setName("ano").setDescription("Ano").setMinValue(2020).setMaxValue(2100),
        )
        .addIntegerOption((o) =>
          o
            .setName("limite")
            .setDescription("Quantidade de posições (máx. 50)")
            .setMinValue(1)
            .setMaxValue(50),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("exportar")
        .setDescription("Exporta dados do mês (JSON ou CSV) — apenas admin")
        .addStringOption((o) =>
          o
            .setName("formato")
            .setDescription("Formato do arquivo")
            .setRequired(true)
            .addChoices(
              { name: "JSON", value: "json" },
              { name: "CSV", value: "csv" },
            ),
        )
        .addIntegerOption((o) =>
          o.setName("mes").setDescription("1–12").setMinValue(1).setMaxValue(12),
        )
        .addIntegerOption((o) =>
          o.setName("ano").setDescription("Ano").setMinValue(2020).setMaxValue(2100),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("deletar-dados")
        .setDescription("Apaga todos os dados deste servidor no bot (irreversível) — apenas admin"),
    );
}
