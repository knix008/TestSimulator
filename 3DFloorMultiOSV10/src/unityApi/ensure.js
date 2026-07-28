import { isDesktopApp } from '../desktop/bridge.js';
import { runWithProgressDialog } from '../ui/progressDialog.js';
import { t } from '../i18n/index.js';

/**
 * @returns {Promise<{
 *   installed: boolean,
 *   running?: boolean,
 *   hasWeights?: boolean,
 *   path?: string,
 *   url?: string,
 *   hasPython?: boolean
 * }>}
 */
export async function getFloorplanApiStatus() {
  if (isDesktopApp() && typeof window.fp3dDesktop.getFloorplanApiStatus === 'function') {
    return window.fp3dDesktop.getFloorplanApiStatus();
  }
  try {
    const res = await fetch('/__fp3d/floorplan-api/status', { cache: 'no-store' });
    if (res.ok) return res.json();
  } catch {
    /* ignore */
  }
  return { installed: false, running: false };
}

/**
 * Ensure FloorPlanTo3D-API is installed, weights present, and server running.
 * Shows progress bar + percent popup.
 * @returns {Promise<{ ok: boolean, canceled?: boolean, alreadyRunning?: boolean, error?: string, url?: string }>}
 */
export async function ensureFloorplanApiWithUi() {
  return runWithProgressDialog({
    titleKey: 'progressDialog.unityApiTitle',
    cancelable: true,
    run: async (update, signal) => {
      update({
        percent: 1,
        phase: 'check',
        message: t('progressDialog.unityApiChecking'),
      });

      if (isDesktopApp() && typeof window.fp3dDesktop.ensureFloorplanApi === 'function') {
        const unsub = window.fp3dDesktop.onFloorplanApiProgress?.((info) => {
          update({
            percent: info.percent,
            phase: info.phase,
            message: info.message || t('progressDialog.unityApiWorking'),
          });
        });
        try {
          if (signal.aborted) return { canceled: true };
          const abortUnsub = () => window.fp3dDesktop.cancelFloorplanApi?.();
          signal.addEventListener('abort', abortUnsub, { once: true });
          const result = await window.fp3dDesktop.ensureFloorplanApi();
          signal.removeEventListener('abort', abortUnsub);
          if (result?.canceled) return { canceled: true };
          if (!result?.ok) {
            return {
              ...result,
              ok: false,
              error: result?.error || t('progressDialog.unityApiFailed'),
            };
          }
          return result;
        } finally {
          unsub?.();
        }
      }

      return ensureViaDevServer(update, signal);
    },
  });
}

/**
 * @param {(info: object) => void} update
 * @param {AbortSignal} signal
 */
async function ensureViaDevServer(update, signal) {
  const res = await fetch('/__fp3d/floorplan-api/ensure', {
    method: 'GET',
    headers: { Accept: 'text/event-stream' },
    signal,
  });
  if (!res.ok || !res.body) {
    throw new Error(t('progressDialog.unityApiNoInstaller'));
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finalResult = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() || '';
    for (const part of parts) {
      const line = part.split('\n').find((l) => l.startsWith('data: '));
      if (!line) continue;
      let data;
      try {
        data = JSON.parse(line.slice(6));
      } catch {
        continue;
      }
      if (data.done) {
        finalResult = data;
        continue;
      }
      update({
        percent: data.percent,
        phase: data.phase,
        message: data.message || t('progressDialog.unityApiWorking'),
      });
    }
  }

  if (signal.aborted || finalResult?.canceled) return { canceled: true };
  if (!finalResult?.ok) {
    return {
      ...finalResult,
      ok: false,
      error: finalResult?.error || t('progressDialog.unityApiFailed'),
    };
  }
  return finalResult;
}
