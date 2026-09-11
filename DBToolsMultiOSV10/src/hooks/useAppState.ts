// Central editor state: schema, selection, viewport, undo/redo, dirty tracking.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DbColumn, DbRelationship, DbSchema, DbTable, ToolMode } from '../types';
import { analyzeLevels, type NormalizationIssue } from '../core/analysis/normalization';
import { analyzeIndexes, type IndexSuggestion } from '../core/analysis/indexAdvisor';
import { clamp, MAX_ZOOM, MIN_ZOOM } from '../core/geometry';
import { cloneSchema, ensureInitialized, newSchema } from '../core/schema';
import { areEquivalent } from '../core/serializer';
import { EMPTY_HISTORY, UndoRedoManager, type UndoRedoSnapshot } from '../core/undoRedo';
import {
  DEFAULT_PREFERENCES,
  loadPreferences,
  loadRecentFiles,
  savePreferences,
  type UserPreferences,
} from '../core/settings';
import { setLanguage } from '../i18n';
import { applyPaletteToDocument } from '../render/theme';

export interface Selection {
  /**
   * The table the side panels follow — the last one clicked. It is always the
   * final entry of `tableIds`, so single-selection code needs no special case.
   */
  tableId: string | null;
  columnId: string | null;
  relationshipId: string | null;
  /** Every selected table, for moving or deleting several at once. */
  tableIds: string[];
}

export const EMPTY_SELECTION: Selection = {
  tableId: null,
  columnId: null,
  relationshipId: null,
  tableIds: [],
};

export interface Viewport {
  zoom: number;
  offsetX: number;
  offsetY: number;
}

/**
 * One open schema.
 *
 * Only the active document's state lives in React state; the rest are parked
 * here as plain values. Switching tabs writes the live state back into the
 * document being left and loads the one being entered, which keeps every
 * existing piece of editor code working on "the schema" with no idea that
 * others exist.
 */
export interface SchemaDocument {
  id: string;
  schema: DbSchema;
  path: string | null;
  /** What the document looked like when it was last saved. */
  saved: DbSchema;
  selection: Selection;
  viewport: Viewport;
  tool: ToolMode;
  history: UndoRedoSnapshot;
}

/** The name shown on a tab: the file name if it has one, else the schema name. */
export function documentLabel(document: SchemaDocument): string {
  if (document.path) {
    const base = document.path.split(/[\\/]/).pop() ?? document.path;
    return base;
  }
  return document.schema.Name || '(\uc774\ub984 \uc5c6\uc74c)';
}

let documentSequence = 0;
function nextDocumentId(): string {
  documentSequence += 1;
  return `doc-${documentSequence}`;
}

