import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client.js';
import {
  getVisibleTestCasesColumns,
  resolveTestCasesColumnWidths,
} from '../lib/testCasesTableLayout.js';

export function useTestCasesTableColumns({
  projectId,
  uiSettings,
  canEdit,
  onUiSettingsSaved,
}) {
  const columns = getVisibleTestCasesColumns(canEdit);
  const [widths, setWidths] = useState(() => resolveTestCasesColumnWidths(uiSettings, canEdit));
  const [resizingColumnId, setResizingColumnId] = useState(null);
  const widthsRef = useRef(widths);
  const saveTimerRef = useRef(null);
  const resizeRef = useRef(null);

  useEffect(() => {
    widthsRef.current = widths;
  }, [widths]);

  useEffect(() => {
    setWidths(resolveTestCasesColumnWidths(uiSettings, canEdit));
  }, [projectId, uiSettings, canEdit]);

  useEffect(() => () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    if (resizeRef.current) {
      document.removeEventListener('mousemove', resizeRef.current.onMove);
      document.removeEventListener('mouseup', resizeRef.current.onUp);
    }
    document.body.classList.remove('requirements-table--resizing');
  }, []);

  const persistWidths = useCallback((nextWidths) => {
    if (!projectId || !canEdit) return;

    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        const updated = await api.patchProjectUiSettings(projectId, {
          testCasesTable: { columnWidths: nextWidths },
        });
        onUiSettingsSaved?.(updated.uiSettings);
      } catch {
        // Silent retry on next resize.
      }
    }, 400);
  }, [projectId, canEdit, onUiSettingsSaved]);

  const startResize = useCallback((columnId, event) => {
    if (!canEdit) return;

    event.preventDefault();
    event.stopPropagation();

    const column = columns.find((entry) => entry.id === columnId);
    if (!column) return;

    const startX = event.clientX;
    const startWidth = widthsRef.current[columnId] ?? column.defaultWidth;
    setResizingColumnId(columnId);

    const onMove = (moveEvent) => {
      const nextWidth = Math.max(column.minWidth, startWidth + (moveEvent.clientX - startX));
      setWidths((prev) => {
        const updated = { ...prev, [columnId]: nextWidth };
        widthsRef.current = updated;
        return updated;
      });
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.classList.remove('requirements-table--resizing');
      resizeRef.current = null;
      setResizingColumnId(null);
      persistWidths(widthsRef.current);
    };

    resizeRef.current = { onMove, onUp };
    document.body.classList.add('requirements-table--resizing');
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [canEdit, columns, persistWidths]);

  return {
    columns,
    widths,
    resizingColumnId,
    startResize,
  };
}
