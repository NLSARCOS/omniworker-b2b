// src/app/api/admin/providers/health-check/route.ts — Manual provider health check trigger
import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkModelHealth, updateModelHealth, invalidateHealthCache } from "@/lib/provider-health";
import { getAllModelIds } from "@/lib/provider-models";

// Module-level mutex: prevents concurrent health-check runs from hammering
// provider APIs simultaneously (e.g., multiple admins clicking at once).
let _checkRunning = false;

export async function POST(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth || auth.user.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  if (_checkRunning) {
    return NextResponse.json(
      { error: "Health check ya en progreso. Espera que termine antes de lanzar otro." },
      { status: 409 }
    );
  }

  let body: { providerId?: string } = {};
  try {
    body = await request.json();
  } catch {
    // No body is fine — run all providers
  }

  _checkRunning = true;
  const startTime = Date.now();

  const flatResults: Array<{
    providerId: string;
    providerName: string;
    modelId: string;
    status: string;
    latencyMs?: number;
    error?: string;
  }> = [];

  try {
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

    // Providers run in parallel; models within each provider run sequentially
    // to respect per-provider rate limits (100ms between models, not 300ms).
    const perProviderResults = await Promise.all(
      providers.map(async (provider) => {
        const modelIds = getAllModelIds(provider.provider);
        const results = [];
        for (const modelId of modelIds) {
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
          // Short delay between models of the same provider (rate limit buffer)
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        return results;
      })
    );

    // Flatten results from all providers
    for (const providerResults of perProviderResults) {
      flatResults.push(...providerResults);
    }

    // Invalidate in-memory cache so the next admin GET returns fresh data
    invalidateHealthCache();
  } finally {
    _checkRunning = false;
  }

  const tested = flatResults.length;
  const available = flatResults.filter((r) => r.status === "available").length;
  const degraded = flatResults.filter((r) => r.status === "degraded").length;
  const unavailable = flatResults.filter((r) => r.status === "unavailable").length;
  const durationMs = Date.now() - startTime;

  console.log(
    `[AdminHealthCheck] ${auth.user.email} triggered: ${tested} tested, ` +
      `${available} available, ${degraded} degraded, ${unavailable} unavailable (${durationMs}ms)`
  );

  return NextResponse.json({
    ok: true,
    tested,
    available,
    degraded,
    unavailable,
    results: flatResults,
    durationMs,
    triggeredBy: auth.user.email,
  });
}
