import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileDown, FileUp, FolderOpen, Loader2, RotateCcw, X } from 'lucide-react';

import { api, downloadExcelSample } from '../api/client.js';
import { useProject } from '../context/ProjectContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { useExcelDialogs } from '../context/ExcelDialogContext.jsx';
import { IconButton } from './IconButton.jsx';
import ExcelImportResultDialog from './ExcelImportResultDialog.jsx';
import { getDisplayProjectName } from '../lib/displayLabels.js';
import { pickExcelFile } from '../lib/excelFileActions.js';
import { ROUTES } from '../lib/routes.js';

const MAPPABLE_FIELDS = [
  'skip',
  'classification',
  'title',
  'description',
  'descriptionExtra',
  'majorCategory',
  'minorCategory',
  'category',
  'priority',
  'status',
  'other',
];

function buildColumnMapping(selectedSheet, headerRow, columns) {
  return {
    sheetName: selectedSheet,
    headerRow,
    columns: columns.map((column) => ({
      index: column.index,
      field: column.included && column.field !== 'skip' ? column.field : 'skip',
      included: column.included && column.field !== 'skip',
    })),
  };
}

export default function ExcelImportDialog() {
  const { activeProject, canEditProject } = useProject();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { importOpen, closeImport, notifyDataChange } = useExcelDialogs();
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [generateTestCases, setGenerateTestCases] = useState(true);
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedPath, setSelectedPath] = useState('');
  const [resultDialog, setResultDialog] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [preview, setPreview] = useState(null);
  const [selectedSheet, setSelectedSheet] = useState('');
  const [headerRow, setHeaderRow] = useState(1);
  const [columns, setColumns] = useState([]);

  const resetImportState = useCallback(() => {
    setBusy(false);
    setGenerateTestCases(true);
    setSelectedFile(null);
    setSelectedPath('');
    setResultDialog(null);
    setPreviewLoading(false);
    setPreviewError('');
    setPreview(null);
    setSelectedSheet('');
    setHeaderRow(1);
    setColumns([]);
    if (fileRef.current) fileRef.current.value = '';
  }, []);

  useEffect(() => {
    if (!importOpen) return undefined;
    resetImportState();
    return undefined;
  }, [importOpen, resetImportState]);

  useEffect(() => {
    if (!importOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && !busy && !resultDialog) closeImport();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [importOpen, busy, resultDialog, closeImport]);

  const loadPreview = useCallback(async (file, sheetName) => {
    if (!file || !activeProject?.id) return;
    setPreviewLoading(true);
    setPreviewError('');
    setResultDialog(null);
    try {
      const data = await api.previewExcelImport(activeProject.id, file, { sheetName });
      setPreview(data);
      setSelectedSheet(data.selectedSheetName);
      setHeaderRow(data.headerRow);
      setColumns(data.columns ?? []);
    } catch (err) {
      setPreview(null);
      setColumns([]);
      setPreviewError(err.message || t('import.previewFailed'));
    } finally {
      setPreviewLoading(false);
    }
  }, [activeProject?.id, t]);

  const showImportResult = (data) => {
    const hasChanges = (data.created ?? 0) > 0 || (data.updated ?? 0) > 0 || (data.testCasesCreated ?? 0) > 0;
    const hasRowErrors = data.errors?.length > 0;
    if (hasRowErrors && !hasChanges) {
      setResultDialog({ mode: 'error', result: data });
      return;
    }
    setResultDialog({ mode: 'success', result: data });
  };

  const handleResultClose = () => {
    const wasSuccess = resultDialog?.mode === 'success';
    setResultDialog(null);
    if (wasSuccess) closeImport();
  };

  const handleResultConfirm = () => {
    const wasSuccess = resultDialog?.mode === 'success';
    setResultDialog(null);
    if (wasSuccess) {
      closeImport();
      navigate(ROUTES.requirements);
    }
  };

  if (!importOpen) return null;

  const setFileSelection = (file, filePath = '') => {
    setSelectedFile(file);
    setSelectedPath(filePath || file?.name || '');
    if (fileRef.current) {
      const dt = new DataTransfer();
      dt.items.add(file);
      fileRef.current.files = dt.files;
    }
    if (file) {
      void loadPreview(file);
    } else {
      setPreview(null);
      setColumns([]);
    }
  };

  const handleBrowseDesktop = async () => {
    try {
      const picked = await pickExcelFile();
      if (!picked) return;
      setFileSelection(picked.file, picked.filePath);
    } catch (err) {
      setResultDialog({ mode: 'error', message: err.message });
    }
  };

  const handleFileInputChange = (e) => {
    const file = e.target.files?.[0];
    if (file) setFileSelection(file, file.name);
  };

  const handleSheetChange = (e) => {
    const sheetName = e.target.value;
    if (!selectedFile || sheetName === selectedSheet) return;
    void loadPreview(selectedFile, sheetName);
  };

  const handleColumnIncludedChange = (index, included) => {
    setColumns((prev) => prev.map((column) => {
      if (column.index !== index) return column;
      if (!included) {
        return { ...column, included: false, field: 'skip' };
      }
      const restoredField = column.suggestedField && column.suggestedField !== 'skip'
        ? column.suggestedField
        : 'description';
      return { ...column, included: true, field: restoredField };
    }));
  };

  const handleColumnFieldChange = (index, field) => {
    setColumns((prev) => prev.map((column) => {
      if (column.index !== index) return column;
      if (field === 'skip') {
        return { ...column, field, included: false };
      }
      return { ...column, field, included: true };
    }));
  };

  const handleResetColumns = () => {
    if (selectedFile) {
      void loadPreview(selectedFile, selectedSheet || undefined);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const file = selectedFile || fileRef.current?.files?.[0];
    if (!file) {
      setResultDialog({ mode: 'error', message: t('import.selectFile') });
      return;
    }

    setBusy(true);
    setResultDialog(null);
    try {
      const columnMapping = columns.length > 0
        ? buildColumnMapping(selectedSheet, headerRow, columns)
        : null;
      const data = await api.importExcel(activeProject.id, file, {
        generateTestCases,
        columnMapping,
      });
      showImportResult(data);
      const hasChanges = (data.created ?? 0) > 0 || (data.updated ?? 0) > 0 || (data.testCasesCreated ?? 0) > 0;
      const failedImport = data.errors?.length > 0 && !hasChanges;
      if (!failedImport) {
        navigate(ROUTES.requirements);
      }
      if (hasChanges) {
        notifyDataChange();
      }
    } catch (err) {
      setResultDialog({ mode: 'error', message: err.message });
    } finally {
      setBusy(false);
    }
  };

  const handleOverlayClick = () => {
    if (!busy && !resultDialog) closeImport();
  };

  const selectedSheetMeta = preview?.sheets?.find((sheet) => sheet.name === selectedSheet);

  return (
    <>
    <div className="modal-overlay" onClick={handleOverlayClick} role="presentation">
      <div
        className="modal-dialog excel-dialog"
        role="dialog"
        aria-labelledby="excel-import-title"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="excel-dialog__header">
          <h2 id="excel-import-title">{t('import.title')}</h2>
          <button
            type="button"
            className="modal-close"
            onClick={closeImport}
            disabled={busy}
            aria-label={t('common.close')}
          >
            <X size={18} strokeWidth={2} />
          </button>
        </header>

        <div className="excel-dialog__body">
          {!canEditProject && (
            <p className="error">{t('import.noEdit')}</p>
          )}
          {!activeProject && (
            <p className="muted">{t('common.selectProject')}</p>
          )}
          {canEditProject && activeProject && (
            <>
              <p className="muted excel-dialog__project">{t('import.project', { name: getDisplayProjectName(activeProject, t) })}</p>

              <div className="excel-dialog__instructions">
                <p>{t('import.instructions1')}</p>
                <p className="muted">{t('import.instructions2')}</p>
                <p className="muted">{t('import.instructions3')}</p>
              </div>

              <div className="excel-dialog__toolbar">
                <IconButton
                  icon={FileDown}
                  className="btn-secondary"
                  type="button"
                  onClick={() => downloadExcelSample(activeProject.id)}
                  tooltip={t('import.tipSample')}
                >
                  {t('import.sample')}
                </IconButton>
              </div>

              <form id="excel-import-form" onSubmit={handleSubmit}>
                <div className="form-row excel-dialog__file-field">
                  <label htmlFor="excel-file">{t('import.fileLabel')}</label>
                  <div className="excel-dialog__file-controls">
                    <IconButton
                      icon={FolderOpen}
                      className="btn-secondary"
                      type="button"
                      onClick={() => { void handleBrowseDesktop(); }}
                      tooltip={t('import.tipBrowseDesktop')}
                    >
                      {t('import.browseDesktop')}
                    </IconButton>
                    <input
                      id="excel-file"
                      ref={fileRef}
                      type="file"
                      accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                      onChange={handleFileInputChange}
                    />
                  </div>
                  {selectedPath && (
                    <p className="muted excel-dialog__selected-file">{t('import.selectedFile', { name: selectedPath })}</p>
                  )}
                </div>

                {previewError && (
                  <p className="muted excel-dialog__preview-status">{t('import.previewUnavailable', { message: previewError })}</p>
                )}

                {(previewLoading || preview) && (
                  <div className="excel-dialog__mapping">
                    <div className="excel-dialog__mapping-head">
                      <h3>{t('import.columnMappingTitle')}</h3>
                      <IconButton
                        icon={RotateCcw}
                        className="btn-secondary"
                        type="button"
                        onClick={handleResetColumns}
                        disabled={previewLoading || busy || !selectedFile}
                        tooltip={t('import.resetColumns')}
                      >
                        {t('import.resetColumns')}
                      </IconButton>
                    </div>

                    {previewLoading && (
                      <p className="muted excel-dialog__preview-status">{t('import.previewLoading')}</p>
                    )}

                    {!previewLoading && preview && (
                      <>
                        <div className="excel-dialog__sheet-row">
                          <label htmlFor="excel-import-sheet">{t('import.sheetLabel')}</label>
                          <select
                            id="excel-import-sheet"
                            value={selectedSheet}
                            onChange={handleSheetChange}
                            disabled={busy}
                          >
                            {(preview.sheets ?? []).map((sheet) => (
                              <option key={sheet.name} value={sheet.name}>
                                {sheet.name}
                                {sheet.excluded ? ' *' : ''}
                              </option>
                            ))}
                          </select>
                          {selectedSheetMeta?.dataRowCount != null && (
                            <span className="muted">
                              {t('import.dataRows', { count: selectedSheetMeta.dataRowCount })}
                            </span>
                          )}
                        </div>

                        {columns.length === 0 ? (
                          <p className="muted">{t('import.noColumns')}</p>
                        ) : (
                          <div className="excel-dialog__column-table-wrap">
                            <table className="excel-dialog__column-table">
                              <thead>
                                <tr>
                                  <th>{t('import.columnInclude')}</th>
                                  <th>{t('import.columnHeader')}</th>
                                  <th>{t('import.columnMapTo')}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {columns.map((column) => (
                                  <tr key={column.index}>
                                    <td>
                                      <input
                                        type="checkbox"
                                        checked={column.included && column.field !== 'skip'}
                                        onChange={(e) => handleColumnIncludedChange(column.index, e.target.checked)}
                                        disabled={busy}
                                        aria-label={`${t('import.columnInclude')} ${column.header}`}
                                      />
                                    </td>
                                    <td>
                                      <span className="excel-dialog__column-name">{column.header || `(${column.letter})`}</span>
                                      <span className="excel-dialog__column-meta">{column.letter}</span>
                                    </td>
                                    <td>
                                      <select
                                        value={column.included && column.field !== 'skip' ? column.field : 'skip'}
                                        onChange={(e) => handleColumnFieldChange(column.index, e.target.value)}
                                        disabled={busy}
                                      >
                                        {MAPPABLE_FIELDS.map((field) => (
                                          <option key={field} value={field}>
                                            {t(`import.fields.${field}`)}
                                          </option>
                                        ))}
                                      </select>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                <div className="excel-dialog__options">
                  <p className="muted">{t('import.codeRenumberNote')}</p>
                  <label className="excel-dialog__checkbox">
                    <input
                      type="checkbox"
                      checked={generateTestCases}
                      onChange={(e) => setGenerateTestCases(e.target.checked)}
                    />
                    <span>{t('import.autoTc')}</span>
                  </label>
                </div>
              </form>
            </>
          )}
        </div>

        <footer className="excel-dialog__footer">
          {canEditProject && activeProject && (
            <>
              <IconButton
                icon={busy ? Loader2 : FileUp}
                className="btn-primary"
                type="submit"
                form="excel-import-form"
                disabled={busy || previewLoading}
                iconClassName={busy ? 'icon-spin' : ''}
                tooltip={t('import.tipImport')}
              >
                {busy ? t('import.importing') : t('import.import')}
              </IconButton>
            </>
          )}
          <button type="button" className="btn btn-secondary" onClick={closeImport} disabled={busy}>
            {t('common.close')}
          </button>
        </footer>
      </div>
    </div>

    <ExcelImportResultDialog
      open={Boolean(resultDialog)}
      mode={resultDialog?.mode}
      message={resultDialog?.message}
      result={resultDialog?.result}
      onClose={handleResultClose}
      onConfirm={handleResultConfirm}
    />
    </>
  );
}
