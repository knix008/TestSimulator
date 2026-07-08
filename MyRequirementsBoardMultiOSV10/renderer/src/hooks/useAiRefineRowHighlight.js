import { useCallback, useEffect, useRef, useState } from 'react';
import { getChangedFieldKeys } from '../lib/aiRefineFields.js';

const CELL_HIGHLIGHT_MS = 1800;

export function useAiRefineRowHighlight({ tableFieldKeys }) {
  const [refinedCellKeys, setRefinedCellKeys] = useState({});
  const clearTimersRef = useRef(new Map());

  const clearRowTimer = useCallback((rowId) => {
    const timer = clearTimersRef.current.get(rowId);
    if (timer) {
      clearTimeout(timer);
      clearTimersRef.current.delete(rowId);
    }
  }, []);

  const resetRefineState = useCallback(() => {
    clearTimersRef.current.forEach((timer) => clearTimeout(timer));
    clearTimersRef.current.clear();
    setRefinedCellKeys({});
  }, []);

  const applyRowCommitted = useCallback((item, before, after, updateItems) => {
    const rowId = item.id;
    clearRowTimer(rowId);

    updateItems(item, after);
    const changedFields = getChangedFieldKeys(before, after, tableFieldKeys);

    if (changedFields.length === 0) {
      setRefinedCellKeys((prev) => {
        if (!prev[rowId]) return prev;
        const next = { ...prev };
        delete next[rowId];
        return next;
      });
      return;
    }

    setRefinedCellKeys((prev) => ({
      ...prev,
      [rowId]: changedFields,
    }));

    const timer = setTimeout(() => {
      setRefinedCellKeys((prev) => {
        if (!prev[rowId]) return prev;
        const next = { ...prev };
        delete next[rowId];
        return next;
      });
      clearTimersRef.current.delete(rowId);
    }, CELL_HIGHLIGHT_MS);

    clearTimersRef.current.set(rowId, timer);
  }, [clearRowTimer, tableFieldKeys]);

  useEffect(() => () => {
    clearTimersRef.current.forEach((timer) => clearTimeout(timer));
    clearTimersRef.current.clear();
  }, []);

  const isCellRefined = useCallback(
    (itemId, columnId) => refinedCellKeys[itemId]?.includes(columnId),
    [refinedCellKeys],
  );

  return {
    resetRefineState,
    applyRowCommitted,
    isCellRefined,
  };
}
