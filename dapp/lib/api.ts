const BOT_API_DIRECT =
  process.env.NEXT_PUBLIC_BOT_API_URL ?? "http://localhost:3001";

/** No browser usa proxy same-origin (/bot-api) para evitar CORS e conflito de porta. */
function botApiBase(): string {
  if (typeof window !== "undefined") return "/bot-api";
  return BOT_API_DIRECT;
}

export type BolaoSession = {
  sessionId: string;
  discordUserId: string;
  discordUsername: string;
  rodadaId: number;
  numeroRodada: number;
  paymentMode: "transferencia";
  paymentReceiverAddress: string;
  entradaCHZWei: string;
  partidas: Array<{
    partidaId: number;
    timeMandante: string;
    timeVisitante: string;
    siglaMandante: string | null;
    siglaVisitante: string | null;
    escudoMandante: string | null;
    escudoVisitante: string | null;
    dataIso: string | null;
    estadio: string | null;
  }>;
  palpites: Array<{ partidaId: number; mandante: number; visitante: number }>;
  status: "pendente" | "confirmada" | "expirada";
  expiraEm: string;
};

export type RodadaInfo = {
  rodadaId: number;
  numeroRodada: number;
  entradaCHZWei: string;
  totalPalpites: number;
  pagamentosConfirmados: number;
  status: "aberta" | "fechada" | "finalizada";
};

export type VincularSessao = {
  token: string;
  discordUserId: string;
  discordUsername: string;
  mensagem: string;
  expiraEm: string;
};

export type SiteEstado = {
  guildId: string;
  rodada: null | {
    id: number;
    numeroRodada: number;
    status: "aberta" | "fechada" | "finalizada";
    modalidade: "free" | "copa";
    entradaCHZWei: string | null;
  };
  partidas?: Array<{
    partidaId: number;
    timeMandante: string;
    timeVisitante: string;
    siglaMandante: string | null;
    siglaVisitante: string | null;
    escudoMandante: string | null;
    escudoVisitante: string | null;
    dataIso: string | null;
    status: string;
    placarMandante: number | null;
    placarVisitante: number | null;
    processada: boolean;
  }>;
  ranking?: Array<{
    discord_user_id: string;
    discord_username: string | null;
    total_pontos: number;
    acertos_exatos: number;
    acertos_vencedor: number;
    total_palpites: number;
  }>;
};

export type SitePalpites = {
  rodadaId: number;
  discordUserId: string;
  wallet: string;
  palpites: Array<{
    partidaId: number;
    mandante: number;
    visitante: number;
    pontos: number;
  }>;
};

function formatFetchError(path: string, err: unknown): Error {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg === "Failed to fetch" || msg.includes("NetworkError")) {
    return new Error(
      `Não foi possível conectar ao bot (API em ${BOT_API_DIRECT}). ` +
        `Na raiz do projeto, rode "npm run dev" e confira se aparece ` +
        `"HTTP server interno ativo em http://0.0.0.0:3001".`,
    );
  }
  return new Error(msg || `Erro ao chamar ${path}`);
}

function formatHttpError(method: string, path: string, status: number): Error {
  if (status === 500 || status === 502 || status === 503 || status === 504) {
    return new Error(
      `Bot offline ou inacessível em ${BOT_API_DIRECT}. ` +
        `Na raiz do projeto, execute "npm run dev" e aguarde ` +
        `"HTTP server interno ativo em http://0.0.0.0:3001".`,
    );
  }
  return new Error(`${method} ${path} -> HTTP ${status}`);
}

async function get<T>(path: string): Promise<T> {
  const url = `${botApiBase()}${path}`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw formatHttpError("GET", path, res.status);
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof Error && err.message.includes("Bot offline")) throw err;
    throw formatFetchError(path, err);
  }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const url = `${botApiBase()}${path}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      let detalhe = "";
      try {
        const json = (await res.json()) as { detalhe?: string; error?: string };
        detalhe = json.detalhe ?? json.error ?? "";
      } catch {
        // ignora parse se resposta nao for JSON
      }
      if (!detalhe && (res.status === 500 || res.status === 502 || res.status === 503)) {
        throw formatHttpError("POST", path, res.status);
      }
      throw new Error(
        `POST ${path} -> HTTP ${res.status}${detalhe ? ` (${detalhe})` : ""}`,
      );
    }
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("POST ")) throw err;
    throw formatFetchError(path, err);
  }
}

export const api = {
  getSession: (sessionId: string) =>
    get<BolaoSession>(`/api/sessions/${sessionId}`),
  confirmarBolao: (sessionId: string, txHash: string, wallet: string) =>
    post<{ ok: true }>(`/api/sessions/${sessionId}/confirmar`, {
      txHash,
      wallet,
    }),
  getRodada: (rodadaId: number) => get<RodadaInfo>(`/api/rodadas/${rodadaId}`),
  getVincular: (token: string) =>
    get<VincularSessao>(`/api/wallet/vincular/${token}`),
  confirmarVinculo: (token: string, wallet: string, assinatura: string) =>
    post<{ ok: true }>(`/api/wallet/vincular/${token}/confirmar`, {
      wallet,
      assinatura,
    }),
  getSiteEstado: (guildId?: string) =>
    get<SiteEstado>(
      `/api/site/estado${guildId ? `?guildId=${encodeURIComponent(guildId)}` : ""}`,
    ),
  getSitePalpites: (rodadaId: number, wallet: string) =>
    get<SitePalpites>(
      `/api/site/palpites?rodadaId=${rodadaId}&wallet=${encodeURIComponent(wallet)}`,
    ),
  salvarSitePalpites: (
    rodadaId: number,
    wallet: string,
    palpites: Array<{ partidaId: number; mandante: number; visitante: number }>,
  ) =>
    post<{ ok: true; totalPalpites: number }>(`/api/site/palpites`, {
      rodadaId,
      wallet,
      palpites,
    }),
};
