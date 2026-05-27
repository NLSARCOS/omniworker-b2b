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

// Pre-configured rate limiters
const limiters = {
  // Auth endpoints: 5 per 15 min
  auth: redis
    ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(5, "15 m") })
    : null,
  // Chat/completions: 60 per min
  chat: redis
    ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(60, "1 m") })
    : null,
  // Admin: 30 per min
  admin: redis
    ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(30, "1 m") })
    : null,
  // General API: 120 per min
  default: redis
    ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(120, "1 m") })
    : null,
};

type RateLimitTier = "auth" | "chat" | "admin" | "default";

export async function checkRateLimit(
  identifier: string,
  tier: RateLimitTier = "default"
): Promise<{ success: boolean; remaining: number; reset: number; limit: number }> {
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
    case "auth": return 5;
    case "chat": return 60;
    case "admin": return 30;
    default: return 120;
  }
}

function getWindowForTier(tier: RateLimitTier): number {
  switch (tier) {
    case "auth": return 15 * 60 * 1000;
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
