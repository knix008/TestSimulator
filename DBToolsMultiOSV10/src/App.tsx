// Port of MainForm.cs — menus, toolbar, tool panel, canvas, side panels, status bar.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  DbColumn,
  DbRelationship,
  DbSchema,
  DbTable,
  DbTargetType,
  RelationshipLineStyle,
  ToolMode,
} from './types';
import { DB_TARGET_TYPES, getDbDisplayName } from './types';
import type { NormalizationIssue, NormalizationLevel } from './core/analysis/normalization';
import type { IndexSuggestion } from './core/analysis/indexAdvisor';
import { autoArrange, fitTableWidths, fitTableWidthForTarget } from './core/layout';
import { getAllTablesBounds, getTableBounds } from './core/geometry';
import { getRelationshipConnection, resetRoutePoints, tryInsertOrthogonalBend } from './core/relationshipPath';
import {
  findTable,
  newColumn,
  newRelationship,
  newSchema,
  newTable,
  removeColumn,
  removeTable,
} from './core/schema';
import { clearRecentFiles } from './core/settings';
import { useT, type Language } from './i18n';
import { getHost } from './platform';
import {
  applyPaletteToDocument,
  getHeaderColor,
  getPalette,
  getThemeName,
  THEMES,
  type ThemeId,
} from './render/theme';
import { useAppState } from './hooks/useAppState';
import { useFileActions } from './hooks/useFileActions';
import { useToolbarMinWidth } from './hooks/useToolbarMinWidth';
import { AnalysisPanel, IndexAdvisorPanel } from './components/AnalysisPanel';
import { CanvasContextMenuRequest, DiagramCanvas, computeFitViewport } from './components/DiagramCanvas';
import { ColumnEditDialog } from './components/ColumnEditDialog';
import { ContextMenu, Dropdown, MenuList, SplitButton, type MenuItem } from './components/Menu';
import { Icons } from './components/Icons';
import { PreferencesDialog } from './components/PreferencesDialog';
import { PropertyGrid, type SortMode } from './components/PropertyGrid';
import { RelationshipEditDialog } from './components/RelationshipEditDialog';
import { AboutDialog, ConfirmDialog, ErrorDialog, NoticeDialog } from './components/SimpleDialogs';
import { StructureTree } from './components/StructureTree';
import { TableEditDialog } from './components/TableEditDialog';
import { RULER_SIZE } from './components/CanvasRuler';

type RightTab = 'structure' | 'analysis' | 'index';

type ModalState =
  | { kind: 'none' }
  | { kind: 'table'; table: DbTable }
  | { kind: 'column'; tableId: string; column: DbColumn; isNew: boolean }
  | { kind: 'relationship'; relationship: DbRelationship; isNew: boolean }
  | { kind: 'preferences' }
  | { kind: 'about' }
  | { kind: 'notice'; message: string }
  | { kind: 'error'; message: string; details?: string | null }
  | {
      kind: 'confirm';
      message: string;
      title?: string;
      onConfirm: () => void;
      onDiscard?: () => void;
      confirmLabel?: string;
      discardLabel?: string;
    };

