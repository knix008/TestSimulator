/**
 * The generic menu ("list"): one row per item, always with an icon beside the label,
 * keyboard navigable. Registered as the "list" menu (src/popupRegistrations.ts), so any
 * dropdown or context menu can be shown in a popup window with
 *
 *   host.openMenu("list", { items }, host.anchorFor(button))
 */
import { useCallback, useEffect, useState } from "react";
import { Icon, type IconName } from "./icons";
import type { MenuComponentProps } from "./popupRegistry";

export type MenuItem =
  | {
    kind?: "item";
    id: string;
    label: string;
    icon: IconName;
    shortcut?: string;
    checked?: boolean;
    disabled?: boolean;
    /** Shown at the right edge in a muted tone (a path, a count). */
    hint?: string;
    /** Colour chips drawn in place of the icon (themes). */
    swatches?: string[];
    /** A second, small button at the row's end (e.g. remove a recent entry). */
    secondary?: { id: string; icon: IconName; label: string };
  }
  | { kind: "separator"; id?: string }
  | { kind: "header"; id?: string; label: string };

export type ListMenuPayload = { items: MenuItem[] };

const isRow = (item: MenuItem): item is Extract<MenuItem, { id: string; label: string; icon: IconName }> =>
  !item.kind || item.kind === "item";

export function ListMenu({ payload, choose, dismiss }: MenuComponentProps) {
  const items = (payload as ListMenuPayload | null)?.items ?? [];
  const first = Math.max(0, items.findIndex((item) => isRow(item) && !item.disabled));
  const [focused, setFocused] = useState(first);
  const hasCheck = items.some((item) => isRow(item) && item.checked !== undefined);

  const move = useCallback((direction: 1 | -1) => {
    setFocused((current) => {
      for (let step = 1; step <= items.length; step++) {
        const next = (current + direction * step + items.length * 2) % items.length;
        const item = items[next];
        if (isRow(item) && !item.disabled) return next;
      }
      return current;
    });
  }, [items]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        dismiss();
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        move(1);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        move(-1);
      } else if (event.key === "Enter" || event.key === " ") {
        const item = items[focused];
        if (item && isRow(item) && !item.disabled) {
          event.preventDefault();
          choose(item.id);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [choose, dismiss, focused, items, move]);

  return (
    <div className={hasCheck ? "popup-menu with-check" : "popup-menu"} role="menu">
      {items.map((item, index) => {
        if (item.kind === "separator") return <div className="popup-menu-separator" key={`sep-${index}`} role="separator" />;
        if (item.kind === "header") return <div className="popup-menu-header" key={`head-${index}`}>{item.label}</div>;
        const row = (
          <button
            key={item.id}
            type="button"
            role="menuitem"
            className={`popup-menu-row${item.disabled ? " disabled" : ""}${item.checked ? " checked" : ""}${index === focused ? " focused" : ""}`}
            data-command={item.id}
            disabled={item.disabled}
            title={item.hint ? `${item.label} — ${item.hint}` : item.label}
            onMouseEnter={() => setFocused(index)}
            onClick={() => choose(item.id)}
          >
            {hasCheck ? <span className="popup-menu-check">{item.checked ? "✓" : ""}</span> : null}
            <span className="popup-menu-icon">
              {item.swatches?.length
                ? <span className="popup-menu-swatches">{item.swatches.map((color, position) => <i key={position} style={{ background: color }} />)}</span>
                : <Icon name={item.icon} />}
            </span>
            <span className="popup-menu-label menu-label">{item.label}</span>
            <span className="popup-menu-hint">{item.hint ?? ""}</span>
            <span className="popup-menu-shortcut menu-shortcut">{item.shortcut ?? ""}</span>
          </button>
        );
        if (!item.secondary) return row;
        const secondary = item.secondary;
        // A button cannot sit inside another, so the row and its second button share a strip.
        return (
          <div className="popup-menu-row-wrap" key={item.id}>
            {row}
            <button type="button" role="menuitem" className="popup-menu-secondary" data-command={secondary.id} title={secondary.label} aria-label={secondary.label} onClick={() => choose(secondary.id)}>
              <Icon name={secondary.icon} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
