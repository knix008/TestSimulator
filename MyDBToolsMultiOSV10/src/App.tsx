// Port of MainForm.cs — menus, toolbar, tool panel, canvas, side panels, status bar.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
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
import { areEquivalent } from './core/serializer';
import { useT, type Language } from './i18n';
import { getHost } from './platform';
import { APP_TITLE, APP_VERSION, windowTitle } from './appInfo';
import { createSample, SAMPLES, sampleName } from './core/samples';
import {
  applyPaletteToDocument,
  getHeaderColor,
  getPalette,
  customThemeDefinitions,
  getThemeName,
  THEMES,
  type ThemeId,
} from './render/theme';
import { useAppState } from './hooks/useAppState';
import type { SchemaDocument } from './hooks/useAppState';
import { useFileActions } from './hooks/useFileActions';
import { useToolbarMinWidth } from './hooks/useToolbarMinWidth';
import { AnalysisPanel, IndexAdvisorPanel } from './components/AnalysisPanel';
import { CanvasContextMenuRequest, DiagramCanvas, computeFitViewport } from './components/DiagramCanvas';
import { ColumnEditDialog } from './components/ColumnEditDialog';
import { ContextMenu, Dropdown, MenuList, type MenuItem } from './components/Menu';
import { Icons } from './components/Icons';
import { setLineBridgesDefault } from './render/drawDiagram';
import { PreferencesDialog } from './components/PreferencesDialog';
import { PropertyGrid, type SortMode } from './components/PropertyGrid';
import { RelationshipEditDialog } from './components/RelationshipEditDialog';
import { AboutDialog, ConfirmDialog, DoneDialog, ErrorDialog, NoticeDialog } from './components/SimpleDialogs';
import { StructureTree } from './components/StructureTree';
import { DocumentTabs } from './components/DocumentTabs';
import { SchemaPickerDialog } from './components/SchemaPickerDialog';
import { TableEditDialog } from './components/TableEditDialog';
import { RULER_SIZE } from './components/CanvasRuler';
import appIcon from '../assets/icons/256x256.png';
import { ResizeGrip } from './components/ResizeGrip';
import { StartScreen } from './components/StartScreen';
import { ThemeDialog } from './components/ThemeDialog';
import { ThemeDropdown } from './components/ThemeDropdown';
import { PrintWindow } from './components/PrintWindow';
import { BottomPanelBody, Panel, Splitter, type BottomTab, type LogEntry, type ProblemRow } from './components/Panels';
import type { UserPreferences } from './core/settings';

type RightTab = 'structure' | 'analysis' | 'index';

type ModalState =
  | { kind: 'none' }
  | { kind: 'table'; table: DbTable }
  | { kind: 'column'; tableId: string; column: DbColumn; isNew: boolean }
  | { kind: 'relationship'; relationship: DbRelationship; isNew: boolean }
  | { kind: 'preferences' }
  | { kind: 'themes' }
  | { kind: 'about' }
  | { kind: 'notice'; message: string }
  | { kind: 'done'; message: string; detail?: string | null }
  | {
      kind: 'pick-schema';
      title: string;
      onPick: (documentIds: string[]) => void;
    }
  | { kind: 'error'; message: string; details?: string | null }
  | {
      kind: 'confirm';
      message: string;
      title?: string;
      onConfirm: () => void;
      onDiscard?: () => void;
      confirmLabel?: string;
      discardLabel?: string;
      /** What confirming does, for the button icons. */
      intent?: 'save' | 'delete';
    };

