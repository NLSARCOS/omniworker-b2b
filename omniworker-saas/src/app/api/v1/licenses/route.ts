// src/app/api/v1/licenses/route.ts — List and create licenses for a tenant
import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";

export async function GET(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { user } = auth;
  if (!user.tenantId) {
    return NextResponse.json({ error: "Sin tenant" }, { status: 400 });
  }

  const licenses = await prisma.license.findMany({
    where: { tenantId: user.tenantId },
    include: {
      _count: { select: { apiKeys: true } },
      apiKeys: { select: { id: true, name: true, keyPrefix: true, lastUsedAt: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const tenant = await prisma.tenant.findUnique({
    where: { id: user.tenantId },
    include: { plan: true },
  });
  const maxLicenses = tenant?.plan?.maxLicenses ?? 1;
  const activeCount = licenses.filter(l => l.status === "ACTIVE").length;

  return NextResponse.json({
    success: true,
    licenses,
    usage: { active: activeCount, max: maxLicenses },
  });
}

export async function POST(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { user } = auth;
  if (!user.tenantId) {
    return NextResponse.json({ error: "Sin tenant" }, { status: 400 });
  }

  const ip = request.headers.get("x-forwarded-for") || "unknown-ip";
  const rateLimit = await checkRateLimit(ip, "default");
  if (!rateLimit.success) {
    return NextResponse.json({ error: "Demasiadas peticiones." }, { status: 429 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { name, deviceFingerprint } = body as { name?: string; deviceFingerprint?: string };

  const tenant = await prisma.tenant.findUnique({
    where: { id: user.tenantId },
    include: {
      plan: true,
      licenses: { where: { status: "ACTIVE" } },
    },
  });

  if (!tenant) return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });

  const maxLicenses = tenant.plan?.maxLicenses ?? 1;
  if (tenant.licenses.length >= maxLicenses) {
    return NextResponse.json(
      { error: `Límite de instalaciones alcanzado (${maxLicenses}). Actualizá tu plan.` },
      { status: 403 }
    );
  }

  const license = await prisma.license.create({
    data: {
      tenantId: user.tenantId,
      name: name || `Instalación ${tenant.licenses.length + 1}`,
      deviceFingerprint: deviceFingerprint || null,
      status: "ACTIVE",
    },
  });

  return NextResponse.json({ success: true, license }, { status: 201 });
}