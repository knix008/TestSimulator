import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store/useAppStore';
import { IconDuplicate, IconRedo, IconTrash, IconUndo } from './Icons';

type MenuState = { x: number; y: number } | null;

export default function ContextMenu() {
  const { t } = useTranslation();
  const [menu, setMenu] = useState<MenuState>(null);
  const ref = useRef<HTMLDivElement>(null);

  const pastLen = useAppStore((s) => s.past.length);
  const futureLen = useAppStore((s) => s.future.length);
  const selectedId = useAppStore((s) => s.selectedId);
  const undo = useAppStore((s) => s.undo);
  const redo = useAppStore((s) => s.redo);
  const duplicateSelected = useAppStore((s) => s.duplicateSelected);
  const deleteSelected = useAppStore((s) => s.deleteSelected);

  useEffect(() => {
    const onContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      // Keep native menu for text fields
      if (target.closest('input, textarea, select, [contenteditable="true"]')) return;

      // Only within the app chrome / workspace
      if (!target.closest('.app')) return;

      e.preventDefault();
      setMenu({ x: e.clientX, y: e.clientY });
    };

    const onClose = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(null);
    };

    window.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('resize', onClose);
    window.addEventListener('blur', onClose);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('resize', onClose);
      window.removeEventListener('blur', onClose);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  useLayoutEffect(() => {
    if (!menu || !ref.current) return;
    const el = ref.current;
    const rect = el.getBoundingClientRect();
    const pad = 8;
    let x = menu.x;
    let y = menu.y;
    if (x + rect.width > window.innerWidth - pad) x = window.innerWidth - rect.width - pad;
    if (y + rect.height > window.innerHeight - pad) y = window.innerHeight - rect.height - pad;
    if (x < pad) x = pad;
    if (y < pad) y = pad;
    if (x !== menu.x || y !== menu.y) setMenu({ x, y });
  }, [menu]);

  if (!menu) return null;

  const run = (fn: () => void) => {
    fn();
    setMenu(null);
  };

  return (
    <>
      <div className="context-menu-backdrop" onMouseDown={() => setMenu(null)} />
      <div
        ref={ref}
        className="context-menu"
        style={{ left: menu.x, top: menu.y }}
        role="menu"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="context-item"
          role="menuitem"
          disabled={pastLen === 0}
          onClick={() => run(undo)}
        >
          <IconUndo width={15} height={15} />
          <span>{t('toolbar.undo')}</span>
          <kbd>Ctrl+Z</kbd>
        </button>
        <button
          type="button"
          className="context-item"
          role="menuitem"
          disabled={futureLen === 0}
          onClick={() => run(redo)}
        >
          <IconRedo width={15} height={15} />
          <span>{t('toolbar.redo')}</span>
          <kbd>Ctrl+Y</kbd>
        </button>

        <div className="context-sep" />

        <button
          type="button"
          className="context-item"
          role="menuitem"
          disabled={!selectedId}
          onClick={() => run(duplicateSelected)}
        >
          <IconDuplicate width={15} height={15} />
          <span>{t('tools.duplicate')}</span>
        </button>
        <button
          type="button"
          className="context-item danger"
          role="menuitem"
          disabled={!selectedId}
          onClick={() => run(deleteSelected)}
        >
          <IconTrash width={15} height={15} />
          <span>{t('tools.delete')}</span>
          <kbd>Del</kbd>
        </button>
      </div>
    </>
  );
}
