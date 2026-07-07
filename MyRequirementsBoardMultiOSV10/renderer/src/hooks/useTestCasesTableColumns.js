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

    const columnIndex = columns.findIndex((entry) => entry.id === columnId);
    const neighborColumn = columns[columnIndex + 1];
    if (!neighborColumn) return;

    const startX = event.clientX;
    const startWidths = { ...widthsRef.current };
    const startCurrent = startWidths[columnId] ?? column.defaultWidth;
    const startNeighbor = startWidths[neighborColumn.id] ?? neighborColumn.defaultWidth;
    setResizingColumnId(columnId);

    const onMove = (moveEvent) => {
      const delta = moveEvent.clientX - startX;
      let nextCurrent = startCurrent + delta;
      let nextNeighbor = startNeighbor - delta;

      if (nextCurrent < column.minWidth) {
        nextNeighbor -= column.minWidth - nextCurrent;
        nextCurrent = column.minWidth;
      }
      if (nextNeighbor < neighborColumn.minWidth) {
        nextCurrent -= neighborColumn.minWidth - nextNeighbor;
        nextNeighbor = neighborColumn.minWidth;
      }

      nextCurrent = Math.max(column.minWidth, nextCurrent);
      nextNeighbor = Math.max(neighborColumn.minWidth, nextNeighbor);

      setWidths((prev) => {
        const updated = {
          ...prev,
          [columnId]: Math.round(nextCurrent),
          [neighborColumn.id]: Math.round(nextNeighbor),
        };
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
