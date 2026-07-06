import { useLayoutEffect, useRef } from 'react';
import {
  applyAppMinHeight,
  clearAppMinHeight,
  computeDesktopAppMinHeight,
  DESKTOP_WINDOW_MIN_WIDTH,
  measureDesktopToolbarHeight,
} from '@web/utils/toolbarLayout';

export function useDesktopWindowMinSize(deps: unknown[] = []) {
  const toolbarRef = useRef<HTMLElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const toolbar = toolbarRef.current;
    const actions = actionsRef.current;
    if (!toolbar || !actions) return;

    let frameId = 0;

    const syncLayout = () => {
      const projectView = toolbar.closest('.desktop-project-view');
      const menuBar = projectView?.querySelector('.desktop-menu-bar');
      const statusBar = projectView?.querySelector('.desktop-status-bar');
      const errorBanner = projectView?.querySelector('.desktop-error-banner');

      const toolbarHeight = measureDesktopToolbarHeight(toolbar, actions);
      toolbar.style.minHeight = `${toolbarHeight}px`;

      const minHeight = computeDesktopAppMinHeight(toolbar, {
        actions,
        menuBar: menuBar instanceof HTMLElement ? menuBar : null,
        statusBar: statusBar instanceof HTMLElement ? statusBar : null,
        extraChrome: errorBanner instanceof HTMLElement ? errorBanner : null,
      });

      applyAppMinHeight(minHeight);
      window.electronAPI?.setMinimumSize?.(DESKTOP_WINDOW_MIN_WIDTH, minHeight);
    };

    const scheduleSync = () => {
      cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(() => {
        frameId = requestAnimationFrame(syncLayout);
      });
    };

    scheduleSync();

    const resizeObserver = new ResizeObserver(scheduleSync);
    resizeObserver.observe(toolbar);
    resizeObserver.observe(actions);
    for (const child of actions.children) {
      resizeObserver.observe(child);
    }

    const projectView = toolbar.closest('.desktop-project-view');
    if (projectView instanceof HTMLElement) {
      resizeObserver.observe(projectView);
    }
    for (const selector of ['.desktop-menu-bar', '.desktop-status-bar', '.desktop-error-banner']) {
      const element = projectView?.querySelector(selector);
      if (element instanceof HTMLElement) {
        resizeObserver.observe(element);
      }
    }

    const mutationObserver = new MutationObserver(() => {
      for (const child of actions.children) {
        resizeObserver.observe(child);
      }
      scheduleSync();
    });
    mutationObserver.observe(actions, { childList: true, subtree: true, attributes: true });

    window.addEventListener('resize', scheduleSync);
    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      window.removeEventListener('resize', scheduleSync);
      toolbar.style.removeProperty('min-height');
      clearAppMinHeight();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { toolbarRef, actionsRef };
}
