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

  const { agentId, status, capabilities, version } = body;

  if (!user.tenantId) {
    return NextResponse.json({ error: "Sin tenant" }, { status: 400 });
  }

  const agent = await prisma.edgeAgent.findFirst({
    where: { id: agentId, tenantId: user.tenantId },
  });

  if (!agent) {
    return NextResponse.json({ error: "Agente no encontrado" }, { status: 404 });
  }

  const now = new Date();
  await prisma.edgeAgent.update({
    where: { id: agentId },
    data: {
      status: status || "online",
      lastSeenAt: now,
      ...(capabilities ? { capabilities: JSON.stringify(capabilities) } : {}),
    },
  });

  // Update license lastSeenAt if this agent is attached to a license
  if (agent.licenseId) {
    await prisma.license.update({
      where: { id: agent.licenseId },
      data: { lastSeenAt: now },
    }).catch(() => { /* license may have been revoked */ });
  }

  // License usage for desktop app header display
  const tenantWithPlan = await prisma.tenant.findUnique({
    where: { id: user.tenantId },
    include: { plan: true },
  });
  const activeLicenseCount = await prisma.license.count({
    where: { tenantId: user.tenantId, status: "ACTIVE" },
  });
  const maxLicenses = tenantWithPlan?.plan?.maxLicenses ?? 1;

  // Check for SaaS-controlled software updates
  let updateAvailable = false;
  let updatePayload = null;

  try {
    const latestUpdate = await prisma.appUpdate.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: "desc" },
    });

    if (latestUpdate && version) {
      if (isNewerVersion(version, latestUpdate.version)) {
        updateAvailable = true;
        let downloadUrl = latestUpdate.urlWindows; // fallback
        if (agent.platform === "darwin") {
          downloadUrl = latestUpdate.urlMac;
        } else if (agent.platform === "linux") {
          downloadUrl = latestUpdate.urlLinux;
        }
        updatePayload = {
          version: latestUpdate.version,
          downloadUrl,
          releaseNotes: latestUpdate.releaseNotes,
        };
      }
    }
  } catch (err) {
    console.error("Failed to check for updates during heartbeat:", err);
  }

  return NextResponse.json({
    success: true,
    commands: [],
    plan: user.plan,
    tokenBalance: user.tokenBalance,
    tenantName: user.tenantName,
    licenseUsage: { active: activeLicenseCount, max: maxLicenses },
    updateAvailable,
    updatePayload,
  });
}

function isNewerVersion(current: string, latest: string): boolean {
  try {
    const cleanCurr = current.replace(/[^0-9.]/g, "");
    const cleanLat = latest.replace(/[^0-9.]/g, "");

    const currParts = cleanCurr.split(".").map(Number);
    const latParts = cleanLat.split(".").map(Number);

    for (let i = 0; i < Math.max(currParts.length, latParts.length); i++) {
      const currPart = currParts[i] || 0;
      const latPart = latParts[i] || 0;
      if (latPart > currPart) return true;
      if (currPart > latPart) return false;
    }
    return false;
  } catch {
    return latest !== current;
  }
}

