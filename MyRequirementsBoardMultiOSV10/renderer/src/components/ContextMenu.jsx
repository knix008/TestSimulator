import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconText } from './IconText.jsx';

const ContextMenuContext = createContext(null);

function clampPosition(x, y, width, height) {
  const margin = 8;
  const maxX = window.innerWidth - width - margin;
  const maxY = window.innerHeight - height - margin;
  return {
    x: Math.max(margin, Math.min(x, maxX)),
    y: Math.max(margin, Math.min(y, maxY)),
  };
}

function ContextMenuPanel({ x, y, items, onClose }) {
  const [pos, setPos] = useState({ x, y });

  useEffect(() => {
    const el = document.getElementById('app-context-menu');
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setPos(clampPosition(x, y, width, height));
  }, [x, y, items]);

  const handleAction = (item) => {
    if (item.disabled) return;
    onClose();
    item.onClick?.();
  };

  return createPortal(
    <div
      id="app-context-menu"
      className="context-menu"
      style={{ left: pos.x, top: pos.y }}
      role="menu"
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <ul className="context-menu__list">
        {items.map((item, index) => {
          if (item.separator) {
            return <li key={`sep-${index}`} className="context-menu__separator" role="separator" />;
          }
          const Icon = item.icon;
          return (
            <li key={item.id || item.label || index} role="none">
              <button
                type="button"
                role="menuitem"
                className={`context-menu__item${item.danger ? ' context-menu__item--danger' : ''}${item.disabled ? ' context-menu__item--disabled' : ''}`}
                disabled={item.disabled}
                title={item.tooltip || item.label}
                onClick={() => handleAction(item)}
              >
                {Icon ? <IconText icon={Icon}>{item.label}</IconText> : item.label}
              </button>
            </li>
          );
        })}
      </ul>
    </div>,
    document.body,
  );
}

export function ContextMenuProvider({ children }) {
  const [menu, setMenu] = useState(null);

  const closeContextMenu = useCallback(() => setMenu(null), []);

  const openContextMenu = useCallback((event, items) => {
    if (!items?.length) return;
    event.preventDefault();
    event.stopPropagation();
    setMenu({
      x: event.clientX,
      y: event.clientY,
      items: items.filter((item) => item.separator || item.label),
    });
  }, []);

  useEffect(() => {
    if (!menu) return undefined;
    const close = () => closeContextMenu();
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    window.addEventListener('click', close);
    window.addEventListener('contextmenu', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('contextmenu', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [menu, closeContextMenu]);

  return (
    <ContextMenuContext.Provider value={{ openContextMenu, closeContextMenu }}>
      {children}
      {menu && (
        <ContextMenuPanel
          x={menu.x}
          y={menu.y}
          items={menu.items}
          onClose={closeContextMenu}
        />
      )}
    </ContextMenuContext.Provider>
  );
}

export function useContextMenu() {
  const ctx = useContext(ContextMenuContext);
  if (!ctx) throw new Error('useContextMenu must be used within ContextMenuProvider');
  return ctx;
}

/**
 * Opens a context menu for a selectable row.
 * If the row is not already selected, selects it exclusively first.
 */
export function openRowContextMenu(event, {
  openContextMenu,
  rowId,
  selectedIds,
  setSelectedIds,
  items,
  multiSelect = false,
}) {
  let effectiveSelection = selectedIds;

  if (multiSelect && event.ctrlKey) {
    effectiveSelection = selectedIds.includes(rowId)
      ? selectedIds.filter((id) => id !== rowId)
      : [...selectedIds, rowId];
    setSelectedIds(effectiveSelection);
  } else if (!selectedIds.includes(rowId)) {
    effectiveSelection = [rowId];
    setSelectedIds([rowId]);
  }

  const resolvedItems = typeof items === 'function'
    ? items(effectiveSelection, rowId)
    : items;

  openContextMenu(event, resolvedItems);
}
