/**
 * Dialog hosting.
 *
 * `DialogWindow` is what a desktop popup window renders: it is handed a name and a
 * payload by the shell, paints the app's theme, and reports the height its content needs
 * so the window fits exactly — no popup ever scrolls. `InlineDialogs` is the web
 * build's equivalent, the same dialog components inside a modal layer.
 *
 * The dialogs themselves know nothing about either: they take a payload and call
 * `resolve`.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from "react";
import { applyTheme } from "../core/themes.js";
import type { AppSettings } from "../core/settings.js";
import { translator, type Language } from "../core/i18n.js";
import { api } from "./api.js";
import { inlineDialogs, type DialogName, type InlineDialogState } from "./host.js";
import { Icon } from "./icons.js";
import { useTextContextMenu } from "./contextMenus.js";
import { AboutDialog } from "./dialogs/AboutDialog.js";
import { SettingsDialog } from "./dialogs/SettingsDialog.js";
import { PrintDialog } from "./dialogs/PrintDialog.js";
import { ErrorDialog } from "./dialogs/ErrorDialog.js";
import { ProgressDialog } from "./dialogs/ProgressDialog.js";
import { UnsavedDialog } from "./dialogs/UnsavedDialog.js";
import { ConfirmDialog } from "./dialogs/ConfirmDialog.js";
import { PromptDialog } from "./dialogs/PromptDialog.js";
import { RemoteDialog } from "./dialogs/RemoteDialog.js";
import { TextPromptDialog } from "./dialogs/TextPromptDialog.js";
import { RecentDialog } from "./dialogs/RecentDialog.js";
import { GuideDialog } from "./dialogs/GuideDialog.js";
import { dialogSpec } from "./dialogSpecs.js";

export type DialogProps = {
  payload: unknown;
  settings: AppSettings & { settingsPath: string };
  t: ReturnType<typeof translator>;
  resolve: (value: unknown) => void;
  close: () => void;
};

const DIALOGS: Record<DialogName, (props: DialogProps) => ReactElement> = {
  guide: GuideDialog,
  about: AboutDialog,
  settings: SettingsDialog,
  print: PrintDialog,
  error: ErrorDialog,
  progress: ProgressDialog,
  unsaved: UnsavedDialog,
  confirm: ConfirmDialog,
  prompt: PromptDialog,
  remote: RemoteDialog,
  text: TextPromptDialog,
  recent: RecentDialog,
};

const TITLES: Record<DialogName, Parameters<ReturnType<typeof translator>>[0]> = {
  guide: "guide.title",
  about: "about.title",
  settings: "settings.title",
  print: "print.title",
  error: "error.title",
  progress: "progress.title",
  unsaved: "unsaved.title",
  confirm: "dlg.ok",
  prompt: "dlg.browse",
  text: "dir.rename",
  remote: "remote.title",
  recent: "recent.title",
};

const ICONS: Record<DialogName, string> = {
  guide: "book",
  about: "about",
  settings: "settings",
  print: "print",
  error: "error",
  progress: "clock",
  unsaved: "warning",
  confirm: "help",
  prompt: "folder",
  recent: "clock",
  text: "edit",
  remote: "cloud",
};

/* ------------------------------------------------------------------ *
 * The desktop popup window (`#dialog=`)
 * ------------------------------------------------------------------ */

