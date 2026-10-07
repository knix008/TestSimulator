import { useEffect, useMemo, useState, type MouseEvent, type ReactNode } from "react";
import { MONTH_TITLE_FORMATS, monthTitle } from "../domain/calendar";
import { countryName, sortCountries } from "../domain/countries";
import { requestHolidayRefresh } from "../domain/holidays";
import { lunarSupported } from "../domain/lunar";
import {
  DATE_FONT_FAMILIES,
  DATE_FONT_WEIGHT_VALUES,
  DATE_FONT_WEIGHTS,
  dateFontFor,
  dateFontPatch,
  DEFAULT_SETTINGS,
  FULLSCREEN_KEY,
  MAX_DATE_FONT_SCALE,
  MIN_DATE_FONT_SCALE,
  opacityFromTransparency,
  pickDateFont,
  readFullscreen,
  sameDateFont,
  transparencyFromOpacity,
  type DateFont,
  type DateFontFamily,
  type Weekday,
} from "../domain/settings";
import { dateFontStyle } from "./dateFont";
import { darkThemes, lightThemes } from "../domain/themes";
import { dragWindow, isTauri } from "../platform/desktop";
import { AboutInfo } from "./AboutInfo";
import { BackgroundImageSettings } from "./BackgroundImageSettings";
import { Dropdown } from "./Dropdown";
import { RangeField } from "./RangeField";
import {
  CalendarIcon,
  FlagIcon,
  FontIcon,
  GearIcon,
  GlobeIcon,
  InfoIcon,
  KoreaFlag,
  LocationIcon,
  MoonIcon,
  PaletteIcon,
  PinIcon,
  PowerIcon,
  RefreshIcon,
  SlidersIcon,
  SunIcon,
  TransparencyIcon,
  UnitedKingdomFlag,
  WeekStartIcon,
} from "./icons";
import { parseSettingsTab, SETTINGS_TAB_KEY, takeRequestedTab, type SettingsTab } from "./settingsTab";
import type { ReadyContext } from "./useSettings";
import { useCountries } from "./useCountries";
import { WindowChrome } from "./WindowChrome";

const WEEKDAYS: Weekday[] = [0, 1, 2, 3, 4, 5, 6];

