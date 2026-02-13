import { NextRequest } from 'next/server';

interface RateBucket {
  count: number;
  resetAt: number;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

interface RateLimitOptions {
  namespace: string;
  key: string;
  limit: number;
  windowMs: number;
}

const buckets = new Map<string, RateBucket>();

function nowMs(): number {
  return Date.now();
}

function getBucketKey(namespace: string, key: string): string {
  return `${namespace}:${key}`;
}

function pruneExpiredBuckets(currentTime: number): void {
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= currentTime) {
      buckets.delete(key);
    }
  }
}

export function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }

  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    return realIp.trim();
  }

  return 'unknown';
}

export function checkRateLimit(options: RateLimitOptions): RateLimitResult {
  const currentTime = nowMs();
  pruneExpiredBuckets(currentTime);

  const bucketKey = getBucketKey(options.namespace, options.key);
  const existing = buckets.get(bucketKey);

  if (!existing || existing.resetAt <= currentTime) {
    buckets.set(bucketKey, {
      count: 1,
      resetAt: currentTime + options.windowMs,
    });

    return {
      allowed: true,
      remaining: Math.max(0, options.limit - 1),
      retryAfterMs: 0,
    };
  }

  existing.count += 1;
  buckets.set(bucketKey, existing);

  const allowed = existing.count <= options.limit;
  const retryAfterMs = Math.max(0, existing.resetAt - currentTime);

  return {
    allowed,
    remaining: Math.max(0, options.limit - existing.count),
    retryAfterMs: allowed ? 0 : retryAfterMs,
  };
}