export function DialogWindow() {
  const [message, setMessage] = useState<{ name: DialogName | null; payload: unknown; openId: number } | null>(null);
  const [settings, setSettings] = useState<(AppSettings & { settingsPath: string }) | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const bridge = window.mcm;
    if (!bridge) return;
    const offPayload = bridge.onDialogPayload((payload) => {
      setMessage(payload as { name: DialogName | null; payload: unknown; openId: number });
    });
    const offSettings = bridge.onSettingsChanged((value) => {
      setSettings(value as AppSettings & { settingsPath: string });
    });
    bridge.dialogPayload()
      .then((payload) => {
        if (payload) setMessage(payload as { name: DialogName | null; payload: unknown; openId: number });
      })
      .catch(() => {});
    api.settings().then(setSettings).catch(() => {});
    return () => {
      offPayload();
      offSettings();
    };
  }, []);

  useEffect(() => {
    if (settings) applyTheme(settings.theme, settings.customTheme);
  }, [settings]);

  // The window's own context menu: Cut/Copy/Paste in a field, never the WebView's.
  const language = (settings?.language ?? "ko") as Language;
  const menuT = useMemo(() => translator(language), [language]);
  useTextContextMenu(
    settings
      ? { theme: settings.theme, customTheme: settings.customTheme, language, fontFamily: settings.font.family }
      : null,
    settings ? menuT : null,
  );

  // Report the content's natural height so the window can be exactly that tall.
  useLayoutEffect(() => {
    const bridge = window.mcm;
    const body = bodyRef.current;
    // A resizable dialog (the guide) keeps the size the user gives it.
    if (!bridge || !body || !message?.name || dialogSpec(message.name).resizable) return;
    const report = () => {
      const rect = body.getBoundingClientRect();
      bridge.dialogSize({ width: 0, height: Math.ceil(rect.height) }).catch(() => {});
    };
    report();
    const observer = new ResizeObserver(report);
    observer.observe(body);
    return () => observer.disconnect();
  }, [message?.name, message?.openId]);

  const close = useCallback(() => {
    window.mcm?.closeDialog();
  }, []);

  const resolve = useCallback((value: unknown) => {
    if (!message?.name) return;
    window.mcm?.dialogResult(message.name, value);
    window.mcm?.closeDialog();
  }, [message?.name]);

  if (!message?.name || !settings) return <div className="dialog-window empty" />;

  const name = message.name;
  const Component = DIALOGS[name];
  const t = translator((settings.language ?? "ko") as Language);

  return (
    <div className="dialog-window" data-dialog={name}>
      <div ref={bodyRef}>
        <DialogFrame name={name} t={t} onClose={close}>
          <Component payload={message.payload} settings={settings} t={t} resolve={resolve} close={close} />
        </DialogFrame>
      </div>
    </div>
  );
}

function DialogFrame({
  name,
  t,
  onClose,
  children,
}: {
  name: DialogName;
  t: ReturnType<typeof translator>;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="dialog">
      <header className="dialog-title">
        <Icon name={ICONS[name]} size={16} />
        <span>{t(TITLES[name])}</span>
        <button type="button" className="icon-button dialog-close" title={t("dlg.close")} onClick={onClose}>
          <Icon name="close" size={14} />
        </button>
      </header>
      <div className="dialog-content">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * The web build's dialogs
 * ------------------------------------------------------------------ */

export function InlineDialogs() {
  const [list, setList] = useState<InlineDialogState[]>(inlineDialogs.get());
  const [settings, setSettings] = useState<(AppSettings & { settingsPath: string }) | null>(null);

  useEffect(() => inlineDialogs.subscribe(setList), []);
  useEffect(() => {
    api.settings().then(setSettings).catch(() => {});
  }, [list.length]);

  if (list.length === 0 || !settings) return null;
  const t = translator((settings.language ?? "ko") as Language);

  return (
    <div className="dialog-layer">
      {list.map((entry, index) => {
        if (!entry) return null;
        const Component = DIALOGS[entry.name];
        return (
          <div className="dialog-backdrop" key={`${entry.name}-${index}`}>
            <div className={`dialog floating size-${entry.name}`}>
              <header className="dialog-title">
                <Icon name={ICONS[entry.name]} size={16} />
                <span>{t(TITLES[entry.name])}</span>
                <button type="button" className="icon-button dialog-close" title={t("dlg.close")}
                  onClick={() => entry.resolve(null)}>
                  <Icon name="close" size={14} />
                </button>
              </header>
              <div className="dialog-content">
                <Component
                  payload={entry.payload}
                  settings={settings}
                  t={t}
                  resolve={entry.resolve}
                  close={() => entry.resolve(null)}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
