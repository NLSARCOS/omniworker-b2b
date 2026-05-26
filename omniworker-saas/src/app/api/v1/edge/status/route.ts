// src/app/api/v1/edge/status/route.ts — Listar edge agents del tenant
import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { user } = auth;

  if (!user.tenantId) {
    return NextResponse.json({ agents: [] });
  }

  const agents = await prisma.edgeAgent.findMany({
    where: { tenantId: user.tenantId },
    orderBy: { lastSeenAt: "desc" },
  });

  return NextResponse.json({
    success: true,
    agents: agents.map((a) => ({
      id: a.id,
      agentName: a.agentName,
      hostname: a.hostname,
      platform: a.platform,
      status: a.status,
      capabilities: JSON.parse(a.capabilities),
      lastSeenAt: a.lastSeenAt,
      createdAt: a.createdAt,
    })),
  });
}

export async function DELETE(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { user } = auth;

  if (!user.tenantId) {
    return NextResponse.json({ error: "Sin tenant" }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const agentId = searchParams.get("id");
  if (!agentId) {
    return NextResponse.json({ error: "id requerido" }, { status: 400 });
  }

  const agent = await prisma.edgeAgent.findFirst({
    where: { id: agentId, tenantId: user.tenantId },
  });

  if (!agent) {
    return NextResponse.json({ error: "Agente no encontrado" }, { status: 404 });
  }

  await prisma.edgeAgent.delete({
    where: { id: agentId },
  });

  return NextResponse.json({ success: true });
}
