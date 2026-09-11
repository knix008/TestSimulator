// Dropdown menu primitives shared by the menu bar, toolbar dropdowns and the
// canvas context menu.
import { useEffect, useRef, useState, type ReactNode } from 'react';

export interface MenuItem {
  id: string;
  label?: string;
  /** Leading icon, shown in the icon gutter next to the label. */
  icon?: ReactNode;
  /** Small colour chip used instead of an icon (theme and DB pickers). */
  swatch?: string;
  shortcut?: string;
  tooltip?: string;
  separator?: boolean;
  header?: boolean;
  disabled?: boolean;
  checked?: boolean;
  submenu?: MenuItem[];
  onSelect?: () => void;
}

interface MenuListProps {
  items: MenuItem[];
  onClose: () => void;
  /** Rendered as a nested list rather than a positioned popup. */
  nested?: boolean;
}

export function MenuList({ items, onClose, nested }: MenuListProps) {
  const [openSubmenu, setOpenSubmenu] = useState<string | null>(null);

  return (
    <div className={`menu-list ${nested ? 'nested' : ''}`} role="menu">
      {items.map((item, index) => {
        if (item.separator) return <div key={`${item.id}-${index}`} className="menu-separator" />;
        if (item.header)
          return (
            <div key={item.id} className="menu-header">
              {item.icon && <span className="menu-header-icon">{item.icon}</span>}
              {item.label}
            </div>
          );

        const hasSubmenu = !!item.submenu?.length;
        return (
          <div
            key={item.id}
            className="menu-item-wrapper"
            onMouseEnter={() => setOpenSubmenu(hasSubmenu ? item.id : null)}
          >
            <button
              className={`menu-item ${item.disabled ? 'disabled' : ''} ${item.checked ? 'checked' : ''}`}
              disabled={item.disabled}
              title={item.tooltip}
              role="menuitem"
              onClick={() => {
                if (item.disabled) return;
                if (hasSubmenu) {
                  setOpenSubmenu((v) => (v === item.id ? null : item.id));
                  return;
                }
                item.onSelect?.();
                onClose();
              }}
            >
              <span className="menu-icon">
                {item.swatch ? (
                  <span className="menu-swatch" style={{ background: item.swatch }} />
                ) : (
                  item.icon
                )}
              </span>
              <span className="menu-label">{item.label}</span>
              {item.shortcut && <span className="menu-shortcut">{item.shortcut}</span>}
              <span className="menu-check">{item.checked ? '✓' : ''}</span>
              {hasSubmenu && <span className="menu-arrow">▸</span>}
            </button>
            {hasSubmenu && openSubmenu === item.id && (
              <div className="submenu">
                <MenuList items={item.submenu!} onClose={onClose} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

interface DropdownProps {
  label: ReactNode;
  items: MenuItem[];
  className?: string;
  title?: string;
  disabled?: boolean;
}

export function Dropdown({ label, items, className, title, disabled }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocumentDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDocumentDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocumentDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className={`dropdown ${className ?? ''}`} ref={ref}>
      <button
        className={`dropdown-trigger ${open ? 'open' : ''}`}
        title={title}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      >
        {label}
      </button>
      {open && <MenuList items={items} onClose={() => setOpen(false)} />}
    </div>
  );
}

interface SplitButtonProps {
  /** Contents of the primary half. */
  label: ReactNode;
  /** Primary click — typically "advance to the next value". */
  onAction: () => void;
  actionTitle?: string;
  /** Menu on the caret half — pick a specific value. */
  items: MenuItem[];
  menuTitle?: string;
  className?: string;
  /** Marks the primary half, for tests and automation. */
  actionId?: string;
}

/**
 * A button with a menu attached: clicking the left half performs the action,
 * clicking the caret opens the list. Used for the theme control, where cycling
 * is the quick path and the menu is the precise one.
 */
export function SplitButton({
  label,
  onAction,
  actionTitle,
  items,
  menuTitle,
  className,
  actionId,
}: SplitButtonProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocumentDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDocumentDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocumentDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className={`split-button ${className ?? ''}`} ref={ref}>
      <button
        className="split-action"
        data-action={actionId}
        title={actionTitle}
        onClick={onAction}
      >
        {label}
      </button>
      <button
        className={`split-toggle ${open ? 'open' : ''}`}
        title={menuTitle}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        ▾
      </button>
      {open && <MenuList items={items} onClose={() => setOpen(false)} />}
    </div>
  );
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x, top: y });

  useEffect(() => {
    // Listening immediately is safe: this menu is opened from `contextmenu`
    // (and the dropdowns from `click`), both of which fire *after* the
    // mousedown of the gesture that opened them. Deferring the attachment
    // instead — to a frame or a timeout — races with re-renders and can leave
    // the menu with no outside-click handler at all.
    const onDocumentDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => e.key === 'Escape' && onClose();

    document.addEventListener('mousedown', onDocumentDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocumentDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  // Keep the popup inside the viewport.
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    setPosition({
      left: Math.min(x, window.innerWidth - rect.width - 8),
      top: Math.min(y, window.innerHeight - rect.height - 8),
    });
  }, [x, y]);

  return (
    <div className="context-menu" style={position} ref={ref}>
      <MenuList items={items} onClose={onClose} />
    </div>
  );
}
