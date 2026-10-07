import { aggregate } from "./aggregate.js";
import { createProviders } from "./providers.js";

export async function loadWeather(location, options) {
  const fetchImpl = options.fetchImpl;
  const enabled = new Set(options.sources || createProviders().map((provider) => provider.id));
  const providers = createProviders().filter((provider) => enabled.has(provider.id));
  if (!providers.length) {
    return aggregate([{ id: "none", ok: false, error: "No sources enabled" }]);
  }
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
        return { id: provider.id, ok: false, error: error?.message || String(error), name: error?.name };
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
  return aggregate(results);
}
