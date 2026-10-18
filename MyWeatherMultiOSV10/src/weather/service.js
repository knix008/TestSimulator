import { isOfflineError } from "../core/errors.js";
import { airQualityUrl, applyAirQuality, parseAirQuality } from "./air.js";
import { aggregate } from "./aggregate.js";
import { EXTENDED_SOURCE, createProviders } from "./providers.js";

export async function loadWeather(location, options) {
  const fetchImpl = options.fetchImpl;
  const enabled = new Set(options.sources || createProviders().map((provider) => provider.id));
  const providers = createProviders().filter((provider) => enabled.has(provider.id));
  if (!providers.length) {
    return aggregate([{ id: "none", ok: false, error: "No sources enabled" }]);
  }
  const fill = enabled.has(EXTENDED_SOURCE.follows) ? fetchExtended(location, options) : Promise.resolve(null);
  const air = fetchAir(location, options);
  let finished = 0;
  const results = await Promise.all(
    providers.map(async (provider) => {
      try {
        if (options.signal?.aborted) {
          const error = new Error("Aborted");
          error.name = "AbortError";
          throw error;
        }
        const response = await fetchImpl(provider.url(location), {
          headers: provider.headers || {},
          signal: options.signal,
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const json = await response.json();
        return { id: provider.id, ok: true, data: provider.parse(json) };
      } catch (error) {
        return { id: provider.id, ok: false, error: error?.message || String(error), name: error?.name, code: error?.code || "" };
      } finally {
        finished += 1;
        options.onProgress?.(Math.round((finished / providers.length) * 100), provider.id);
      }
    }),
  );
  if (results.every((result) => result.name === "AbortError")) {
    const error = new Error("Aborted");
    error.name = "AbortError";
    throw error;
  }
  if (results.length && results.every((result) => isOfflineError({ code: result.code, name: result.name, message: result.error }))) {
    const error = new Error("OFFLINE");
    error.code = "OFFLINE";
    throw error;
  }
  return applyAirQuality(aggregate(results, await fill), await air);
}

/** Quiet, like the monthly fill-in: a failure only leaves the dust line empty. */
async function fetchAir(location, options) {
  try {
    const response = await options.fetchImpl(airQualityUrl(location), { signal: options.signal });
    if (!response.ok) return null;
    return parseAirQuality(await response.json());
  } catch {
    return null;
  }
}

/** The monthly fill-in. It is quiet: a failure only leaves the later days empty. */
async function fetchExtended(location, options) {
  try {
    const response = await options.fetchImpl(EXTENDED_SOURCE.url(location), { headers: EXTENDED_SOURCE.headers, signal: options.signal });
    if (!response.ok) return null;
    return { id: EXTENDED_SOURCE.id, ok: true, data: EXTENDED_SOURCE.parse(await response.json()) };
  } catch {
    return null;
  }
}
