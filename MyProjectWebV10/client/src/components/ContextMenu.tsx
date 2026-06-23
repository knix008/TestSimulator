import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { DependencyTypePreview } from './DependencyTypePreview';
import { ToolbarIcon, type ToolbarIconName } from './ToolbarIcons';
import type { GanttViewSettings } from '../types/project';
import './ContextMenu.css';

export interface ContextMenuItemDef {
  id: string;
  label: string;
  icon: ToolbarIconName;
  disabled?: boolean;
  checked?: boolean;
  dependencyTypePreview?: GanttViewSettings['defaultDependencyType'];
  onClick: () => void;
}
export interface ContextMenuSeparator {
  type: 'separator';
}

export type ContextMenuEntry = ContextMenuItemDef | ContextMenuSeparator;

export function isContextMenuSeparator(entry: ContextMenuEntry): entry is ContextMenuSeparator {
  return 'type' in entry && entry.type === 'separator';
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuEntry[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLUListElement>(null);
  const [position, setPosition] = useState({ x, y });

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) {
      setPosition({ x, y });
      return;
    }

    const rect = menu.getBoundingClientRect();
    const margin = 8;
    let nextX = x;
    let nextY = y;

    if (nextX + rect.width > window.innerWidth - margin) {
      nextX = Math.max(margin, window.innerWidth - rect.width - margin);
    }
    if (nextY + rect.height > window.innerHeight - margin) {
      nextY = Math.max(margin, window.innerHeight - rect.height - margin);
    }

    setPosition({ x: nextX, y: nextY });
  }, [x, y, items]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const onScroll = () => onClose();

    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onClose);

    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  if (items.length === 0) return null;

  return createPortal(
    <ul
      ref={menuRef}
      className="context-menu"
      style={{ left: position.x, top: position.y }}
      role="menu"
    >
      {items.map((entry, index) =>
        isContextMenuSeparator(entry) ? (
          <li key={`sep-${index}`} className="context-menu-separator" role="separator" />
        ) : (
          <li key={entry.id} role="none">
            <button
              type="button"
              className={[
                'context-menu-item',
                entry.checked ? 'context-menu-item-checked' : '',
                entry.disabled ? 'context-menu-item-disabled' : '',
                entry.dependencyTypePreview ? 'context-menu-item-with-preview' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              role="menuitemcheckbox"
              aria-checked={entry.checked ?? false}
              disabled={entry.disabled}
              onClick={() => {
                if (entry.disabled) return;
                entry.onClick();
                onClose();
              }}
            >
              <span className="context-menu-item-icon" aria-hidden="true">
                <ToolbarIcon name={entry.icon} className="context-menu-icon" />
              </span>
              {entry.checked ? (
                <span className="context-menu-item-check" aria-hidden="true">
                  ✓
                </span>
              ) : (
                <span className="context-menu-item-check" aria-hidden="true" />
              )}
              <span className="context-menu-item-label">{entry.label}</span>
              {entry.dependencyTypePreview ? (
                <span className="context-menu-item-preview" aria-hidden="true">
                  <DependencyTypePreview type={entry.dependencyTypePreview} />
                </span>
              ) : null}
            </button>
          </li>
        ),
      )}
    </ul>,
    document.body,
  );
}
