import { NextRequest, NextResponse } from "next/server";
import { clientIpFromRequest } from "@/lib/client-ip";
import { sessionCookieOptions, signSession } from "@/lib/auth/session";
import { siteAuthLogin } from "@/lib/site-admin-api";

function safeNext(value: unknown): string {
  if (typeof value !== "string") return "/quiz";
  if (!value.startsWith("/") || value.startsWith("//")) return "/quiz";
  return value;
}

export async function POST(req: NextRequest) {
  if (!process.env.AUTH_SECRET?.trim()) {
    return NextResponse.json(
      {
        error: "auth_nao_configurado",
        message: "Defina AUTH_SECRET no .env da raiz.",
      },
      { status: 503 },
    );
  }

  let body: { username?: string; password?: string; next?: string };
  try {
    body = (await req.json()) as { username?: string; password?: string; next?: string };
  } catch {
    return NextResponse.json({ error: "payload_invalido" }, { status: 400 });
  }

  const username = body.username?.trim() ?? "";
  const password = body.password ?? "";
  const next = safeNext(body.next);

  if (!username || !password) {
    return NextResponse.json({ error: "credenciais_ausentes" }, { status: 400 });
  }

  const ip = clientIpFromRequest(req);
  const userAgent = req.headers.get("user-agent");

  try {
    const result = await siteAuthLogin(username, password, { ip, userAgent });
    if (!result.ok || !result.user || !result.sessionId) {
      const status = result.error === "conta_desativada" ? 403 : 401;
      return NextResponse.json(
        { error: result.error ?? "credenciais_invalidas" },
        { status },
      );
    }

    const token = await signSession({
      id: result.user.id,
      username: result.user.username,
      role: result.user.role,
      sessionId: result.sessionId,
    });

    const res = NextResponse.json({
      ok: true,
      next: result.user.role === "developer" ? next : next.startsWith("/admin") ? "/quiz" : next,
      user: result.user,
    });
    res.cookies.set(sessionCookieOptions(token));
    return res;
  } catch {
    return NextResponse.json(
      {
        error: "bot_offline",
        message: "Bot offline. Execute npm run dev na raiz do projeto.",
      },
      { status: 503 },
    );
  }
}
