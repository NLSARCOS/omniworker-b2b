// src/app/api/admin/providers/health-check/route.ts — Manual provider health check trigger
import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkModelHealth, updateModelHealth } from "@/lib/provider-health";
import { getAllModelIds } from "@/lib/provider-models";

export async function POST(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth || auth.user.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  let body: { providerId?: string } = {};
  try {
    body = await request.json();
  } catch {
    // No body is fine — run all providers
  }

  const startTime = Date.now();
  const results: Array<{
    providerId: string;
    providerName: string;
    modelId: string;
    status: string;
    latencyMs?: number;
    error?: string;
  }> = [];

  // Get providers to check
  let providers;
  if (body.providerId) {
    providers = await prisma.masterProvider.findMany({
      where: { id: body.providerId },
    });
  } else {
    providers = await prisma.masterProvider.findMany({
      where: { isActive: true },
      orderBy: { priority: "asc" },
    });
  }

  let tested = 0;
  let available = 0;
  let degraded = 0;
  let unavailable = 0;

  // Process each provider sequentially
  for (const provider of providers) {
    const modelIds = getAllModelIds(provider.provider);
    if (modelIds.length === 0) continue;

    for (const modelId of modelIds) {
      // Check this model
      const result = await checkModelHealth(provider, modelId);
      await updateModelHealth(prisma, result);

      results.push({
        providerId: provider.id,
        providerName: provider.name,
        modelId: result.modelId,
        status: result.status,
        latencyMs: result.latencyMs,
        error: result.lastError,
      });

      tested++;
      if (result.status === "available") available++;
      else if (result.status === "degraded") degraded++;
      else unavailable++;

      // Small delay between checks to avoid rate limits
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }

  const durationMs = Date.now() - startTime;

  console.log(`[AdminHealthCheck] ${auth.user.email} triggered: ${tested} tested, ${available} available, ${degraded} degraded, ${unavailable} unavailable (${durationMs}ms)`);

  return NextResponse.json({
    ok: true,
    tested,
    available,
    degraded,
    unavailable,
    results,
    durationMs,
    triggeredBy: auth.user.email,
  });
}
