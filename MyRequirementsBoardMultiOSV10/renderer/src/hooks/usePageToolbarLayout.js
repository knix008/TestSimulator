import { useLayoutEffect } from 'react';
import { syncAppMinWidthFromNav } from '../lib/syncAppMinWidth.js';

/** Re-sync window min width when page toolbar contents change size. */
export function usePageToolbarLayout(deps = []) {
  useLayoutEffect(() => {
    const nav = document.querySelector('.nav');
    if (!nav) return undefined;

    void syncAppMinWidthFromNav(nav, { updateMinWidth: true, deferHeavyMeasure: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- explicit deps from caller
  }, deps);
}
