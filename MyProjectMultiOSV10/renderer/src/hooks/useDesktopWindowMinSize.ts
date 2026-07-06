import { useLayoutEffect, useRef } from 'react';
import {
  applyAppMinHeight,
  applyAppMinWidth,
  clearAppMinHeight,
  clearAppMinWidth,
  computeDesktopAppMinWidth,
  DESKTOP_WINDOW_MIN_HEIGHT,
} from '@web/utils/toolbarLayout';

export function useDesktopWindowMinSize(deps: unknown[] = []) {
  const toolbarRef = useRef<HTMLElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const toolbar = toolbarRef.current;
    const actions = actionsRef.current;
    if (!toolbar || !actions) return;

    const update = () => {
      const minWidth = computeDesktopAppMinWidth(toolbar, actions);
      applyAppMinWidth(minWidth);
      applyAppMinHeight(DESKTOP_WINDOW_MIN_HEIGHT);
      window.electronAPI?.setMinimumSize?.(minWidth, DESKTOP_WINDOW_MIN_HEIGHT);
    };

    update();

    const resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(toolbar);
    resizeObserver.observe(actions);
    for (const child of actions.children) {
      resizeObserver.observe(child);
    }

    const mutationObserver = new MutationObserver(() => {
      for (const child of actions.children) {
        resizeObserver.observe(child);
      }
      update();
    });
    mutationObserver.observe(actions, { childList: true, subtree: true, attributes: true });

    window.addEventListener('resize', update);
    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      window.removeEventListener('resize', update);
      clearAppMinWidth();
      clearAppMinHeight();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { toolbarRef, actionsRef };
}
