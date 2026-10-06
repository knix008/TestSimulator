import { useEffect, useRef, useState } from "react";
import { messages } from "../domain/i18n";
import type { Language, Messages } from "../domain/messages";
import {
  DEFAULT_SETTINGS,
  normalizeSettings,
  readStoredSettings,
  writeStoredSettings,
  type Settings,
} from "../domain/settings";
import { applyTheme, getTheme } from "../domain/themes";
import { readInstallLanguage, setAutostartEnabled, syncShell } from "../platform/desktop";

export interface ReadyContext {
  settings: Settings & { language: Language };
  update: (patch: Partial<Settings>) => void;
  desktopError: string | null;
  t: Messages;
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);
  const [desktopError, setDesktopError] = useState<string | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const autostartSeen = useRef(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const stored = readStoredSettings();
      let next = stored ?? { ...DEFAULT_SETTINGS };
      if (!next.language) {
        const installed = await readInstallLanguage();
        if (installed) {
          next = { ...next, language: installed };
          writeStoredSettings(next);
        }
      }
      if (!alive) return;
      settingsRef.current = next;
      setSettings(next);
      setReady(true);
    })();

    const onChange = () => {
      const next = readStoredSettings();
      if (!next) return;
      settingsRef.current = next;
      setSettings(next);
    };
    window.addEventListener("mycalendar-settings", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      alive = false;
      window.removeEventListener("mycalendar-settings", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    applyTheme(getTheme(settings.themeId), settings.opacity);
    if (!settings.language) return;
    document.documentElement.lang = settings.language;
    document.title = messages[settings.language].appName;
  }, [ready, settings.language, settings.opacity, settings.themeId]);

  useEffect(() => {
    if (!ready || !settings.language) return;
    const current = settingsRef.current;
    if (!current.language) return;
    void syncShell(current, messages[current.language]).catch((error: unknown) => {
      setDesktopError(error instanceof Error ? error.message : String(error));
    });
  }, [ready, settings.language, settings.alwaysOnTop]);

  useEffect(() => {
    if (!ready) return;
    if (!autostartSeen.current) {
      autostartSeen.current = true;
      if (!settings.autostart) return;
    }
    void setAutostartEnabled(settings.autostart).catch((error: unknown) => {
      setDesktopError(error instanceof Error ? error.message : String(error));
    });
  }, [ready, settings.autostart]);

  const update = (patch: Partial<Settings>) => {
    const next = normalizeSettings({ ...settingsRef.current, ...patch });
    settingsRef.current = next;
    setSettings(next);
    writeStoredSettings(next);
    setDesktopError(null);
  };

  return { settings, ready, update, desktopError };
}
