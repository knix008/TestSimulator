import { useEffect, useRef, useState } from 'react';
import { ToolbarIcon } from '@web/components/ToolbarIcons';
import {
  buildDesktopMenus,
  isMenuSeparator,
  isMenuSubmenu,
  type DesktopMenuEntry,
  type DesktopMenuGroup,
} from '../desktopAppActions';
import type { DesktopAppActions } from '../desktopAppActions';
import type { GanttViewSettings } from '@web/types/project';
import './DesktopMenuBar.css';

interface DesktopMenuBarProps {
  actions: DesktopAppActions;
  linkMode: boolean;
  showCriticalPath: boolean;
  propertiesPanelVisible: boolean;
  calendarView: boolean;
  canDeleteTask: boolean;
  canIndentTask: boolean;
  canOutdentTask: boolean;
  canLink: boolean;
  canUnlink: boolean;
  canAddNote: boolean;
  canUndo: boolean;
  canRedo: boolean;
  recentFiles: string[];
  defaultDependencyType: GanttViewSettings['defaultDependencyType'];
  locale: 'ko' | 'en';
  isAdmin: boolean;
}

function MenuShortcut({ text }: { text?: string }) {
  if (!text) return null;
  return <span className="desktop-menu-shortcut">{text}</span>;
}

function MenuRow({
  entry,
  onClose,
  depth = 0,
}: {
  entry: DesktopMenuEntry;
  onClose: () => void;
  depth?: number;
}) {
  const [subOpen, setSubOpen] = useState(false);
  const rowRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    if (!subOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (rowRef.current && !rowRef.current.contains(e.target as Node)) {
        setSubOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [subOpen]);

  if (isMenuSeparator(entry)) {
    return <li className="desktop-menu-separator" role="separator" />;
  }

  if (isMenuSubmenu(entry)) {
    return (
      <li
        ref={rowRef}
        className="desktop-menu-item desktop-menu-item--submenu"
        onMouseEnter={() => setSubOpen(true)}
        onMouseLeave={() => setSubOpen(false)}
      >
        <button type="button" className="desktop-menu-button" onClick={() => setSubOpen((v) => !v)}>
          {entry.icon ? <ToolbarIcon name={entry.icon} className="desktop-menu-icon" /> : null}
          <span className="desktop-menu-label">{entry.label}</span>
          <span className="desktop-menu-submenu-arrow">▸</span>
        </button>
        {subOpen && (
          <ul className="desktop-menu-dropdown desktop-menu-dropdown--nested" style={{ ['--depth' as string]: depth }}>
            {entry.items.map((child, childIndex) => (
              <MenuRow
                key={isMenuSeparator(child) ? `sep-${childIndex}` : child.id}
                entry={child}
                onClose={onClose}
                depth={depth + 1}
              />
            ))}
          </ul>
        )}
      </li>
    );
  }

  return (
    <li className="desktop-menu-item" role="none">
      <button
        type="button"
        className="desktop-menu-button"
        disabled={entry.disabled}
        onClick={() => {
          if (entry.disabled) return;
          entry.onClick?.();
          onClose();
        }}
      >
        {entry.icon ? <ToolbarIcon name={entry.icon} className="desktop-menu-icon" /> : null}
        <span className="desktop-menu-label">{entry.label}</span>
        {entry.checked ? <span className="desktop-menu-check">✓</span> : null}
        <MenuShortcut text={entry.shortcut} />
      </button>
    </li>
  );
}

function MenuDropdown({ group, onCloseRoot }: { group: DesktopMenuGroup; onCloseRoot: () => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        onCloseRoot();
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open, onCloseRoot]);

  return (
    <div ref={rootRef} className="desktop-menu-root">
      <button
        type="button"
        className={`desktop-menu-top ${open ? 'desktop-menu-top--open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <ToolbarIcon name={group.icon} className="desktop-menu-top-icon" />
        <span>{group.label}</span>
      </button>
      {open && (
        <ul className="desktop-menu-dropdown" role="menu">
          {group.items.map((entry, index) => (
            <MenuRow
              key={isMenuSeparator(entry) ? `sep-${index}` : entry.id}
              entry={entry}
              onClose={() => {
                setOpen(false);
                onCloseRoot();
              }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

export function DesktopMenuBar(props: DesktopMenuBarProps) {
  const menus = buildDesktopMenus(props.actions, {
    linkMode: props.linkMode,
    showCriticalPath: props.showCriticalPath,
    propertiesPanelVisible: props.propertiesPanelVisible,
    calendarView: props.calendarView,
    canDeleteTask: props.canDeleteTask,
    canIndentTask: props.canIndentTask,
    canOutdentTask: props.canOutdentTask,
    canLink: props.canLink,
    canUnlink: props.canUnlink,
    canAddNote: props.canAddNote,
    canUndo: props.canUndo,
    canRedo: props.canRedo,
    recentFiles: props.recentFiles,
    defaultDependencyType: props.defaultDependencyType,
    locale: props.locale,
    isAdmin: props.isAdmin,
  });

  return (
    <nav className="desktop-menu-bar" aria-label="Application menu">
      {menus.map((group) => (
        <MenuDropdown key={group.id} group={group} onCloseRoot={() => {}} />
      ))}
    </nav>
  );
}
