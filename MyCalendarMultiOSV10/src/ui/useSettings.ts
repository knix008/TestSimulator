import { useEffect, useRef, useState } from "react";
import { messages, systemLanguage } from "../domain/i18n";
import type { Language, Messages } from "../domain/messages";
import {
  DEFAULT_SETTINGS,
  normalizeSettings,
  readStoredSettings,
  writeStoredSettings,
  type Settings,
} from "../domain/settings";
import { applyTheme, getTheme } from "../domain/themes";
import { isTauri, onTrayLanguage, readInstallLanguage, setAutostartEnabled, syncShell } from "../platform/desktop";

export interface ReadyContext {
  settings: Settings & { language: Language };
  update: (patch: Partial<Settings>) => void;
  desktopError: string | null;
  t: Messages;
}

/** Only one window should follow the tray language item, the others pick the change up from storage. */
export function useSettings({ followTray = false }: { followTray?: boolean } = {}) {
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
        /** The installer picked the language; a desktop run that never went through one follows the system instead of asking. */
        const installed = (await readInstallLanguage()) ?? (isTauri() ? systemLanguage() : null);
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
  const updateRef = useRef(update);
  updateRef.current = update;

  useEffect(() => {
    if (!followTray) return;
    let stop: (() => void) | null = null;
    let alive = true;
    void onTrayLanguage((language) => updateRef.current({ language })).then((unlisten) => {
      if (alive) stop = unlisten;
      else unlisten();
    });
    return () => {
      alive = false;
      stop?.();
    };
  }, [followTray]);

  return { settings, ready, update, desktopError };
}