export function useAppState(newProjectName: string) {
  const [schema, setSchemaState] = useState<DbSchema>(() => newSchema(newProjectName));
  const [selection, setSelection] = useState<Selection>(EMPTY_SELECTION);
  const [tool, setTool] = useState<ToolMode>('Select');
  const [viewport, setViewport] = useState<Viewport>({ zoom: 1, offsetX: 0, offsetY: 0 });
  const [prefs, setPrefsState] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [recentFiles, setRecentFiles] = useState<string[]>([]);
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [undoVersion, setUndoVersion] = useState(0);

  const undoRedo = useRef(new UndoRedoManager()).current;
  /** Snapshot the document was last saved at; drives the dirty marker. */
  const savedSnapshot = useRef<DbSchema>(cloneSchema(schema));

  const isDirty = useMemo(
    () => !areEquivalent(savedSnapshot.current, schema),
    [schema],
  );

  // ── Open documents ─────────────────────────────────────────────────────────

  const [documentId, setDocumentId] = useState<string>(nextDocumentId);
  /** Every document *except* the active one, whose state is the live state. */
  const [parked, setParked] = useState<SchemaDocument[]>([]);
  /** Tab order, including the active document. */
  const [documentOrder, setDocumentOrder] = useState<string[]>(() => [documentId]);

  // ── Settings ───────────────────────────────────────────────────────────────

  useEffect(() => {
    void (async () => {
      const loaded = await loadPreferences();
      setPrefsState(loaded);
      setLanguage(loaded.Language);
      applyPaletteToDocument(loaded.Theme);
      setRecentFiles(await loadRecentFiles());
      setPrefsLoaded(true);
      setSchemaState((prev) =>
        prev.Tables.length === 0 ? { ...prev, TargetDb: loaded.DefaultDbType } : prev,
      );
    })();
  }, []);

  const setPrefs = useCallback((next: UserPreferences) => {
    setPrefsState(next);
    setLanguage(next.Language);
    applyPaletteToDocument(next.Theme);
    void savePreferences(next);
  }, []);

  // ── Schema mutation ────────────────────────────────────────────────────────

  /** Apply a mutation to a copy of the schema, pushing an undo snapshot first. */
  const mutate = useCallback(
    (mutator: (draft: DbSchema) => void, options: { undo?: boolean } = {}) => {
      setSchemaState((prev) => {
        if (options.undo !== false) undoRedo.push(cloneSchema(prev));
        const draft = cloneSchema(prev);
        mutator(draft);
        ensureInitialized(draft);
        return draft;
      });
      if (options.undo !== false) setUndoVersion((v) => v + 1);
    },
    [undoRedo],
  );

  /** Replace the whole document (new / open / import). Clears history. */
  const loadSchema = useCallback(
    (next: DbSchema, path: string | null) => {
      ensureInitialized(next);
      undoRedo.clear();
      savedSnapshot.current = cloneSchema(next);
      setSchemaState(next);
      setCurrentPath(path);
      setSelection(EMPTY_SELECTION);
      setTool('Select');
      setUndoVersion((v) => v + 1);
    },
    [undoRedo],
  );

  const markSaved = useCallback(
    (path: string | null) => {
      savedSnapshot.current = cloneSchema(schema);
      if (path) setCurrentPath(path);
      // Recompute isDirty by nudging the schema identity without changing content.
      setSchemaState((prev) => ({ ...prev }));
    },
    [schema],
  );


  // ── Tabs ───────────────────────────────────────────────────────────────────

  /** The live state, packaged as a document. */
  const captureActive = useCallback(
    (): SchemaDocument => ({
      id: documentId,
      schema,
      path: currentPath,
      saved: savedSnapshot.current,
      selection,
      viewport,
      tool,
      history: undoRedo.capture(),
    }),
    [documentId, schema, currentPath, selection, viewport, tool, undoRedo],
  );

  /** Make `document` the live state. The caller must have parked the old one. */
  const activate = useCallback(
    (document: SchemaDocument) => {
      undoRedo.restore(document.history);
      savedSnapshot.current = document.saved;
      setDocumentId(document.id);
      setSchemaState(document.schema);
      setCurrentPath(document.path);
      setSelection(document.selection);
      setViewport(document.viewport);
      setTool(document.tool);
      setUndoVersion((v) => v + 1);
    },
    [undoRedo],
  );

  const switchDocument = useCallback(
    (id: string) => {
      if (id === documentId) return;
      const target = parked.find((d) => d.id === id);
      if (!target) return;
      const leaving = captureActive();
      setParked((current) => [...current.filter((d) => d.id !== id), leaving]);
      activate(target);
    },
    [documentId, parked, captureActive, activate],
  );

  /**
   * Open a schema in a tab of its own. Used by New, Open and every import —
   * none of them disturb what is already open.
   */
  const openDocument = useCallback(
    (next: DbSchema, path: string | null) => {
      ensureInitialized(next);

      // An untouched, empty, unsaved document is a scratch tab nobody chose to
      // have. Opening into it rather than beside it keeps the row honest.
      const scratch =
        !currentPath && schema.Tables.length === 0 && areEquivalent(savedSnapshot.current, schema);
      if (scratch) {
        undoRedo.clear();
        savedSnapshot.current = cloneSchema(next);
        setSchemaState(next);
        setCurrentPath(path);
        setSelection(EMPTY_SELECTION);
        setViewport({ zoom: 1, offsetX: 0, offsetY: 0 });
        setTool('Select');
        setUndoVersion((v) => v + 1);
        return documentId;
      }

      const leaving = captureActive();
      setParked((current) => [...current, leaving]);
      const document: SchemaDocument = {
        id: nextDocumentId(),
        schema: next,
        path,
        saved: cloneSchema(next),
        selection: EMPTY_SELECTION,
        viewport: { zoom: 1, offsetX: 0, offsetY: 0 },
        tool: 'Select',
        history: EMPTY_HISTORY,
      };
      setDocumentOrder((order) => [...order, document.id]);
      activate(document);
      return document.id;
    },
    [captureActive, activate, currentPath, schema, documentId, undoRedo],
  );

  /**
   * Close a tab. Returns false when it was the only one — the caller then knows
   * nothing happened and can decide whether to close the window instead.
   */
  const closeDocument = useCallback(
    (id: string): boolean => {
      if (documentOrder.length <= 1) return false;
      const remaining = documentOrder.filter((docId) => docId !== id);
      setDocumentOrder(remaining);

      if (id !== documentId) {
        setParked((current) => current.filter((d) => d.id !== id));
        return true;
      }

      // Closing the active tab: step to the neighbour on the right, or the last
      // one if this was the rightmost — what every tabbed editor does.
      const index = documentOrder.indexOf(id);
      const nextId = remaining[Math.min(index, remaining.length - 1)];
      const target = parked.find((d) => d.id === nextId);
      if (!target) return false;
      setParked((current) => current.filter((d) => d.id !== nextId));
      activate(target);
      return true;
    },
    [documentOrder, documentId, parked, activate],
  );

  /** Every open document in tab order, the active one carrying live state. */
  const documents = useMemo<SchemaDocument[]>(() => {
    const live = captureActive();
    const byId = new Map(parked.map((d) => [d.id, d]));
    byId.set(live.id, live);
    return documentOrder.map((id) => byId.get(id)).filter((d): d is SchemaDocument => !!d);
  }, [documentOrder, parked, captureActive]);

  /** True when any open document has unsaved changes — used when closing. */
  const anyDirty = useMemo(
    () => documents.some((d) => !areEquivalent(d.saved, d.schema)),
    [documents],
  );

  const undo = useCallback(() => {
    if (!undoRedo.canUndo) return;
    setSchemaState((prev) => undoRedo.undo(cloneSchema(prev)));
    setSelection(EMPTY_SELECTION);
    setUndoVersion((v) => v + 1);
  }, [undoRedo]);

  const redo = useCallback(() => {
    if (!undoRedo.canRedo) return;
    setSchemaState((prev) => undoRedo.redo(cloneSchema(prev)));
    setSelection(EMPTY_SELECTION);
    setUndoVersion((v) => v + 1);
  }, [undoRedo]);

  // ── Selection helpers ──────────────────────────────────────────────────────

  const selectTable = useCallback((tableId: string | null, columnId: string | null = null) => {
    setSelection({
      tableId,
      columnId,
      relationshipId: null,
      tableIds: tableId ? [tableId] : [],
    });
  }, []);

  /**
   * Ctrl/Shift-click: add the table to the selection, or drop it if it was
   * already in. The primary stays the last one still selected, so the property
   * panel keeps following something sensible.
   */
  const toggleTableSelection = useCallback((tableId: string) => {
    setSelection((current) => {
      const has = current.tableIds.includes(tableId);
      const tableIds = has
        ? current.tableIds.filter((id) => id !== tableId)
        : [...current.tableIds, tableId];
      const primary = tableIds.length > 0 ? tableIds[tableIds.length - 1] : null;
      return {
        tableId: primary,
        // The column selection belongs to a single table; it cannot survive a
        // change of primary.
        columnId: primary === current.tableId ? current.columnId : null,
        relationshipId: null,
        tableIds,
      };
    });
  }, []);

  /**
   * Select a set of tables in one go — what a rubber-band selection produces.
   * `additive` keeps whatever was already selected, which is what holding a
   * modifier through the drag implies.
   */
  const selectTables = useCallback((tableIds: string[], additive: boolean) => {
    setSelection((current) => {
      const merged = additive
        ? [...current.tableIds, ...tableIds.filter((id) => !current.tableIds.includes(id))]
        : [...new Set(tableIds)];
      const primary = merged.length > 0 ? merged[merged.length - 1] : null;
      return {
        tableId: primary,
        columnId: primary === current.tableId ? current.columnId : null,
        relationshipId: null,
        tableIds: merged,
      };
    });
  }, []);

  const selectRelationship = useCallback((relationshipId: string | null) => {
    setSelection({ tableId: null, columnId: null, relationshipId, tableIds: [] });
  }, []);

  const clearSelection = useCallback(() => setSelection(EMPTY_SELECTION), []);

  const selectedTable: DbTable | null = useMemo(
    () => schema.Tables.find((t) => t.Id === selection.tableId) ?? null,
    [schema, selection.tableId],
  );

  const selectedColumn: DbColumn | null = useMemo(
    () => selectedTable?.Columns.find((c) => c.Id === selection.columnId) ?? null,
    [selectedTable, selection.columnId],
  );

  const selectedRelationship: DbRelationship | null = useMemo(
    () => schema.Relationships.find((r) => r.Id === selection.relationshipId) ?? null,
    [schema, selection.relationshipId],
  );

  // ── Viewport ───────────────────────────────────────────────────────────────

  const setZoom = useCallback((zoom: number) => {
    setViewport((v) => ({ ...v, zoom: clamp(zoom, MIN_ZOOM, MAX_ZOOM) }));
  }, []);

  const zoomIn = useCallback(() => setZoom(viewport.zoom * 1.2), [setZoom, viewport.zoom]);
  const zoomOut = useCallback(() => setZoom(viewport.zoom / 1.2), [setZoom, viewport.zoom]);
  const resetZoom = useCallback(() => setZoom(1), [setZoom]);

  // ── Analysis (recomputed whenever the schema or selected levels change) ─────

  const issues: NormalizationIssue[] = useMemo(
    () => analyzeLevels(schema, prefs.NormalizationLevels),
    [schema, prefs.NormalizationLevels],
  );

  const indexSuggestions: IndexSuggestion[] = useMemo(() => analyzeIndexes(schema), [schema]);

  /** Column ids highlighted on the canvas by the current analysis selection. */
  const [highlightedColumnIds, setHighlightedColumnIds] = useState<Set<string>>(new Set());

  return {
    schema,
    setSchema: setSchemaState,
    mutate,
    loadSchema,
    markSaved,
    isDirty,
    currentPath,
    setCurrentPath,

    documents,
    documentId,
    switchDocument,
    openDocument,
    closeDocument,
    anyDirty,

    selection,
    setSelection,
    selectTable,
    toggleTableSelection,
    selectTables,
    selectRelationship,
    clearSelection,
    selectedTable,
    selectedColumn,
    selectedRelationship,

    tool,
    setTool,

    viewport,
    setViewport,
    setZoom,
    zoomIn,
    zoomOut,
    resetZoom,

    prefs,
    setPrefs,
    prefsLoaded,
    recentFiles,
    setRecentFiles,

    status,
    setStatus,

    undo,
    redo,
    canUndo: undoRedo.canUndo,
    canRedo: undoRedo.canRedo,
    undoVersion,

    issues,
    indexSuggestions,
    highlightedColumnIds,
    setHighlightedColumnIds,
  };
}

export type AppState = ReturnType<typeof useAppState>;
