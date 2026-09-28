const rateMap = new Map<string, { count: number; resetTime: number }>();

/**
 * Bound the in-process map so a long-running server cannot grow it without
 * limit. This limiter is per-process (not shared across instances); database
 * or edge-based limiting would be required for a multi-instance deployment.
 */
const MAX_ENTRIES = 10_000;

function pruneExpired(now: number) {
  for (const [key, record] of rateMap) {
    if (now > record.resetTime) rateMap.delete(key);
  }
  if (rateMap.size >= MAX_ENTRIES) rateMap.clear();
}

interface RateLimitOptions {
  windowMs?: number;
  max?: number;
}

export function rateLimit(options: RateLimitOptions = {}) {
  const { windowMs = 60 * 1000, max = 100 } = options;

  return function check(ip: string): { success: boolean; remaining: number; resetTime: number } {
    const now = Date.now();
    if (rateMap.size >= MAX_ENTRIES) pruneExpired(now);

    const record = rateMap.get(ip);

    if (!record || now > record.resetTime) {
      rateMap.set(ip, { count: 1, resetTime: now + windowMs });
      return { success: true, remaining: max - 1, resetTime: now + windowMs };
    }

    if (record.count >= max) {
      return { success: false, remaining: 0, resetTime: record.resetTime };
    }

    record.count++;
    return { success: true, remaining: max - record.count, resetTime: record.resetTime };
  };
}

export const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 100 });
export const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });
/** Per-minute budget for the anonymous customer assistant. */
export const customerAiLimiter = rateLimit({ windowMs: 60 * 1000, max: 20 });
/** Per-day budget for anonymous paid model calls, keyed by client address. */
export const customerAiDailyLimiter = rateLimit({ windowMs: 24 * 60 * 60 * 1000, max: 200 });
