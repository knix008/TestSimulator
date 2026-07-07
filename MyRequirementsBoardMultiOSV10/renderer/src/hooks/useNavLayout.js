import { useLayoutEffect } from 'react';
import { syncAppMinWidthFromNav } from '../lib/syncAppMinWidth.js';

function updateTrailingWidth(navEl, trailingEl) {
  if (!navEl || !trailingEl) return;

  const width = Math.ceil(trailingEl.getBoundingClientRect().width);
  navEl.style.setProperty('--nav-trailing-width', `${width}px`);
}

function scheduleIdleTask(task, { timeout = 800 } = {}) {
  if (typeof requestIdleCallback !== 'undefined') {
    return requestIdleCallback(() => {
      void task();
    }, { timeout });
  }
  return setTimeout(() => {
    void task();
  }, 0);
}

function cancelIdleTask(id) {
  if (typeof cancelIdleCallback !== 'undefined') {
    cancelIdleCallback(id);
    return;
  }
  clearTimeout(id);
}

/** Reserves scroll padding for the fixed trailing cluster and syncs header min-width. */
export function useNavLayout(navRef, trailingRef, { layoutDeps = [], trailingDeps = [] } = {}) {
  useLayoutEffect(() => {
    const nav = navRef.current;
    const trailing = trailingRef.current;
    if (!nav) return undefined;

    updateTrailingWidth(nav, trailing);

    let resizeObserver = null;
    if (trailing && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        updateTrailingWidth(nav, trailing);
      });
      resizeObserver.observe(trailing);
    }

    return () => {
      resizeObserver?.disconnect();
    };
  }, trailingDeps);

  useLayoutEffect(() => {
    const nav = navRef.current;
    const trailing = trailingRef.current;
    if (!nav) return undefined;

    let cancelled = false;
    let fastIdleId = null;
    let fullIdleId = null;

    const applyTrailingWidth = () => {
      updateTrailingWidth(nav, trailing);
    };

    const runFastSync = async () => {
      if (cancelled) return;
      applyTrailingWidth();
      await syncAppMinWidthFromNav(nav, { updateMinWidth: false, deferHeavyMeasure: true });
      if (!cancelled) applyTrailingWidth();
    };

    const runFullSync = async () => {
      if (cancelled) return;
      applyTrailingWidth();
      await syncAppMinWidthFromNav(nav, { updateMinWidth: true, deferHeavyMeasure: false });
      if (!cancelled) applyTrailingWidth();
    };

    applyTrailingWidth();
    fastIdleId = scheduleIdleTask(runFastSync, { timeout: 120 });
    fullIdleId = scheduleIdleTask(runFullSync, { timeout: 1200 });

    return () => {
      cancelled = true;
      if (fastIdleId != null) cancelIdleTask(fastIdleId);
      if (fullIdleId != null) cancelIdleTask(fullIdleId);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- explicit layoutDeps from caller
  }, layoutDeps);
}
