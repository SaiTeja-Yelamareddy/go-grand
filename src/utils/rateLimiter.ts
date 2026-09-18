/**
 * Authentication Rate Limiter
 * Enforces attempt thresholds and lockout durations to defend against brute-force attacks.
 */

interface RateLimitRecord {
  attempts: number;
  lockedUntil: number;
}

const STORAGE_PREFIX = 'gg_ratelimit_';

export function checkRateLimit(
  actionKey: string,
  maxAttempts = 5
): { allowed: boolean; remainingAttempts: number; retryAfterSeconds: number } {
  try {
    const raw = sessionStorage.getItem(`${STORAGE_PREFIX}${actionKey}`);
    const now = Date.now();

    if (!raw) {
      return { allowed: true, remainingAttempts: maxAttempts, retryAfterSeconds: 0 };
    }

    const record: RateLimitRecord = JSON.parse(raw);

    // If currently locked out
    if (record.lockedUntil && now < record.lockedUntil) {
      const retryAfterSeconds = Math.ceil((record.lockedUntil - now) / 1000);
      return { allowed: false, remainingAttempts: 0, retryAfterSeconds };
    }

    // Lockout expired, reset attempts
    if (record.lockedUntil && now >= record.lockedUntil) {
      sessionStorage.removeItem(`${STORAGE_PREFIX}${actionKey}`);
      return { allowed: true, remainingAttempts: maxAttempts, retryAfterSeconds: 0 };
    }

    const remaining = Math.max(0, maxAttempts - record.attempts);
    return { allowed: remaining > 0, remainingAttempts: remaining, retryAfterSeconds: 0 };
  } catch {
    return { allowed: true, remainingAttempts: maxAttempts, retryAfterSeconds: 0 };
  }
}

export function recordFailedAttempt(
  actionKey: string,
  maxAttempts = 5,
  lockoutSeconds = 60
): { allowed: boolean; retryAfterSeconds: number } {
  try {
    const key = `${STORAGE_PREFIX}${actionKey}`;
    const raw = sessionStorage.getItem(key);
    const now = Date.now();

    let record: RateLimitRecord = raw ? JSON.parse(raw) : { attempts: 0, lockedUntil: 0 };
    record.attempts += 1;

    if (record.attempts >= maxAttempts) {
      // Exponential backoff if repeated lockouts
      const multiplier = Math.min(5, Math.floor(record.attempts / maxAttempts));
      const effectiveLockout = lockoutSeconds * multiplier;
      record.lockedUntil = now + effectiveLockout * 1000;
      sessionStorage.setItem(key, JSON.stringify(record));
      return { allowed: false, retryAfterSeconds: effectiveLockout };
    }

    sessionStorage.setItem(key, JSON.stringify(record));
    return { allowed: true, retryAfterSeconds: 0 };
  } catch {
    return { allowed: true, retryAfterSeconds: 0 };
  }
}

export function resetRateLimit(actionKey: string): void {
  try {
    sessionStorage.removeItem(`${STORAGE_PREFIX}${actionKey}`);
  } catch {}
}
