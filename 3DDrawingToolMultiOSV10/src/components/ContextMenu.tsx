import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store/useAppStore';
import { IconConnection, IconDuplicate, IconRedo, IconTrash, IconUndo } from './Icons';

type MenuState = { x: number; y: number; selectedId: string | null } | null;

export default function ContextMenu() {
  const { t } = useTranslation();
  const [menu, setMenu] = useState<MenuState>(null);
  const ref = useRef<HTMLDivElement>(null);

  const pastLen = useAppStore((s) => s.past.length);
  const futureLen = useAppStore((s) => s.future.length);
  const objects = useAppStore((s) => s.objects);
  const selectedId = useAppStore((s) => s.selectedId);
  const connectionStartId = useAppStore((s) => s.connectionStartId);
  const connectionEditTarget = useAppStore((s) => s.connectionEditTarget);
  const undo = useAppStore((s) => s.undo);
  const redo = useAppStore((s) => s.redo);
  const addConnection = useAppStore((s) => s.addConnection);
  const setConnectionStartId = useAppStore((s) => s.setConnectionStartId);
  const setConnectionEditTarget = useAppStore((s) => s.setConnectionEditTarget);
  const updateObject = useAppStore((s) => s.updateObject);
  const duplicateSelected = useAppStore((s) => s.duplicateSelected);
  const deleteSelected = useAppStore((s) => s.deleteSelected);
  const menuSelectedId = menu?.selectedId ?? selectedId;
  const selectedObject = objects.find((obj) => obj.id === menuSelectedId);
  const connectionStart = objects.find((obj) => obj.id === connectionStartId && obj.type !== 'connection');
  const editingConnection = objects.find((obj) => obj.id === connectionEditTarget?.connectionId && obj.type === 'connection');
  const canUseSelectedForConnection = !!selectedObject && selectedObject.type !== 'connection';
  const canCompleteConnection = !!connectionStart && canUseSelectedForConnection && selectedObject.id !== connectionStart.id;
  const canRetargetConnection = !!editingConnection && canUseSelectedForConnection && selectedObject.id !== (connectionEditTarget?.endpoint === 'start' ? editingConnection.connectionEndId : editingConnection.connectionStartId);

  useEffect(() => {
    if (connectionStartId && !connectionStart) setConnectionStartId(null);
  }, [connectionStart, connectionStartId]);

  useEffect(() => {
    if (connectionEditTarget && !editingConnection) setConnectionEditTarget(null);
  }, [connectionEditTarget, editingConnection, setConnectionEditTarget]);

  useEffect(() => {
    const onContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      // Keep native menu for text fields
      if (target.closest('input, textarea, select, [contenteditable="true"]')) return;

      // Only within the app chrome / workspace
      if (!target.closest('.app')) return;

      e.preventDefault();
      setMenu({ x: e.clientX, y: e.clientY, selectedId: useAppStore.getState().selectedId });
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
    if (x !== menu.x || y !== menu.y) setMenu({ ...menu, x, y });
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

        {connectionStart && (
          <button type="button" className="context-item muted" role="menuitem" disabled>
            <IconConnection width={15} height={15} />
            <span>{t('tools.connectionFrom', { name: connectionStart.name })}</span>
          </button>
        )}
        {editingConnection && connectionEditTarget && (
          <button type="button" className="context-item muted" role="menuitem" disabled>
            <IconConnection width={15} height={15} />
            <span>{t(connectionEditTarget.endpoint === 'start' ? 'tools.retargetingConnectionStart' : 'tools.retargetingConnectionEnd', { name: editingConnection.name })}</span>
          </button>
        )}
        {selectedObject?.type === 'connection' && (
          <>
            <button
              type="button"
              className="context-item"
              role="menuitem"
              onClick={() =>
                run(() => {
                  setConnectionStartId(null);
                  setConnectionEditTarget({ connectionId: selectedObject.id, endpoint: 'start' });
                })
              }
            >
              <IconConnection width={15} height={15} />
              <span>{t('tools.retargetConnectionStart')}</span>
            </button>
            <button
              type="button"
              className="context-item"
              role="menuitem"
              onClick={() =>
                run(() => {
                  setConnectionStartId(null);
                  setConnectionEditTarget({ connectionId: selectedObject.id, endpoint: 'end' });
                })
              }
            >
              <IconConnection width={15} height={15} />
              <span>{t('tools.retargetConnectionEnd')}</span>
            </button>
          </>
        )}
        <button
          type="button"
          className="context-item"
          role="menuitem"
          disabled={!canUseSelectedForConnection}
          onClick={() =>
            run(() => {
              if (selectedObject && selectedObject.type !== 'connection') setConnectionStartId(selectedObject.id);
            })
          }
        >
          <IconConnection width={15} height={15} />
          <span>{t('tools.startConnection')}</span>
        </button>
        <button
          type="button"
          className="context-item"
          role="menuitem"
          disabled={!canRetargetConnection}
          onClick={() =>
            run(() => {
              if (!editingConnection || !connectionEditTarget || !selectedObject || selectedObject.type === 'connection') return;
              updateObject(editingConnection.id, connectionEditTarget.endpoint === 'start'
                ? { connectionStartId: selectedObject.id }
                : { connectionEndId: selectedObject.id });
              setConnectionEditTarget(null);
            })
          }
        >
          <IconConnection width={15} height={15} />
          <span>{t('tools.completeRetargetConnection')}</span>
        </button>
        <button
          type="button"
          className="context-item"
          role="menuitem"
          disabled={!canCompleteConnection}
          onClick={() =>
            run(() => {
              if (!connectionStart || !selectedObject || selectedObject.type === 'connection') return;
              addConnection(connectionStart.id, selectedObject.id);
              setConnectionStartId(null);
              setConnectionEditTarget(null);
            })
          }
        >
          <IconConnection width={15} height={15} />
          <span>{t('tools.completeConnection')}</span>
        </button>
        {connectionStart && (
          <button type="button" className="context-item" role="menuitem" onClick={() => run(() => setConnectionStartId(null))}>
            <IconConnection width={15} height={15} />
            <span>{t('tools.cancelConnection')}</span>
          </button>
        )}
        {editingConnection && (
          <button type="button" className="context-item" role="menuitem" onClick={() => run(() => setConnectionEditTarget(null))}>
            <IconConnection width={15} height={15} />
            <span>{t('tools.cancelRetargetConnection')}</span>
          </button>
        )}

        <div className="context-sep" />

        <button
          type="button"
          className="context-item"
          role="menuitem"
          disabled={!menuSelectedId}
          onClick={() => run(duplicateSelected)}
        >
          <IconDuplicate width={15} height={15} />
          <span>{t('tools.duplicate')}</span>
        </button>
        <button
          type="button"
          className="context-item danger"
          role="menuitem"
          disabled={!menuSelectedId}
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
