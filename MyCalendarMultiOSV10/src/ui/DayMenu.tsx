import { Fragment, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

export interface DayMenuItem {
  id: string;
  label: string;
  icon: ReactNode;
  color?: string;
  separated?: boolean;
  /** Makes the item a toggle that shows a check mark while on. */
  checked?: boolean;
  onSelect: () => void;
}

/** Context menu at a point inside `bounds`, flipped or shifted so it never leaves them. Every item carries an icon. */
export function DayMenu({
  x,
  y,
  bounds,
  label,
  items,
  onClose,
}: {
  x: number;
  y: number;
  bounds: HTMLElement;
  label: string;
  items: DayMenuItem[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const menu = ref.current;
    if (!menu) return;
    const box = bounds.getBoundingClientRect();
    const margin = 6;
    const width = menu.offsetWidth;
    const height = menu.offsetHeight;
    let left = x - box.left - bounds.clientLeft;
    let top = y - box.top - bounds.clientTop;
    if (left + width > bounds.clientWidth - margin) left = Math.max(margin, left - width);
    if (top + height > bounds.clientHeight - margin) top = Math.max(margin, bounds.clientHeight - margin - height);
    setPlace({ left, top });
    menu.querySelector<HTMLButtonElement>("button")?.focus();
  }, [bounds, x, y]);

  useEffect(() => {
    const away = (event: Event) => {
      if (event.target instanceof Node && ref.current?.contains(event.target)) return;
      onClose();
    };
    window.addEventListener("mousedown", away, true);
    window.addEventListener("wheel", away, { capture: true, passive: true });
    window.addEventListener("resize", onClose);
    window.addEventListener("blur", onClose);
    return () => {
      window.removeEventListener("mousedown", away, true);
      window.removeEventListener("wheel", away, true);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("blur", onClose);
    };
  }, [onClose]);

  const onKeyDown = (event: KeyboardEvent) => {
    event.stopPropagation();
    const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
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
  };

  return (
    <div
      ref={ref}
      className="day-menu"
      role="menu"
      aria-label={label}
      style={place ?? { left: 0, top: 0, visibility: "hidden" }}
      onKeyDown={onKeyDown}
      onContextMenu={(event) => event.preventDefault()}
    >
      {items.map((item) => (
        <Fragment key={item.id}>
          {item.separated && <div className="day-menu-sep" role="separator" />}
          <button
            type="button"
            role={item.checked === undefined ? "menuitem" : "menuitemcheckbox"}
            aria-checked={item.checked}
            onClick={() => {
              onClose();
              item.onSelect();
            }}
          >
            <span className="day-menu-icon" style={item.color ? { color: item.color } : undefined}>
              {item.icon}
            </span>
            <span className="day-menu-label">{item.label}</span>
            {item.checked && <span className="day-menu-check" aria-hidden="true" />}
          </button>
        </Fragment>
      ))}
    </div>
  );
}