export default function App() {
  const t = useT();
  const host = getHost();
  const state = useAppState('새 스키마');
  const {
    schema, mutate, loadSchema, markSaved, isDirty, currentPath,
    selection, selectTable, selectRelationship, clearSelection,
    selectedTable, selectedColumn, selectedRelationship,
    tool, setTool, viewport, setViewport, zoomIn, zoomOut, resetZoom,
    prefs, setPrefs, prefsLoaded, recentFiles, setRecentFiles,
    status, setStatus, undo, redo, canUndo, canRedo,
    issues, indexSuggestions, highlightedColumnIds, setHighlightedColumnIds,
  } = state;

  const [rightTab, setRightTab] = useState<RightTab>('structure');
  const [rightPanelVisible, setRightPanelVisible] = useState(true);
  const [sortMode, setSortMode] = useState<SortMode>('category');
  const [modal, setModal] = useState<ModalState>({ kind: 'none' });
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const canvasAreaRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

  const schemaRef = useRef(schema);
  schemaRef.current = schema;
  const pathRef = useRef(currentPath);
  pathRef.current = currentPath;
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const dirtyRef = useRef(isDirty);
  dirtyRef.current = isDirty;

  // The toolbar must stay one row, so the window cannot be narrower than it.
  useToolbarMinWidth(toolbarRef, [prefs.Language, prefs.Theme, schema.TargetDb, prefs.DefaultLineStyle]);

  const closeModal = useCallback(() => setModal({ kind: 'none' }), []);
  const showError = useCallback(
    (message: string, details?: string | null) => setModal({ kind: 'error', message, details }),
    [],
  );

  // ── File actions ───────────────────────────────────────────────────────────

  const files = useFileActions(
    () => schemaRef.current,
    () => pathRef.current,
    () => prefsRef.current.RecentFilesMaxCount,
    () => prefsRef.current.Theme,
    {
      onLoaded: (next, path, message) => {
        loadSchema(next, path);
        setStatus(message);
      },
      onSaved: (path, message) => {
        markSaved(path);
        setStatus(message);
      },
      onStatus: setStatus,
      onError: showError,
      onRecentFilesChanged: setRecentFiles,
    },
  );

  /** Run `action` after resolving unsaved changes. */
  const withUnsavedCheck = useCallback(
    (action: () => void) => {
      if (!dirtyRef.current) return action();
      setModal({
        kind: 'confirm',
        title: t('ConfirmDiscardTitle'),
        message: t('MsgUnsavedChanges'),
        confirmLabel: t('ConfirmSave'),
        discardLabel: t('ConfirmDiscard'),
        onConfirm: () => {
          closeModal();
          void files.save().then((saved) => saved && action());
        },
        onDiscard: () => {
          closeModal();
          action();
        },
      });
    },
    [t, closeModal, files],
  );

  const newProject = useCallback(() => {
    withUnsavedCheck(() => {
      const next = newSchema(t('NewProjectName'));
      next.TargetDb = prefsRef.current.DefaultDbType;
      loadSchema(next, null);
      setStatus(t('StatusNewProjectCreated'));
    });
  }, [withUnsavedCheck, loadSchema, setStatus, t]);

  // ── Window title and dirty state ───────────────────────────────────────────

  useEffect(() => {
    const name = currentPath ?? schema.Name ?? 'DBTools';
    const title = `${isDirty ? '● ' : ''}${name} — DBTools`;
    host.setTitle(title);
    document.title = title;
    if ('setDirty' in host) (host as { setDirty(dirty: boolean): void }).setDirty(isDirty);
  }, [host, currentPath, schema.Name, isDirty]);

  // Close confirmation (Electron) / beforeunload (web)
  useEffect(() => {
    host.onBeforeClose(async () => {
      if (!dirtyRef.current) return true;
      return new Promise<boolean>((resolve) => {
        setModal({
          kind: 'confirm',
          title: t('ConfirmDiscardTitle'),
          message: t('MsgUnsavedChanges'),
          confirmLabel: t('ConfirmSave'),
          discardLabel: t('ConfirmDiscard'),
          onConfirm: () => {
            closeModal();
            void files.save().then(resolve);
          },
          onDiscard: () => {
            closeModal();
            resolve(true);
          },
        });
      });
    });
    // Registered once; the handler reads refs so it never goes stale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Startup file / file-association open
  useEffect(() => {
    if (!prefsLoaded) return;
    void (async () => {
      const startup = await host.getStartupFile();
      if (startup) await files.openPath(startup);
    })();
    const hostWithOpen = host as { onOpenFile?: (h: (p: string) => void) => void };
    hostWithOpen.onOpenFile?.((path) => withUnsavedCheck(() => void files.openPath(path)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefsLoaded]);

  useEffect(() => {
    applyPaletteToDocument(prefs.Theme);
  }, [prefs.Theme]);

  // ── Schema edits ───────────────────────────────────────────────────────────

  const addTable = useCallback(
    (x?: number, y?: number) => {
      let createdId = '';
      mutate((draft) => {
        const bounds = getAllTablesBounds(draft);
        const table = newTable({
          Name: `${t('NewTableName')}_${draft.Tables.length + 1}`,
          X: x ?? (bounds ? bounds.x + bounds.w + 60 : 60),
          Y: y ?? (bounds ? bounds.y : 60),
          Columns: [
            newColumn({
              Name: 'id',
              DataType: draft.TargetDb === 'PostgreSQL' ? 'SERIAL' : 'INTEGER',
              IsPrimaryKey: true,
              IsAutoIncrement: true,
              IsNullable: false,
            }),
          ],
        });
        fitTableWidthForTarget(table, draft.TargetDb);
        draft.Tables.push(table);
        createdId = table.Id;
      });
      if (createdId) selectTable(createdId, null);
    },
    [mutate, selectTable, t],
  );

  const addColumn = useCallback(() => {
    if (!selectedTable) return setModal({ kind: 'notice', message: t('MsgSelectTable') });
    const table = selectedTable;
    setModal({
      kind: 'column',
      tableId: table.Id,
      column: newColumn({ Name: `${t('NewColumnName')}${table.Columns.length + 1}` }),
      isNew: true,
    });
  }, [selectedTable, t]);

  const addRelationship = useCallback(() => {
    if (schema.Tables.length < 2) return setModal({ kind: 'notice', message: t('MsgNeedTwoTables') });
    const [source, target] = schema.Tables;
    const sourcePk = source.Columns.find((c) => c.IsPrimaryKey) ?? source.Columns[0];
    const targetColumn = target.Columns[0];
    if (!sourcePk || !targetColumn) return setModal({ kind: 'notice', message: t('RelNeedPk') });
    setModal({
      kind: 'relationship',
      isNew: true,
      relationship: newRelationship({
        LineStyle: prefs.DefaultLineStyle,
        SourceTableId: source.Id,
        SourceColumnId: sourcePk.Id,
        TargetTableId: target.Id,
        TargetColumnId: targetColumn.Id,
      }),
    });
  }, [schema.Tables, prefs.DefaultLineStyle, t]);

  /** Create a relationship from a canvas drag between two tables. */
  const createRelationFromDrag = useCallback(
    (sourceTableId: string, targetTableId: string) => {
      const source = findTable(schema, sourceTableId);
      const target = findTable(schema, targetTableId);
      if (!source || !target) return;
      const sourcePk = source.Columns.find((c) => c.IsPrimaryKey);
      if (!sourcePk) return setModal({ kind: 'notice', message: t('RelNeedPk') });

      // Prefer an existing "<table>_id"-shaped column on the target.
      const guess =
        target.Columns.find((c) => c.Name.toLowerCase() === `${source.Name.toLowerCase()}_id`) ??
        target.Columns.find((c) => c.Name.toLowerCase().endsWith('_id') && !c.IsPrimaryKey) ??
        target.Columns[0];
      if (!guess) return setModal({ kind: 'notice', message: t('RelNeedPk') });

      const type =
        tool === 'RelationOneToOne'
          ? 'OneToOne'
          : tool === 'RelationManyToMany'
            ? 'ManyToMany'
            : 'OneToMany';

      let createdId = '';
      mutate((draft) => {
        const rel = newRelationship({
          Name: `fk_${target.Name}_${guess.Name}`,
          Type: type,
          LineStyle: prefsRef.current.DefaultLineStyle,
          SourceTableId: source.Id,
          SourceColumnId: sourcePk.Id,
          TargetTableId: target.Id,
          TargetColumnId: guess.Id,
        });
        draft.Relationships.push(rel);
        const targetColumn = draft.Tables
          .find((tb) => tb.Id === target.Id)
          ?.Columns.find((c) => c.Id === guess.Id);
        if (targetColumn) targetColumn.IsForeignKey = true;
        createdId = rel.Id;
      });
      if (createdId) selectRelationship(createdId);
    },
    [schema, tool, mutate, selectRelationship, t],
  );

  const editSelected = useCallback(() => {
    if (selectedColumn && selectedTable) {
      setModal({ kind: 'column', tableId: selectedTable.Id, column: selectedColumn, isNew: false });
    } else if (selectedTable) {
      setModal({ kind: 'table', table: selectedTable });
    } else if (selectedRelationship) {
      setModal({ kind: 'relationship', relationship: selectedRelationship, isNew: false });
    }
  }, [selectedColumn, selectedTable, selectedRelationship]);

  const deleteSelected = useCallback(() => {
    if (selectedColumn && selectedTable) {
      const tableId = selectedTable.Id;
      const columnId = selectedColumn.Id;
      setModal({
        kind: 'confirm',
        title: t('MsgDeleteColumnTitle'),
        message: t('MsgDeleteColumn', selectedColumn.Name),
        onConfirm: () => {
          mutate((draft) => removeColumn(draft, tableId, columnId));
          selectTable(tableId, null);
          closeModal();
        },
      });
      return;
    }
    if (selectedTable) {
      const tableId = selectedTable.Id;
      setModal({
        kind: 'confirm',
        title: t('MsgDeleteTableTitle'),
        message: t('MsgDeleteTable', selectedTable.Name),
        onConfirm: () => {
          mutate((draft) => removeTable(draft, tableId));
          clearSelection();
          closeModal();
        },
      });
      return;
    }
    if (selectedRelationship) {
      const relId = selectedRelationship.Id;
      mutate((draft) => {
        draft.Relationships = draft.Relationships.filter((r) => r.Id !== relId);
      });
      clearSelection();
    }
  }, [selectedColumn, selectedTable, selectedRelationship, mutate, selectTable, clearSelection, closeModal, t]);

  const setTargetDb = useCallback(
    (db: DbTargetType) => {
      mutate((draft) => {
        draft.TargetDb = db;
        fitTableWidths(draft);
      });
      setStatus(t('StatusDbType', getDbDisplayName(db)));
    },
    [mutate, setStatus, t],
  );

  const setLineStyle = useCallback(
    (style: RelationshipLineStyle) => {
      if (selectedRelationship) {
        const relId = selectedRelationship.Id;
        mutate((draft) => {
          const rel = draft.Relationships.find((r) => r.Id === relId);
          if (!rel) return;
          rel.LineStyle = style;
          rel.RoutePoints = [];
        });
      }
      setPrefs({ ...prefsRef.current, DefaultLineStyle: style });
    },
    [selectedRelationship, mutate, setPrefs],
  );

  const fitAll = useCallback(() => {
    const area = canvasAreaRef.current;
    if (!area) return;
    const next = computeFitViewport(
      schemaRef.current,
      area.clientWidth - RULER_SIZE,
      area.clientHeight - RULER_SIZE,
    );
    if (next) setViewport(next);
  }, [setViewport]);

  const doAutoArrange = useCallback(() => {
    mutate((draft) => autoArrange(draft));
    setTimeout(fitAll, 0);
  }, [mutate, fitAll]);

  // ── Keyboard shortcuts (port of MainForm.ProcessCmdKey) ────────────────────

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const editing =
        !!target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);
      const ctrl = e.ctrlKey || e.metaKey;

      if (e.key === 'Escape' && !editing) {
        setTool('Select');
        clearSelection();
        return;
      }
      if (editing) return;

      if (ctrl && !e.shiftKey && e.key.toLowerCase() === 'n') return void (e.preventDefault(), newProject());
      if (ctrl && !e.shiftKey && e.key.toLowerCase() === 'o') return void (e.preventDefault(), files.openProject());
      if (ctrl && e.shiftKey && e.key.toLowerCase() === 'o') return void (e.preventDefault(), files.openDatabase());
      if (ctrl && !e.shiftKey && e.key.toLowerCase() === 's') return void (e.preventDefault(), files.save());
      if (ctrl && e.shiftKey && e.key.toLowerCase() === 's') return void (e.preventDefault(), files.saveAs());
      if (ctrl && !e.shiftKey && e.key.toLowerCase() === 'z') return void (e.preventDefault(), undo());
      if (ctrl && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
        return void (e.preventDefault(), redo());
      }
      if (ctrl && e.key.toLowerCase() === 't') return void (e.preventDefault(), addTable());
      if (ctrl && e.key.toLowerCase() === 'l') return void (e.preventDefault(), addColumn());
      if (ctrl && e.key.toLowerCase() === 'r' && !e.shiftKey) {
        return void (e.preventDefault(), addRelationship());
      }
      if (ctrl && e.shiftKey && e.key.toLowerCase() === 'r') {
        return void (e.preventDefault(), files.exportMarkdown());
      }
      if (ctrl && (e.key === '+' || e.key === '=')) return void (e.preventDefault(), zoomIn());
      if (ctrl && e.key === '-') return void (e.preventDefault(), zoomOut());
      if (ctrl && e.key === '0') return void (e.preventDefault(), fitAll());
      if (e.key === 'F2') return void (e.preventDefault(), editSelected());
      if (e.key === 'F5') {
        e.preventDefault();
        setRightTab('analysis');
        setStatus(t('AnalysisDoneCount', issues.length));
        return;
      }
      if (e.key === 'Delete') return void (e.preventDefault(), deleteSelected());
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [newProject, files, undo, redo, addTable, addColumn, addRelationship, zoomIn, zoomOut,
      fitAll, editSelected, deleteSelected, setTool, clearSelection, setStatus, issues.length, t]);

  // ── Theme / language / grid ────────────────────────────────────────────────

  const setTheme = useCallback(
    (id: ThemeId) => {
      setPrefs({ ...prefsRef.current, Theme: id });
      setStatus(t('StatusTheme', getThemeName(id, prefsRef.current.Language)));
    },
    [setPrefs, setStatus, t],
  );

  /** Step to the next theme in the catalogue, wrapping light → dark → light. */
  const cycleTheme = useCallback(() => {
    const current = THEMES.findIndex((x) => x.id === prefsRef.current.Theme);
    const next = THEMES[(current + 1) % THEMES.length];
    setPrefs({ ...prefsRef.current, Theme: next.id });
    setStatus(t('StatusTheme', getThemeName(next.id, prefsRef.current.Language)));
  }, [setPrefs, setStatus, t]);

  const toggleLanguage = useCallback(() => {
    const next: Language = prefsRef.current.Language === 'ko' ? 'en' : 'ko';
    setPrefs({ ...prefsRef.current, Language: next });
    setStatus(t('StatusLanguage', next === 'ko' ? '한국어' : 'English'));
  }, [setPrefs, setStatus, t]);

  const toggleGrid = useCallback(() => {
    const next = !prefsRef.current.ShowGrid;
    setPrefs({ ...prefsRef.current, ShowGrid: next });
    setStatus(t(next ? 'StatusGridOn' : 'StatusGridOff'));
  }, [setPrefs, setStatus, t]);

  /** Theme submenu: light themes, a separator, then dark themes. */
  const themeItems = useMemo<MenuItem[]>(() => {
    const toItem = (theme: (typeof THEMES)[number]): MenuItem => ({
      id: `theme-${theme.id}`,
      label: getThemeName(theme.id, prefs.Language),
      swatch: theme.palette.accent,
      checked: prefs.Theme === theme.id,
      onSelect: () => setTheme(theme.id),
    });
    return [
      { id: 'theme-light-head', header: true, label: t('SettingsThemeLight') },
      ...THEMES.filter((x) => x.kind === 'light').map(toItem),
      { id: 'theme-sep', separator: true },
      { id: 'theme-dark-head', header: true, label: t('SettingsThemeDark') },
      ...THEMES.filter((x) => x.kind === 'dark').map(toItem),
    ];
  }, [prefs.Theme, prefs.Language, setTheme, t]);

  const languageItems = useMemo<MenuItem[]>(
    () =>
      (
        [
          ['ko', '한국어'],
          ['en', 'English'],
        ] as const
      ).map(([code, label]) => ({
        id: `lang-${code}`,
        label,
        icon: <Icons.Language />,
        checked: prefs.Language === code,
        onSelect: () => {
          if (prefsRef.current.Language === code) return;
          setPrefs({ ...prefsRef.current, Language: code });
          setStatus(t('StatusLanguage', label));
        },
      })),
    [prefs.Language, setPrefs, setStatus, t],
  );

  // ── Menus ──────────────────────────────────────────────────────────────────

  const recentItems = useMemo<MenuItem[]>(() => {
    if (host.kind !== 'electron' || recentFiles.length === 0) {
      return [{ id: 'recent-empty', label: t('MenuRecentEmpty'), disabled: true }];
    }
    return [
      ...recentFiles.map((path, i) => ({
        id: `recent-${i}`,
        label: path,
        icon: <Icons.Doc />,
        onSelect: () => withUnsavedCheck(() => void files.openPath(path)),
      })),
      { id: 'recent-sep', separator: true } as MenuItem,
      {
        id: 'recent-clear',
        label: t('MenuRecentClear'),
        icon: <Icons.Delete />,
        onSelect: () => void clearRecentFiles().then(setRecentFiles),
      },
    ];
  }, [host.kind, recentFiles, t, withUnsavedCheck, files, setRecentFiles]);

  const exportItems = useMemo<MenuItem[]>(
    () => [
      { id: 'x-doc', header: true, label: t('ExportGroupDocument'), icon: <Icons.Doc /> },
      { id: 'x-md', label: t('MenuExportMarkdown'), icon: <Icons.Doc />, onSelect: files.exportMarkdown },
      { id: 'x-xlsx', label: t('MenuExportExcel'), icon: <Icons.Doc />, onSelect: files.exportExcelFile },
      { id: 'x-docx', label: t('MenuExportWord'), icon: <Icons.Doc />, onSelect: files.exportWordFile },
      { id: 'x-pdf', label: t('MenuExportPdf'), icon: <Icons.Report />, onSelect: files.exportPdf },
      { id: 'x-sep1', separator: true },
      { id: 'x-img', header: true, label: t('ExportGroupImage'), icon: <Icons.Image /> },
      { id: 'x-png', label: t('MenuExportPng'), icon: <Icons.Image />, onSelect: () => files.exportImage('png') },
      { id: 'x-jpg', label: t('MenuExportJpeg'), icon: <Icons.Image />, onSelect: () => files.exportImage('jpeg') },
      { id: 'x-webp', label: t('MenuExportWebp'), icon: <Icons.Image />, onSelect: () => files.exportImage('webp') },
      { id: 'x-gif', label: t('MenuExportGif'), icon: <Icons.Image />, onSelect: () => files.exportImage('gif') },
      { id: 'x-sep2', separator: true },
      { id: 'x-data', header: true, label: t('ExportGroupData'), icon: <Icons.Code /> },
      { id: 'x-json', label: t('MenuExportJson'), icon: <Icons.Code />, onSelect: files.exportJson },
      { id: 'x-sep3', separator: true },
      { id: 'x-sql', header: true, label: t('ExportGroupSql'), icon: <Icons.Database /> },
      { id: 'x-sql-current', label: t('MenuExportSql'), icon: <Icons.Code />, onSelect: files.exportSqlCurrent },
      { id: 'x-sqlite-db', label: t('MenuExportSqliteDb'), icon: <Icons.Database />, onSelect: files.exportSqliteDb },
      { id: 'x-pg', label: t('MenuExportPostgres'), icon: <Icons.Database />, onSelect: () => files.exportSqlFor('PostgreSQL') },
      { id: 'x-my', label: t('MenuExportMySql'), icon: <Icons.Database />, onSelect: () => files.exportSqlFor('MySQL') },
      { id: 'x-maria', label: t('MenuExportMariaDb'), icon: <Icons.Database />, onSelect: () => files.exportSqlFor('MariaDB') },
      { id: 'x-mssql', label: t('MenuExportSqlServer'), icon: <Icons.Database />, onSelect: () => files.exportSqlFor('SqlServer') },
    ],
    [t, files],
  );

  const fileMenu = useMemo<MenuItem[]>(
    () => [
      { id: 'new', label: t('MenuNew'), icon: <Icons.New />, shortcut: 'Ctrl+N', onSelect: newProject },
      { id: 'open', label: t('MenuOpen'), icon: <Icons.Open />, shortcut: 'Ctrl+O', onSelect: () => withUnsavedCheck(() => void files.openProject()) },
      { id: 'opendb', label: t('MenuOpenDatabase'), icon: <Icons.Database />, shortcut: 'Ctrl+Shift+O', onSelect: () => withUnsavedCheck(() => void files.openDatabase()) },
      { id: 'sep1', separator: true },
      { id: 'save', label: t('MenuSave'), icon: <Icons.Save />, shortcut: 'Ctrl+S', onSelect: () => void files.save() },
      { id: 'saveas', label: t('MenuSaveAs'), icon: <Icons.SaveAs />, shortcut: 'Ctrl+Shift+S', onSelect: () => void files.saveAs() },
      { id: 'sep2', separator: true },
      { id: 'recent', label: t('MenuRecentFiles'), icon: <Icons.Recent />, submenu: recentItems },
      { id: 'export', label: t('MenuExport'), icon: <Icons.Export />, submenu: exportItems },
      { id: 'sep3', separator: true },
      { id: 'sample', label: t('MenuSampleCreate'), icon: <Icons.Sample />, onSelect: () => withUnsavedCheck(files.loadSample) },
      { id: 'sample-all', label: t('MenuSampleCreateAll'), icon: <Icons.Sample />, onSelect: () => void files.generateSamples() },
      { id: 'sep4', separator: true },
      { id: 'settings', label: t('MenuSettings'), icon: <Icons.Settings />, onSelect: () => setModal({ kind: 'preferences' }) },
    ],
    [t, newProject, withUnsavedCheck, files, recentItems, exportItems],
  );

  const editMenu = useMemo<MenuItem[]>(
    () => [
      { id: 'undo', label: t('MenuUndo'), icon: <Icons.Undo />, shortcut: 'Ctrl+Z', disabled: !canUndo, onSelect: undo },
      { id: 'redo', label: t('MenuRedo'), icon: <Icons.Redo />, shortcut: 'Ctrl+Y', disabled: !canRedo, onSelect: redo },
      { id: 'sep1', separator: true },
      { id: 'addtable', label: t('MenuAddTable'), icon: <Icons.Table />, shortcut: 'Ctrl+T', onSelect: () => addTable() },
      { id: 'addcol', label: t('MenuAddColumn'), icon: <Icons.Column />, shortcut: 'Ctrl+L', onSelect: addColumn },
      { id: 'addrel', label: t('MenuAddRelation'), icon: <Icons.Relation />, shortcut: 'Ctrl+R', onSelect: addRelationship },
      { id: 'sep2', separator: true },
      { id: 'edit', label: t('MenuEditSelected'), icon: <Icons.Edit />, shortcut: 'F2', onSelect: editSelected },
      { id: 'del', label: t('MenuDeleteSelected'), icon: <Icons.Delete />, shortcut: 'Delete', onSelect: deleteSelected },
    ],
    [t, canUndo, canRedo, undo, redo, addTable, addColumn, addRelationship, editSelected, deleteSelected],
  );

  const viewMenu = useMemo<MenuItem[]>(
    () => [
      { id: 'zin', label: t('MenuZoomIn'), icon: <Icons.ZoomIn />, shortcut: 'Ctrl++', onSelect: zoomIn },
      { id: 'zout', label: t('MenuZoomOut'), icon: <Icons.ZoomOut />, shortcut: 'Ctrl+-', onSelect: zoomOut },
      { id: 'fit', label: t('MenuFitAll'), icon: <Icons.FitAll />, shortcut: 'Ctrl+0', onSelect: fitAll },
      { id: 'reset', label: t('CmResetZoom'), icon: <Icons.Reset />, onSelect: resetZoom },
      { id: 'sep1', separator: true },
      { id: 'arrange', label: t('MenuAutoArrange'), icon: <Icons.Arrange />, tooltip: t('TtAutoArrange'), onSelect: doAutoArrange },
      { id: 'fitw', label: t('MenuFitWidths'), icon: <Icons.FitWidth />, tooltip: t('TtFitWidths'), onSelect: () => mutate((d) => fitTableWidths(d)) },
      { id: 'sep2', separator: true },
      { id: 'grid', label: t('SettingsShowGrid'), icon: <Icons.Grid />, checked: prefs.ShowGrid, onSelect: toggleGrid },
      { id: 'snap', label: t('SettingsSnapToGrid'), icon: <Icons.Snap />, checked: prefs.SnapToGrid, onSelect: () => setPrefs({ ...prefs, SnapToGrid: !prefs.SnapToGrid }) },
      { id: 'sep3', separator: true },
      { id: 'panel', label: t('MenuTogglePanel'), icon: <Icons.Panel />, checked: rightPanelVisible, onSelect: () => setRightPanelVisible((v) => !v) },
      { id: 'sep4', separator: true },
      {
        id: 'dbtype',
        label: t('MenuDbType'),
        icon: <Icons.Database />,
        submenu: DB_TARGET_TYPES.map((db) => ({
          id: `db-${db}`,
          label: getDbDisplayName(db),
          swatch: getHeaderColor(db),
          checked: schema.TargetDb === db,
          onSelect: () => setTargetDb(db),
        })),
      },
      { id: 'theme', label: t('MenuTheme'), icon: <Icons.Palette />, submenu: themeItems },
      { id: 'language', label: t('SettingsLabelLanguage').replace(':', ''), icon: <Icons.Language />, submenu: languageItems },
    ],
    [t, zoomIn, zoomOut, fitAll, resetZoom, doAutoArrange, mutate, prefs, setPrefs, toggleGrid,
     rightPanelVisible, schema.TargetDb, setTargetDb, themeItems, languageItems],
  );

  const analyzeMenu = useMemo<MenuItem[]>(
    () => [
      {
        id: 'run',
        label: t('MenuRunAnalysis'),
        icon: <Icons.Analyze />,
        shortcut: 'F5',
        onSelect: () => {
          setRightTab('analysis');
          setStatus(t('AnalysisDoneCount', issues.length));
        },
      },
      { id: 'idx', label: t('TabIndexAdvisor'), icon: <Icons.Database />, onSelect: () => setRightTab('index') },
      { id: 'sep1', separator: true },
      { id: 'report', label: t('MenuWriteReport'), icon: <Icons.Report />, shortcut: 'Ctrl+Shift+R', onSelect: files.exportMarkdown },
    ],
    [t, issues.length, setStatus, files],
  );

  const helpMenu = useMemo<MenuItem[]>(
    () => [{ id: 'about', label: t('BtnAbout'), icon: <Icons.About />, onSelect: () => setModal({ kind: 'about' }) }],
    [t],
  );

  // ── Canvas context menu ────────────────────────────────────────────────────

  const handleCanvasContextMenu = useCallback(
    (request: CanvasContextMenuRequest) => {
      const items: MenuItem[] = [];
      const { table, columnIndex, relationship, canvasPoint } = request;

      if (table) {
        selectTable(table.Id, columnIndex >= 0 ? table.Columns[columnIndex].Id : null);
        if (columnIndex >= 0) {
          const column = table.Columns[columnIndex];
          items.push(
            {
              id: 'ctx-editcol',
              label: t('CmEditColumn'),
              icon: <Icons.Edit />,
              onSelect: () => setModal({ kind: 'column', tableId: table.Id, column, isNew: false }),
            },
            {
              id: 'ctx-delcol',
              label: t('CmDeleteColumn'),
              icon: <Icons.Delete />,
              onSelect: () => {
                mutate((draft) => removeColumn(draft, table.Id, column.Id));
                selectTable(table.Id, null);
              },
            },
            { id: 'ctx-sep0', separator: true },
          );
        }
        items.push(
          { id: 'ctx-addcol', label: t('CmAddColumn'), icon: <Icons.Column />, onSelect: () => {
            setModal({
              kind: 'column',
              tableId: table.Id,
              column: newColumn({ Name: `${t('NewColumnName')}${table.Columns.length + 1}` }),
              isNew: true,
            });
          } },
          { id: 'ctx-edittable', label: t('CmEditTable'), icon: <Icons.Edit />, onSelect: () => setModal({ kind: 'table', table }) },
          {
            id: 'ctx-deltable',
            label: t('CmDeleteTable'),
            icon: <Icons.Delete />,
            onSelect: () =>
              setModal({
                kind: 'confirm',
                title: t('MsgDeleteTableTitle'),
                message: t('MsgDeleteTable', table.Name),
                onConfirm: () => {
                  mutate((draft) => removeTable(draft, table.Id));
                  clearSelection();
                  closeModal();
                },
              }),
          },
        );
      } else if (relationship) {
        selectRelationship(relationship.Id);
        const relId = relationship.Id;
        items.push(
          {
            id: 'ctx-editrel',
            label: t('CmEditRelation'),
            icon: <Icons.Edit />,
            onSelect: () => setModal({ kind: 'relationship', relationship, isNew: false }),
          },
          {
            id: 'ctx-reltype',
            label: t('CmRelationType'),
            icon: <Icons.Relation />,
            submenu: (
              [
                ['OneToOne', t('CmRelType11')],
                ['OneToMany', t('CmRelType1N')],
                ['ManyToMany', t('CmRelTypeNM')],
              ] as const
            ).map(([type, label]) => ({
              id: `ctx-reltype-${type}`,
              label,
              checked: relationship.Type === type,
              onSelect: () =>
                mutate((draft) => {
                  const rel = draft.Relationships.find((r) => r.Id === relId);
                  if (rel) rel.Type = type;
                }),
            })),
          },
          {
            id: 'ctx-linestyle',
            label: t('CmLineStyle'),
            icon: <Icons.Code />,
            submenu: (
              [
                ['Straight', t('LineStyleStraight')],
                ['Curved', t('LineStyleCurved')],
                ['Orthogonal', t('LineStyleOrthogonal')],
              ] as const
            ).map(([style, label]) => ({
              id: `ctx-linestyle-${style}`,
              label,
              checked: relationship.LineStyle === style,
              onSelect: () =>
                mutate((draft) => {
                  const rel = draft.Relationships.find((r) => r.Id === relId);
                  if (!rel) return;
                  rel.LineStyle = style;
                  rel.RoutePoints = [];
                }),
            })),
          },
        );
        if (relationship.LineStyle === 'Orthogonal') {
          items.push(
            {
              id: 'ctx-addbend',
              label: t('CmAddBend'),
              icon: <Icons.Relation />,
              onSelect: () =>
                mutate((draft) => {
                  const rel = draft.Relationships.find((r) => r.Id === relId);
                  if (!rel) return;
                  const connection = getRelationshipConnection(draft, rel);
                  if (connection) tryInsertOrthogonalBend(rel, canvasPoint, connection);
                }),
            },
            {
              id: 'ctx-resetroute',
              label: t('CmResetRoute'),
              icon: <Icons.Reset />,
              onSelect: () =>
                mutate((draft) => {
                  const rel = draft.Relationships.find((r) => r.Id === relId);
                  if (!rel) return;
                  rel.RoutePoints = [];
                  const connection = getRelationshipConnection(draft, rel);
                  if (connection) resetRoutePoints(rel, connection);
                }),
            },
          );
        }
        items.push(
          { id: 'ctx-sep1', separator: true },
          {
            id: 'ctx-delrel',
            label: t('CmDeleteRelation'),
            icon: <Icons.Delete />,
            onSelect: () => {
              mutate((draft) => {
                draft.Relationships = draft.Relationships.filter((r) => r.Id !== relId);
              });
              clearSelection();
            },
          },
        );
      } else {
        items.push(
          { id: 'ctx-addhere', label: t('CmAddTableHere'), icon: <Icons.Table />, onSelect: () => addTable(canvasPoint.x, canvasPoint.y) },
          {
            id: 'ctx-addrel',
            label: t('MenuAddRelation'),
            icon: <Icons.Relation />,
            disabled: schema.Tables.length < 2,
            onSelect: addRelationship,
          },
          { id: 'ctx-sep2', separator: true },
          { id: 'ctx-fit', label: t('CmFitAll'), icon: <Icons.FitAll />, onSelect: fitAll },
          { id: 'ctx-zin', label: t('CmZoomIn'), icon: <Icons.ZoomIn />, onSelect: zoomIn },
          { id: 'ctx-zout', label: t('CmZoomOut'), icon: <Icons.ZoomOut />, onSelect: zoomOut },
          { id: 'ctx-reset', label: t('CmResetZoom'), icon: <Icons.Reset />, onSelect: resetZoom },
        );
      }

      setContextMenu({ x: request.screenX, y: request.screenY, items });
    },
    [t, selectTable, selectRelationship, clearSelection, mutate, closeModal, addTable,
     addRelationship, schema.Tables.length, fitAll, zoomIn, zoomOut, resetZoom],
  );

  // ── Analysis interaction ───────────────────────────────────────────────────

  const focusIssue = useCallback(
    (issue: NormalizationIssue) => {
      const table = schema.Tables.find((tb) => tb.Name === issue.Table);
      if (!table) return;
      selectTable(table.Id, null);
      const names = issue.AffectedColumns.split(',').map((s) => s.trim().toLowerCase());
      setHighlightedColumnIds(
        new Set(table.Columns.filter((c) => names.includes(c.Name.toLowerCase())).map((c) => c.Id)),
      );
      const bounds = getTableBounds(table);
      const area = canvasAreaRef.current;
      if (area) {
        setViewport((v) => ({
          ...v,
          offsetX: (bounds.x + bounds.w / 2) * v.zoom - (area.clientWidth - RULER_SIZE) / 2,
          offsetY: (bounds.y + bounds.h / 2) * v.zoom - (area.clientHeight - RULER_SIZE) / 2,
        }));
      }
    },
    [schema.Tables, selectTable, setHighlightedColumnIds, setViewport],
  );

  const focusSuggestion = useCallback(
    (suggestion: IndexSuggestion) => {
      const table = schema.Tables.find((tb) => tb.Name === suggestion.Table);
      const column = table?.Columns.find((c) => c.Name === suggestion.Column);
      if (table) selectTable(table.Id, column?.Id ?? null);
    },
    [schema.Tables, selectTable],
  );

  const toggleLevel = useCallback(
    (level: NormalizationLevel) => {
      const current = prefsRef.current.NormalizationLevels;
      const next = current.includes(level)
        ? current.filter((l) => l !== level)
        : [...current, level];
      setPrefs({ ...prefsRef.current, NormalizationLevels: next.length ? next : ['NF1'] });
    },
    [setPrefs],
  );

  // ── Property grid patches ──────────────────────────────────────────────────

  const patchSchema = useCallback(
    (patch: Partial<DbSchema>) => mutate((draft) => Object.assign(draft, patch)),
    [mutate],
  );

  const patchTable = useCallback(
    (tableId: string, patch: Partial<DbTable>) =>
      mutate((draft) => {
        const table = draft.Tables.find((tb) => tb.Id === tableId);
        if (table) Object.assign(table, patch);
      }),
    [mutate],
  );

  const patchColumn = useCallback(
    (tableId: string, columnId: string, patch: Partial<DbColumn>) =>
      mutate((draft) => {
        const column = draft.Tables.find((tb) => tb.Id === tableId)?.Columns.find((c) => c.Id === columnId);
        if (column) Object.assign(column, patch);
      }),
    [mutate],
  );

  const patchRelationship = useCallback(
    (relationshipId: string, patch: Partial<DbRelationship>) =>
      mutate((draft) => {
        const rel = draft.Relationships.find((r) => r.Id === relationshipId);
        if (rel) Object.assign(rel, patch);
      }),
    [mutate],
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  const toolButton = (mode: ToolMode, label: string, tooltip: string, icon: React.ReactNode) => (
    <button
      className={`tool-button ${tool === mode ? 'active' : ''}`}
      title={tooltip}
      onClick={() => setTool(mode)}
    >
      {icon}
      <span>{label}</span>
    </button>
  );

  const lineStyleLabel =
    prefs.DefaultLineStyle === 'Straight'
      ? t('LineStyleStraight')
      : prefs.DefaultLineStyle === 'Curved'
        ? t('LineStyleCurved')
        : t('LineStyleOrthogonal');

  return (
    <div className="app">
      <div className="menubar">
        <MenuBarItem label={t('MenuFile')} icon={<Icons.Doc />} items={fileMenu} />
        <MenuBarItem label={t('MenuEdit')} icon={<Icons.Edit />} items={editMenu} />
        <MenuBarItem label={t('MenuView')} icon={<Icons.FitAll />} items={viewMenu} />
        <MenuBarItem label={t('MenuAnalyze')} icon={<Icons.Analyze />} items={analyzeMenu} />
        <MenuBarItem label={t('MenuAbout')} icon={<Icons.Help />} items={helpMenu} />
      </div>

      <div className="toolbar" ref={toolbarRef}>
        <button className="tb" title={t('TtNew')} onClick={newProject}><Icons.New /></button>
        <button className="tb" title={t('TtOpen')} onClick={() => withUnsavedCheck(() => void files.openProject())}><Icons.Open /></button>
        <button className="tb" title={t('TtOpenDb')} onClick={() => withUnsavedCheck(() => void files.openDatabase())}><Icons.Database /></button>
        <button className="tb" title={t('TtSave')} onClick={() => void files.save()}><Icons.Save /></button>
        <button className="tb" title={t('TtSaveAs')} onClick={() => void files.saveAs()}><Icons.SaveAs /></button>
        <span className="tb-sep" />
        <button className="tb" title={t('TtUndo')} disabled={!canUndo} onClick={undo}><Icons.Undo /></button>
        <button className="tb" title={t('TtRedo')} disabled={!canRedo} onClick={redo}><Icons.Redo /></button>
        <span className="tb-sep" />
        <Dropdown
          className="tb-dropdown"
          title={t('TtMenuExport')}
          label={<Icons.Export />}
          items={exportItems}
        />
        <span className="tb-sep" />
        <button className="tb" title={t('TtAddTable')} onClick={() => addTable()}><Icons.Table /></button>
        <button className="tb" title={t('TtAddRelation')} onClick={addRelationship}><Icons.Relation /></button>
        <Dropdown
          className="tb-dropdown"
          title={t('TtLineStyle')}
          label={<span>{lineStyleLabel}</span>}
          items={(
            [
              ['Straight', t('LineStyleStraight')],
              ['Curved', t('LineStyleCurved')],
              ['Orthogonal', t('LineStyleOrthogonal')],
            ] as const
          ).map(([style, label]) => ({
            id: `ls-${style}`,
            label,
            checked: prefs.DefaultLineStyle === style,
            onSelect: () => setLineStyle(style),
          }))}
        />
        <span className="tb-sep" />
        <button className="tb" title={t('TtZoomIn')} onClick={zoomIn}><Icons.ZoomIn /></button>
        <button className="tb" title={t('TtZoomOut')} onClick={zoomOut}><Icons.ZoomOut /></button>
        <button className="tb" title={t('TtFitAll')} onClick={fitAll}><Icons.FitAll /></button>
        <button className="tb tb-zoom" title={t('TtResetZoom')} onClick={resetZoom}>
          {Math.round(viewport.zoom * 100)}%
        </button>
        <span className="tb-sep" />
        <button
          className={`tb ${prefs.ShowGrid ? 'active' : ''}`}
          data-action="toggle-grid"
          title={t('TtToggleGrid')}
          aria-pressed={prefs.ShowGrid}
          onClick={toggleGrid}
        >
          <Icons.Grid />
        </button>
        <button
          className="tb"
          data-action="auto-arrange"
          title={t('TtAutoArrange')}
          onClick={doAutoArrange}
        >
          <Icons.Arrange />
        </button>
        <span className="tb-sep" />
        <button className="tb" title={t('TtAnalyze')} onClick={() => setRightTab('analysis')}><Icons.Analyze /></button>
        <button className="tb" title={t('TtReport')} onClick={files.exportMarkdown}><Icons.Report /></button>
        <span className="tb-sep" />
        <Dropdown
          className="tb-dropdown"
          title={t('TtDbTypeSelector')}
          label={<span>{getDbDisplayName(schema.TargetDb)}</span>}
          items={DB_TARGET_TYPES.map((db) => ({
            id: `tb-db-${db}`,
            label: getDbDisplayName(db),
            checked: schema.TargetDb === db,
            onSelect: () => setTargetDb(db),
          }))}
        />
        <button
          className="tb"
          data-action="load-sample"
          title={t('MenuSampleCreate')}
          onClick={() => withUnsavedCheck(files.loadSample)}
        >
          <Icons.Sample />
        </button>
        <SplitButton
          className="tb-theme"
          actionId="cycle-theme"
          actionTitle={t('TtCycleTheme', getThemeName(prefs.Theme, prefs.Language))}
          label={
            <>
              {/* Tinted with the active theme's accent so it matches the colour
                  chip that same theme shows in the menu below. */}
              <span className="theme-icon" style={{ color: getPalette(prefs.Theme).accent }}>
                <Icons.Palette />
              </span>
              <span>{getThemeName(prefs.Theme, prefs.Language)}</span>
            </>
          }
          onAction={cycleTheme}
          menuTitle={t('TtThemeSelector')}
          items={themeItems}
        />
        <button
          className="tb tb-lang"
          data-action="toggle-language"
          title={t('TtToggleLanguage')}
          onClick={toggleLanguage}
        >
          {/* A distinct glyph per language, so the current mode reads at a glance. */}
          {prefs.Language === 'ko' ? <Icons.LanguageKo /> : <Icons.LanguageEn />}
        </button>
        {/* Only these three sit on the right; everything above is left-aligned. */}
        <span className="tb-spacer" />
        <button
          className="tb"
          data-action="settings"
          title={t('TtSettings')}
          onClick={() => setModal({ kind: 'preferences' })}
        >
          <Icons.Settings />
        </button>
        <button className="tb" title={t('TtToggleRight')} onClick={() => setRightPanelVisible((v) => !v)}><Icons.Panel /></button>
        <button className="tb" title={t('TtAbout')} onClick={() => setModal({ kind: 'about' })}><Icons.About /></button>
      </div>

      <div className="main">
        <div className="tool-panel">
          <div className="tool-group-title">{t('GrpTools')}</div>
          {toolButton('Select', t('ToolSelect'), t('TtToolSelect'), <Icons.Pointer />)}
          {toolButton('AddTable', t('ToolAddTable'), t('TtToolAddTable'), <Icons.Table />)}
          <div className="tool-group-title">{t('GrpRelation')}</div>
          {toolButton('RelationOneToOne', '1:1', t('TtToolRel11'), <Icons.Relation />)}
          {toolButton('RelationOneToMany', '1:N', t('TtToolRel1N'), <Icons.Relation />)}
          {toolButton('RelationManyToMany', 'N:M', t('TtToolRelNM'), <Icons.Relation />)}
          <div className="tool-group-title">{t('GrpView')}</div>
          <button className="tool-button" title={t('TtToolZoomIn')} onClick={zoomIn}><Icons.ZoomIn /><span>+</span></button>
          <button className="tool-button" title={t('TtToolZoomOut')} onClick={zoomOut}><Icons.ZoomOut /><span>−</span></button>
          <button className="tool-button" title={t('TtToolFitAll')} onClick={fitAll}><Icons.FitAll /><span>{t('CmFitAll')}</span></button>
        </div>

        <div className="canvas-area" ref={canvasAreaRef}>
          <DiagramCanvas
            schema={schema}
            theme={prefs.Theme}
            tool={tool}
            zoom={viewport.zoom}
            offsetX={viewport.offsetX}
            offsetY={viewport.offsetY}
            showGrid={prefs.ShowGrid}
            snapToGrid={prefs.SnapToGrid}
            snapInterval={prefs.SnapInterval}
            defaultLineStyle={prefs.DefaultLineStyle}
            selectedTableId={selection.tableId}
            selectedColumnId={selection.columnId}
            selectedRelationshipId={selection.relationshipId}
            highlightedColumnIds={highlightedColumnIds}
            onViewportChange={setViewport}
            onSelectTable={(tableId, columnId) => {
              setHighlightedColumnIds(new Set());
              selectTable(tableId, columnId ?? null);
            }}
            onSelectRelationship={selectRelationship}
            onMutate={mutate}
            onDragUpdate={(mutator) => mutate(mutator, { undo: false })}
            onToolReset={() => setTool('Select')}
            onEditTable={(tableId) => {
              const table = findTable(schema, tableId);
              if (table) setModal({ kind: 'table', table });
            }}
            onEditRelationship={(relationshipId) => {
              const rel = schema.Relationships.find((r) => r.Id === relationshipId);
              if (rel) setModal({ kind: 'relationship', relationship: rel, isNew: false });
            }}
            onEditColumn={(tableId, columnId) => {
              const column = findTable(schema, tableId)?.Columns.find((c) => c.Id === columnId);
              if (column) setModal({ kind: 'column', tableId, column, isNew: false });
            }}
            onContextMenu={handleCanvasContextMenu}
            onRelationRequested={createRelationFromDrag}
          />
        </div>

        {rightPanelVisible && (
          <div className="right-panel" style={{ width: prefs.RightPanelWidth }}>
            <div className="tabs">
              <button className={rightTab === 'structure' ? 'active' : ''} onClick={() => setRightTab('structure')}>
                {t('TabStructure')}
              </button>
              <button className={rightTab === 'analysis' ? 'active' : ''} onClick={() => setRightTab('analysis')}>
                {t('TabAnalysis')}
              </button>
              <button className={rightTab === 'index' ? 'active' : ''} onClick={() => setRightTab('index')}>
                {t('TabIndexAdvisor')}
              </button>
            </div>

            <div className="right-top">
              {rightTab === 'structure' && (
                <StructureTree
                  schema={schema}
                  selectedTableId={selection.tableId}
                  selectedColumnId={selection.columnId}
                  selectedRelationshipId={selection.relationshipId}
                  onSelectTable={(tableId, columnId) => selectTable(tableId, columnId ?? null)}
                  onSelectRelationship={selectRelationship}
                  onEditTable={(tableId) => {
                    const table = findTable(schema, tableId);
                    if (table) setModal({ kind: 'table', table });
                  }}
                  onEditColumn={(tableId, columnId) => {
                    const column = findTable(schema, tableId)?.Columns.find((c) => c.Id === columnId);
                    if (column) setModal({ kind: 'column', tableId, column, isNew: false });
                  }}
                  onEditRelationship={(relationshipId) => {
                    const rel = schema.Relationships.find((r) => r.Id === relationshipId);
                    if (rel) setModal({ kind: 'relationship', relationship: rel, isNew: false });
                  }}
                />
              )}
              {rightTab === 'analysis' && (
                <AnalysisPanel
                  schema={schema}
                  issues={issues}
                  levels={prefs.NormalizationLevels}
                  onToggleLevel={toggleLevel}
                  onSelectIssue={focusIssue}
                />
              )}
              {rightTab === 'index' && (
                <IndexAdvisorPanel
                  schema={schema}
                  suggestions={indexSuggestions}
                  onSelectSuggestion={focusSuggestion}
                />
              )}
            </div>

            <div className="right-splitter" />

            <div className="right-bottom">
              <div className="panel-title">{t('PropertiesTitle')}</div>
              <PropertyGrid
                schema={schema}
                table={selectedTable}
                column={selectedColumn}
                relationship={selectedRelationship}
                sortMode={sortMode}
                onSortModeChange={setSortMode}
                onSchemaChange={patchSchema}
                onTableChange={patchTable}
                onColumnChange={patchColumn}
                onRelationshipChange={patchRelationship}
              />
            </div>
          </div>
        )}
      </div>

      <div className="statusbar">
        <span className="status-schema">
          {t('StatusSchema', schema.Name, getDbDisplayName(schema.TargetDb), schema.Tables.length, schema.Relationships.length)}
        </span>
        <span className="spacer" />
        {isDirty && <span className="status-dirty">● {t('UnsavedMarker')}</span>}
        <span className="status-message">{status || t('StatusReady')}</span>
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
        />
      )}

      {modal.kind === 'table' && (
        <TableEditDialog
          table={modal.table}
          targetDb={schema.TargetDb}
          onClose={closeModal}
          onSave={(updated) => {
            mutate((draft) => {
              const index = draft.Tables.findIndex((tb) => tb.Id === updated.Id);
              if (index >= 0) {
                draft.Tables[index] = { ...updated };
                fitTableWidthForTarget(draft.Tables[index], draft.TargetDb);
                // Columns removed in the dialog must not leave dangling relationships.
                const ids = new Set(updated.Columns.map((c) => c.Id));
                draft.Relationships = draft.Relationships.filter(
                  (r) =>
                    (r.SourceTableId !== updated.Id || ids.has(r.SourceColumnId)) &&
                    (r.TargetTableId !== updated.Id || ids.has(r.TargetColumnId)),
                );
              }
            });
            closeModal();
          }}
        />
      )}

      {modal.kind === 'column' && (
        <ColumnEditDialog
          column={modal.column}
          targetDb={schema.TargetDb}
          onClose={closeModal}
          onSave={(updated) => {
            const { tableId, isNew } = modal;
            mutate((draft) => {
              const table = draft.Tables.find((tb) => tb.Id === tableId);
              if (!table) return;
              if (isNew) table.Columns.push(updated);
              else {
                const index = table.Columns.findIndex((c) => c.Id === updated.Id);
                if (index >= 0) table.Columns[index] = updated;
              }
              fitTableWidthForTarget(table, draft.TargetDb);
            });
            selectTable(tableId, updated.Id);
            closeModal();
          }}
        />
      )}

      {modal.kind === 'relationship' && (
        <RelationshipEditDialog
          relationship={modal.relationship}
          schema={schema}
          onClose={closeModal}
          onSave={(updated) => {
            const { isNew } = modal;
            mutate((draft) => {
              if (isNew) draft.Relationships.push(updated);
              else {
                const index = draft.Relationships.findIndex((r) => r.Id === updated.Id);
                if (index >= 0) draft.Relationships[index] = updated;
              }
              const targetColumn = draft.Tables
                .find((tb) => tb.Id === updated.TargetTableId)
                ?.Columns.find((c) => c.Id === updated.TargetColumnId);
              if (targetColumn) targetColumn.IsForeignKey = true;
            });
            selectRelationship(updated.Id);
            closeModal();
          }}
        />
      )}

      {modal.kind === 'preferences' && (
        <PreferencesDialog
          prefs={prefs}
          onClose={closeModal}
          onSave={(next) => {
            setPrefs(next);
            closeModal();
          }}
        />
      )}

      {modal.kind === 'about' && <AboutDialog onClose={closeModal} />}
      {modal.kind === 'notice' && <NoticeDialog message={modal.message} onClose={closeModal} />}
      {modal.kind === 'error' && (
        <ErrorDialog message={modal.message} details={modal.details} onClose={closeModal} />
      )}
      {modal.kind === 'confirm' && (
        <ConfirmDialog
          title={modal.title}
          message={modal.message}
          confirmLabel={modal.confirmLabel}
          discardLabel={modal.discardLabel}
          onConfirm={modal.onConfirm}
          onDiscard={modal.onDiscard}
          onCancel={closeModal}
        />
      )}
    </div>
  );
}

function MenuBarItem({
  label,
  icon,
  items,
}: {
  label: string;
  icon: React.ReactNode;
  items: MenuItem[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="menubar-item" ref={ref}>
      <button className={open ? 'open' : ''} onClick={() => setOpen((v) => !v)}>
        <span className="menubar-icon">{icon}</span>
        <span>{label}</span>
      </button>
      {open && <MenuList items={items} onClose={() => setOpen(false)} />}
    </div>
  );
}
