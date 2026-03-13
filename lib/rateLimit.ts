import { NextRequest } from "next/server";

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const rateLimitStore = new Map<string, RateLimitEntry>();

export function getClientIp(req: NextRequest): string {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const [first] = forwardedFor.split(",");
    if (first?.trim()) {
      return first.trim();
    }
  }

  const realIp = req.headers.get("x-real-ip");
  if (realIp?.trim()) {
    return realIp.trim();
  }

  return "unknown";
}

export function enforceRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const current = rateLimitStore.get(key);

  if (!current || current.resetAt <= now) {
    rateLimitStore.set(key, {
      count: 1,
      resetAt: now + windowMs,
    });
    return {
      allowed: true,
      retryAfterSeconds: 0,
      remaining: limit - 1,
    };
  }

  if (current.count >= limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((current.resetAt - now) / 1000),
      remaining: 0,
    };
  }

  current.count += 1;
  rateLimitStore.set(key, current);

  return {
    allowed: true,
    retryAfterSeconds: 0,
    remaining: Math.max(0, limit - current.count),
  };
}