export function SettingsScreen({
  ctx,
  onClose,
  onHeaderMouseDown,
}: {
  ctx: ReadyContext;
  onClose: () => void;
  onHeaderMouseDown?: (event: MouseEvent) => void;
}) {
  const { settings, update, t, desktopError } = ctx;
  const desktop = isTauri();
  const currentMode = settings.themeId.startsWith("light-") ? "light" : "dark";
  const transparency = transparencyFromOpacity(settings.opacity);
  const [tab, setTab] = useState<SettingsTab>(() => takeRequestedTab() ?? "general");
  const [today] = useState(() => new Date());

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== SETTINGS_TAB_KEY) return;
      const requested = parseSettingsTab(event.newValue);
      if (!requested) return;
      setTab(requested);
      localStorage.removeItem(SETTINGS_TAB_KEY);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  // Opens on the font of whatever the calendar shows now, and follows it into and out of full screen.
  const [fontFullscreen, setFontFullscreen] = useState(() => desktop && readFullscreen());
  useEffect(() => {
    if (!desktop) return;
    const onStorage = (event: StorageEvent) => {
      if (event.key === FULLSCREEN_KEY) setFontFullscreen(event.newValue === "1");
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [desktop]);
  const font = dateFontFor(settings, fontFullscreen);
  const setFont = (patch: Partial<DateFont>) => update(dateFontPatch(settings, fontFullscreen, patch));
  const [mode, setMode] = useState<"light" | "dark">(currentMode);
  const [query, setQuery] = useState("");
  const { countries, source, reload } = useCountries();
  const visibleThemes = mode === "light" ? lightThemes : darkThemes;
  const countryOptions = useMemo(() => {
    const sorted = sortCountries(countries, settings.language);
    const needle = query.trim().toLowerCase();
    const filtered = needle
      ? sorted.filter((country) => {
          const label = countryName(country, settings.language).toLowerCase();
          return (
            label.includes(needle) ||
            country.en.toLowerCase().includes(needle) ||
            country.code.toLowerCase().includes(needle)
          );
        })
      : sorted;
    if (filtered.some((country) => country.code === settings.countryCode)) return filtered;
    const selected = sorted.find((country) => country.code === settings.countryCode);
    return selected ? [selected, ...filtered] : filtered;
  }, [countries, query, settings.countryCode, settings.language]);

  const onMouseDown = (event: MouseEvent) => {
    if (desktop) {
      void dragWindow(event);
      return;
    }
    onHeaderMouseDown?.(event);
  };

  const tabs: Array<{ id: SettingsTab; label: string; icon: ReactNode }> = [
    { id: "general", label: t.general, icon: <SlidersIcon /> },
    { id: "appearance", label: t.appearance, icon: <PaletteIcon /> },
    { id: "calendar", label: t.calendarSection, icon: <CalendarIcon /> },
    { id: "holidays", label: t.holidaysSection, icon: <FlagIcon /> },
    { id: "about", label: t.aboutTab, icon: <InfoIcon /> },
  ];

  return (
    <section className="panel screen">
      <WindowChrome icon={<GearIcon />} title={t.settings} closeLabel={t.close} onClose={onClose} onMouseDown={onMouseDown} />
      <div className="tabs" role="tablist">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </div>
      <div className="screen-body" role="tabpanel">
        {tab === "general" && (
          <>
            {!desktop && <p className="banner">{t.webBanner}</p>}
            <label className="field with-icon">
              <GlobeIcon />
              {t.language}
            </label>
            <div className="segment">
              <button type="button" aria-pressed={settings.language === "ko"} onClick={() => update({ language: "ko" })}>
                <KoreaFlag />
                한국어
              </button>
              <button type="button" aria-pressed={settings.language === "en"} onClick={() => update({ language: "en" })}>
                <UnitedKingdomFlag />
                English
              </button>
            </div>
            <label className="check">
              <input
                type="checkbox"
                checked={settings.alwaysOnTop}
                disabled={!desktop}
                onChange={(event) => update({ alwaysOnTop: event.target.checked })}
              />
              <PinIcon />
              <span>{t.alwaysOnTop}</span>
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={settings.autostart}
                disabled={!desktop}
                onChange={(event) => update({ autostart: event.target.checked })}
              />
              <PowerIcon />
              <span>{t.autostart}</span>
            </label>
            {!desktop && <p className="hint">{t.desktopOnly}</p>}
            {desktopError && <p className="error">{desktopError}</p>}
          </>
        )}
        {tab === "appearance" && (
          <>
            <label className="field with-icon" htmlFor="transparency">
              <TransparencyIcon />
              {t.transparency}
            </label>
            <RangeField
              id="transparency"
              name={t.transparency}
              value={transparency}
              min={0}
              max={100}
              buttonStep={5}
              title={t.transparencyHint}
              t={t}
              onChange={(value) => update({ opacity: opacityFromTransparency(value) })}
            />
            <div className="segment">
              <button type="button" aria-pressed={mode === "light"} onClick={() => setMode("light")}>
                <SunIcon />
                {t.light}
              </button>
              <button type="button" aria-pressed={mode === "dark"} onClick={() => setMode("dark")}>
                <MoonIcon />
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
                  <span className="swatch-name">{theme.name[settings.language]}</span>
                </button>
              ))}
            </div>
            <BackgroundImageSettings settings={settings} update={update} t={t} />
          </>
        )}
        {tab === "calendar" && (
          <>
            <label className="field with-icon" id="month-title-format-label">
              <CalendarIcon />
              {t.monthTitleFormat}
            </label>
            <Dropdown
              value={settings.monthTitleFormats[settings.language]}
              ariaLabel={t.monthTitleFormat}
              options={MONTH_TITLE_FORMATS[settings.language].map((format) => ({
                value: format,
                label: monthTitle(today.getFullYear(), today.getMonth(), settings.language, t.months, format),
              }))}
              onChange={(format) =>
                update({ monthTitleFormats: { ...settings.monthTitleFormats, [settings.language]: format } })
              }
            />
            <p className="hint">{t.monthTitleFormatHint}</p>
            <label className="field with-icon" id="week-start-label">
              <WeekStartIcon />
              {t.weekStart}
            </label>
            <div className="segment weekday-segment" role="group" aria-labelledby="week-start-label">
              {WEEKDAYS.map((day) => (
                <button
                  key={day}
                  type="button"
                  aria-pressed={settings.weekStartsOn === day}
                  aria-label={t.weekdays[day]}
                  title={t.weekdays[day]}
                  onClick={() => update({ weekStartsOn: day })}
                >
                  {t.weekdaysShort[day]}
                </button>
              ))}
            </div>
            <p className="hint">{t.weekStartHint}</p>
            <label className="check">
              <input type="checkbox" checked={settings.showLunar} onChange={(event) => update({ showLunar: event.target.checked })} />
              <MoonIcon />
              <span>{t.showLunar}</span>
            </label>
            <p className="hint">{lunarSupported() ? t.lunarHint : t.lunarUnavailable}</p>
            <div className="font-head">
              <label className="field with-icon" htmlFor="date-font-size">
                <FontIcon />
                {t.dateFont}
              </label>
              <button
                type="button"
                className="text-btn"
                disabled={sameDateFont(font, pickDateFont(DEFAULT_SETTINGS))}
                onClick={() => setFont(pickDateFont(DEFAULT_SETTINGS))}
              >
                {t.resetFont}
              </button>
            </div>
            {desktop && (
              <div className="font-row">
                <span className="font-label" id="date-font-target-label">
                  {t.dateFontTarget}
                </span>
                <div className="segment" role="group" aria-labelledby="date-font-target-label">
                  {([false, true] as const).map((on) => (
                    <button key={String(on)} type="button" aria-pressed={fontFullscreen === on} onClick={() => setFontFullscreen(on)}>
                      {on ? t.dateFontTargets.fullscreen : t.dateFontTargets.window}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="font-row">
              <span className="font-label">{t.dateFontSize}</span>
              <RangeField
                id="date-font-size"
                name={t.dateFontSize}
                value={Math.round(font.dateFontScale * 100)}
                min={Math.round(MIN_DATE_FONT_SCALE * 100)}
                max={Math.round(MAX_DATE_FONT_SCALE * 100)}
                step={5}
                title={t.dateFontSizeHint}
                t={t}
                onChange={(value) => setFont({ dateFontScale: value / 100 })}
              />
            </div>
            <div className="font-row">
              <span className="font-label">{t.dateFontFamily}</span>
              <Dropdown
                value={font.dateFontFamily}
                ariaLabel={t.dateFontFamily}
                options={DATE_FONT_FAMILIES.map((family) => ({ value: family, label: t.fontFamilies[family] }))}
                onChange={(family) => setFont({ dateFontFamily: family as DateFontFamily })}
              />
            </div>
            <div className="font-row">
              <span className="font-label" id="date-font-weight-label">
                {t.dateFontWeight}
              </span>
              <div className="segment" role="group" aria-labelledby="date-font-weight-label">
                {DATE_FONT_WEIGHTS.map((weight) => (
                  <button
                    key={weight}
                    type="button"
                    aria-pressed={font.dateFontWeight === weight}
                    style={{ fontWeight: DATE_FONT_WEIGHT_VALUES[weight] }}
                    onClick={() => setFont({ dateFontWeight: weight })}
                  >
                    {t.fontWeights[weight]}
                  </button>
                ))}
              </div>
            </div>
            <label className="check">
              <input
                type="checkbox"
                checked={font.dateFontItalic}
                onChange={(event) => setFont({ dateFontItalic: event.target.checked })}
              />
              <span className="italic-mark">I</span>
              <span>{t.dateFontItalic}</span>
            </label>
            <div className="font-preview" aria-label={t.fontPreview} style={dateFontStyle(font)}>
              <span>{t.fontPreview}</span>
              {[1, 9, 14, 25, 31].map((day) => (
                <b key={day}>{day}</b>
              ))}
            </div>
            <p className="hint">{t.dateFontSizeHint}</p>
            {desktop && <p className="hint">{t.dateFontTargetHint}</p>}
          </>
        )}
        {tab === "holidays" && (
          <>
            <p className="hint">{t.countryHint}</p>
            <label className="field with-icon" htmlFor="country-search">
              <LocationIcon />
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
            <Dropdown
              value={settings.countryCode}
              ariaLabel={t.country}
              options={countryOptions.map((country) => ({
                value: country.code,
                label: `${countryName(country, settings.language)} (${country.code})`,
              }))}
              onChange={(countryCode) => update({ countryCode })}
            />
            {countryOptions.length === 0 && <p className="hint">{t.noCountry}</p>}
            <p className="hint">
              {source === "loading" ? t.countriesLoading : source === "live" ? t.countriesLive : t.countriesFallback}
            </p>
            <button
              type="button"
              className="text-btn solid"
              onClick={() => {
                void reload();
                requestHolidayRefresh();
              }}
            >
              <RefreshIcon />
              {t.refreshHolidays}
            </button>
          </>
        )}
        {tab === "about" && <AboutInfo t={t} />}
      </div>
    </section>
  );
}
