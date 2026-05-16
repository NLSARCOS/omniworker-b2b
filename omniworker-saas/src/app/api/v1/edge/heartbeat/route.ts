// src/app/api/v1/edge/heartbeat/route.ts — Keep-alive + update status
import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { user } = auth;
  const body = await request.json();
  const { agentId, status, capabilities } = body;

  if (!agentId) {
    return NextResponse.json({ error: "agentId es obligatorio" }, { status: 400 });
  }

  if (!user.tenantId) {
    return NextResponse.json({ error: "Sin tenant" }, { status: 400 });
  }

  // Verify agent belongs to user's tenant
  const agent = await prisma.edgeAgent.findFirst({
    where: { id: agentId, tenantId: user.tenantId },
  });

  if (!agent) {
    return NextResponse.json({ error: "Agente no encontrado" }, { status: 404 });
  }

  await prisma.edgeAgent.update({
    where: { id: agentId },
    data: {
      status: status || "online",
      lastSeenAt: new Date(),
      ...(capabilities ? { capabilities: JSON.stringify(capabilities) } : {}),
    },
  });

  // Return pending commands for the agent (future: queue system)
  return NextResponse.json({
    success: true,
    commands: [], // Placeholder for future command queue
  });
}
