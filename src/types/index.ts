export interface GuildConfig {
  guild_id: string;
  /** Brasileirão (free) */
  canal_palpites_id: string | null;
  canal_resultados_id: string | null;
  /** Copa CHZ — independente do Brasileirão */
  canal_copa_palpites_id: string | null;
  canal_copa_resultados_id: string | null;
  campeonato_id: number;
  pontos_exato: number;
  pontos_vencedor: number;
  cor_embed: string;
  notificar_resultados: number;
  auto_verificar: number;
  auto_abrir_rodada: number;
  cargo_palpites_id: string | null;
}

export type Modalidade = 'free' | 'copa';

export interface Rodada {
  id: number;
  guild_id: string;
  campeonato_id: number;
  numero_rodada: number;
  channel_id: string;
  message_id: string | null;
  status: 'aberta' | 'fechada' | 'finalizada';
  aberta_em: string;
  fechada_em: string | null;
  resultados_publicados: number;
  modalidade: Modalidade;
  entrada_chz_wei: string | null;
}

export interface PartidaRodada {
  id: number;
  rodada_id: number;
  partida_id: number;
  time_mandante: string;
  time_visitante: string;
  sigla_mandante: string | null;
  sigla_visitante: string | null;
  escudo_mandante: string | null;
  escudo_visitante: string | null;
  estadio: string | null;
  data_realizacao: string | null;
  hora_realizacao: string | null;
  data_realizacao_iso: string | null;
  status: string;
  placar_mandante: number | null;
  placar_visitante: number | null;
  processada: number;
}

export interface Palpite {
  id: number;
  rodada_id: number;
  partida_id: number;
  discord_user_id: string;
  discord_username: string | null;
  palpite_mandante: number;
  palpite_visitante: number;
  pontos: number;
  criado_em: string;
  atualizado_em: string | null;
  wallet_address: string | null;
  tx_hash: string | null;
  onchain_confirmed: number;
}

export interface WalletLink {
  discord_user_id: string;
  wallet_address: string;
  signed_message: string;
  assinatura: string;
  vinculado_em: string;
}

export interface ApostaSession {
  session_id: string;
  discord_user_id: string;
  discord_username: string | null;
  rodada_id: number;
  palpites_json: string;
  status: 'pendente' | 'confirmada' | 'expirada';
  tx_hash: string | null;
  wallet_address: string | null;
  criado_em: string;
  expira_em: string;
  confirmado_em: string | null;
}

export interface VinculacaoWalletPendente {
  token: string;
  discord_user_id: string;
  discord_username: string | null;
  mensagem: string;
  criado_em: string;
  expira_em: string;
}

export interface TimeApi {
  time_id: number;
  nome_popular: string;
  sigla: string;
  escudo: string;
}

export interface PartidaApi {
  partida_id: number;
  time_mandante: TimeApi;
  time_visitante: TimeApi;
  placar_mandante: number | null;
  placar_visitante: number | null;
  status: string;
  data_realizacao: string;
  hora_realizacao: string;
  data_realizacao_iso: string;
  estadio?: { nome_popular: string };
}

export interface RodadaApi {
  nome: string;
  slug: string;
  rodada: number;
  status: string;
  partidas: PartidaApi[];
  faseId?: number;
}

/** Resposta da API Futebol para copas por fase (ex.: Copa 2026). */
export interface RodadaGrupoBlocoApi {
  nome: string;
  slug: string;
  rodada: number;
  status: string;
  partidas: PartidaApi[];
}

export type RodadaGruposApi = Record<string, RodadaGrupoBlocoApi[]>;

export interface FaseMetaApi {
  fase_id: number;
  nome: string;
  slug: string;
  status?: string;
}

export interface FaseDetailApi extends FaseMetaApi {
  grupos?: Record<string, { partidas?: Record<string, PartidaApi[]> }>;
  chaves?: Array<{ partida_ida?: PartidaApi; partida_volta?: PartidaApi | PartidaApi[] }>;
  rodadas?: RodadaApi[];
}

export interface CampeonatoApi {
  campeonato_id: number;
  nome: string;
  slug: string;
  nome_popular: string;
  rodada_atual?: {
    nome: string;
    rodada: number;
    status: string;
  } | null;
  fase_atual?: {
    fase_id: number;
    nome: string;
  } | null;
}

export interface ResultadoPalpite {
  palpite: Palpite;
  partida: PartidaRodada;
  pontos: number;
  tipo: 'exato' | 'vencedor' | 'erro';
}

export interface RankingEntry {
  discord_user_id: string;
  discord_username: string | null;
  total_pontos: number;
  acertos_exatos: number;
  acertos_vencedor: number;
  total_palpites: number;
}
