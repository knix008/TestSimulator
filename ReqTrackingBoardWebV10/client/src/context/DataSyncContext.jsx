import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import api from '../api';
import { useAuth } from './AuthContext';
import { registerDataSyncHandlers } from '../utils/dataSyncNotify';

const POLL_MS = 5000;

const DataSyncContext = createContext({ refreshToken: 0 });

export function DataSyncProvider({ children }) {
  const { user, needsSetup } = useAuth();
  const [refreshToken, setRefreshToken] = useState(0);
  const versionRef = useRef(null);

  const bump = useCallback(() => {
    setRefreshToken(v => v + 1);
  }, []);

  const setVersion = useCallback((version) => {
    versionRef.current = version;
  }, []);

  useEffect(() => {
    registerDataSyncHandlers({ bump, setVersion });
    return () => registerDataSyncHandlers({ bump: () => {}, setVersion: () => {} });
  }, [bump, setVersion]);

  useEffect(() => {
    if (!user || needsSetup) {
      versionRef.current = null;
      return undefined;
    }

    let cancelled = false;

    async function checkVersion() {
      if (document.hidden) return;
      try {
        const res = await api.get('/sync/version');
        if (cancelled) return;
        const { version } = res.data;
        if (versionRef.current !== null && versionRef.current !== version) {
          setRefreshToken(v => v + 1);
        }
        versionRef.current = version;
      } catch {
        /* ignore polling errors */
      }
    }

    checkVersion();
    const timer = setInterval(checkVersion, POLL_MS);
    const onVisible = () => {
      if (!document.hidden) checkVersion();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [user, needsSetup]);

  return (
    <DataSyncContext.Provider value={{ refreshToken }}>
      {children}
    </DataSyncContext.Provider>
  );
}

export function useDataSync() {
  return useContext(DataSyncContext);
}
