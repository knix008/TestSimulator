import { createContext, useCallback, useContext, useMemo, useState } from 'react';

const StatusBarContext = createContext(null);

export function StatusBarProvider({ children }) {
  const [pageReports, setPageReports] = useState({});

  const setPageReport = useCallback((pageId, report) => {
    setPageReports((prev) => ({ ...prev, [pageId]: report }));
  }, []);

  const clearPageReport = useCallback((pageId) => {
    setPageReports((prev) => {
      if (!prev[pageId]) return prev;
      const next = { ...prev };
      delete next[pageId];
      return next;
    });
  }, []);

  const activeReport = useMemo(() => {
    const reports = Object.values(pageReports);
    return reports.length > 0 ? reports[reports.length - 1] : null;
  }, [pageReports]);

  const value = useMemo(() => ({
    setPageReport,
    clearPageReport,
    activeReport,
  }), [setPageReport, clearPageReport, activeReport]);

  return (
    <StatusBarContext.Provider value={value}>
      {children}
    </StatusBarContext.Provider>
  );
}

export function useStatusBar() {
  const ctx = useContext(StatusBarContext);
  if (!ctx) throw new Error('useStatusBar must be used within StatusBarProvider');
  return ctx;
}
