// src/app/api/v1/edge/register/route.ts — Registrar un edge agent
import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
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

  const body = await request.json();
  const { agentName, hostname, platform, capabilities } = body;

  if (!agentName) {
    return NextResponse.json(
      { error: "agentName es obligatorio" },
      { status: 400 }
    );
  }

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

  const agent = await prisma.edgeAgent.create({
    data: {
      tenantId: user.tenantId,
      agentName,
      hostname: hostname || null,
      platform: platform || null,
      status: "online",
      capabilities: JSON.stringify(capabilities || []),
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
