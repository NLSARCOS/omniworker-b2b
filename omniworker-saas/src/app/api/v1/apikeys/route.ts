import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createApiKeySchema } from "@/lib/validation";
import { checkRateLimit } from "@/lib/rate-limit";
import { randomBytes, createHash } from "crypto";

export async function POST(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { user } = auth;
  if (!user.tenantId) {
    return NextResponse.json({ error: "El usuario no pertenece a un tenant" }, { status: 400 });
  }

  // Rate limiting
  const ip = request.headers.get("x-forwarded-for") || "unknown-ip";
  const rateLimit = await checkRateLimit(ip, "default");
  if (!rateLimit.success) {
    return NextResponse.json(
      { error: "Demasiadas peticiones. Intenta más tarde." },
      { status: 429 }
    );
  }

  let body;
  try {
    const rawBody = await request.json();
    const parsed = createApiKeySchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    body = parsed.data;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { name } = body;

  // Generate a new secure API Key
  const rawKey = "tsto_" + randomBytes(16).toString("hex");
  const keyPrefix = rawKey.substring(0, 16);
  const keyHash = createHash("sha256").update(rawKey).digest("hex");

  const newKey = await prisma.tenantApiKey.create({
    data: {
      tenantId: user.tenantId,
      keyHash: keyHash,
      keyPrefix: keyPrefix,
      name: name || "Nueva Clave",
    },
  });

  return NextResponse.json({
    success: true,
    apiKey: {
      id: newKey.id,
      name: newKey.name,
      key: rawKey,
      createdAt: newKey.createdAt,
    }
  });
}

export async function GET(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { user } = auth;
  if (!user.tenantId) {
    return NextResponse.json({ error: "El usuario no pertenece a un tenant" }, { status: 400 });
  }

  const keys = await prisma.tenantApiKey.findMany({
    where: { tenantId: user.tenantId },
    select: { id: true, name: true, keyPrefix: true, createdAt: true, lastUsedAt: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ success: true, keys });
}
