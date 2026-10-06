/**
 * The menu popup, in both of its homes.
 *
 * `MenuList` is the markup: one row per item, always a single column, always an icon
 * beside the label. `MenuWindow` is what the Electron popup window renders — it
 * measures the list and tells the main process how big to be, which is how a menu
 * taller than the app window still shows all of its rows. `InlineMenu` is the web
 * build's equivalent, positioned over the page.
 */
import { type CSSProperties, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { applyTheme } from "../core/themes.js";
import { Icon } from "./icons.js";
import { inlineMenu, type InlineMenuState, type MenuItem, type MenuSpec } from "./host.js";
import type { MenuAnchor } from "./global.js";

export function MenuList({
  spec,
  onChoose,
  onDismiss,
}: {
  spec: MenuSpec;
  onChoose: (id: string) => void;
  onDismiss: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(() => firstEnabled(spec.items));
  const tracks = trackLayout(spec.items);

  const move = useCallback((direction: 1 | -1) => {
    setFocused((current) => {
      const items = spec.items;
      for (let step = 1; step <= items.length; step++) {
        const next = (current + direction * step + items.length * 2) % items.length;
        const item = items[next];
        if ((!item.kind || item.kind === "item") && !item.disabled) return next;
      }
      return current;
    });
  }, [spec.items]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onDismiss();
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        move(1);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        move(-1);
      } else if (event.key === "Enter" || event.key === " ") {
        const item = spec.items[focused];
        if (item && (!item.kind || item.kind === "item") && !item.disabled) {
          event.preventDefault();
          onChoose(item.id);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focused, move, onChoose, onDismiss, spec.items]);

  return (
    <div
      className="menu-popup"
      ref={containerRef}
      role="menu"
      data-menu={spec.menu}
      style={{ "--menu-columns": tracks.columns } as CSSProperties}
    >
      {spec.items.map((item, index) => {
        if (item.kind === "separator") return <div className="menu-separator" key={`sep-${index}`} role="separator" />;
        if (item.kind === "columns") {
          return (
            <div className="menu-columns" key={`cols-${index}`}>
              {item.columns.map((column) => (
                <div className="menu-column" key={column.label}>
                  <div className="menu-header">{column.label}</div>
                  {column.options.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      role="menuitem"
                      className={`menu-row compact${option.checked ? " checked" : ""}`}
                      data-command={option.id}
                      title={option.label}
                      onClick={() => onChoose(option.id)}
                    >
                      <span className="menu-check">
                        {option.checked ? <Icon name="check" size={13} /> : null}
                      </span>
                      <span className="menu-icon">
                        {option.colors?.length
                          ? (
                            <span className="menu-swatches">
                              {option.colors.map((color, position) => (
                                <span key={position} style={{ background: color }} />
                              ))}
                            </span>
                          )
                          : null}
                      </span>
                      <span className="menu-label">{option.label}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          );
        }
        if (item.kind === "header") {
          return (
            <div className="menu-header" key={`head-${index}`}>
              {item.label}
            </div>
          );
        }
        return (
          <button
            key={item.id}
            type="button"
            role="menuitem"
            className={`menu-row${item.disabled ? " disabled" : ""}${item.checked ? " checked" : ""}${index === focused ? " focused" : ""}`}
            data-command={item.id}
            disabled={item.disabled}
            title={item.hint ? `${item.label} — ${item.hint}` : item.label}
            onMouseEnter={() => setFocused(index)}
            onClick={() => onChoose(item.id)}
          >
            {tracks.check
              ? <span className="menu-check">{item.checked ? <Icon name="check" size={14} /> : null}</span>
              : null}
            <span className="menu-icon">
              {item.swatches?.length
                ? (
                  <span className="menu-swatches">
                    {item.swatches.map((color, position) => (
                      <span key={position} style={{ background: color }} />
                    ))}
                  </span>
                )
                : <Icon name={item.icon} size={16} />}
            </span>
            <span className="menu-label">{item.label}</span>
            {tracks.spacer ? <span className="menu-hint">{item.hint ?? ""}</span> : null}
            {tracks.shortcut ? <span className="menu-shortcut">{item.shortcut ?? ""}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Which of the row's optional columns this menu actually needs.
 *
 * The rows share one grid so the shortcuts line up down the right-hand edge, but a
 * column every row leaves empty is not alignment — it is a margin. A menu with
 * nothing to tick (File, say) used to indent every label past a tick column anyway,
 * which read as the labels being badly left-aligned; a menu with no shortcuts paid
 * for the spacer that pushes them right. So the tracks are decided once per menu,
 * from its own items, and the cells for the tracks it dropped are not rendered.
 *
 * `checked: false` still counts: an unticked toggle needs the room its tick will
 * take, or the labels would shift sideways the moment it is switched on.
 */
export function trackLayout(items: MenuItem[]): {
  columns: string;
  check: boolean;
  spacer: boolean;
  shortcut: boolean;
} {
  const rows = items.filter((item) => !item.kind || item.kind === "item");
  const check = rows.some((item) => "checked" in item && item.checked !== undefined);
  const shortcut = rows.some((item) => "shortcut" in item && Boolean(item.shortcut));
  const hint = rows.some((item) => "hint" in item && Boolean(item.hint));
  // The flexible track is both the hint's home and the gap that holds the
  // shortcuts against the right-hand edge, so either one keeps it.
  const spacer = hint || shortcut;
  const columns = [
    // Just wide enough for the tick and the 16px row icon: the gutter is a place
    // for them, not a margin, and every pixel of it is in front of every label.
    check ? "16px" : null,
    "20px",
    "max-content",
    spacer ? "1fr" : null,
    shortcut ? "max-content" : null,
  ].filter(Boolean).join(" ");
  return { columns, check, spacer, shortcut };
}

function firstEnabled(items: MenuItem[]): number {
  return Math.max(0, items.findIndex((item) => (!item.kind || item.kind === "item") && !item.disabled));
}

/* ------------------------------------------------------------------ *
 * The Electron popup window (`#menu=`)
 * ------------------------------------------------------------------ */

export function MenuWindow() {
  const [spec, setSpec] = useState<(MenuSpec & { openId: number }) | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const bridge = window.mdm;
    if (!bridge) return;
    const off = bridge.onMenuPayload((payload) => {
      setSpec(payload as (MenuSpec & { openId: number }) | null);
    });
    // The window may have been given its payload before this renderer was listening.
    bridge.menuPayload().then((payload) => {
      if (payload) setSpec(payload as MenuSpec & { openId: number });
    }).catch(() => {});
    return off;
  }, []);

  useEffect(() => {
    if (spec) applyTheme(spec.theme, spec.customTheme);
  }, [spec]);

  useLayoutEffect(() => {
    const bridge = window.mdm;
    if (!bridge || !spec || !bodyRef.current) return;
    const body = bodyRef.current;
    // `scrollWidth` rather than the bounding box: the box is what the window currently
    // allows, so measuring it would keep a too-narrow window too narrow and clip the
    // longest row for ever.
    const report = () => {
      const width = Math.max(body.scrollWidth, Math.ceil(body.getBoundingClientRect().width));
      const height = Math.max(body.scrollHeight, Math.ceil(body.getBoundingClientRect().height));
      bridge.menuSize({ width: width + 4, height: height + 4 }).catch(() => {});
    };
    report();
    // Fonts settle a frame late; a second measurement costs nothing and avoids a
    // permanently clipped menu on the first open of a session.
    const timer = window.setTimeout(report, 60);
    return () => window.clearTimeout(timer);
  }, [spec]);

  if (!spec) return <div className="menu-window empty" />;

  return (
    <div
      className="menu-window"
      style={{ fontFamily: spec.fontFamily, fontSize: `${spec.fontSize}px` }}
    >
      <div ref={bodyRef} className="menu-measure">
        <MenuList
          spec={spec}
          onChoose={(id) => window.mdm?.chooseMenu(id)}
          onDismiss={() => window.mdm?.closeMenu()}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * The web build's menu
 * ------------------------------------------------------------------ */

export function InlineMenu() {
  const [state, setState] = useState<InlineMenuState>(inlineMenu.get());
  const boxRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => inlineMenu.subscribe(setState), []);

  useLayoutEffect(() => {
    if (!state || !boxRef.current) {
      setPosition(null);
      return;
    }
    setPosition(place(state.anchor, boxRef.current.getBoundingClientRect()));
  }, [state]);

  useEffect(() => {
    if (!state) return;
    const dismiss = () => state.resolve(null);
    window.addEventListener("resize", dismiss);
    window.addEventListener("blur", dismiss);
    return () => {
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("blur", dismiss);
    };
  }, [state]);

  if (!state) return null;

  return (
    <div className="inline-menu-layer" onPointerDown={() => state.resolve(null)}>
      <div
        className="inline-menu"
        ref={boxRef}
        style={position ? { left: position.left, top: position.top } : { left: -9999, top: -9999 }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <MenuList spec={state.spec} onChoose={state.resolve} onDismiss={() => state.resolve(null)} />
      </div>
    </div>
  );
}

function place(anchor: MenuAnchor, box: DOMRect): { left: number; top: number } {
  const margin = 6;
  let left = anchor.x;
  let top = anchor.y;
  if (left + box.width > window.innerWidth - margin) left = window.innerWidth - box.width - margin;
  if (left < margin) left = margin;
  if (top + box.height > window.innerHeight - margin) {
    const above = anchor.y - anchor.height - box.height;
    top = above >= margin ? above : Math.max(margin, window.innerHeight - box.height - margin);
  }
  return { left, top };
}
