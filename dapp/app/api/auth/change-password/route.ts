import { NextResponse } from "next/server";

import { getAuthUser } from "@/lib/auth/server";

import { clearSessionCookieOptions } from "@/lib/auth/session";

import { siteAuthChangePassword } from "@/lib/site-admin-api";



export async function POST(req: Request) {

  const user = await getAuthUser();

  if (!user) {

    return NextResponse.json({ error: "nao_autenticado" }, { status: 401 });

  }



  let body: { currentPassword?: string; newPassword?: string };

  try {

    body = (await req.json()) as { currentPassword?: string; newPassword?: string };

  } catch {

    return NextResponse.json({ error: "payload_invalido" }, { status: 400 });

  }



  const currentPassword = body.currentPassword ?? "";

  const newPassword = body.newPassword ?? "";

  if (!currentPassword || !newPassword) {

    return NextResponse.json({ error: "dados_invalidos" }, { status: 400 });

  }



  const result = await siteAuthChangePassword(

    { sessionId: user.sessionId, userId: user.id },

    currentPassword,

    newPassword,

  );



  if (!result.ok) {

    const msgs: Record<string, string> = {

      senha_atual_invalida: "Senha atual incorreta.",

      senha_curta: "Nova senha deve ter no mínimo 8 caracteres.",

      conta_desativada: "Conta desativada.",

    };

    const status = result.error === "conta_desativada" ? 403 : 400;

    return NextResponse.json(

      { error: result.error, message: msgs[result.error ?? ""] },

      { status },

    );

  }



  const res = NextResponse.json({

    ok: true,

    message: "Senha alterada. Faça login novamente.",

  });

  res.cookies.set(clearSessionCookieOptions());

  return res;

}


