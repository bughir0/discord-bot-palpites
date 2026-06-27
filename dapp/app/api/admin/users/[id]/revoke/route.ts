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

export async function POST(_req: Request, { params }: Ctx) {
  const gate = await requireDev();
  if ("res" in gate && gate.res) return gate.res;
  const { user } = gate as { user: NonNullable<Awaited<ReturnType<typeof getAuthUser>>> };
  const data = await siteAdminFetch(`/api/site/admins/${params.id}/revoke-sessions`, {
    sessionId: user.sessionId,
    userId: user.id,
  }, { method: "POST", body: "{}" });
  return NextResponse.json(data);
}
