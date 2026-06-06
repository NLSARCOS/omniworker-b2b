// src/lib/provider-health.ts — Per-model health monitoring for providers
import { PrismaClient } from "@prisma/client";

// ── In-memory health cache ────────────────────────────────────────────────────
// Avoids hitting the DB on every admin panel GET. Invalidated after each
// manual health-check run so the next read always gets fresh data.
const HEALTH_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface HealthCacheEntry {
  data: Map<string, string[]>;
  expiresAt: number;
}

let _healthCache: HealthCacheEntry | null = null;

/** Invalidate the in-memory health cache (call after updateModelHealth runs). */
export function invalidateHealthCache(): void {
  _healthCache = null;
}

// Reuse the same provider URL mapping from chat/completions/route.ts
const PROVIDER_TEST_URLS: Record<string, string> = {
  openai: "https://api.openai.com/v1/chat/completions",
  anthropic: "https://api.anthropic.com/v1/messages",
  deepseek: "https://api.deepseek.com/chat/completions",
  groq: "https://api.groq.com/openai/v1/chat/completions",
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
  mistral: "https://api.mistral.ai/v1/chat/completions",
  cohere: "https://api.cohere.ai/v2/chat",
  together: "https://api.together.xyz/v1/chat/completions",
  nvidia: "https://integrate.api.nvidia.com/v1/chat/completions",
  "opencode-go": "https://opencode.ai/zen/go/v1/chat/completions",
  ollama: "http://localhost:11434/v1/chat/completions",
  moonshot: "https://api.kimi.com/coding/v1/chat/completions",
  "z-ai": "https://api.z.ai/api/coding/paas/v4/chat/completions",
  stepfun: "https://api.stepfun.ai/step_plan/v1/chat/completions",
  "kimi-code": "https://api.kimi.com/coding/v1/chat/completions",
};

// Models that use Anthropic's /messages endpoint format
const ANTHROPIC_FORMAT_MODELS = new Set([
  "qwen3.7-max",
  "qwen3.6-plus",
  "minimax-m2.7",
  "qwen3.5-plus",
  "minimax-m2.5",
]);

export type ModelHealthStatus = "available" | "degraded" | "unavailable";

export interface ModelHealthResult {
  providerId: string;
  modelId: string;
  status: ModelHealthStatus;
  latencyMs?: number;
  lastCheckedAt: Date;
  lastError?: string;
}

export interface ProviderModelHealth {
  id: string;
  providerId: string;
  modelId: string;
  status: ModelHealthStatus;
  latencyMs: number | null;
  lastCheckedAt: Date;
  lastSuccessAt: Date | null;
  lastError: string | null;
  consecutiveFails: number;
  consecutiveSuccess: number;
  totalChecks: number;
  totalFails: number;
}

const HEALTH_CHECK_TIMEOUT_MS = 15000;
const DEGRADED_LATENCY_THRESHOLD_MS = 10000;
const MAX_DEGRADED_LATENCY_MS = 30000;

/**
 * Categorize an HTTP response into a health status.
 */
export function categorizeError(status: number, latencyMs: number): ModelHealthStatus {
  if (status === 200) {
    if (latencyMs < DEGRADED_LATENCY_THRESHOLD_MS) {
      return "available";
    }
    if (latencyMs <= MAX_DEGRADED_LATENCY_MS) {
      return "degraded";
    }
    // Very slow responses treated as degraded
    return "degraded";
  }

  // Non-200 responses
  if (status === 429 || status === 500 || status === 502 || status === 503) {
    return "unavailable";
  }

  if (status === 404) {
    return "unavailable"; // Model not found
  }

  if (status === 401) {
    return "unavailable"; // Auth failure — won't recover without key change
  }

  if (status === 400) {
    return "unavailable"; // Bad request — don't retry
  }

  // Unknown error codes
  return "unavailable";
}

/**
 * Build provider-specific headers and payload for health check.
 */
