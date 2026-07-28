import { isDesktopApp } from '../desktop/bridge.js';
import { runWithProgressDialog } from '../ui/progressDialog.js';
import { t } from '../i18n/index.js';

/**
 * @returns {Promise<{ installed: boolean, path?: string, hasNodeModules?: boolean }>}
 */
export async function getDreamspaceInstallStatus() {
  if (isDesktopApp() && typeof window.fp3dDesktop.getDreamspaceStatus === 'function') {
    return window.fp3dDesktop.getDreamspaceStatus();
  }
  try {
    const res = await fetch('/__fp3d/dreamspace/status', { cache: 'no-store' });
    if (res.ok) return res.json();
  } catch {
    /* ignore */
  }
  return { installed: false };
}

/**
 * Ensure DreamSpaceAI sources exist; download from GitHub with a progress popup.
 * @returns {Promise<{ ok: boolean, canceled?: boolean, alreadyInstalled?: boolean, error?: string }>}
 */
export async function ensureDreamspaceWithUi() {
  const status = await getDreamspaceInstallStatus();
  if (status.installed) {
    return { ok: true, alreadyInstalled: true };
  }

  return runWithProgressDialog({
    titleKey: 'progressDialog.dreamspaceTitle',
    cancelable: true,
    run: async (update, signal) => {
      update({
        percent: 1,
        phase: 'check',
        message: t('progressDialog.dreamspaceChecking'),
      });

      if (isDesktopApp() && typeof window.fp3dDesktop.ensureDreamspace === 'function') {
        const unsub = window.fp3dDesktop.onDreamspaceProgress?.((info) => {
          update({
            percent: info.percent,
            phase: info.phase,
            message: info.message || t('progressDialog.dreamspaceDownloading'),
          });
        });
        try {
          if (signal.aborted) return { canceled: true };
          const abortUnsub = () => window.fp3dDesktop.cancelDreamspace?.();
          signal.addEventListener('abort', abortUnsub, { once: true });
          const result = await window.fp3dDesktop.ensureDreamspace();
          signal.removeEventListener('abort', abortUnsub);
          if (result?.canceled) return { canceled: true };
          if (!result?.ok) {
            return {
              ok: false,
              error: result?.error || t('progressDialog.dreamspaceFailed'),
            };
          }
          return result;
        } finally {
          unsub?.();
        }
      }

      // Vite / browser-dev SSE installer
      return ensureViaDevServer(update, signal);
    },
  });
}

/**
 * @param {(info: object) => void} update
 * @param {AbortSignal} signal
 */
async function ensureViaDevServer(update, signal) {
  const res = await fetch('/__fp3d/dreamspace/ensure', {
    method: 'GET',
    headers: { Accept: 'text/event-stream' },
    signal,
  });
  if (!res.ok || !res.body) {
    throw new Error(t('progressDialog.dreamspaceNoInstaller'));
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
        message: data.message || t('progressDialog.dreamspaceDownloading'),
      });
    }
  }

  if (signal.aborted || finalResult?.canceled) return { canceled: true };
  if (!finalResult?.ok) {
    return {
      ok: false,
      error: finalResult?.error || t('progressDialog.dreamspaceFailed'),
    };
  }
  return finalResult;
}
