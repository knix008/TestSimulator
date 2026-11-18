// Sign-in lockout: after a number of failed sign-ins in a row, an account waits before it may try again.
// The data service keeps the count (the screen only shows it); the administrator picks the wait in Settings.

/** Failed sign-ins in a row that lock an account. */
export const LOCK_ATTEMPTS = 5;
/** The shortest wait (minutes): five failures always cost at least ten minutes. */
export const LOCK_MIN_MINUTES = 10;
/** The longest wait (minutes): 30 days. */
export const LOCK_MAX_MINUTES = 30 * 24 * 60;
export const LOCK_DEFAULT_MINUTES = 10;

/** The waits offered in Settings, in minutes. Anything else in range is a "custom" wait. */
export const LOCK_CHOICES = [10, 20, 30, 60, 120, 180, 360, 720, 1440, 2880, 10080];

/** Minutes clamped into the allowed range; a bad value falls back to the default. */
export function clampLockMinutes(value) {
  const minutes = Math.round(Number(value));
  if (!Number.isFinite(minutes) || minutes <= 0) return LOCK_DEFAULT_MINUTES;
  return Math.min(LOCK_MAX_MINUTES, Math.max(LOCK_MIN_MINUTES, minutes));
}

/** The policy stored in the workspace (ws.security.lockMinutes). */
export function lockPolicy(ws) {
  return { attempts: LOCK_ATTEMPTS, minutes: clampLockMinutes(ws?.security?.lockMinutes ?? LOCK_DEFAULT_MINUTES) };
}

/** The key a failure is counted under: the typed account, the way sign-in matches it. */
export function lockKey(account) {
  return String(account || '').trim().toLowerCase();
}

/**
 * Counts failures per account. `state` is a plain object { key: { fails, until } } so it can be saved as JSON.
 * Every method takes `now` (ms) so tests do not need a clock.
 */
export function createLockout(state = {}) {
  const entries = state && typeof state === 'object' ? state : {};
  return {
    entries,
    /** Locked now? { locked, until (ms), fails } */
    check(account, now = Date.now()) {
      const entry = entries[lockKey(account)];
      if (!entry) return { locked: false, until: 0, fails: 0 };
      if (entry.until && entry.until > now) return { locked: true, until: entry.until, fails: entry.fails || 0 };
      if (entry.until && entry.until <= now) {
        // The wait is over: the next try starts a fresh count.
        delete entries[lockKey(account)];
        return { locked: false, until: 0, fails: 0 };
      }
      return { locked: false, until: 0, fails: entry.fails || 0 };
    },
    /** One more failure. Returns { locked, until, remaining } — remaining tries before the lock. */
    fail(account, policy = { attempts: LOCK_ATTEMPTS, minutes: LOCK_DEFAULT_MINUTES }, now = Date.now()) {
      const key = lockKey(account);
      const before = this.check(account, now);
      if (before.locked) return { locked: true, until: before.until, remaining: 0 };
      const fails = before.fails + 1;
      if (fails >= policy.attempts) {
        const until = now + clampLockMinutes(policy.minutes) * 60_000;
        entries[key] = { fails, until };
        return { locked: true, until, remaining: 0 };
      }
      entries[key] = { fails, until: 0 };
      return { locked: false, until: 0, remaining: policy.attempts - fails };
    },
    /** A good sign-in clears the count. */
    succeed(account) {
      delete entries[lockKey(account)];
    },
    /** The administrator lets an account try again now. */
    release(account) {
      delete entries[lockKey(account)];
    },
    /** Drops finished locks so the saved file stays small. */
    prune(now = Date.now()) {
      for (const [key, entry] of Object.entries(entries)) {
        if (entry.until && entry.until <= now) delete entries[key];
      }
    },
  };
}

/** "10분", "1시간 30분", "1일" — a wait in minutes as words. */
export function formatLockMinutes(minutes, lang = 'ko') {
  const total = clampLockMinutes(minutes);
  const days = Math.floor(total / 1440);
  const hours = Math.floor((total % 1440) / 60);
  const mins = total % 60;
  const parts = [];
  if (lang === 'en') {
    if (days) parts.push(`${days} day${days > 1 ? 's' : ''}`);
    if (hours) parts.push(`${hours} hour${hours > 1 ? 's' : ''}`);
    if (mins) parts.push(`${mins} minute${mins > 1 ? 's' : ''}`);
  } else {
    if (days) parts.push(`${days}일`);
    if (hours) parts.push(`${hours}시간`);
    if (mins) parts.push(`${mins}분`);
  }
  return parts.join(' ');
}

/** A countdown such as "9:58", "1:02:03" or "1일 2:03:04" / "1 day 2:03:04". */
export function formatCountdown(ms, lang = 'ko') {
  let seconds = Math.max(0, Math.ceil(ms / 1000));
  const days = Math.floor(seconds / 86400);
  seconds -= days * 86400;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const two = (n) => String(n).padStart(2, '0');
  const clock = h ? `${h}:${two(m)}:${two(s)}` : `${m}:${two(s)}`;
  if (!days) return clock;
  const dayWord = lang === 'en' ? `${days} day${days > 1 ? 's' : ''}` : `${days}일`;
  return `${dayWord} ${h ? clock : `0:${two(m)}:${two(s)}`}`;
}
