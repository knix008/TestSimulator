import { HOLIDAY_API } from "../version";

const CHECK_TIMEOUT_MS = 8000;

/**
 * Whether the holiday server can be reached. Any answer, even an error status, means the network is up; only a
 * request that cannot be sent at all (no connection, no DNS, timed out) counts as offline. `navigator.onLine` alone
 * is not enough: right after sign-in it can be true while no connection works yet.
 */
export async function checkOnline(signal?: AbortSignal): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
  const timeout = AbortSignal.timeout(CHECK_TIMEOUT_MS);
  try {
    await fetch(`${HOLIDAY_API}/api/v3/AvailableCountries`, {
      method: "HEAD",
      cache: "no-store",
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    return true;
  } catch (error) {
    if (signal?.aborted) throw error;
    return false;
  }
}
