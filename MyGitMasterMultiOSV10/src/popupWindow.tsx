/**
 * The windows that show popups.
 *
 *   #menu=        MenuWindow   — the pooled desktop menu window; draws the registered
 *                                menu it is handed and tells the shell its size
 *   #dialog=      DialogWindow — a pooled desktop dialog window; draws the registered
 *                                dialog inside PopupFrame and reports its height
 *   #guide[=id]   GuideWindow  — the user's guide (src/GuideWindow.tsx)
 *   (main page)   InlinePopups — the browser's stand-in: the same menus and dialogs in
 *                                an in-page layer, since a page cannot open OS windows
 *
 * Every popup reads the saved settings itself and follows changes published by any
 * window (host.onSettingsPublished), so it paints in the app's theme and language.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { applyTheme, setCustomThemes, type CustomTheme } from "../core/themes";
import type { Settings } from "./api";
import { dialogSpec } from "./dialogSpecs";
import type { MenuAnchor } from "./global";
import * as host from "./host";
import { translate, type Lang } from "./i18n";
import { PopupFrame } from "./PopupFrame";
import { dialogEntry, dialogIcon, menuEntry, type PopupContext } from "./popupRegistry";
import "./popups.css";

export { popupRoute, type PopupRoute } from "./popupRoute";

/** Applies a settings object's theme (and the user's themes) to this window. */
export function paintSettings(settings: Settings): void {
  setCustomThemes(settings.customThemes as CustomTheme[] | undefined);
  applyTheme(settings.theme);
}

/**
 * The saved settings for a popup: loaded once, then kept in step with every window.
 * `onPrefs` saves a change and publishes it, so the main window follows a change made
 * in a dialog window.
 */
export function usePopupSettings(openId = 0): PopupContext | null {
  const [settings, setSettings] = useState<Settings | null>(null);
  useEffect(() => {
    const off = host.onSettingsPublished((value) => setSettings(value));
    return off;
  }, []);
  // Read again for every popup this (pooled) window is handed: it may have sat hidden
  // through theme changes it never heard about, and must open in the current theme.
  useEffect(() => {
    let live = true;
    host.loadSettings().then((value) => {
      if (live) setSettings(value);
    }).catch(() => {});
    return () => {
      live = false;
    };
  }, [openId]);
  useEffect(() => {
    if (settings) paintSettings(settings);
  }, [settings]);
  const onPrefs = useCallback((patch: Partial<Settings>) => {
    setSettings((current) => (current ? { ...current, ...patch } : current));
    host.saveSettings(patch).then(setSettings).catch(() => {});
  }, []);
  return useMemo(() => {
    if (!settings) return null;
    const lang: Lang = settings.language === "en" ? "en" : "ko";
    return { settings, lang, t: (key: string) => translate(lang, key), onPrefs };
  }, [settings, onPrefs]);
}

/* ------------------------------------------------------------------ *
 * Desktop: the menu window
 * ------------------------------------------------------------------ */

type MenuMessage = { menu: string; payload: unknown; openId: number; anchor?: MenuAnchor } | null;

