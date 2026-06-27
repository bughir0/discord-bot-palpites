import { NextResponse } from "next/server";
import { getAuthUser, isDeveloper } from "@/lib/auth/server";
import { siteAdminFetch } from "@/lib/site-admin-api";

async function requireDev() {
  const user = await getAuthUser();
  if (!user) return { res: NextResponse.json({ error: "nao_autenticado" }, { status: 401 }) };
  if (!isDeveloper(user)) {
    return { res: NextResponse.json({ error: "sem_permissao" }, { status: 403 }) };
  }
  return { user };
}

export async function GET() {
  const gate = await requireDev();
  if ("res" in gate && gate.res) return gate.res;
  const { user } = gate as { user: NonNullable<Awaited<ReturnType<typeof getAuthUser>>> };
  const data = await siteAdminFetch<{ ok: boolean; users: unknown[] }>(
    "/api/site/admins",
    { sessionId: user.sessionId, userId: user.id },
  );
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const gate = await requireDev();
  if ("res" in gate && gate.res) return gate.res;
  const { user } = gate as { user: NonNullable<Awaited<ReturnType<typeof getAuthUser>>> };
  const body = await req.json();
  const data = await siteAdminFetch("/api/site/admins", {
    sessionId: user.sessionId,
    userId: user.id,
  }, { method: "POST", body: JSON.stringify(body) });
  return NextResponse.json(data);
}
