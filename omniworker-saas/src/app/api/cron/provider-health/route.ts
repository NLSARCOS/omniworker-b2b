// src/app/api/cron/provider-health/route.ts — Automated provider model health checks
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkModelHealth, updateModelHealth, invalidateHealthCache } from "@/lib/provider-health";
import { getAllModelIds } from "@/lib/provider-models";

const CRON_SECRET = process.env.CRON_SECRET;
const MAX_TOTAL_DURATION_MS = 5 * 60 * 1000; // 5 minute max (Vercel cron budget)

export async function POST(request: Request) {
  // 1. Authenticate via CRON_SECRET
  const authHeader = request.headers.get("authorization");
  if (!CRON_SECRET) {
    console.error("[ProviderHealth] CRON_SECRET not configured");
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }

  const token = authHeader?.replace("Bearer ", "").trim();
  if (token !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  // 2. Parse optional providerId filter
  let body: { providerId?: string } = {};
  try {
    body = await request.json();
  } catch {
    // No body is fine — run all providers
  }

  const startTime = Date.now();

  // 3. Get providers to check
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

  // 4. Providers run in parallel; models within each provider run sequentially
  // (same strategy as the manual health-check endpoint for consistency).
  const perProviderResults = await Promise.all(
    providers.map(async (provider) => {
      const modelIds = getAllModelIds(provider.provider);
      const results = [];
      for (const modelId of modelIds) {
        // Hard time-box: stop early if we are close to the cron budget
        if (Date.now() - startTime > MAX_TOTAL_DURATION_MS - 10_000) {
          console.warn(`[ProviderHealth] Approaching time limit, stopping ${provider.provider} early`);
          break;
        }
        const result = await checkModelHealth(provider, modelId);
        await updateModelHealth(prisma, result);
        results.push({
          providerId: result.providerId,
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

  // 5. Flatten + invalidate cache so next panel GET reads fresh data
  const results = perProviderResults.flat();
  invalidateHealthCache();

  const tested = results.length;
  const available = results.filter((r) => r.status === "available").length;
  const degraded = results.filter((r) => r.status === "degraded").length;
  const unavailable = results.filter((r) => r.status === "unavailable").length;
  const durationMs = Date.now() - startTime;

  console.log(
    `[ProviderHealth] Complete: ${tested} tested, ${available} available, ` +
      `${degraded} degraded, ${unavailable} unavailable (${durationMs}ms)`
  );

  return NextResponse.json({
    ok: true,
    tested,
    available,
    degraded,
    unavailable,
    results,
    durationMs,
  });
}

// Also support GET for manual trigger (with admin auth)
export async function GET(request: Request) {
  const auth = await import("@/lib/auth").then((m) => m.authenticateRequest(request));
  if (!auth || auth.user.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  // Trigger the health check by calling ourselves
  return POST(request);
}
