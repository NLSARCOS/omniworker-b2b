// src/lib/rate-limit.ts — Tiered rate limiting with Upstash Redis fallback to memory
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Memory fallback for local dev (no Redis needed)
const memoryCache = new Map<string, { count: number; expiresAt: number }>();

function memoryRateLimit(
  identifier: string,
  maxRequests: number,
  windowMs: number
): { success: boolean; remaining: number; reset: number } {
  const now = Date.now();
  const record = memoryCache.get(identifier);

  // Cleanup expired entries occasionally
  if (Math.random() < 0.01) {
    for (const [key, val] of memoryCache.entries()) {
      if (val.expiresAt < now) memoryCache.delete(key);
    }
  }

  if (!record || record.expiresAt < now) {
    const expiresAt = now + windowMs;
    memoryCache.set(identifier, { count: 1, expiresAt });
    return { success: true, remaining: maxRequests - 1, reset: expiresAt };
  }

  if (record.count >= maxRequests) {
    return { success: false, remaining: 0, reset: record.expiresAt };
  }

  record.count++;
  return {
    success: true,
    remaining: maxRequests - record.count,
    reset: record.expiresAt,
  };
}

// Upstash Redis instances per tier
function getRedis() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    return Redis.fromEnv();
  }
  return null;
}

const redis = getRedis();

// Pre-configured rate limiters with extremely generous limits for Nelson's team
const limiters = {
  // Auth endpoints: 2000 per 15 min
  auth: redis
    ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(2000, "15 m") })
    : null,
  // Token refresh: 5000 per 15 min (normal desktop app sync usage)
  refresh: redis
    ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(5000, "15 m") })
    : null,
  // Chat/completions: 1000 per min (parallel agents workflow safe)
  chat: redis
    ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(1000, "1 m") })
    : null,
  // Admin: 500 per min
  admin: redis
    ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(500, "1 m") })
    : null,
  // General API: 3000 per min
  default: redis
    ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(3000, "1 m") })
    : null,
};

type RateLimitTier = "auth" | "refresh" | "chat" | "admin" | "default";

export async function checkRateLimit(
  rawIdentifier: string,
  tier: RateLimitTier = "default"
): Promise<{ success: boolean; remaining: number; reset: number; limit: number }> {
  // Extract first client IP from X-Forwarded-For header to prevent proxy aggregation
  const identifier = (rawIdentifier || "unknown-ip").split(",")[0].trim();
  const limiter = limiters[tier];

  if (limiter) {
    const { success, remaining, reset } = await limiter.limit(identifier);
    return { success, remaining, reset: reset * 1000, limit: getLimitForTier(tier) };
  }

  // Fallback to memory
  const limit = getLimitForTier(tier);
  const windowMs = getWindowForTier(tier);
  const result = memoryRateLimit(identifier, limit, windowMs);
  return { ...result, limit };
}

function getLimitForTier(tier: RateLimitTier): number {
  switch (tier) {
    case "auth": return 2000;
    case "refresh": return 5000;
    case "chat": return 1000;
    case "admin": return 500;
    default: return 3000;
  }
}

function getWindowForTier(tier: RateLimitTier): number {
  switch (tier) {
    case "auth": return 15 * 60 * 1000;
    case "refresh": return 15 * 60 * 1000;
    case "chat": return 60 * 1000;
    case "admin": return 60 * 1000;
    default: return 60 * 1000;
  }
}

// Backward-compat helper for non-async usage (deprecated)
export function checkRateLimitSync(
  ip: string,
  maxRequests: number = 20,
  windowMs: number = 60000
): { success: boolean; remaining: number } {
  const result = memoryRateLimit(ip, maxRequests, windowMs);
  return { success: result.success, remaining: result.remaining };
}
