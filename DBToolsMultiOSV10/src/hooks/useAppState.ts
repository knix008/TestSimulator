// Central editor state: schema, selection, viewport, undo/redo, dirty tracking.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DbColumn, DbRelationship, DbSchema, DbTable, ToolMode } from '../types';
import { analyzeLevels, type NormalizationIssue } from '../core/analysis/normalization';
import { analyzeIndexes, type IndexSuggestion } from '../core/analysis/indexAdvisor';
import { clamp, MAX_ZOOM, MIN_ZOOM } from '../core/geometry';
import { cloneSchema, ensureInitialized, newSchema } from '../core/schema';
import { areEquivalent } from '../core/serializer';
import { UndoRedoManager } from '../core/undoRedo';
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
  tableId: string | null;
  columnId: string | null;
  relationshipId: string | null;
}

export const EMPTY_SELECTION: Selection = { tableId: null, columnId: null, relationshipId: null };

export interface Viewport {
  zoom: number;
  offsetX: number;
  offsetY: number;
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
    setSelection({ tableId, columnId, relationshipId: null });
  }, []);

  const selectRelationship = useCallback((relationshipId: string | null) => {
    setSelection({ tableId: null, columnId: null, relationshipId });
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

    selection,
    setSelection,
    selectTable,
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
