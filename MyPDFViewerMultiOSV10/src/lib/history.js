// Snapshot-based undo/redo for the document workspace.
//
// The workspace (annotations, clipped text/images, bookmarks, rotation) is a
// small plain object, so keeping whole snapshots is simpler — and far less
// bug-prone — than paired do/undo commands, and it makes "Undo: Highlight" style
// labels fall out for free.
import { useCallback, useMemo, useRef, useState } from 'react';

export const HISTORY_LIMIT = 100;
const LIMIT = HISTORY_LIMIT;

export const EMPTY_WORKSPACE = {
  annotations: [],   // { id, page, kind: 'highlight'|'note', rect, color, text }
  clips: [],         // { id, kind: 'text'|'image', page, content, width, height, at }
  bookmarks: [],     // { id, page, label, y, rects? }
  attachments: [],   // { id, page, kind: 'fileattachment', name, data, mime, y }
  rotation: 0,
};

export function useHistory(initial = EMPTY_WORKSPACE) {
  const [state, setState] = useState(initial);
  const past = useRef([]);     // [{ state, label }]
  const future = useRef([]);
  const [, bump] = useState(0);
  const rerender = useCallback(() => bump((n) => n + 1), []);

  // Records the current state on the undo stack and replaces it with `next`.
  // `next` may be a value or an updater, exactly like setState.
  const commit = useCallback((next, label) => {
    setState((prev) => {
      const value = typeof next === 'function' ? next(prev) : next;
      if (value === prev) return prev;
      past.current = [...past.current, { state: prev, label }].slice(-LIMIT);
      future.current = [];
      return value;
    });
    rerender();
  }, [rerender]);

  // Replaces the state without touching the history (loading a document).
  const reset = useCallback((value) => {
    past.current = [];
    future.current = [];
    setState(value ?? EMPTY_WORKSPACE);
    rerender();
  }, [rerender]);

  const undo = useCallback(() => {
    if (!past.current.length) return null;
    const entry = past.current[past.current.length - 1];
    past.current = past.current.slice(0, -1);
    setState((prev) => {
      future.current = [...future.current, { state: prev, label: entry.label }].slice(-LIMIT);
      return entry.state;
    });
    rerender();
    return entry.label;
  }, [rerender]);

  const redo = useCallback(() => {
    if (!future.current.length) return null;
    const entry = future.current[future.current.length - 1];
    future.current = future.current.slice(0, -1);
    setState((prev) => {
      past.current = [...past.current, { state: prev, label: entry.label }].slice(-LIMIT);
      return entry.state;
    });
    rerender();
    return entry.label;
  }, [rerender]);

  return useMemo(() => ({
    state,
    commit,
    reset,
    undo,
    redo,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
    undoLabel: past.current.length ? past.current[past.current.length - 1].label : '',
    redoLabel: future.current.length ? future.current[future.current.length - 1].label : '',
    depth: past.current.length,
  }), [state, commit, reset, undo, redo]);
}

export function newId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
