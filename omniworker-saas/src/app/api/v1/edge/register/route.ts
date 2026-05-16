// src/app/api/v1/edge/register/route.ts — Registrar un edge agent
import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { edgeRegisterSchema } from "@/lib/validation";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  // Rate limiting
  const ip = request.headers.get("x-forwarded-for") || "unknown-ip";
  const rateLimit = await checkRateLimit(ip, "default");
  if (!rateLimit.success) {
    return NextResponse.json(
      { error: "Demasiadas peticiones. Intenta más tarde." },
      { status: 429 }
    );
  }

  const auth = await authenticateRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { user } = auth;

  if (!user.tenantId) {
    return NextResponse.json(
      { error: "Necesitas pertenecer a una organización para registrar agentes" },
      { status: 400 }
    );
  }

  let body;
  try {
    const rawBody = await request.json();
    const parsed = edgeRegisterSchema.safeParse(rawBody);
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

  const { agentName, hostname, platform, capabilities, licenseId } = body;

  // Check plan limits
  const tenant = await prisma.tenant.findUnique({
    where: { id: user.tenantId },
    include: { plan: true, edgeAgents: true },
  });

  if (!tenant) {
    return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });
  }

  const maxAgents = tenant.plan?.maxAgents ?? 1;
  if (tenant.edgeAgents.length >= maxAgents) {
    return NextResponse.json(
      { error: `Límite de agentes alcanzado (${maxAgents}). Actualice su plan.` },
      { status: 403 }
    );
  }

  if (licenseId) {
    const lic = await prisma.license.findFirst({
      where: { id: licenseId, tenantId: user.tenantId, status: "ACTIVE" },
    });
    if (!lic) {
      return NextResponse.json({ error: "Licencia inválida o inactiva" }, { status: 400 });
    }
  }

  const agent = await prisma.edgeAgent.create({
    data: {
      tenantId: user.tenantId,
      agentName,
      hostname: hostname || null,
      platform: platform || null,
      status: "online",
      capabilities: JSON.stringify(capabilities || []),
      ...(licenseId ? { licenseId } : {}),
    },
  });

  return NextResponse.json({
    success: true,
    agent: {
      id: agent.id,
      agentName: agent.agentName,
      status: agent.status,
    },
  });
}
