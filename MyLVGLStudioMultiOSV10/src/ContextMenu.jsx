// The right-click menu: every item has its icon. It replaces the browser's own menu everywhere.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Icon } from "./icons.jsx";

/** A list of items; one with `children` opens its own list when pointed at or clicked. */
export function MenuItems({ items, onClose }) {
  const [open, setOpen] = useState(null);
  return items.map((item, index) => {
    if (item === "-") return <div className="sep" key={index} />;
    if (item.children) {
      return (
        <div key={item.id} className="context-branch" onPointerEnter={() => !item.disabled && setOpen(item.id)}>
          <button
            type="button"
            role="menuitem"
            aria-haspopup="menu"
            aria-expanded={open === item.id}
            data-context={item.id}
            className={item.disabled ? "has-children is-disabled" : "has-children"}
            onClick={() => !item.disabled && setOpen(item.id)}
          >
            <Icon name={item.icon} />
            <span className="menu-label">{item.label}</span>
            <Icon name="caretRight" size={12} />
          </button>
          {open === item.id && <SubMenu items={item.children} onClose={onClose} />}
        </div>
      );
    }
    return (
      <button
        type="button"
        key={item.id}
        role="menuitem"
        data-context={item.id}
        className={item.disabled ? "is-disabled" : undefined}
        aria-disabled={item.disabled || undefined}
        onPointerEnter={() => setOpen(null)}
        onClick={() => {
          if (item.disabled) return;
          onClose();
          item.run();
        }}
      >
        <Icon name={item.icon} />
        <span className="menu-label">{item.label}</span>
        {item.keys && <span className="menu-note">{item.keys}</span>}
      </button>
    );
  });
}

/** A list beside its parent: to the left and higher up when the window has no room. */
function SubMenu({ items, onClose }) {
  const menu = useRef(null);
  const [style, setStyle] = useState({ visibility: "hidden" });
  useLayoutEffect(() => {
    const rect = menu.current.getBoundingClientRect();
    const next = { visibility: "visible" };
    if (rect.right > window.innerWidth - 4) {
      next.left = "auto";
      next.right = "calc(100% - 2px)";
    }
    if (rect.bottom > window.innerHeight - 4) next.top = -5 - Math.min(rect.top - 4, rect.bottom - window.innerHeight + 8);
    setStyle(next);
  }, []);
  return (
    <div className="menu-pop context-sub" role="menu" ref={menu} style={style}>
      <MenuItems items={items} onClose={onClose} />
    </div>
  );
}

export function ContextMenu({ x, y, items, onClose }) {
  const menu = useRef(null);
  const [place, setPlace] = useState({ left: x, top: y, visibility: "hidden" });

  // Kept inside the window, whatever the size of the menu and wherever the click was.
  useLayoutEffect(() => {
    const rect = menu.current.getBoundingClientRect();
    setPlace({
      left: Math.max(4, Math.min(x, window.innerWidth - rect.width - 4)),
      top: Math.max(4, Math.min(y, window.innerHeight - rect.height - 4)),
      visibility: "visible",
    });
  }, [x, y]);

  useEffect(() => {
    const away = (event) => {
      if (!menu.current?.contains(event.target)) onClose();
    };
    const key = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("pointerdown", away, true);
    window.addEventListener("keydown", key, true);
    window.addEventListener("blur", onClose);
    window.addEventListener("resize", onClose);
    return () => {
      window.removeEventListener("pointerdown", away, true);
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("blur", onClose);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  return (
    <div className="menu-pop context-menu" role="menu" data-context-menu="" ref={menu} style={place}>
      <MenuItems items={items} onClose={onClose} />
    </div>
  );
}

/** Cut, copy, paste and select all for a text field, through its own editing commands. */
export function textFieldItems(t, field) {
  const hasSelection = field.selectionStart !== field.selectionEnd;
  return [
    { id: "text-cut", icon: "cut", label: t("cmd.cut"), keys: "Ctrl+X", disabled: !hasSelection || field.readOnly, run: () => { field.focus(); document.execCommand("cut"); } },
    { id: "text-copy", icon: "copy", label: t("cmd.copy"), keys: "Ctrl+C", disabled: !hasSelection, run: () => { field.focus(); document.execCommand("copy"); } },
    {
      id: "text-paste",
      icon: "paste",
      label: t("cmd.paste"),
      keys: "Ctrl+V",
      disabled: field.readOnly,
      run: async () => {
        const text = await navigator.clipboard.readText().catch(() => "");
        if (!text) return;
        field.focus();
        document.execCommand("insertText", false, text);
      },
    },
    "-",
    { id: "text-all", icon: "selectAll", label: t("cmd.selectAll"), keys: "Ctrl+A", run: () => { field.focus(); field.select(); } },
  ];
}

/** Copy and select all for text shown on the page, such as the log or the code. */
export function readOnlyTextItems(t, element, extra = []) {
  const selected = () => getSelection()?.toString() ?? "";
  return [
    { id: "read-copy", icon: "copy", label: t("cmd.copy"), keys: "Ctrl+C", disabled: !selected(), run: () => void navigator.clipboard.writeText(selected()).catch(() => {}) },
    { id: "read-all", icon: "selectAll", label: t("cmd.selectAll"), run: () => getSelection()?.selectAllChildren(element) },
    ...extra,
  ];
}
