import { useMemo, useState } from "react";
import { countryName, sortCountries } from "../domain/countries";
import { requestHolidayRefresh } from "../domain/holidays";
import { darkThemes, lightThemes } from "../domain/themes";
import { isTauri } from "../platform/desktop";
import type { ReadyContext } from "./useSettings";
import { useCountries } from "./useCountries";
import { WindowChrome } from "./WindowChrome";

export function SettingsScreen({ ctx, onClose }: { ctx: ReadyContext; onClose: () => void }) {
  const { settings, update, t, desktopError } = ctx;
  const desktop = isTauri();
  const currentMode = settings.themeId.startsWith("light-") ? "light" : "dark";
  const [mode, setMode] = useState<"light" | "dark">(currentMode);
  const [query, setQuery] = useState("");
  const { countries, source, reload } = useCountries();
  const transparency = Math.round((1 - settings.opacity) * 100);
  const visibleThemes = mode === "light" ? lightThemes : darkThemes;
  const countryOptions = useMemo(() => {
    const sorted = sortCountries(countries, settings.language);
    const needle = query.trim().toLowerCase();
    const filtered = needle
      ? sorted.filter((country) => {
          const label = countryName(country, settings.language).toLowerCase();
          return label.includes(needle) || country.en.toLowerCase().includes(needle) || country.code.toLowerCase().includes(needle);
        })
      : sorted;
    if (filtered.some((country) => country.code === settings.countryCode)) return filtered;
    const selected = sorted.find((country) => country.code === settings.countryCode);
    return selected ? [selected, ...filtered] : filtered;
  }, [countries, query, settings.countryCode, settings.language]);

  return (
    <section className="panel screen">
      <WindowChrome title={t.settings} closeLabel={t.close} onClose={onClose} />
      <div className="screen-body">
        {!desktop && <p className="banner">{t.webBanner}</p>}
        <section>
          <h2>{t.general}</h2>
          <label className="field" htmlFor="language">
            {t.language}
          </label>
          <div className="segment" id="language">
            <button type="button" aria-pressed={settings.language === "ko"} onClick={() => update({ language: "ko" })}>
              한국어
            </button>
            <button type="button" aria-pressed={settings.language === "en"} onClick={() => update({ language: "en" })}>
              English
            </button>
          </div>
        </section>
        <section>
          <h2>{t.startup}</h2>
          <label className="check">
            <input
              type="checkbox"
              checked={settings.alwaysOnTop}
              disabled={!desktop}
              onChange={(event) => update({ alwaysOnTop: event.target.checked })}
            />
            <span>{t.alwaysOnTop}</span>
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={settings.autostart}
              disabled={!desktop}
              onChange={(event) => update({ autostart: event.target.checked })}
            />
            <span>{t.autostart}</span>
          </label>
          {!desktop && <p className="hint">{t.desktopOnly}</p>}
          {desktopError && <p className="error">{desktopError}</p>}
        </section>
        <section>
          <h2>{t.appearance}</h2>
          <label className="field" htmlFor="transparency">
            {t.transparency} <strong>{transparency}%</strong>
          </label>
          <input
            id="transparency"
            type="range"
            min={0}
            max={85}
            value={transparency}
            onChange={(event) => update({ opacity: 1 - Number(event.target.value) / 100 })}
          />
          <p className="hint">{t.transparencyHint}</p>
          <label className="field">{t.theme}</label>
          <div className="segment">
            <button type="button" aria-pressed={mode === "light"} onClick={() => setMode("light")}>
              {t.light}
            </button>
            <button type="button" aria-pressed={mode === "dark"} onClick={() => setMode("dark")}>
              {t.dark}
            </button>
          </div>
          <div className="theme-grid">
            {visibleThemes.map((theme) => (
              <button
                key={theme.id}
                type="button"
                className="swatch"
                aria-pressed={settings.themeId === theme.id}
                onClick={() => update({ themeId: theme.id })}
              >
                <span className="chip" style={{ background: `linear-gradient(160deg, ${theme.bgTop}, ${theme.bg})` }}>
                  <i style={{ background: theme.accent }} />
                </span>
                <span>{theme.name[settings.language]}</span>
              </button>
            ))}
          </div>
        </section>
        <section>
          <h2>{t.holidaysSection}</h2>
          <p className="hint">{t.countryHint}</p>
          <label className="field" htmlFor="country-search">
            {t.country}
          </label>
          <input
            id="country-search"
            className="text-input"
            value={query}
            placeholder={t.searchCountry}
            autoComplete="off"
            onChange={(event) => setQuery(event.target.value)}
          />
          <select
            className="select"
            value={settings.countryCode}
            aria-label={t.country}
            onChange={(event) => update({ countryCode: event.target.value })}
          >
            {countryOptions.map((country) => (
              <option key={country.code} value={country.code}>
                {countryName(country, settings.language)} ({country.code})
              </option>
            ))}
          </select>
          {countryOptions.length === 0 && <p className="hint">{t.noCountry}</p>}
          <p className="hint">{source === "loading" ? t.countriesLoading : source === "live" ? t.countriesLive : t.countriesFallback}</p>
          <label className="field">{t.weekStart}</label>
          <div className="segment">
            <button type="button" aria-pressed={settings.weekStartsOn === 0} onClick={() => update({ weekStartsOn: 0 })}>
              {t.sunday}
            </button>
            <button type="button" aria-pressed={settings.weekStartsOn === 1} onClick={() => update({ weekStartsOn: 1 })}>
              {t.monday}
            </button>
          </div>
          <button
            type="button"
            className="text-btn solid"
            onClick={() => {
              void reload();
              requestHolidayRefresh();
            }}
          >
            {t.refreshHolidays}
          </button>
        </section>
      </div>
    </section>
  );
}
