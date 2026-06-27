export type SiteAdminRole = "developer" | "community_manager" | "moderator";

export type AdminSession = {
  sub: string;
  username: string;
  role: SiteAdminRole;
  sessionId: string;
  exp: number;
};

export const ROLE_LABELS: Record<SiteAdminRole, string> = {
  developer: "Developer",
  community_manager: "Community Manager",
  moderator: "Moderator",
};

const SESSION_COOKIE = "co_admin_session";
const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 7;

function secretOrNull(): string | null {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) return null;
  return s;
}

function secret(): string {
  const s = secretOrNull();
  if (!s) {
    throw new Error("AUTH_SECRET ausente ou muito curto (mín. 16 caracteres).");
  }
  return s;
}

function encoder(): TextEncoder {
  return new TextEncoder();
}

async function hmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder().encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  const pad = value.length % 4 === 0 ? "" : "=".repeat(4 - (value.length % 4));
  const bin = atob(value.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function signSession(user: {
  id: string;
  username: string;
  role: SiteAdminRole;
  sessionId: string;
}): Promise<string> {
  const payload: AdminSession = {
    sub: user.id,
    username: user.username,
    role: user.role,
    sessionId: user.sessionId,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SEC,
  };
  const data = toBase64Url(encoder().encode(JSON.stringify(payload)));
  const key = await hmacKey();
  const sig = await crypto.subtle.sign("HMAC", key, encoder().encode(data));
  return `${data}.${toBase64Url(new Uint8Array(sig))}`;
}

export async function verifySession(
  token: string | undefined | null,
): Promise<AdminSession | null> {
  if (!token || !secretOrNull()) return null;
  const [data, sig] = token.split(".");
  if (!data || !sig) return null;

  try {
    const key = await hmacKey();
    const sigBytes = new Uint8Array(fromBase64Url(sig));
    const ok = await crypto.subtle.verify(
      "HMAC",
      key,
      sigBytes,
      encoder().encode(data),
    );
    if (!ok) return null;

    const payload = JSON.parse(
      new TextDecoder().decode(fromBase64Url(data)),
    ) as AdminSession;
    if (!payload.sub || !payload.exp || !payload.sessionId || !payload.role) {
      return null;
    }
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function sessionCookieOptions(token: string) {
  return {
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE_SEC,
  };
}

export function clearSessionCookieOptions() {
  return {
    name: SESSION_COOKIE,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 0,
  };
}

export { SESSION_COOKIE, SESSION_MAX_AGE_SEC };
