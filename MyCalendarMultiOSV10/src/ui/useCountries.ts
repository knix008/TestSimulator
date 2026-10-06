import { useCallback, useEffect, useState } from "react";
import { FALLBACK_COUNTRIES, type Country } from "../domain/countries";
import { clearCountriesCache, loadCountries } from "../domain/holidays";

export function useCountries() {
  const [countries, setCountries] = useState<Country[]>(FALLBACK_COUNTRIES);
  const [source, setSource] = useState<"loading" | "live" | "fallback">("loading");

  const apply = useCallback((result: { countries: Country[]; live: boolean }) => {
    setCountries(result.countries);
    setSource(result.live ? "live" : "fallback");
  }, []);

  const reload = useCallback(() => {
    setSource("loading");
    clearCountriesCache();
    return loadCountries().then(apply);
  }, [apply]);

  useEffect(() => {
    let alive = true;
    void loadCountries().then((result) => {
      if (!alive) return;
      apply(result);
    });
    return () => {
      alive = false;
    };
  }, [apply]);

  return { countries, source, reload };
}
