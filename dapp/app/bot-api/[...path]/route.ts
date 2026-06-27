import { NextRequest, NextResponse } from "next/server";

function botApiBase(): string {
  return (
    process.env.BOT_API_URL ??
    process.env.NEXT_PUBLIC_BOT_API_URL ??
    "http://localhost:3001"
  );
}

async function proxy(
  req: NextRequest,
  pathSegments: string[],
): Promise<NextResponse> {
  const path = pathSegments.join("/");
  const target = `${botApiBase()}/${path}${req.nextUrl.search}`;

  const init: RequestInit = {
    method: req.method,
    cache: "no-store",
  };

  const contentType = req.headers.get("content-type");
  if (contentType) {
    init.headers = { "content-type": contentType };
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = await req.text();
  }

  try {
    const res = await fetch(target, init);
    const body = await res.arrayBuffer();

    return new NextResponse(body, {
      status: res.status,
      headers: {
        "content-type": res.headers.get("content-type") ?? "application/json",
      },
    });
  } catch {
    return NextResponse.json(
      {
        error: "bot_offline",
        message:
          "Bot offline ou inacessível. Na raiz do projeto, execute npm run dev e aguarde o HTTP server na porta 3001.",
      },
      { status: 503 },
    );
  }
}

type RouteContext = { params: { path: string[] } };

export async function GET(req: NextRequest, { params }: RouteContext) {
  return proxy(req, params.path);
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  return proxy(req, params.path);
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  return proxy(req, params.path);
}

export async function PUT(req: NextRequest, { params }: RouteContext) {
  return proxy(req, params.path);
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  return proxy(req, params.path);
}
