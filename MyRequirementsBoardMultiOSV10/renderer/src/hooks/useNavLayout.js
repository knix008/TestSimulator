import { useLayoutEffect } from 'react';
import { syncAppMinWidthFromNav, syncAppMinWidthOnResize, scrollNavSettingsIntoView } from '../lib/syncAppMinWidth.js';

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

/** Syncs header min-width when nav/trailing layout changes. */
export function useNavLayout(navRef, trailingRef, { layoutDeps = [], trailingDeps = [] } = {}) {
  useLayoutEffect(() => {
    const nav = navRef.current;
    const trailing = trailingRef.current;
    if (!nav) return undefined;

    let syncTimer = null;
    const scheduleOverflowSync = () => {
      clearTimeout(syncTimer);
      syncTimer = setTimeout(() => {
        scrollNavSettingsIntoView(nav);
        void syncAppMinWidthOnResize(nav);
      }, 250);
    };

    let resizeObserver = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(scheduleOverflowSync);
      resizeObserver.observe(nav);
      if (trailing) resizeObserver.observe(trailing);
    }

    return () => {
      resizeObserver?.disconnect();
      clearTimeout(syncTimer);
    };
  }, trailingDeps);

  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return undefined;

    let cancelled = false;
    let fullIdleId = null;

    const runFullSync = async () => {
      if (cancelled) return;
      scrollNavSettingsIntoView(nav);
      await syncAppMinWidthFromNav(nav, { updateMinWidth: true, deferHeavyMeasure: false });
    };

    void runFullSync();
    fullIdleId = scheduleIdleTask(runFullSync, { timeout: 1200 });

    return () => {
      cancelled = true;
      if (fullIdleId != null) cancelIdleTask(fullIdleId);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- explicit layoutDeps from caller
  }, layoutDeps);
}
