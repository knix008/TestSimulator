import { useLayoutEffect } from 'react';
import { syncAppMinWidthFromNav } from '../lib/syncAppMinWidth.js';

function updateTrailingWidth(navEl, trailingEl) {
  if (!navEl || !trailingEl) return;

  const width = Math.ceil(trailingEl.getBoundingClientRect().width);
  navEl.style.setProperty('--nav-trailing-width', `${width}px`);
}

/** Reserves scroll padding for the fixed trailing cluster and syncs header min-width. */
export function useNavLayout(navRef, trailingRef, syncDeps = []) {
  useLayoutEffect(() => {
    const nav = navRef.current;
    const trailing = trailingRef.current;
    if (!nav) return undefined;

    let cancelled = false;
    let syncFrame = 0;
    let resizeObserver = null;

    const applyTrailingWidth = () => {
      updateTrailingWidth(nav, trailing);
    };

    const syncLayout = async () => {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      await new Promise((resolve) => requestAnimationFrame(resolve));
      if (document.fonts?.ready) await document.fonts.ready;
      if (cancelled) return;

      applyTrailingWidth();
      await syncAppMinWidthFromNav(nav, { updateMinWidth: true });
      if (!cancelled) applyTrailingWidth();
    };

    const scheduleSync = () => {
      cancelAnimationFrame(syncFrame);
      syncFrame = requestAnimationFrame(() => {
        void syncLayout();
      });
    };

    applyTrailingWidth();

    if (trailing && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        scheduleSync();
      });
      resizeObserver.observe(trailing);
    }

    window.addEventListener('resize', applyTrailingWidth);
    scheduleSync();

    return () => {
      cancelled = true;
      cancelAnimationFrame(syncFrame);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', applyTrailingWidth);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- explicit syncDeps from caller
  }, syncDeps);
}
