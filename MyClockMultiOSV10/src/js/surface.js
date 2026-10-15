'use strict';

/**
 * 투명 창이 하얗게 굳거나 캔버스가 멈추면 시계를 다시 그린다.
 * redraw 는 지금 시각으로 한 프레임을 그리는 함수.
 */
function watchClockSurface(redraw) {
  const api = window.myclock;

  function resetCanvases() {
    if (!document.querySelectorAll) return;
    for (const canvas of document.querySelectorAll('canvas')) {
      const width = canvas.width;
      if (width > 0) canvas.width = width;
    }
  }

  function recover() {
    try {
      resetCanvases();
      redraw();
    } catch {
      /* 다음 틱이 다시 그린다 */
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    recover();
    if (api && api.window && typeof api.window.requestSurfaceRefresh === 'function') {
      api.window.requestSurfaceRefresh();
    }
  });

  if (document.querySelectorAll) {
    for (const canvas of document.querySelectorAll('canvas')) {
      canvas.addEventListener('contextlost', (event) => {
        event.preventDefault();
      });
      canvas.addEventListener('contextrestored', recover);
    }
  }

  if (api && api.window && typeof api.window.onSurfaceRefresh === 'function') {
    api.window.onSurfaceRefresh(recover);
  }
}