function buildHealthCheckRequest(
  provider: { provider: string; apiKey: string; baseUrl?: string | null },
  modelId: string
): { url: string; headers: Record<string, string>; body: Record<string, unknown> } | null {
  const baseUrl = provider.baseUrl;
  let url: string;
  let headers: Record<string, string> = { "Content-Type": "application/json" };
  let body: Record<string, unknown>;

  // Determine base URL
  if (baseUrl && baseUrl.trim().length > 0) {
    url = baseUrl.replace(/\/$/, "");
  } else if (PROVIDER_TEST_URLS[provider.provider]) {
    url = PROVIDER_TEST_URLS[provider.provider];
  } else {
    return null;
  }

  // Provider-specific formatting
  if (provider.provider === "anthropic") {
    headers["x-api-key"] = provider.apiKey;
    headers["anthropic-version"] = "2023-06-01";
    body = {
      model: modelId,
      max_tokens: 30,
      messages: [{ role: "user", content: "hi" }],
    };
  } else if (provider.provider === "opencode-go" && ANTHROPIC_FORMAT_MODELS.has(modelId)) {
    // OpenCode Go models that use /messages endpoint
    url = "https://opencode.ai/zen/go/v1/messages";
    headers["Authorization"] = `Bearer ${provider.apiKey}`;
    headers["x-api-key"] = provider.apiKey;
    body = {
      model: modelId,
      max_tokens: 30,
      messages: [{ role: "user", content: "hi" }],
    };
  } else {
    headers["Authorization"] = `Bearer ${provider.apiKey}`;
    if (provider.provider === "moonshot" || provider.provider === "kimi-code") {
      headers["User-Agent"] = "KimiCLI/1.5";
    }
    body = {
      model: modelId,
      max_tokens: 30,
      messages: [{ role: "user", content: "hi" }],
      stream: false,
    };
  }

  return { url, headers, body };
}

/**
 * Check a single model's health by making a minimal API call.
 */