export default function App() {
  const t = useT();
  const host = getHost();
  const state = useAppState('새 스키마');
  const {
    schema, mutate, loadSchema, markSaved, isDirty, currentPath,
    documents, documentId, switchDocument, openDocument, replaceDocuments, closeDocument, anyDirty,
    selection, selectTable, toggleTableSelection, selectTables, selectRelationship, clearSelection,
    selectedTable, selectedColumn, selectedRelationship,
    tool, setTool, viewport, setViewport, zoomIn, zoomOut, resetZoom,
    prefs, setPrefs, prefsLoaded, recentFiles, setRecentFiles,
    status, setStatus, undo, redo, canUndo, canRedo,
    issues, indexSuggestions, highlightedColumnIds, setHighlightedColumnIds,
  } = state;

  const [rightTab, setRightTab] = useState<RightTab>('structure');
  // The three panels: open or folded, and their sizes (a per-window convenience,
  // kept in localStorage; the right panel's width also lives in the settings).
  const [panels, setPanels] = useState(() => {
    const fallback = { right: true, bottom: true, bottomHeight: 170 };
    try {
      return { ...fallback, ...JSON.parse(localStorage.getItem('dbtools.panels') ?? '{}') };
    } catch {
      return fallback;
    }
  });
  const [rightWidth, setRightWidth] = useState<number | null>(null);
  useEffect(() => {
    try {
      localStorage.setItem('dbtools.panels', JSON.stringify(panels));
    } catch {
      /* storage blocked */
    }
  }, [panels]);
  const togglePanel = useCallback(
    (side: 'right' | 'bottom') => setPanels((p: typeof panels) => ({ ...p, [side]: !p[side] })),
    [],
  );
  const rightPanelVisible = panels.right;
  const [bottomTab, setBottomTab] = useState<BottomTab>('problems');
  const [log, setLog] = useState<LogEntry[]>([]);
  const pushLog = useCallback((level: LogEntry['level'], text: string) => {
    if (!text) return;
    setLog((l) => [...l.slice(-499), { time: new Date(), level, text }]);
  }, []);
  const [sortMode, setSortMode] = useState<SortMode>('category');
  const [modal, setModal] = useState<ModalState>({ kind: 'none' });
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  /** The start screen covers the workspace; null until the settings say whether to show it. */
  const [startOn, setStartOn] = useState<boolean | null>(null);
  const [printOpen, setPrintOpen] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const canvasAreaRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

  const schemaRef = useRef(schema);
  schemaRef.current = schema;
  const pathRef = useRef(currentPath);
  pathRef.current = currentPath;
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  // Read by the context menu builder, which would otherwise be rebuilt — and
  // its menu closed — every time the selection changes.
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  /**
   * The document an export is currently working on. Exports read the schema
   * through `getSchema`, so pointing this at another open tab is all it takes
   * to make them produce that tab's files instead of the visible one's.
   */
  const exportTargetRef = useRef<SchemaDocument | null>(null);
  const documentsRef = useRef(documents);
  documentsRef.current = documents;
  const dirtyRef = useRef(isDirty);
  dirtyRef.current = isDirty;
  // Closing the window is about every open tab, not only the visible one.
  const anyDirtyRef = useRef(anyDirty);
  anyDirtyRef.current = anyDirty;
  /**
   * Set while saving on the way out: the completion dialog would open a window
   * just as the app is closing it again, which reads as a flash and nothing
   * else. The save itself still reports to the status bar.
   */
  const closingRef = useRef(false);

  // The toolbar must stay one row, so the window cannot be narrower than it.
  useToolbarMinWidth(toolbarRef, [prefs.Language]);

  const closeModal = useCallback(() => setModal({ kind: 'none' }), []);
  // Stable identity: the menu keys its document listeners off this, and a new
  // function every render would tear them down and rebuild them constantly.
  const closeContextMenu = useCallback(() => setContextMenu(null), []);
  const showError = useCallback(
    (message: string, details?: string | null) => {
      setLog((l) => [...l.slice(-499), { time: new Date(), level: 'error' as const, text: details ? `${message} — ${details}` : message }]);
      setModal({ kind: 'error', message, details });
    },
    [],
  );

  // ── File actions ───────────────────────────────────────────────────────────

  const files = useFileActions(
    () => exportTargetRef.current?.schema ?? schemaRef.current,
    () => exportTargetRef.current?.path ?? pathRef.current,
    () => prefsRef.current.RecentFilesMaxCount,
    () => prefsRef.current.Theme,
    () => prefsRef.current.NormalizationLevels,
    () => prefsRef.current.Report,
    () => prefsRef.current.ImageExportTransparent,
    {
      onLoaded: (next, path, message) => {
        // Every open and import lands in a tab of its own; nothing that is
        // already open is disturbed, so there is nothing to confirm first.
        openDocument(next, path);
        setStartOn(false);
        setStatus(message);
      },
      onSaved: (path, message) => {
        markSaved(path);
        setStatus(message);
        if (!closingRef.current) {
          setModal({ kind: 'done', message: t('SaveDoneTitle'), detail: path });
        }
      },
      onStatus: setStatus,
      onWorkspaceLoaded: (entries, activeIndex) => replaceDocuments(entries, activeIndex),
      onCompleted: (message, detail) => {
        if (!closingRef.current) setModal({ kind: 'done', message, detail });
      },
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
        intent: 'save',
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

  /** New schema, always in a tab of its own. */
  const newProject = useCallback(() => {
    const next = newSchema(t('NewProjectName'));
    next.TargetDb = prefsRef.current.DefaultDbType;
    openDocument(next, null, { reuseScratch: false });
    setStartOn(false);
    setStatus(t('StatusNewProjectCreated'));
  }, [openDocument, setStatus, t]);

  /**
   * Close one tab, asking first if it has unsaved changes. Closing the last
   * remaining tab closes the window instead — there is no such thing as the
   * editor with no document open.
   */
  const closeTab = useCallback(
    (id: string) => {
      const document = documents.find((d) => d.id === id);
      if (!document) return;
      const dirty = !areEquivalent(document.saved, document.schema);

      const finish = () => {
        // The editor always has a document. Closing the last tab empties it
        // rather than leaving a window with nothing in it.
        if (closeDocument(id)) return;
        const fresh = newSchema(t('NewProjectName'));
        fresh.TargetDb = prefsRef.current.DefaultDbType;
        loadSchema(fresh, null);
      };
      if (!dirty) return finish();

      const wasActive = id === documentId;
      setModal({
        kind: 'confirm',
        title: t('ConfirmDiscardTitle'),
        message: t('MsgUnsavedChanges'),
        confirmLabel: t('ConfirmSave'),
        intent: 'save',
        discardLabel: t('ConfirmDiscard'),
        onConfirm: () => {
          closeModal();
          // Saving works on the active document, so a background tab has to be
          // brought forward before it can be saved.
          if (!wasActive) switchDocument(id);
          void files.save().then((saved) => saved && finish());
        },
        onDiscard: () => {
          closeModal();
          finish();
        },
      });
    },
    [documents, documentId, closeDocument, switchDocument, closeModal, files, loadSchema, t],
  );

  // ── Window title and dirty state ───────────────────────────────────────────

  useEffect(() => {
    const title = windowTitle(currentPath ?? schema.Name, isDirty);
    host.setTitle(title);
    document.title = title;
    if ('setDirty' in host) (host as { setDirty(dirty: boolean): void }).setDirty(isDirty);
  }, [host, currentPath, schema.Name, isDirty]);

  // Close confirmation (desktop) / beforeunload (web)
  useEffect(() => {
    host.onBeforeClose(async () => {
      if (!anyDirtyRef.current) return true;
      return new Promise<boolean>((resolve) => {
        setModal({
          kind: 'confirm',
          title: t('ConfirmDiscardTitle'),
          message: dirtyRef.current ? t('MsgUnsavedChanges') : t('MsgUnsavedTabs'),
          confirmLabel: t('ConfirmSave'),
          intent: 'save',
          discardLabel: t('ConfirmDiscard'),
          onConfirm: () => {
            closeModal();
            closingRef.current = true;
            void files.save().then((saved) => {
              // Cancelling the save dialog keeps the app open, so the guard has
              // to come back off or later saves would report nothing.
              if (!saved) closingRef.current = false;
              resolve(saved);
            });
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
  }, [prefs.Theme, prefs.CustomThemes]);

  useEffect(() => {
    if (status) pushLog('info', status);
  }, [status, pushLog]);

  // Once the settings are in: the start screen (or not), then the window may
  // appear — it is created hidden so it never flashes white.
  useEffect(() => {
    if (!prefsLoaded) return;
    setStartOn((on) => (on === null ? prefs.ShowStartScreen : on));
    requestAnimationFrame(() => requestAnimationFrame(() => host.ready?.()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefsLoaded]);

  // The window's maximized state, for the title bar button's icon.
  useEffect(() => {
    if (host.kind !== 'desktop') return;
    let stop: (() => void) | undefined;
    void (async () => {
      const win = getCurrentWindow();
      setMaximized(await win.isMaximized());
      stop = await win.onResized(async () => setMaximized(await win.isMaximized()));
    })();
    return () => stop?.();
  }, [host.kind]);

  const patchPrefs = useCallback(
    (patch: Partial<UserPreferences>) => setPrefs({ ...prefsRef.current, ...patch }),
    [setPrefs],
  );

  const openDoc = useCallback(
    (doc: 'guide' | 'tutorial') => {
      const language = prefsRef.current.Language;
      if (host.openDoc) return void host.openDoc(doc, language);
      window.open(`./doc/index.html?doc=${doc}&lang=${language}`, 'dbtools-doc');
    },
    [host],
  );

  const openSample = useCallback(
    (id: string) => {
      const sample = createSample(id);
      openDocument(sample, null, { reuseScratch: true });
      setStartOn(false);
      setStatus(t('StatusLoaded', sample.Name));
      setTimeout(() => frameAll(), 30);
    },
    // frameAll is declared further down; it is stable (useCallback on refs).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [openDocument, setStatus, t],
  );

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
        intent: 'delete',
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
      // Several tables can be selected at once; delete asks about all of them.
      const ids = selection.tableIds.length > 0 ? [...selection.tableIds] : [selectedTable.Id];
      setModal({
        kind: 'confirm',
        title: t('MsgDeleteTableTitle'),
        intent: 'delete',
        message:
          ids.length > 1
            ? t('MsgDeleteTables', ids.length)
            : t('MsgDeleteTable', selectedTable.Name),
        onConfirm: () => {
          mutate((draft) => {
            for (const id of ids) removeTable(draft, id);
          });
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
  }, [selectedColumn, selectedTable, selectedRelationship, selection.tableIds, mutate, selectTable,
      clearSelection, closeModal, t]);

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

  /** Frame the whole schema. `fixedZoom` keeps a magnification instead of fitting. */
  const frameAll = useCallback(
    (fixedZoom?: number) => {
      const area = canvasAreaRef.current;
      if (!area) return;
      const next = computeFitViewport(
        schemaRef.current,
        area.clientWidth - (prefsRef.current.ShowRulers ? RULER_SIZE : 0),
        area.clientHeight - (prefsRef.current.ShowRulers ? RULER_SIZE : 0),
        fixedZoom,
      );
      if (next) setViewport(next);
    },
    [setViewport],
  );

  const fitAll = useCallback(() => frameAll(), [frameAll]);

  const doAutoArrange = useCallback(() => {
    mutate((draft) => autoArrange(draft));
    // The arranged layout is designed at 1:1 — the gutters are sized in real
    // pixels — so it is shown at 100% rather than shrunk to fit.
    setTimeout(() => frameAll(1), 0);
  }, [mutate, frameAll]);

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
      if (ctrl && !e.shiftKey && e.key.toLowerCase() === 'p') return void (e.preventDefault(), setPrintOpen(true));
      if (e.key === 'F1') return void (e.preventDefault(), openDoc('guide'));
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
        e.preventDefault();
        return void forChosenSchemas(t('PickTitleReport'), files.exportAnalysisMarkdown);
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
      fitAll, editSelected, deleteSelected, setTool, clearSelection, setStatus, issues.length, t, openDoc]);

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
    const all = [...THEMES, ...customThemeDefinitions()];
    const current = all.findIndex((x) => x.id === prefsRef.current.Theme);
    const next = all[(current + 1) % all.length];
    setPrefs({ ...prefsRef.current, Theme: next.id });
    setStatus(t('StatusTheme', getThemeName(next.id, prefsRef.current.Language)));
  }, [setPrefs, setStatus, t]);

  const toggleLanguage = useCallback(() => {
    const next: Language = prefsRef.current.Language === 'ko' ? 'en' : 'ko';
    setPrefs({ ...prefsRef.current, Language: next });
    setStatus(t('StatusLanguage', next === 'ko' ? '한국어' : 'English'));
  }, [setPrefs, setStatus, t]);

  const toggleRulers = useCallback(() => {
    const next = !prefsRef.current.ShowRulers;
    setPrefs({ ...prefsRef.current, ShowRulers: next });
    setStatus(t(next ? 'StatusRulersOn' : 'StatusRulersOff'));
  }, [setPrefs, setStatus, t]);

  const toggleBridges = useCallback(() => {
    const next = !prefsRef.current.LineBridges;
    setPrefs({ ...prefsRef.current, LineBridges: next });
    setStatus(t(next ? 'StatusBridgesOn' : 'StatusBridgesOff'));
  }, [setPrefs, setStatus, t]);

  // Exports, print and the start-screen previews draw lines the same way.
  setLineBridgesDefault(prefs.LineBridges);

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
      ...(customThemeDefinitions().length
        ? [
            { id: 'theme-sep-custom', separator: true } as MenuItem,
            { id: 'theme-custom-head', header: true, label: t('ThemeCustomGroup') } as MenuItem,
            ...customThemeDefinitions().map(toItem),
          ]
        : []),
      { id: 'theme-sep-settings', separator: true },
      {
        id: 'theme-settings',
        label: t('MenuThemeSettings'),
        icon: <Icons.Palette />,
        onSelect: () => setModal({ kind: 'themes' }),
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs.Theme, prefs.Language, prefs.CustomThemes, setTheme, t]);

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
        icon: code === 'ko' ? <Icons.FlagKo /> : <Icons.FlagEn />,
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
    if (host.kind !== 'desktop' || recentFiles.length === 0) {
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

  /**
   * Run an export for one or more open schemas.
   *
   * With a single document open there is nothing to ask. With several, the
   * picker decides; picking more than one collects the files and writes them
   * into a folder chosen once, rather than opening a save dialog per file.
   */
  const forChosenSchemas = useCallback(
    (title: string, run: () => Promise<unknown> | unknown) => {
      const all = documentsRef.current;
      const runFor = async (ids: string[]) => {
        const targets = all.filter((d) => ids.includes(d.id));
        if (targets.length === 0) return;
        if (targets.length === 1) {
          exportTargetRef.current = targets[0];
          try {
            await run();
          } finally {
            exportTargetRef.current = null;
          }
          return;
        }
        files.beginBatch();
        try {
          for (const target of targets) {
            exportTargetRef.current = target;
            await run();
          }
        } finally {
          exportTargetRef.current = null;
        }
        await files.saveBatch(files.endBatch(), title);
      };

      if (all.length <= 1) return void runFor(all.map((d) => d.id));
      setModal({
        kind: 'pick-schema',
        title,
        onPick: (ids) => {
          closeModal();
          void runFor(ids);
        },
      });
    },
    [files, closeModal],
  );

  const diagramImageItems = useMemo<MenuItem[]>(
    () => [
      { id: 'di-png', label: t('MenuExportPng'), icon: <Icons.Image />, onSelect: () => forChosenSchemas(t('PickTitleImage'), () => files.exportImage('png')) },
      { id: 'di-jpg', label: t('MenuExportJpeg'), icon: <Icons.Image />, onSelect: () => forChosenSchemas(t('PickTitleImage'), () => files.exportImage('jpeg')) },
      { id: 'di-webp', label: t('MenuExportWebp'), icon: <Icons.Image />, onSelect: () => forChosenSchemas(t('PickTitleImage'), () => files.exportImage('webp')) },
      { id: 'di-gif', label: t('MenuExportGif'), icon: <Icons.Image />, onSelect: () => forChosenSchemas(t('PickTitleImage'), () => files.exportImage('gif')) },
    ],
    [t, files, forChosenSchemas],
  );

  const analysisReportItems = useMemo<MenuItem[]>(
    () => [
      { id: 'ar-md', label: t('MenuExportMarkdown'), icon: <Icons.Doc />, onSelect: () => forChosenSchemas(t('PickTitleReport'), files.exportAnalysisMarkdown) },
      { id: 'ar-docx', label: t('MenuExportWord'), icon: <Icons.Doc />, onSelect: () => forChosenSchemas(t('PickTitleReport'), files.exportAnalysisWordFile) },
      { id: 'ar-pdf', label: t('MenuExportPdf'), icon: <Icons.Report />, onSelect: () => forChosenSchemas(t('PickTitleReport'), files.exportAnalysisPdf) },
      { id: 'ar-html', label: t('MenuExportHtml'), icon: <Icons.Code />, onSelect: () => forChosenSchemas(t('PickTitleReport'), files.exportAnalysisHtml) },
    ],
    [t, files, forChosenSchemas],
  );

  const exportItems = useMemo<MenuItem[]>(
    () => [
      { id: 'x-doc', header: true, label: t('ExportGroupDocument'), icon: <Icons.Doc /> },
      { id: 'x-md', label: t('MenuExportMarkdown'), icon: <Icons.Doc />, onSelect: () => forChosenSchemas(t('PickTitleExport'), files.exportMarkdown) },
      { id: 'x-xlsx', label: t('MenuExportExcel'), icon: <Icons.Doc />, onSelect: () => forChosenSchemas(t('PickTitleExport'), files.exportExcelFile) },
      { id: 'x-docx', label: t('MenuExportWord'), icon: <Icons.Doc />, onSelect: () => forChosenSchemas(t('PickTitleExport'), files.exportWordFile) },
      { id: 'x-pdf', label: t('MenuExportPdf'), icon: <Icons.Report />, onSelect: () => forChosenSchemas(t('PickTitleExport'), files.exportPdf) },
      { id: 'x-html', label: t('MenuExportHtml'), icon: <Icons.Code />, onSelect: () => forChosenSchemas(t('PickTitleExport'), files.exportHtml) },
      { id: 'x-sep-an', separator: true },
      { id: 'x-analysis', header: true, label: t('ExportGroupAnalysis'), icon: <Icons.Analyze /> },
      ...analysisReportItems.map((item) => ({ ...item, id: `x-${item.id}` })),
      { id: 'x-sep1', separator: true },
      { id: 'x-img', header: true, label: t('ExportGroupImage'), icon: <Icons.Image /> },
      ...diagramImageItems.map((item) => ({ ...item, id: `x-${item.id}` })),
      { id: 'x-sep2', separator: true },
      { id: 'x-data', header: true, label: t('ExportGroupData'), icon: <Icons.Code /> },
      { id: 'x-json', label: t('MenuExportJson'), icon: <Icons.Code />, onSelect: () => forChosenSchemas(t('PickTitleExport'), files.exportJson) },
      { id: 'x-sep3', separator: true },
      { id: 'x-sql', header: true, label: t('ExportGroupSql'), icon: <Icons.Database /> },
      { id: 'x-sql-current', label: t('MenuExportSql'), icon: <Icons.Code />, onSelect: () => forChosenSchemas(t('PickTitleExport'), files.exportSqlCurrent) },
      { id: 'x-sqlite-db', label: t('MenuExportSqliteDb'), icon: <Icons.Database />, onSelect: () => forChosenSchemas(t('PickTitleExport'), files.exportSqliteDb) },
      { id: 'x-pg', label: t('MenuExportPostgres'), icon: <Icons.Database />, onSelect: () => forChosenSchemas(t('PickTitleExport'), () => files.exportSqlFor('PostgreSQL')) },
      { id: 'x-my', label: t('MenuExportMySql'), icon: <Icons.Database />, onSelect: () => forChosenSchemas(t('PickTitleExport'), () => files.exportSqlFor('MySQL')) },
      { id: 'x-maria', label: t('MenuExportMariaDb'), icon: <Icons.Database />, onSelect: () => forChosenSchemas(t('PickTitleExport'), () => files.exportSqlFor('MariaDB')) },
      { id: 'x-mssql', label: t('MenuExportSqlServer'), icon: <Icons.Database />, onSelect: () => forChosenSchemas(t('PickTitleExport'), () => files.exportSqlFor('SqlServer')) },
    ],
    [t, files, analysisReportItems, diagramImageItems, forChosenSchemas],
  );

  const sampleItems = useMemo<MenuItem[]>(
    () =>
      SAMPLES.map((sample) => ({
        id: `sample-${sample.id}`,
        label: sampleName(sample, prefs.Language),
        icon: <Icons.Database />,
        swatch: getHeaderColor(sample.db),
        onSelect: () => openSample(sample.id),
      })),
    [prefs.Language, openSample],
  );

  const fileMenu = useMemo<MenuItem[]>(
    () => [
      { id: 'home', label: t('MenuStartScreen'), icon: <Icons.Home />, onSelect: () => setStartOn(true) },
      { id: 'sep0', separator: true },
      { id: 'new', label: t('MenuNew'), icon: <Icons.New />, shortcut: 'Ctrl+N', onSelect: newProject },
      { id: 'open', label: t('MenuOpen'), icon: <Icons.Open />, shortcut: 'Ctrl+O', onSelect: () => withUnsavedCheck(() => void files.openProject()) },
      { id: 'opendb', label: t('MenuOpenDatabase'), icon: <Icons.Database />, shortcut: 'Ctrl+Shift+O', onSelect: () => withUnsavedCheck(() => void files.openDatabase()) },
      { id: 'sep1', separator: true },
      { id: 'save', label: t('MenuSave'), icon: <Icons.Save />, shortcut: 'Ctrl+S', onSelect: () => void files.save() },
      { id: 'saveas', label: t('MenuSaveAs'), icon: <Icons.SaveAs />, shortcut: 'Ctrl+Shift+S', onSelect: () => void files.saveAs() },
      { id: 'sep-ws', separator: true },
      {
        id: 'ws-save',
        label: t('MenuSaveWorkspace'),
        icon: <Icons.Save />,
        tooltip: t('TtSaveWorkspace'),
        onSelect: () =>
          void files.saveWorkspace(
            documentsRef.current.map((d) => ({ path: d.path, schema: d.schema })),
            documentsRef.current.findIndex((d) => d.id === documentId),
          ),
      },
      {
        id: 'ws-open',
        label: t('MenuOpenWorkspace'),
        icon: <Icons.Open />,
        tooltip: t('TtOpenWorkspace'),
        onSelect: () => withUnsavedCheck(() => void files.openWorkspace()),
      },
      { id: 'sep2', separator: true },
      { id: 'recent', label: t('MenuRecentFiles'), icon: <Icons.Recent />, submenu: recentItems },
      { id: 'export', label: t('MenuExport'), icon: <Icons.Export />, submenu: exportItems },
      { id: 'print', label: t('MenuPrint'), icon: <Icons.Print />, shortcut: 'Ctrl+P', onSelect: () => setPrintOpen(true) },
      { id: 'sep3', separator: true },
      { id: 'examples', label: t('MenuExamples', SAMPLES.length), icon: <Icons.Examples />, submenu: sampleItems },
      { id: 'sample', label: t('MenuSampleCreate'), icon: <Icons.Sample />, onSelect: () => withUnsavedCheck(files.loadSample) },
      { id: 'sample-all', label: t('MenuSampleCreateAll'), icon: <Icons.Sample />, onSelect: () => void files.generateSamples() },
      { id: 'sep4', separator: true },
      { id: 'settings', label: t('MenuSettings'), icon: <Icons.Settings />, onSelect: () => setModal({ kind: 'preferences' }) },
    ],
    [t, newProject, withUnsavedCheck, files, recentItems, exportItems, sampleItems],
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
      { id: 'rulers', label: t('MenuShowRulers'), icon: <Icons.Ruler />, checked: prefs.ShowRulers, onSelect: toggleRulers },
      { id: 'bridges', label: t('MenuLineBridges'), icon: <Icons.Bridge />, checked: prefs.LineBridges, onSelect: toggleBridges },
      { id: 'snap', label: t('SettingsSnapToGrid'), icon: <Icons.Snap />, checked: prefs.SnapToGrid, onSelect: () => setPrefs({ ...prefs, SnapToGrid: !prefs.SnapToGrid }) },
      { id: 'sep3', separator: true },
      { id: 'panel-bottom', label: t('PanelToggleBottom'), icon: <Icons.PanelBottom />, checked: panels.bottom, onSelect: () => togglePanel('bottom') },
      { id: 'panel', label: t('PanelToggleRight'), icon: <Icons.Panel />, checked: rightPanelVisible, onSelect: () => togglePanel('right') },
      { id: 'sep4', separator: true },
      {
        id: 'dbtype',
        label: t('MenuDbType'),
        icon: <Icons.Database />,
        submenu: DB_TARGET_TYPES.map((db) => ({
          id: `db-${db}`,
          label: getDbDisplayName(db),
          icon: <DbTypeIcon db={db} />,
          checked: schema.TargetDb === db,
          onSelect: () => setTargetDb(db),
        })),
      },
      { id: 'theme', label: t('MenuTheme'), icon: <Icons.Palette />, submenu: themeItems },
      { id: 'language', label: t('SettingsLabelLanguage').replace(':', ''), icon: <Icons.Language />, submenu: languageItems },
    ],
    [t, zoomIn, zoomOut, fitAll, resetZoom, doAutoArrange, mutate, prefs, setPrefs, toggleGrid, toggleRulers, toggleBridges,
     rightPanelVisible, panels.bottom, togglePanel, schema.TargetDb, setTargetDb, themeItems, languageItems],
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
      {
        id: 'report',
        label: t('MenuWriteReport'),
        icon: <Icons.Report />,
        submenu: analysisReportItems,
      },
    ],
    [t, issues.length, setStatus, analysisReportItems],
  );

  const helpMenu = useMemo<MenuItem[]>(
    () => [
      { id: 'guide', label: t('MenuUserGuide'), icon: <Icons.Book />, shortcut: 'F1', onSelect: () => openDoc('guide') },
      { id: 'tutorial', label: t('MenuTutorial'), icon: <Icons.Tutorial />, onSelect: () => openDoc('tutorial') },
      { id: 'start', label: t('MenuStartScreen'), icon: <Icons.Home />, onSelect: () => setStartOn(true) },
      { id: 'sep1', separator: true },
      { id: 'about', label: t('BtnAbout'), icon: <Icons.About />, onSelect: () => setModal({ kind: 'about' }) },
    ],
    [t, openDoc],
  );

  // ── Canvas context menu ────────────────────────────────────────────────────

  const handleCanvasContextMenu = useCallback(
    (request: CanvasContextMenuRequest) => {
      const items: MenuItem[] = [];
      const { table, columnIndex, relationship, canvasPoint } = request;

      const selectedIds = selectionRef.current.tableIds;

      // Undo and redo lead, as they do in every other context menu: they are
      // what someone reaches for right after a mistake, wherever they clicked.
      items.push(
        { id: 'ctx-undo', label: t('MenuUndo'), icon: <Icons.Undo />, shortcut: 'Ctrl+Z', disabled: !canUndo, onSelect: undo },
        { id: 'ctx-redo', label: t('MenuRedo'), icon: <Icons.Redo />, shortcut: 'Ctrl+Y', disabled: !canRedo, onSelect: redo },
        { id: 'ctx-sep-edit', separator: true },
      );

      if (table) {
        // Right-clicking inside an existing multi-selection keeps it, so the
        // menu can act on the whole group.
        if (!selectedIds.includes(table.Id)) {
          selectTable(table.Id, columnIndex >= 0 ? table.Columns[columnIndex].Id : null);
        }
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
            label:
              selectedIds.length > 1 && selectedIds.includes(table.Id)
                ? t('CmDeleteTables', selectedIds.length)
                : t('CmDeleteTable'),
            icon: <Icons.Delete />,
            onSelect: () => {
              const ids =
                selectedIds.length > 1 && selectedIds.includes(table.Id) ? selectedIds : [table.Id];
              setModal({
                kind: 'confirm',
                title: t('MsgDeleteTableTitle'),
                intent: 'delete',
                message:
                  ids.length > 1 ? t('MsgDeleteTables', ids.length) : t('MsgDeleteTable', table.Name),
                onConfirm: () => {
                  mutate((draft) => {
                    for (const id of ids) removeTable(draft, id);
                  });
                  clearSelection();
                  closeModal();
                },
              });
            },
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
              icon: <Icons.Relation />,
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
              icon: <LineStyleIcon style={style} />,
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

      items.push(
        { id: 'ctx-sep-out', separator: true },
        {
          id: 'ctx-export-image',
          label: t('CmExportDiagram'),
          icon: <Icons.Image />,
          disabled: schema.Tables.length === 0,
          submenu: diagramImageItems,
        },
        {
          id: 'ctx-report',
          label: t('MenuWriteReport'),
          icon: <Icons.Report />,
          submenu: analysisReportItems,
        },
      );

      setContextMenu({ x: request.screenX, y: request.screenY, items });
    },
    [t, selectTable, selectRelationship, clearSelection, mutate, closeModal, addTable,
     addRelationship, schema.Tables.length, fitAll, zoomIn, zoomOut, resetZoom,
     diagramImageItems, analysisReportItems, canUndo, canRedo, undo, redo],
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
          offsetX: (bounds.x + bounds.w / 2) * v.zoom - (area.clientWidth - (prefsRef.current.ShowRulers ? RULER_SIZE : 0)) / 2,
          offsetY: (bounds.y + bounds.h / 2) * v.zoom - (area.clientHeight - (prefsRef.current.ShowRulers ? RULER_SIZE : 0)) / 2,
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

  // ── Bottom panel data ──────────────────────────────────────────────────────

  const problemRows = useMemo<ProblemRow[]>(
    () => [
      ...issues.map((issue) => ({
        severity: issue.Severity,
        where: issue.AffectedColumns ? `${issue.Table}.${issue.AffectedColumns}` : issue.Table,
        message: issue.Message,
        onSelect: () => focusIssue(issue),
      })),
      ...indexSuggestions
        .filter((s) => s.Kind === 'Required')
        .map((s) => ({
          severity: 'Info' as const,
          where: `${s.Table}.${s.Column}`,
          message: `${t('TabIndexAdvisor')}: ${s.Reason}`,
          onSelect: () => focusSuggestion(s),
        })),
    ],
    [issues, indexSuggestions, focusIssue, focusSuggestion, t],
  );

  const infoRows = useMemo<[string, string][]>(() => {
    const columns = schema.Tables.reduce((n, tb) => n + tb.Columns.length, 0);
    return [
      [t('InfoSchema'), schema.Name],
      [t('InfoDatabase'), getDbDisplayName(schema.TargetDb)],
      [t('InfoPath'), currentPath ?? t('InfoNotSaved')],
      [t('InfoTables'), String(schema.Tables.length)],
      [t('InfoColumns'), String(columns)],
      [t('InfoRelationships'), String(schema.Relationships.length)],
      [t('InfoTabs'), String(documents.length)],
      [t('InfoTheme'), getThemeName(prefs.Theme, prefs.Language)],
      [t('InfoZoom'), `${Math.round(viewport.zoom * 100)}%`],
      [t('InfoVersion'), APP_TITLE],
    ];
  }, [schema, currentPath, documents.length, prefs.Theme, prefs.Language, viewport.zoom, t]);

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
    <div className={`app ${host.kind === 'desktop' ? 'desktop' : 'web'}`}>
      {/* No separate title bar: the menu bar carries the app's name on the left and
          the window buttons on the right, and its empty middle moves the window. */}
      <div className="menubar" onDoubleClick={(e) => {
        if ((e.target as HTMLElement).closest('button, select, input, .menubar-item, .theme-dropdown')) return;
        host.toggleMaximize?.();
      }}>
        <div className="brand" title={`${APP_TITLE} — ${startOn ? t('StartTitle') : currentPath ?? schema.Name}${!startOn && isDirty ? ' ●' : ''}`}>
          <img src={appIcon} alt="" draggable={false} />
          <span className="brand-name">MyDBTools</span>
          <span className="brand-version">v{APP_VERSION}</span>
          {!startOn && isDirty && <em className="title-dirty" aria-label={t('UnsavedMarker')}>●</em>}
        </div>
        <button
          type="button"
          className={`start-toggle ${startOn ? 'active' : ''}`}
          data-action="home"
          title={t('MenuStartScreen')}
          aria-pressed={!!startOn}
          onClick={() => setStartOn((on) => !on)}
        >
          <Icons.Home />
          <span>{t('HomeButton')}</span>
        </button>
        <MenuBarItem label={t('MenuFile')} icon={<Icons.Doc />} items={fileMenu} />
        <MenuBarItem label={t('MenuEdit')} icon={<Icons.Edit />} items={editMenu} />
        <MenuBarItem label={t('MenuView')} icon={<Icons.FitAll />} items={viewMenu} />
        <MenuBarItem label={t('MenuAnalyze')} icon={<Icons.Analyze />} items={analyzeMenu} />
        <MenuBarItem label={t('MenuAbout')} icon={<Icons.Help />} items={helpMenu} />
        <span className="menu-spacer" />
        <ThemeDropdown
          theme={prefs.Theme}
          language={prefs.Language}
          onPick={setTheme}
          onNext={cycleTheme}
          onSettings={() => setModal({ kind: 'themes' })}
        />
        <button
          className="tb"
          data-action="toggle-language"
          title={`${t('TtToggleLanguage')} — ${prefs.Language === 'ko' ? 'English' : '한국어'}`}
          onClick={toggleLanguage}
        >
          {/* The flag of the language this button switches *to*. */}
          {prefs.Language === 'ko' ? <Icons.FlagEn /> : <Icons.FlagKo />}
        </button>
        <button className="tb" data-action="settings" title={t('TtSettings')} onClick={() => setModal({ kind: 'preferences' })}>
          <Icons.Settings />
        </button>
        <button className="tb" data-action="about" title={t('TtAbout')} onClick={() => setModal({ kind: 'about' })}>
          <Icons.About />
        </button>
        {host.kind === 'desktop' && (
          <div className="window-controls">
            <button type="button" title={t('WindowMinimize')} aria-label={t('WindowMinimize')} onClick={() => host.minimize?.()}>
              <Icons.Minimize />
            </button>
            <button
              type="button"
              title={maximized ? t('WindowRestore') : t('WindowMaximize')}
              aria-label={maximized ? t('WindowRestore') : t('WindowMaximize')}
              onClick={() => host.toggleMaximize?.()}
            >
              <Icons.Maximize />
            </button>
            <button type="button" className="window-close" title={t('WindowClose')} aria-label={t('WindowClose')} onClick={() => host.close?.()}>
              <Icons.Close />
            </button>
          </div>
        )}
      </div>

      <div className="toolbar" ref={toolbarRef}>
        <button className="tb" title={t('TtNew')} onClick={newProject}><Icons.New /></button>
        <button className="tb" title={t('TtOpen')} onClick={() => withUnsavedCheck(() => void files.openProject())}><Icons.Open /></button>
        <button className="tb" title={t('TtOpenDb')} onClick={() => withUnsavedCheck(() => void files.openDatabase())}><Icons.Database /></button>
        <button className="tb" title={t('TtSave')} onClick={() => void files.save()}><Icons.Save /></button>
        <button className="tb" title={t('TtSaveAs')} onClick={() => void files.saveAs()}><Icons.SaveAs /></button>
        <button className="tb" data-action="print" title={t('TtPrint')} onClick={() => setPrintOpen(true)}>
          <Icons.Print />
        </button>
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
          label={
            <>
              <LineStyleIcon style={prefs.DefaultLineStyle} />
              <span className="tb-fixed-label tb-fixed-line">{lineStyleLabel}</span>
            </>
          }
          items={(
            [
              ['Straight', t('LineStyleStraight')],
              ['Curved', t('LineStyleCurved')],
              ['Orthogonal', t('LineStyleOrthogonal')],
            ] as const
          ).map(([style, label]) => ({
            id: `ls-${style}`,
            label,
            icon: <LineStyleIcon style={style} />,
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
          className={`tb ${prefs.ShowRulers ? 'active' : ''}`}
          data-action="toggle-rulers"
          title={t('TtToggleRulers')}
          aria-pressed={prefs.ShowRulers}
          onClick={toggleRulers}
        >
          <Icons.Ruler />
        </button>
        <button
          className={`tb ${prefs.LineBridges ? 'active' : ''}`}
          data-action="toggle-bridges"
          title={t('TtToggleBridges')}
          aria-pressed={prefs.LineBridges}
          onClick={toggleBridges}
        >
          <Icons.Bridge />
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
        <Dropdown
          className="tb-dropdown"
          title={t('TtReport')}
          label={<Icons.Report />}
          items={analysisReportItems}
        />
        <span className="tb-sep" />
        <Dropdown
          className="tb-dropdown"
          title={t('TtDbTypeSelector')}
          label={
            <>
              <DbTypeIcon db={schema.TargetDb} />
              <span className="tb-fixed-label tb-fixed-db">{getDbDisplayName(schema.TargetDb)}</span>
            </>
          }
          items={DB_TARGET_TYPES.map((db) => ({
            id: `tb-db-${db}`,
            label: getDbDisplayName(db),
            icon: <DbTypeIcon db={db} />,
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
        <span className="tb-sep" />
        {/* Everything above is left-aligned; the group below sits on the right. */}
        <span className="tb-spacer" />
        {(
          [
            ['bottom', <Icons.PanelBottom key="b" />, t('PanelToggleBottom')],
            ['right', <Icons.Panel key="r" />, t('PanelToggleRight')],
          ] as const
        ).map(([side, icon, label]) => (
          <button
            key={side}
            className={`tb ${panels[side] ? 'active' : ''}`}
            data-action={`toggle-${side}-panel`}
            title={label}
            aria-pressed={panels[side]}
            onClick={() => togglePanel(side)}
          >
            {icon}
          </button>
        ))}
      </div>

      <div className="workspace">
      {startOn && (
        <StartScreen
          language={prefs.Language}
          theme={prefs.Theme}
          recentFiles={host.kind === 'desktop' ? recentFiles : []}
          showOnStart={prefs.ShowStartScreen}
          background={prefs.StartBackground}
          layout={prefs.StartLayout}
          onBackgroundChange={(next) => patchPrefs({ StartBackground: next })}
          onLayoutChange={(next) => patchPrefs({ StartLayout: next })}
          onShowOnStartChange={(on) => patchPrefs({ ShowStartScreen: on })}
          onNew={newProject}
          onOpenProject={() => withUnsavedCheck(() => void files.openProject())}
          onOpenDatabase={() => withUnsavedCheck(() => void files.openDatabase())}
          onOpenWorkspace={() => withUnsavedCheck(() => void files.openWorkspace())}
          onOpenRecent={(path) => void files.openPath(path)}
          onOpenSample={openSample}
          onUserGuide={() => openDoc('guide')}
          onTutorial={() => openDoc('tutorial')}
          onThemes={() => setModal({ kind: 'themes' })}
          onClose={() => setStartOn(false)}
        />
      )}

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

        <div className="center-column">
          {/* The tabs belong to the canvas: they sit between the side panels, which
              start right under the toolbar. */}
          <DocumentTabs
            documents={documents}
            activeId={documentId}
            onSelect={switchDocument}
            onClose={closeTab}
            onNew={newProject}
          />

        <div className="canvas-area" ref={canvasAreaRef}>
          <DiagramCanvas
            schema={schema}
            theme={prefs.Theme}
            backdrop={prefs.CanvasBackdrop}
            showRulers={prefs.ShowRulers}
            lineBridges={prefs.LineBridges}
            tool={tool}
            zoom={viewport.zoom}
            offsetX={viewport.offsetX}
            offsetY={viewport.offsetY}
            showGrid={prefs.ShowGrid}
            snapToGrid={prefs.SnapToGrid}
            snapInterval={prefs.SnapInterval}
            defaultLineStyle={prefs.DefaultLineStyle}
            selectedTableId={selection.tableId}
            selectedTableIds={selection.tableIds}
            onToggleTable={toggleTableSelection}
            onSelectTables={selectTables}
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
        {panels.bottom && (
          <Splitter
            axis="y"
            direction={-1}
            value={panels.bottomHeight}
            min={90}
            max={Math.max(160, Math.round(window.innerHeight * 0.6))}
            label={t('PanelResize')}
            onChange={(v) => setPanels((p: typeof panels) => ({ ...p, bottomHeight: v }))}
          />
        )}
        <Panel
          side="bottom"
          id="output"
          icon={<Icons.Report />}
          title={t('PanelOutput')}
          open={panels.bottom}
          onToggle={() => togglePanel('bottom')}
          size={panels.bottomHeight}
        >
          <BottomPanelBody
            tab={bottomTab}
            onTab={setBottomTab}
            problems={problemRows}
            log={log}
            info={infoRows}
            onClearLog={() => setLog([])}
            onCopy={(text) => {
              void navigator.clipboard?.writeText(text).then(() => setStatus(t('BottomCopied')));
            }}
          />
        </Panel>
        </div>

        {rightPanelVisible && (
          <Splitter
            axis="x"
            direction={-1}
            value={rightWidth ?? prefs.RightPanelWidth}
            min={260}
            max={720}
            label={t('PanelResize')}
            onChange={setRightWidth}
            onCommit={(v) => {
              setRightWidth(null);
              patchPrefs({ RightPanelWidth: v });
            }}
          />
        )}
        <Panel
          side="right"
          id="schema"
          icon={<Icons.Database />}
          title={t('PanelSchema')}
          open={rightPanelVisible}
          onToggle={() => togglePanel('right')}
          size={rightWidth ?? prefs.RightPanelWidth}
        >
          <div className="right-panel">
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
        </Panel>
      </div>
      </div>

      <div className="statusbar">
        <span className="status-schema">
          {t('StatusSchema', schema.Name, getDbDisplayName(schema.TargetDb), schema.Tables.length, schema.Relationships.length)}
        </span>
        <span className="spacer" />
        {isDirty && <span className="status-dirty">● {t('UnsavedMarker')}</span>}
        <span className="status-message">{status || t('StatusReady')}</span>
        <ResizeGrip />
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={closeContextMenu}
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
          onOpenThemes={() => setModal({ kind: 'themes' })}
          onClose={closeModal}
          onSave={(next) => {
            setPrefs(next);
            closeModal();
          }}
        />
      )}

      {modal.kind === 'themes' && <ThemeDialog prefs={prefs} onChange={patchPrefs} onClose={closeModal} />}
      {printOpen && (
        <PrintWindow
          schema={schema}
          projectPath={currentPath}
          theme={prefs.Theme}
          levels={prefs.NormalizationLevels}
          report={prefs.Report}
          onStatus={setStatus}
          onClose={() => setPrintOpen(false)}
        />
      )}
      {modal.kind === 'about' && (
        <AboutDialog
          onClose={closeModal}
          onUserGuide={() => {
            closeModal();
            openDoc('guide');
          }}
        />
      )}
      {modal.kind === 'notice' && <NoticeDialog message={modal.message} onClose={closeModal} />}
      {modal.kind === 'done' && (
        <DoneDialog message={modal.message} detail={modal.detail} onClose={closeModal} />
      )}
      {modal.kind === 'pick-schema' && (
        <SchemaPickerDialog
          title={modal.title}
          documents={documents}
          activeId={documentId}
          onPick={modal.onPick}
          onClose={closeModal}
        />
      )}
      {modal.kind === 'error' && (
        <ErrorDialog message={modal.message} details={modal.details} onClose={closeModal} />
      )}
      {modal.kind === 'confirm' && (
        <ConfirmDialog
          title={modal.title}
          message={modal.message}
          confirmLabel={modal.confirmLabel}
          discardLabel={modal.discardLabel}
          intent={modal.intent}
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

/** The three relationship line styles, drawn as what they look like. */
function LineStyleIcon({ style }: { style: RelationshipLineStyle }) {
  const d =
    style === 'Straight' ? 'M4 19L20 5' : style === 'Curved' ? 'M4 19C4 8 20 16 20 5' : 'M4 19v-7h16V5';
  return (
    <svg className="ic ic-relation" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
      <circle cx="4" cy="19" r="1.8" fill="currentColor" />
      <circle cx="20" cy="5" r="1.8" fill="currentColor" />
    </svg>
  );
}

/** A database cylinder in the colour the target database's table headers use. */
function DbTypeIcon({ db }: { db: DbTargetType }) {
  const color = getHeaderColor(db);
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4.5 5.5v13c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-13" fill={color} />
      <ellipse cx="12" cy="5.5" rx="7.5" ry="3" fill={color} />
      <ellipse cx="12" cy="5.5" rx="7.5" ry="3" fill="#ffffff" opacity="0.35" />
      <path d="M4.5 12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3" fill="none" stroke="#ffffff" strokeOpacity="0.6" strokeWidth="1.2" />
    </svg>
  );
}
