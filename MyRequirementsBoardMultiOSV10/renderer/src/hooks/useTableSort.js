import { useCallback, useState } from 'react';

export function useTableSort(initialSort = null) {
  const [sort, setSort] = useState(initialSort);

  const toggleSort = useCallback((columnId) => {
    setSort((prev) => {
      if (prev?.columnId === columnId) {
        return {
          columnId,
          direction: prev.direction === 'asc' ? 'desc' : 'asc',
        };
      }
      return { columnId, direction: 'asc' };
    });
  }, []);

  const clearSort = useCallback(() => {
    setSort(null);
  }, []);

  return { sort, toggleSort, clearSort, setSort };
}
