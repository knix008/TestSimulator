import { useEffect } from 'react';
import { useDataSync } from '../context/DataSyncContext';

export function useAutoRefresh(load, enabled = true) {
  const { refreshToken } = useDataSync();

  useEffect(() => {
    if (!enabled) return undefined;
    load();
    return undefined;
  }, [load, refreshToken, enabled]);
}
