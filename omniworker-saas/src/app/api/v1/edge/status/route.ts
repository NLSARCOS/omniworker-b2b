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
