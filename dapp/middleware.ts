import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifySession } from "@/lib/auth/session";

const QUIZ_API_PREFIXES = ["config", "quizzes", "status"];

function isQuizBotApi(pathname: string): boolean {
  if (!pathname.startsWith("/bot-api/")) return false;
  const rest = pathname.slice("/bot-api/".length);
  const segment = rest.split("/")[0];
  return QUIZ_API_PREFIXES.includes(segment);
}

function unauthorizedApi(message: string) {
  return NextResponse.json({ error: "unauthorized", message }, { status: 401 });
}

function forbiddenApi(message: string) {
  return NextResponse.json({ error: "forbidden", message }, { status: 403 });
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/conta-desativada" || pathname.startsWith("/conta-desativada/")) {
    return NextResponse.next();
  }

  const token = request.cookies.get("co_admin_session")?.value;
  const session = await verifySession(token);

  const isAdminPage = pathname === "/admin" || pathname.startsWith("/admin/");
  const isAdminApi = pathname.startsWith("/api/admin/");
  const needsAuth =
    pathname === "/quiz" ||
    pathname.startsWith("/quiz/") ||
    pathname === "/conta" ||
    pathname.startsWith("/conta/") ||
    isQuizBotApi(pathname);

  if (isAdminPage || isAdminApi) {
    if (!session) {
      if (isAdminApi) {
        return unauthorizedApi("Faça login como Developer para acessar o painel admin.");
      }
      const login = new URL("/login", request.url);
      login.searchParams.set("next", pathname);
      return NextResponse.redirect(login);
    }
    if (session.role !== "developer") {
      if (isAdminApi) {
        return forbiddenApi("Apenas Developers podem acessar o painel admin.");
      }
      return NextResponse.redirect(new URL("/quiz", request.url));
    }
    return NextResponse.next();
  }

  if (!needsAuth) return NextResponse.next();

  if (session) return NextResponse.next();

  if (isQuizBotApi(pathname)) {
    return unauthorizedApi("Faça login para acessar o painel do quiz.");
  }

  const login = new URL("/login", request.url);
  login.searchParams.set("next", pathname);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: [
    "/quiz",
    "/quiz/:path*",
    "/conta",
    "/conta/:path*",
    "/conta-desativada",
    "/admin",
    "/admin/:path*",
    "/api/admin/:path*",
    "/bot-api/config",
    "/bot-api/quizzes",
    "/bot-api/quizzes/:path*",
    "/bot-api/status",
  ],
};
