const BOT_API_DIRECT =
  process.env.NEXT_PUBLIC_BOT_API_URL ?? "http://localhost:3001";

function botApiBase(): string {
  if (typeof window !== "undefined") return "/bot-api";
  return BOT_API_DIRECT;
}

export type SiteAdminRole = "developer" | "community_manager" | "moderator";

export async function siteAuthLogin(
  username: string,
  password: string,
  meta?: { ip?: string | null; userAgent?: string | null },
): Promise<{
  ok: boolean;
  user?: { id: string; username: string; role: SiteAdminRole; roleLabel: string };
  sessionId?: string;
  error?: string;
}> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (meta?.ip) headers["x-forwarded-for"] = meta.ip;
  if (meta?.userAgent) headers["user-agent"] = meta.userAgent;

  const res = await fetch(`${botApiBase()}/api/site/auth/login`, {
    method: "POST",
    headers,
    body: JSON.stringify({ username, password }),
    cache: "no-store",
  });
  const json = (await res.json()) as {
    ok?: boolean;
    user?: { id: string; username: string; role: SiteAdminRole; roleLabel: string };
    sessionId?: string;
    error?: string;
  };
  if (!res.ok) return { ok: false, error: json.error ?? `http_${res.status}` };
  return { ok: true, user: json.user, sessionId: json.sessionId };
}

export async function siteAuthVerify(
  sessionId: string,
  userId: string,
): Promise<{
  ok: boolean;
  user?: { id: string; username: string; role: SiteAdminRole; roleLabel: string };
  error?: string;
}> {
  const res = await fetch(`${botApiBase()}/api/site/auth/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId, userId }),
    cache: "no-store",
  });
  const json = (await res.json()) as {
    ok?: boolean;
    user?: { id: string; username: string; role: SiteAdminRole; roleLabel: string };
    error?: string;
  };
  if (!res.ok) return { ok: false, error: json.error ?? `http_${res.status}` };
  return { ok: Boolean(json.ok && json.user), user: json.user };
}

export async function siteAuthChangePassword(
  session: { sessionId: string; userId: string },
  currentPassword: string,
  newPassword: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await siteAdminFetch("/api/site/auth/change-password", session, {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "erro" };
  }
}

export async function siteAuthLogout(sessionId: string | undefined): Promise<void> {
  if (!sessionId) return;
  await fetch(`${botApiBase()}/api/site/auth/logout`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId }),
    cache: "no-store",
  });
}

export async function siteAdminFetch<T>(
  path: string,
  session: { sessionId: string; userId: string },
  init?: RequestInit,
): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("x-site-session-id", session.sessionId);
  headers.set("x-site-user-id", session.userId);
  if (init?.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const res = await fetch(`${botApiBase()}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(json.error ?? `http_${res.status}`);
  }
  return (await res.json()) as T;
}
