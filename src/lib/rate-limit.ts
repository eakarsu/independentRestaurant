const rateMap = new Map<string, { count: number; resetTime: number }>();

interface RateLimitOptions {
  windowMs?: number;
  max?: number;
}

export function rateLimit(options: RateLimitOptions = {}) {
  const { windowMs = 60 * 1000, max = 100 } = options;

  return function check(ip: string): { success: boolean; remaining: number; resetTime: number } {
    const now = Date.now();
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
