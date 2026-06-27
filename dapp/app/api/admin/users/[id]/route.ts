import { NextResponse } from "next/server";
import { getAuthUser, isDeveloper } from "@/lib/auth/server";
import { siteAdminFetch } from "@/lib/site-admin-api";

type Ctx = { params: { id: string } };

async function requireDev() {
  const user = await getAuthUser();
  if (!user) return { res: NextResponse.json({ error: "nao_autenticado" }, { status: 401 }) };
  if (!isDeveloper(user)) {
    return { res: NextResponse.json({ error: "sem_permissao" }, { status: 403 }) };
  }
  return { user };
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const gate = await requireDev();
  if ("res" in gate && gate.res) return gate.res;
  const { user } = gate as { user: NonNullable<Awaited<ReturnType<typeof getAuthUser>>> };
  const data = await siteAdminFetch(`/api/site/admins/${params.id}`, {
    sessionId: user.sessionId,
    userId: user.id,
  }, { method: "DELETE" });
  return NextResponse.json(data);
}

export async function PATCH(req: Request, { params }: Ctx) {
  const gate = await requireDev();
  if ("res" in gate && gate.res) return gate.res;
  const { user } = gate as { user: NonNullable<Awaited<ReturnType<typeof getAuthUser>>> };
  const body = await req.json();
  const data = await siteAdminFetch(`/api/site/admins/${params.id}`, {
    sessionId: user.sessionId,
    userId: user.id,
  }, { method: "PATCH", body: JSON.stringify(body) });
  return NextResponse.json(data);
}