export function MenuWindow() {
  const [message, setMessage] = useState<MenuMessage>(null);
  const context = usePopupSettings(message?.openId ?? 0);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const bridge = window.mgm;
    if (!bridge) return;
    const off = bridge.onMenuPayload((payload) => setMessage(payload as MenuMessage));
    // The window may have been handed its payload before this page was listening.
    bridge.menuPayload().then((payload) => {
      if (payload) setMessage(payload as MenuMessage);
    }).catch(() => {});
    return off;
  }, []);

  // A menu has no menu of its own — and never the WebView's ("Back", "Inspect").
  useEffect(() => {
    const suppress = (event: MouseEvent) => event.preventDefault();
    window.addEventListener("contextmenu", suppress);
    return () => window.removeEventListener("contextmenu", suppress);
  }, []);

  useLayoutEffect(() => {
    const bridge = window.mgm;
    const body = bodyRef.current;
    if (!bridge || !message || !context || !body) return;
    // scrollWidth, not the box: the box is what the window currently allows.
    const report = () => {
      const width = Math.max(body.scrollWidth, Math.ceil(body.getBoundingClientRect().width));
      const height = Math.max(body.scrollHeight, Math.ceil(body.getBoundingClientRect().height));
      bridge.menuSize({ width: width + 4, height: height + 4, openId: message.openId }).catch(() => {});
    };
    report();
    // Fonts settle a frame late.
    const timer = window.setTimeout(report, 60);
    return () => window.clearTimeout(timer);
  }, [message, context]);

  const entry = message ? menuEntry(message.menu) : undefined;
  if (!message || !context || !entry) return <div className="menu-window empty" />;
  const Component = entry.component;
  return (
    <div className="menu-window">
      <div ref={bodyRef} className="menu-measure">
        <div className="popup-menu-box">
          <Component
            {...context}
            payload={message.payload}
            choose={(id) => window.mgm?.chooseMenu(id)}
            dismiss={() => window.mgm?.closeMenu(message.openId)}
          />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Desktop: a dialog window
 * ------------------------------------------------------------------ */

type DialogMessage = { name: string | null; payload: unknown; openId: number } | null;

export function DialogWindow() {
  const [message, setMessage] = useState<DialogMessage>(null);
  const context = usePopupSettings(message?.openId ?? 0);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const bridge = window.mgm;
    if (!bridge) return;
    const off = bridge.onDialogPayload((payload) => setMessage(payload as DialogMessage));
    bridge.dialogPayload().then((payload) => {
      if (payload) setMessage(payload as DialogMessage);
    }).catch(() => {});
    return off;
  }, []);

  // Report the content's natural height so the window is exactly that tall.
  useLayoutEffect(() => {
    const bridge = window.mgm;
    const body = bodyRef.current;
    if (!bridge || !body || !message?.name || !context) return;
    const spec = dialogSpec(message.name);
    if (spec.fixed || spec.resizable) return;
    const report = () => {
      bridge.dialogSize({ width: 0, height: Math.ceil(body.getBoundingClientRect().height) }).catch(() => {});
    };
    report();
    const observer = new ResizeObserver(report);
    observer.observe(body);
    return () => observer.disconnect();
  }, [message?.name, message?.openId, context]);

  const name = message?.name ?? null;
  const close = useCallback(() => {
    window.mgm?.closeDialog().catch(() => {});
  }, []);
  const resolve = useCallback((value: unknown) => {
    if (!name) return;
    const bridge = window.mgm;
    if (!bridge) return;
    bridge.dialogResult(name, value).finally(() => bridge.closeDialog().catch(() => {}));
  }, [name]);

  const entry = name ? dialogEntry(name) : undefined;
  if (!name || !context || !entry) return <div className="dialog-window empty" />;
  const Component = entry.component;
  const spec = dialogSpec(name);
  return (
    <div className={spec.fixed || spec.resizable ? "dialog-window filled" : "dialog-window"} data-dialog={name}>
      <div ref={bodyRef} className="dialog-measure">
        <PopupFrame name={name} icon={dialogIcon(entry, message?.payload, context.t)} title={entry.title(context.t, message?.payload)} closeLabel={context.t("close")} onClose={close}>
          <Component key={message?.openId} {...context} payload={message?.payload} resolve={resolve} close={close} />
        </PopupFrame>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Browser: the same menus and dialogs inside the page
 * ------------------------------------------------------------------ */

export function InlinePopups() {
  const [menu, setMenu] = useState(host.inlineMenu.get());
  const [dialogs, setDialogs] = useState(host.inlineDialogs.get());
  const context = usePopupSettings();
  useEffect(() => host.inlineMenu.subscribe(setMenu), []);
  useEffect(() => host.inlineDialogs.subscribe(setDialogs), []);
  if (!context || (!menu && dialogs.length === 0)) return null;
  return (
    <>
      {dialogs.map((item, index) => {
        const entry = dialogEntry(item.name);
        if (!entry) return null;
        const Component = entry.component;
        const spec = dialogSpec(item.name);
        const style = { width: `min(${spec.width}px, calc(100vw - 32px))`, ...(spec.fixed || spec.resizable ? { height: `min(${spec.height}px, calc(100vh - 32px))` } : {}) } as CSSProperties;
        return (
          <div className="popup-backdrop" key={`${item.name}-${index}`}>
            <div className="popup-inline" style={style}>
              <PopupFrame name={item.name} icon={dialogIcon(entry, item.payload, context.t)} title={entry.title(context.t, item.payload)} closeLabel={context.t("close")} onClose={() => item.resolve(null)}>
                <Component {...context} payload={item.payload} resolve={item.resolve} close={() => item.resolve(null)} />
              </PopupFrame>
            </div>
          </div>
        );
      })}
      {menu ? <InlineMenu state={menu} context={context} /> : null}
    </>
  );
}

function InlineMenu({ state, context }: { state: NonNullable<host.InlineMenuState>; context: PopupContext }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    if (!boxRef.current) return;
    const box = boxRef.current.getBoundingClientRect();
    const margin = 6;
    let left = state.anchor.x;
    let top = state.anchor.y;
    if (left + box.width > window.innerWidth - margin) left = window.innerWidth - box.width - margin;
    if (left < margin) left = margin;
    if (top + box.height > window.innerHeight - margin) {
      const above = state.anchor.y - state.anchor.height - box.height;
      top = above >= margin ? above : Math.max(margin, window.innerHeight - box.height - margin);
    }
    setPosition({ left, top });
  }, [state]);
  useEffect(() => {
    const dismiss = () => state.resolve(null);
    window.addEventListener("resize", dismiss);
    window.addEventListener("blur", dismiss);
    return () => {
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("blur", dismiss);
    };
  }, [state]);
  const entry = menuEntry(state.name);
  if (!entry) return null;
  const Component = entry.component;
  return (
    <div className="popup-menu-layer" onPointerDown={() => state.resolve(null)}>
      <div
        className="popup-menu-box inline"
        ref={boxRef}
        style={position ?? { left: -9999, top: -9999 }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <Component {...context} payload={state.payload} choose={(id) => state.resolve(id)} dismiss={() => state.resolve(null)} />
      </div>
    </div>
  );
}
