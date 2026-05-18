// src/app/api/v1/licenses/[id]/route.ts — Single license: GET, PATCH, DELETE
import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";

function notFound() {
  return NextResponse.json({ error: "Licencia no encontrada" }, { status: 404 });
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateRequest(request);
  if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { user } = auth;
  if (!user.tenantId) return NextResponse.json({ error: "Sin tenant" }, { status: 400 });

  const { id } = await params;

  const license = await prisma.license.findFirst({
    where: { id, tenantId: user.tenantId },
    include: {
      _count: { select: { apiKeys: true } },
      apiKeys: { select: { id: true, name: true, keyPrefix: true, lastUsedAt: true } },
    },
  });

  if (!license) return notFound();
  return NextResponse.json({ success: true, license });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateRequest(request);
  if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { user } = auth;
  if (!user.tenantId) return NextResponse.json({ error: "Sin tenant" }, { status: 400 });

  const ip = request.headers.get("x-forwarded-for") || "unknown-ip";
  const rateLimit = await checkRateLimit(ip, "default");
  if (!rateLimit.success) {
    return NextResponse.json({ error: "Demasiadas peticiones." }, { status: 429 });
  }

  const { id } = await params;
  const existing = await prisma.license.findFirst({
    where: { id, tenantId: user.tenantId },
  });
  if (!existing) return notFound();

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { name, deviceFingerprint } = body as { name?: string; deviceFingerprint?: string };

  const updated = await prisma.license.update({
    where: { id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(deviceFingerprint !== undefined ? { deviceFingerprint } : {}),
    },
  });

  return NextResponse.json({ success: true, license: updated });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateRequest(request);
  if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { user } = auth;
  if (!user.tenantId) return NextResponse.json({ error: "Sin tenant" }, { status: 400 });

  const ip = request.headers.get("x-forwarded-for") || "unknown-ip";
  const rateLimit = await checkRateLimit(ip, "default");
  if (!rateLimit.success) {
    return NextResponse.json({ error: "Demasiadas peticiones." }, { status: 429 });
  }

  const { id } = await params;
  const existing = await prisma.license.findFirst({
    where: { id, tenantId: user.tenantId },
  });
  if (!existing) return notFound();

  // Revoke license + cascade-delete all its API keys immediately
  await prisma.$transaction([
    prisma.license.update({
      where: { id },
      data: { status: "REVOKED", revokedAt: new Date() },
    }),
    prisma.tenantApiKey.deleteMany({ where: { licenseId: id } }),
    prisma.edgeAgent.updateMany({
      where: { licenseId: id },
      data: { licenseId: null },
    }),
  ]);

  return NextResponse.json({ success: true });
}