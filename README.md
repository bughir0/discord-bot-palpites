# Palpito

Bot Discord + site para palpites da Copa, quiz ao vivo, eventos, pontos, loja e wallets CHZ.

Integração com a [API Futebol](https://api-futebol.com.br/documentacao) para rodadas e resultados.

## Funcionalidades

- 🏆 Abrir rodada com embed bonito e botões interativos
- ⚽ Palpitar via `/palpite`, botão **Palpitar agora** ou modal
- 🎯 Pontuação: **placar exato (3 pts)** + **vencedor/empate (1 pt)** — configurável
- 📊 Ranking por rodada e geral
- 🤖 Verificação automática de resultados (padrão: a cada 1h, 1 req/rodada — respeita cota de 100 req/dia da API)
- ⚙️ Configurações por servidor (canais, pontos, cor, automação)

## Pré-requisitos

1. Conta no [Discord Developer Portal](https://discord.com/developers/applications)
2. API Key no [dashboard da API Futebol](https://ct.api-futebol.com.br/)
3. Node.js 24+ ([nodejs.org](https://nodejs.org/)) — use o Node do sistema, não o embutido do Cursor

## Instalação

```bash
cd palpito
npm install
cp .env.example .env
```

> **Windows:** confira `node -v` (deve ser v24+). Se aparecer erro do `better-sqlite3`, rode `npm rebuild better-sqlite3` no terminal **fora** do Cursor, ou reinstale: `Remove-Item -Recurse -Force node_modules; npm install`.

Edite o `.env`:

```env
DISCORD_TOKEN=seu_token
DISCORD_CLIENT_ID=id_do_bot
DISCORD_GUILD_ID=id_do_servidor   # recomendado para testes
API_FUTEBOL_KEY=sua_chave
CAMPEONATO_ID=10                   # Brasileirão Série A
```

## Registrar comandos

```bash
npm run register
```

## Executar

```bash
# Desenvolvimento (hot reload)
npm run dev

# Produção
npm run build
npm start
```

## Visual (estilo Ginga)

- **Rodada aberta:** um embed por jogo com escudos, estádio, data relativa e blocos `>`
- **Resultados:** embed dourado por partida com placar e lista de palpites
- **Ranking:** top 10 com `#01`, `#02`… + botões **Ver mais** e **Meus palpites**
- Cor padrão roxa `#5B4B8A` (configurável via `/config cor`)

## Comandos

| Comando | Descrição | Usa API |
|---|---|---|
| `/abrir-rodada [rodada]` | Abre rodada para palpites (admin) | Sim (1–2 req) |
| `/reenviar-rodada` | Republica o embed da rodada aberta (admin) | Não |
| `/fechar-rodada` | Encerra palpites (admin) | Não |
| `/palpite` | Registra palpite via slash command | Não |
| `/meus-palpites` | Seus palpites da rodada | Não |
| `/ranking [tipo]` | Ranking da rodada ou geral | Não |
| `/proximos-jogos [rodada]` | Lista jogos da rodada (admin) | Sim (1–2 req) |
| `/resultado` | Consulta API e publica resultados ao fim da rodada | Sim |
| `/config ver` | Ver configurações |
| `/config canal-palpites` | Canal de palpites |
| `/config canal-resultados` | Canal de resultados |
| `/config pontuacao` | Pontos exato/vencedor |
| `/config cor` | Cor dos embeds (hex) |
| `/config auto-verificar` | Job automático on/off |
| `/config auto-abrir-rodada` | Publica rodada atual sozinho (admin) |
| `/config notificar` | Notificações on/off |

## Fluxo recomendado

1. `/config canal-palpites #palpites`
2. `/config canal-resultados #resultados`
3. `/config auto-abrir-rodada ativo:true` _(opcional — publica rodada sozinho)_
4. `/config pontuacao exato:3 vencedor:1`
5. `/abrir-rodada` _(ou deixe o auto-abrir fazer)_ 
6. Membros palpitam com botão ou `/palpite`
7. Bot processa jogos conforme a API atualiza; **publica todos os resultados juntos** quando a rodada termina

### Cota da API Futebol

O plano gratuito permite **100 requisições/dia** (`API_DAILY_LIMIT=100`). O bot contabiliza cada chamada em `data/api-quota.json` e evita estourar assim:

- **1 chamada por rodada** por ciclo do cron (não 1 por jogo)
- Só consulta jogos **~105 min depois** do horário agendado
- Cron padrão: **a cada hora** (`VERIFICAR_RESULTADOS_CRON=0 * * * *`), **+ 1 vez ao iniciar o bot**
- Ao receber **429**, pausa verificações por **24h**

Para checagem mais rápida após os jogos, aguarde o cron automático (admins controlam `/abrir-rodada` e `/proximos-jogos`, os únicos comandos que gastam cota manualmente).

## Pontuação

| Acerto | Pontos padrão |
|---|---|
| Placar exato | 3 |
| Vencedor ou empate | 1 |
| Errou | 0 |

## Estrutura

```
src/
├── commands/     # Slash commands + handlers de botão/modal
├── embeds/       # Builders de embeds
├── services/     # API Futebol, palpites, config
├── db/           # SQLite
├── jobs/         # Cron de resultados
└── index.ts      # Entry point
```

## Licença

MIT