export async function checkModelHealth(
  provider: { provider: string; apiKey: string; baseUrl?: string | null; defaultModel?: string },
  modelId: string
): Promise<ModelHealthResult> {
  const startTime = Date.now();
  const providerId = provider.provider;

  const request = buildHealthCheckRequest(provider, modelId);
  if (!request) {
    return {
      providerId,
      modelId,
      status: "unavailable",
      latencyMs: 0,
      lastCheckedAt: new Date(),
      lastError: "No test URL configured for provider",
    };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);

    const response = await fetch(request.url, {
      method: "POST",
      headers: request.headers,
      body: JSON.stringify(request.body),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const latencyMs = Date.now() - startTime;
    const status = categorizeError(response.status, latencyMs);

    if (status === "available" || status === "degraded") {
      return {
        providerId,
        modelId,
        status,
        latencyMs,
        lastCheckedAt: new Date(),
      };
    }

    // Parse error for logging
    let errorDetail = `HTTP ${response.status}`;
    try {
      const errText = await response.text();
      const errJson = JSON.parse(errText);
      errorDetail = errJson.error?.message || errJson.error || errorDetail;
    } catch {
      // Keep default error detail
    }

    return {
      providerId,
      modelId,
      status: "unavailable",
      latencyMs,
      lastCheckedAt: new Date(),
      lastError: `${errorDetail} (${response.status})`,
    };
  } catch (error: unknown) {
    const latencyMs = Date.now() - startTime;
    const message = error instanceof Error ? error.message : String(error);
    const isTimeout = message.includes("abort") || message.includes("timeout");

    return {
      providerId,
      modelId,
      status: "unavailable",
      latencyMs,
      lastCheckedAt: new Date(),
      lastError: isTimeout ? `Timeout after ${HEALTH_CHECK_TIMEOUT_MS}ms` : message,
    };
  }
}

/**
 * Upsert health result into Prisma using state machine logic.
 *
 * Transition rules:
 * - available → needs 2 consecutive fails to become unavailable
 * - unavailable → needs 1 success to become available
 * - degraded → can go either way
 */
export async function updateModelHealth(
  prisma: PrismaClient,
  result: ModelHealthResult
) {
  const existing = await prisma.providerModelHealth.findUnique({
    where: {
      providerId_modelId: {
        providerId: result.providerId,
        modelId: result.modelId,
      },
    },
  });

  const now = new Date();
  let consecutiveFails: number;
  let consecutiveSuccess: number;
  let totalChecks: number;
  let totalFails: number;
  let status: ModelHealthStatus;

  if (existing) {
    totalChecks = existing.totalChecks + 1;
    totalFails = existing.totalFails + (result.status === "unavailable" ? 1 : 0);

    if (result.status === "unavailable") {
      consecutiveSuccess = 0;
      consecutiveFails = existing.consecutiveFails + 1;

      // Transition logic: need 2 consecutive fails to mark unavailable
      if (existing.status === "available" && consecutiveFails < 2) {
        // Stay available on first failure (avoid flapping)
        status = "available";
      } else if (existing.status === "degraded" && consecutiveFails < 2) {
        status = "degraded";
      } else {
        status = "unavailable";
      }
    } else {
      // Success (available or degraded)
      consecutiveFails = 0;
      consecutiveSuccess = existing.consecutiveSuccess + 1;

      // Transition logic: 1 success to recover from unavailable
      if (existing.status === "unavailable") {
        status = result.status; // Go to whatever the check says
      } else if (result.status === "degraded") {
        status = "degraded";
      } else {
        status = "available";
      }
    }
  } else {
    // First check
    totalChecks = 1;
    totalFails = result.status === "unavailable" ? 1 : 0;
    consecutiveFails = result.status === "unavailable" ? 1 : 0;
    consecutiveSuccess = result.status !== "unavailable" ? 1 : 0;
    status = result.status;
  }

  return prisma.providerModelHealth.upsert({
    where: {
      providerId_modelId: {
        providerId: result.providerId,
        modelId: result.modelId,
      },
    },
    create: {
      providerId: result.providerId,
      modelId: result.modelId,
      status,
      latencyMs: result.latencyMs ?? null,
      lastCheckedAt: now,
      lastSuccessAt: result.status !== "unavailable" ? now : existing?.lastSuccessAt ?? null,
      lastError: result.lastError ?? null,
      consecutiveFails,
      consecutiveSuccess,
      totalChecks,
      totalFails,
    },
    update: {
      status,
      latencyMs: result.latencyMs ?? null,
      lastCheckedAt: now,
      lastSuccessAt: result.status !== "unavailable" ? now : existing?.lastSuccessAt ?? null,
      lastError: result.lastError ?? null,
      consecutiveFails,
      consecutiveSuccess,
      totalChecks,
      totalFails,
    },
  });
}

/**
 * Get all healthy model IDs for a specific provider.
 */
export async function getHealthyModels(
  prisma: PrismaClient,
  providerId: string
): Promise<string[]> {
  const records = await prisma.providerModelHealth.findMany({
    where: {
      providerId,
      status: { in: ["available", "degraded"] },
    },
    select: { modelId: true },
  });
  return records.map((r) => r.modelId);
}

/**
 * Get all healthy models across all providers.
 * Returns a map: providerId -> modelId[]
 */
export async function getAllHealthyModels(
  prisma: PrismaClient
): Promise<Map<string, string[]>> {
  const records = await prisma.providerModelHealth.findMany({
    where: {
      status: { in: ["available", "degraded"] },
    },
    select: { providerId: true, modelId: true },
  });

  const map = new Map<string, string[]>();
  for (const r of records) {
    const existing = map.get(r.providerId) || [];
    existing.push(r.modelId);
    map.set(r.providerId, existing);
  }
  return map;
}

/**
 * Cached variant of getAllHealthyModels — returns the in-memory result if
 * it was computed less than HEALTH_CACHE_TTL_MS ago, otherwise refreshes.
 * Use this for read-heavy paths (admin panel GET, chat completions routing).
 */
export async function getAllHealthyModelsCached(
  prisma: PrismaClient
): Promise<Map<string, string[]>> {
  const now = Date.now();
  if (_healthCache && _healthCache.expiresAt > now) {
    return _healthCache.data;
  }
  const fresh = await getAllHealthyModels(prisma);
  _healthCache = { data: fresh, expiresAt: now + HEALTH_CACHE_TTL_MS };
  return fresh;
}
