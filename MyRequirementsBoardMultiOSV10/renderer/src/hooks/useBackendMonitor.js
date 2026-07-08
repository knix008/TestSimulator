import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client.js';

const POLL_INTERVAL_MS = 30_000;

export function useBackendMonitor({ enabled = true } = {}) {
  const [serverOk, setServerOk] = useState(null);
  const [ollamaOk, setOllamaOk] = useState(null);
  const [ollamaModel, setOllamaModel] = useState('');

  const refresh = useCallback(async () => {
    if (!enabled) return;

    try {
      await api.health();
      setServerOk(true);
    } catch {
      setServerOk(false);
    }

    try {
      const status = await api.ollamaStatus();
      setOllamaOk(Boolean(status?.available));
      setOllamaModel(status?.model || '');
    } catch {
      setOllamaOk(false);
      setOllamaModel('');
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setServerOk(null);
      setOllamaOk(null);
      setOllamaModel('');
      return undefined;
    }

    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [enabled, refresh]);

  return { serverOk, ollamaOk, ollamaModel, refresh };
}
