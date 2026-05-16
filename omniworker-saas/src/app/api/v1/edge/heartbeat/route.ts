// src/app/api/v1/edge/heartbeat/route.ts — Keep-alive + update status
import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { edgeHeartbeatSchema } from "@/lib/validation";
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

  let body;
  try {
    const rawBody = await request.json();
    const parsed = edgeHeartbeatSchema.safeParse(rawBody);
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

  const { agentId, status, capabilities } = body;

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

  return NextResponse.json({
    success: true,
    commands: [], // Placeholder for future command queue
    plan: user.plan,
    tokenBalance: user.tokenBalance,
    tenantName: user.tenantName,
  });
}
