/**
 * The menu bar, which is also the window's title bar.
 *
 * The OS title bar is turned off (see electron/main.cjs), so this row carries what it
 * used to: the application icon, the name and version, and the minimise / maximise /
 * close buttons at the right-hand end. The whole strip is a drag region apart from
 * the controls themselves.
 *
 * Each title opens its dropdown as a popup that is not part of this window, so a long
 * menu — File, with ten recent files under it — shows every row in one column even
 * when the app window is short. Moving the pointer across the bar while a menu is
 * open switches menus, the way a native bar does.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import * as host from "./host.js";
import type { MenuItem } from "./host.js";
import { Icon } from "./icons.js";
import { useApp } from "./state.js";

export type MenuDefinition = { id: string; label: string; icon: string; items: MenuItem[] };

export function MenuBar({
  menus,
  onChoose,
}: {
  menus: MenuDefinition[];
  onChoose: (id: string | null) => void;
}) {
  const app = useApp();
  const [open, setOpen] = useState<string | null>(null);
  const [maximized, setMaximized] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!host.isDesktop()) return;
    host.isMaximized().then(setMaximized).catch(() => {});
    return host.onWindowState((state) => setMaximized(state.maximized));
  }, []);

  const show = useCallback(async (menu: MenuDefinition, element: HTMLElement) => {
    setOpen(menu.id);
    const chosen = await host.openMenu(
      {
        menu: menu.id,
        items: menu.items,
        theme: app.settings.theme,
        customTheme: app.settings.customTheme,
        language: app.settings.language,
        fontFamily: app.settings.font.family,
        fontSize: 13,
      },
      host.anchorFor(element),
    );
    setOpen(null);
    onChoose(chosen);
  }, [app.settings, onChoose]);

  return (
    <div className="menubar" ref={barRef} role="menubar">
      <span className="menubar-brand" title={app.bootstrap?.app.title}>
        <img className="brand-icon" src="/icon.png" alt="" width={18} height={18} />
        <span className="brand-text">{app.bootstrap?.app.title}</span>
      </span>

      {menus.map((menu) => (
        <button
          key={menu.id}
          type="button"
          role="menuitem"
          className={`menubar-item${open === menu.id ? " open" : ""}`}
          data-menu={menu.id}
          title={menu.label}
          onPointerDown={(event) => {
            event.preventDefault();
            if (open === menu.id) {
              host.closeMenu();
              setOpen(null);
              return;
            }
            void show(menu, event.currentTarget);
          }}
          onPointerEnter={(event) => {
            // Already showing a menu: slide to this one, as a native bar does.
            if (open && open !== menu.id) void show(menu, event.currentTarget);
          }}
        >
          <Icon name={menu.icon} size={15} />
          <span>{menu.label}</span>
        </button>
      ))}

      <span className="menubar-drag" />

      {host.isDesktop() ? (
        <span className="window-controls">
          <button
            type="button"
            className="window-button"
            data-window="minimize"
            title={app.t("tip.minimize")}
            aria-label={app.t("tip.minimize")}
            onClick={() => host.minimizeWindow()}
          >
            <Icon name="minimize" size={15} />
          </button>
          <button
            type="button"
            className="window-button"
            data-window="maximize"
            title={maximized ? app.t("tip.restore") : app.t("tip.maximize")}
            aria-label={maximized ? app.t("tip.restore") : app.t("tip.maximize")}
            onClick={() => host.toggleMaximizeWindow()}
          >
            <Icon name={maximized ? "restore" : "maximize"} size={14} />
          </button>
          <button
            type="button"
            className="window-button danger"
            data-window="close"
            title={app.t("tip.close")}
            aria-label={app.t("tip.close")}
            onClick={() => onChoose("file.exit")}
          >
            <Icon name="close" size={15} />
          </button>
        </span>
      ) : null}
    </div>
  );
}
