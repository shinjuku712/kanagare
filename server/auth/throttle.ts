/**
 * Login limits, kept in memory (a restart clears them).
 *
 * Per email: after MAX_FAILURES within WINDOW_MS, further attempts are refused
 * until the window runs out. Keyed by email rather than IP because behind a
 * proxy every request can look like it came from 127.0.0.1. The catch is that
 * someone can lock a known account out for a while; WINDOW_MS keeps it short.
 *
 * Overall: password checks cost ~40 ms of CPU each, and on Cloudflare they run
 * on the one thread that serves every request, so a flood of logins with random
 * emails could stall the board. A token bucket caps how many run per second.
 */
const MAX_FAILURES = 10;
const WINDOW_MS = 15 * 60 * 1000;
const MAX_TRACKED = 10_000;

const failures = new Map<string, { count: number; resetAt: number }>();

/** Minutes until `email` may try again, or 0 if it may try now. */
export function lockedFor(email: string): number {
  const entry = failures.get(email);
  if (!entry || entry.resetAt <= Date.now()) return 0;
  return entry.count >= MAX_FAILURES ? Math.ceil((entry.resetAt - Date.now()) / 60_000) : 0;
}

export function recordFailure(email: string): void {
  const now = Date.now();
  const entry = failures.get(email);
  if (entry && entry.resetAt > now) {
    entry.count++;
    return;
  }
  // Someone spraying random emails shouldn't be able to grow this forever.
  // Drop expired entries, then the oldest (Maps iterate in insertion order).
  if (failures.size >= MAX_TRACKED) {
    for (const [key, e] of failures) if (e.resetAt <= now) failures.delete(key);
    for (const key of failures.keys()) {
      if (failures.size < MAX_TRACKED) break;
      failures.delete(key);
    }
  }
  failures.set(email, { count: 1, resetAt: now + WINDOW_MS });
}

export function clearFailures(email: string): void {
  failures.delete(email);
}

const BURST = 10;
const PER_SECOND = 3;
let tokens = BURST;
let refilledAt = Date.now();

/** Take a slot for one password check, or false if too many are running. */
export function takeHashSlot(): boolean {
  const now = Date.now();
  tokens = Math.min(BURST, tokens + ((now - refilledAt) / 1000) * PER_SECOND);
  refilledAt = now;
  if (tokens < 1) return false;
  tokens -= 1;
  return true;
}
