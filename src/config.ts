import dotenv from 'dotenv';

dotenv.config();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
  }
  return value;
}

export const env = {
  discordToken: requireEnv('DISCORD_TOKEN'),
  discordClientId: requireEnv('DISCORD_CLIENT_ID'),
  discordGuildId: process.env.DISCORD_GUILD_ID,
  apiFutebolKey: requireEnv('API_FUTEBOL_KEY'),
  campeonatoId: Number(process.env.CAMPEONATO_ID ?? '10'),
  /** ID do campeonato da Copa do Mundo 2026 na API Futebol (para o modo on-chain) */
  copaCampeonatoId: Number(process.env.COPA_CAMPEONATO_ID ?? '0') || null,
  databasePath: process.env.DATABASE_PATH ?? './data/palpites.db',
  /** Cron de verificação de resultados (padrão: a cada 30 min — economiza cota da API) */
  verificarResultadosCron: process.env.VERIFICAR_RESULTADOS_CRON ?? '*/30 * * * *',
  /** Cron para abrir rodada automaticamente (padrão: todo dia às 9h) */
  abrirRodadaCron: process.env.ABRIR_RODADA_CRON ?? '0 9 * * *',
  /** Limite diário de requisições (plano gratuito API Futebol = 100) */
  apiDailyLimit: Number(process.env.API_DAILY_LIMIT ?? '100'),
  /** Cargo marcado ao abrir rodada (pode ser sobrescrito por /config cargo-palpites) */
  palpiteCargoId: process.env.DISCORD_CARGO_PALPITES_ID ?? null,

  // ---------- Blockchain / on-chain (modo Copa) ----------
  /** RPC HTTPS da Chiliz (padrão: Spicy testnet). Para mainnet usar https://rpc.ankr.com/chiliz */
  chilizRpcUrl: process.env.CHILIZ_RPC_URL ?? 'https://spicy-rpc.chiliz.com/',
  /** Chain ID: 88882 (Spicy testnet) ou 88888 (mainnet) */
  chilizChainId: Number(process.env.CHILIZ_CHAIN_ID ?? '88882'),
  /** Base URL opcional da API explorer (Blockscout/Etherscan-like) para fallback. */
  chilizScanApiBaseUrl: process.env.CHILIZ_SCAN_API_BASE_URL ?? null,
  /** API key opcional da API explorer para limites maiores. */
  chilizScanApiKey: process.env.CHILIZ_SCAN_API_KEY ?? null,
  /** Destino do pagamento CHZ no modo sem contrato (transferencia simples). */
  chilizPaymentReceiverAddress:
    (process.env.CHILIZ_PAYMENT_RECEIVER_ADDRESS ?? '').toLowerCase() || null,
  /** URL pública do mini-dApp (Vercel/local) usada para gerar links de aposta. */
  dappBaseUrl: process.env.DAPP_BASE_URL ?? 'http://localhost:3000',
  /** Porta HTTP. Hosts PaaS (Square Cloud) injetam PORT=80 — tem prioridade sobre BOT_API_PORT. */
  botApiPort: Number(process.env.PORT ?? process.env.BOT_API_PORT ?? '3001'),
  /** Origem permitida no CORS do HTTP server (padrão: DAPP_BASE_URL) */
  botApiCorsOrigin: process.env.BOT_API_CORS_ORIGIN ?? null,
  /** Tempo de vida de uma sessão de aposta em minutos (padrão 30 min) */
  apostaSessionTtlMin: Number(process.env.APOSTA_SESSION_TTL_MIN ?? '30'),
  /** Entrada padrão (em CHZ) ao abrir uma rodada Copa, se admin não especificar */
  copaEntradaCHZDefault: process.env.COPA_ENTRADA_CHZ_DEFAULT ?? '10',

  /** Canal do ranking semanal de pontos (ex-chiliz bot) */
  coRankingChannelId: process.env.CO_RANKING_CHANNEL_ID ?? null,
  /** Canal de logs administrativos (eventos, pontos) */
  coLogChannelId: process.env.CO_LOG_CHANNEL_ID ?? null,

  /** Recompensas automáticas (pontos da comunidade) */
  pointsEnabled: process.env.POINTS_REWARDS_ENABLED !== 'false',
  pointsEventParticipation: Number(process.env.POINTS_EVENT_PARTICIPATION ?? '5'),
  pointsQuizPerCorrect: Number(process.env.POINTS_QUIZ_PER_CORRECT ?? '1'),
  pointsPalpiteExato: Number(process.env.POINTS_PALPITE_EXATO ?? '3'),
  pointsPalpiteVencedor: Number(process.env.POINTS_PALPITE_VENCEDOR ?? '1'),
};

/** True quando o bot pode validar pagamentos na chain (modo transferencia CHZ). */
export const onchainEnabled = !!env.chilizPaymentReceiverAddress;

export const API_BASE_URL = 'https://api.api-futebol.com.br/v1';

export const DEFAULT_GUILD_CONFIG = {
  campeonato_id: env.campeonatoId,
  pontos_exato: 3,
  pontos_vencedor: 1,
  cor_embed: '#5B4B8A',
  notificar_resultados: 1,
  auto_verificar: 1,
  auto_abrir_rodada: 0,
  cargo_palpites_id: null as string | null,
};
