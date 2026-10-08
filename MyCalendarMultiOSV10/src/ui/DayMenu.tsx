import { Fragment, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type RefObject } from "react";
import { createPortal } from "react-dom";
import { DEFAULT_SETTINGS, readStoredSettings } from "../domain/settings";
import { applyTheme, getTheme } from "../domain/themes";
import {
  finishMenu,
  growWindowForMenu,
  menuGeometryBusy,
  menuPayload,
  onMenuOpen,
  placeMenuWindow,
  restoreWindowAfterMenu,
  type MenuPayload,
} from "../platform/desktop";
import {
  ChevronIcon,
  GearIcon,
  HideIcon,
  ListIcon,
  MaximizeIcon,
  MinimizeIcon,
  PencilIcon,
  PinIcon,
  PlusIcon,
  PrintIcon,
  RestoreIcon,
  TodayIcon,
} from "./icons";
import { holdMenuHost, menuHostActive, releaseMenuHost } from "./menuHost";
import { currentWorkArea, menuNeedsRoom, placeMenu, type MenuPlace } from "./menuPlace";

const MENU_ICON_NAMES = [
  "chevron-left",
  "chevron-right",
  "plus",
  "pencil",
  "today",
  "list",
  "print",
  "gear",
  "pin",
  "minimize",
  "maximize",
  "restore",
  "hide",
] as const;

export type MenuIconName = (typeof MENU_ICON_NAMES)[number];

export function isMenuIconName(value: string): value is MenuIconName {
  return (MENU_ICON_NAMES as readonly string[]).includes(value);
}

function MenuGlyph({ name }: { name: MenuIconName }) {
  switch (name) {
    case "chevron-left":
      return <ChevronIcon direction="left" />;
    case "chevron-right":
      return <ChevronIcon direction="right" />;
    case "plus":
      return <PlusIcon />;
    case "pencil":
      return <PencilIcon />;
    case "today":
      return <TodayIcon />;
    case "list":
      return <ListIcon />;
    case "print":
      return <PrintIcon />;
    case "gear":
      return <GearIcon />;
    case "pin":
      return <PinIcon />;
    case "minimize":
      return <MinimizeIcon />;
    case "maximize":
      return <MaximizeIcon />;
    case "restore":
      return <RestoreIcon />;
    case "hide":
      return <HideIcon />;
  }
}

export interface DayMenuItem {
  id: string;
  label: string;
  icon: MenuIconName;
  color?: string;
  separated?: boolean;
  /** Makes the item a toggle that shows a check mark while on. */
  checked?: boolean;
  onSelect: () => void;
}

/**
 * Context menu at the cursor. It is drawn on the document, not inside the calendar, so the panel cannot clip it.
 * The desktop app uses a separate window instead, which can extend past the calendar. Every item carries an icon.
 */
