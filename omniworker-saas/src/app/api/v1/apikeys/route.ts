import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { randomBytes, createHash } from "crypto";

export async function POST(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { user } = auth;
  if (!user.tenantId) {
    return NextResponse.json({ error: "El usuario no pertenece a un tenant" }, { status: 400 });
  }

  const ip = request.headers.get("x-forwarded-for") || "unknown-ip";
  const rateLimit = await checkRateLimit(ip, "default");
  if (!rateLimit.success) {
    return NextResponse.json({ error: "Demasiadas peticiones. Intenta más tarde." }, { status: 429 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { name, licenseId } = body as { name?: string; licenseId?: string };

  if (!licenseId) {
    return NextResponse.json({ error: "licenseId es requerido" }, { status: 400 });
  }

  // Verify license belongs to tenant and is ACTIVE
  const license = await prisma.license.findFirst({
    where: { id: licenseId, tenantId: user.tenantId, status: "ACTIVE" },
  });
  if (!license) {
    return NextResponse.json({ error: "Licencia inválida o inactiva" }, { status: 400 });
  }

  const rawKey = "tsto_" + randomBytes(16).toString("hex");
  const keyPrefix = rawKey.substring(0, 16);
  const keyHash = createHash("sha256").update(rawKey).digest("hex");

  const newKey = await prisma.tenantApiKey.create({
    data: {
      tenantId: user.tenantId,
      licenseId: license.id,
      keyHash,
      keyPrefix,
      name: name || "Nueva Clave",
    },
  });

  return NextResponse.json({
    success: true,
    apiKey: {
      id: newKey.id,
      name: newKey.name,
      key: rawKey,
      licenseId: license.id,
      licenseName: license.name,
      createdAt: newKey.createdAt,
    },
  });
}

export async function GET(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { user } = auth;
  if (!user.tenantId) {
    return NextResponse.json({ error: "El usuario no pertenece a un tenant" }, { status: 400 });
  }

  const keys = await prisma.tenantApiKey.findMany({
    where: { tenantId: user.tenantId },
    select: {
      id: true,
      name: true,
      keyPrefix: true,
      createdAt: true,
      lastUsedAt: true,
      licenseId: true,
      license: { select: { id: true, name: true, status: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ success: true, keys });
}

export async function DELETE(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { user } = auth;
  if (!user.tenantId) {
    return NextResponse.json({ error: "Sin tenant" }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const keyId = searchParams.get("id");
  if (!keyId) {
    return NextResponse.json({ error: "id requerido" }, { status: 400 });
  }

  const key = await prisma.tenantApiKey.findFirst({
    where: { id: keyId, tenantId: user.tenantId },
  });
  if (!key) {
    return NextResponse.json({ error: "Clave no encontrada" }, { status: 404 });
  }

  await prisma.tenantApiKey.delete({ where: { id: keyId } });

  return NextResponse.json({ success: true });
}