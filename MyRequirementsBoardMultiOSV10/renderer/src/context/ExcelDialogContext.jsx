import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

const ExcelDialogContext = createContext(null);

export function ExcelDialogProvider({ children }) {
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportSelectedIds, setExportSelectedIds] = useState(null);
  const listenersRef = useRef(new Set());

  const subscribeDataChange = useCallback((listener) => {
    listenersRef.current.add(listener);
    return () => listenersRef.current.delete(listener);
  }, []);

  const notifyDataChange = useCallback(() => {
    listenersRef.current.forEach((listener) => listener());
  }, []);

  const openImport = useCallback(() => {
    setExportOpen(false);
    setImportOpen(true);
  }, []);

  const openExport = useCallback((selectedIds = null) => {
    setImportOpen(false);
    setExportSelectedIds(selectedIds?.length ? [...selectedIds] : null);
    setExportOpen(true);
  }, []);

  const closeImport = useCallback(() => setImportOpen(false), []);
  const closeExport = useCallback(() => {
    setExportOpen(false);
    setExportSelectedIds(null);
  }, []);

  const value = useMemo(() => ({
    importOpen,
    exportOpen,
    exportSelectedIds,
    openImport,
    openExport,
    closeImport,
    closeExport,
    notifyDataChange,
    subscribeDataChange,
  }), [
    importOpen,
    exportOpen,
    exportSelectedIds,
    openImport,
    openExport,
    closeImport,
    closeExport,
    notifyDataChange,
    subscribeDataChange,
  ]);

  return (
    <ExcelDialogContext.Provider value={value}>
      {children}
    </ExcelDialogContext.Provider>
  );
}

export function useExcelDialogs() {
  const ctx = useContext(ExcelDialogContext);
  if (!ctx) throw new Error('useExcelDialogs must be used within ExcelDialogProvider');
  return ctx;
}