export function DayMenu({
  x,
  y,
  grow = false,
  label,
  items,
  onClose,
}: {
  x: number;
  y: number;
  /** When set, the desktop window grows instead of shrinking the menu to the window. */
  grow?: boolean;
  label: string;
  items: DayMenuItem[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<MenuPlace | null>(null);
  const signature = items.map((item) => `${item.id}:${item.label}:${item.checked ?? ""}`).join("\n");

  useLayoutEffect(() => {
    const menu = ref.current;
    if (!menu) return;
    // overflow can cap offsetHeight at the window, hiding the last row from the measurement.
    const borderY = menu.offsetHeight - menu.clientHeight;
    const borderX = menu.offsetWidth - menu.clientWidth;
    const height = Math.max(menu.offsetHeight, menu.scrollHeight + borderY);
    const width = Math.max(menu.offsetWidth, menu.scrollWidth + borderX);
    const placed = placeMenu(x, y, width, height, window.innerWidth, window.innerHeight, grow, currentWorkArea());
    setPlace(placed);
    menu.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
    if (!grow || !menuNeedsRoom(placed)) return;
    const host = holdMenuHost(window.innerWidth, window.innerHeight, placed.padLeft, placed.padTop);
    void growWindowForMenu({ left: placed.padLeft, top: placed.padTop, right: placed.padRight, bottom: placed.padBottom });
    return () => releaseMenuHost(host, restoreWindowAfterMenu);
  }, [grow, x, y, signature]);

  useEffect(() => {
    const away = (event: Event) => {
      if (event.target instanceof Node && ref.current?.contains(event.target)) return;
      onClose();
    };
    window.addEventListener("mousedown", away, true);
    window.addEventListener("wheel", away, { capture: true, passive: true });
    const onResize = () => {
      // Growing the window for this menu is not the user resizing it.
      if (menuGeometryBusy() || menuHostActive()) return;
      onClose();
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("blur", onClose);
    return () => {
      window.removeEventListener("mousedown", away, true);
      window.removeEventListener("wheel", away, true);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("blur", onClose);
    };
  }, [onClose]);

  return createPortal(
    <MenuSurface
      menuRef={ref}
      label={label}
      items={items}
      style={
        place
          ? {
              left: place.left,
              top: place.top,
              maxWidth: place.maxWidth ?? undefined,
              maxHeight: place.maxHeight ?? undefined,
              overflowY: place.maxHeight ? "auto" : undefined,
            }
          : { left: 0, top: 0, visibility: "hidden" }
      }
      onClose={onClose}
      onPick={(item) => {
        onClose();
        item.onSelect();
      }}
    />,
    document.body,
  );
}

function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>, onClose: () => void) {
  event.stopPropagation();
  const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button")];
  const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
  const step: Record<string, number> = { ArrowDown: 1, ArrowUp: -1 };
  if (event.key === "Escape" || event.key === "Tab") {
    event.preventDefault();
    onClose();
  } else if (event.key in step) {
    event.preventDefault();
    buttons[(index + step[event.key] + buttons.length) % buttons.length]?.focus();
  } else if (event.key === "Home" || event.key === "End") {
    event.preventDefault();
    buttons[event.key === "Home" ? 0 : buttons.length - 1]?.focus();
  }
}

function MenuSurface({
  menuRef,
  label,
  items,
  style,
  onClose,
  onPick,
}: {
  menuRef?: RefObject<HTMLDivElement | null>;
  label: string;
  items: DayMenuItem[];
  style?: CSSProperties;
  onClose: () => void;
  onPick: (item: DayMenuItem) => void;
}) {
  return (
    <div
      ref={menuRef}
      className="day-menu"
      role="menu"
      aria-label={label}
      style={style}
      onKeyDown={(event) => onMenuKeyDown(event, onClose)}
      onContextMenu={(event) => event.preventDefault()}
    >
      {items.map((item) => (
        <Fragment key={item.id}>
          {item.separated && <div className="day-menu-sep" role="separator" />}
          <button
            type="button"
            role={item.checked === undefined ? "menuitem" : "menuitemcheckbox"}
            aria-checked={item.checked}
            onClick={() => onPick(item)}
          >
            <span className="day-menu-icon" style={item.color ? { color: item.color } : undefined}>
              <MenuGlyph name={item.icon} />
            </span>
            <span className="day-menu-label">{item.label}</span>
            {item.checked && <span className="day-menu-check" aria-hidden="true" />}
          </button>
        </Fragment>
      ))}
    </div>
  );
}

/** Desktop context menu. Its window is only as big as the menu, so the calendar window does not clip it. */
export function MenuWindow() {
  const [request, setRequest] = useState<MenuPayload | null>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  if (typeof document !== "undefined") document.documentElement.dataset.window = "menu";

  useLayoutEffect(() => {
    const stored = readStoredSettings() ?? DEFAULT_SETTINGS;
    applyTheme(getTheme(stored.themeId), stored.opacity);
  }, [request]);

  useEffect(() => {
    let alive = true;
    const apply = (value: MenuPayload | null) => {
      if (alive && value) setRequest(value);
    };
    void menuPayload().then(apply);
    let stop = () => {};
    void onMenuOpen(() => {
      void menuPayload().then(apply);
    }).then((unlisten) => {
      if (!alive) unlisten();
      else stop = unlisten;
    });
    return () => {
      alive = false;
      stop();
    };
  }, []);

  useLayoutEffect(() => {
    const node = popupRef.current;
    if (!node || !request) return;
    let cancelled = false;
    const measure = () => {
      if (cancelled || !popupRef.current) return;
      const rect = popupRef.current.getBoundingClientRect();
      const width = Math.ceil(rect.width) + 1;
      const height = Math.ceil(rect.height) + 1;
      if (width < 8 || height < 8) {
        requestAnimationFrame(measure);
        return;
      }
      void placeMenuWindow(width, height, request.generation).then(() => {
        if (!cancelled) popupRef.current?.querySelector("button")?.focus();
      });
    };
    measure();
    return () => {
      cancelled = true;
    };
  }, [request]);

  useEffect(() => {
    if (!request) return;
    // Showing the window can blur it once before focus arrives. Dismiss only after it has been focused.
    let seenFocus = document.hasFocus();
    const onFocus = () => {
      seenFocus = true;
    };
    const onBlur = () => {
      if (!seenFocus) return;
      void finishMenu(null, request.generation);
    };
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      void finishMenu(null, request.generation);
    };
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("keydown", onKey);
    };
  }, [request]);

  if (!request) return null;
  const items: DayMenuItem[] = request.entries.map((entry) => ({
    id: entry.id,
    label: entry.label,
    icon: isMenuIconName(entry.icon) ? entry.icon : "pencil",
    color: entry.color ?? undefined,
    separated: entry.separated,
    checked: entry.checked ?? undefined,
    onSelect: () => void finishMenu(entry.id, request.generation),
  }));
  return (
    <div ref={popupRef} className="menu-popup">
      <MenuSurface
        label={request.label}
        items={items}
        onClose={() => void finishMenu(null, request.generation)}
        onPick={(item) => item.onSelect()}
      />
    </div>
  );
}
