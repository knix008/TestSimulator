import { useEffect } from 'react';
import { useAiRefineJob } from '../context/AiRefineContext.jsx';

export function useAiRefinePageSync(entity, { applyRowCommitted, setItems, mapMergedRow } = {}) {
  const { registerRowListener } = useAiRefineJob(entity);

  useEffect(() => {
    if (!applyRowCommitted || !setItems) return undefined;

    return registerRowListener((item, after, before) => {
      applyRowCommitted(item, before, after, (row, merged) => {
        setItems((prev) => prev.map((r) => (
          r.id === row.id
            ? (mapMergedRow ? mapMergedRow(r, merged) : { ...r, ...merged })
            : r
        )));
      });
    });
  }, [registerRowListener, applyRowCommitted, setItems, mapMergedRow]);
}
