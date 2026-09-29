// Snapshot-based undo/redo for the document workspace.
//
// The workspace (annotations, clipped text/images, bookmarks, rotation) is a
// small plain object, so keeping whole snapshots is simpler — and far less
// bug-prone — than paired do/undo commands, and it makes "Undo: Highlight" style
// labels fall out for free.
import { useCallback, useMemo, useRef, useState } from 'react';

export const HISTORY_LIMIT = 100;
const LIMIT = HISTORY_LIMIT;

export function historyList(past) {
  return (Array.isArray(past) ? past : []).map((entry, index) => ({
    index,
    label: String(entry?.label || ''),
  })).reverse();
}

export function jumpPastStacks(past, future, current, index) {
  const stack = Array.isArray(past) ? past.slice() : [];
  const redo = Array.isArray(future) ? future.slice() : [];
  if (!(index >= 0 && index < stack.length)) {
    return { past: stack, future: redo, state: current };
  }
  const rest = stack.slice(index);
  const undone = rest.map((entry, i) => ({
    state: i + 1 < rest.length ? rest[i + 1].state : current,
    label: entry.label,
  }));
  return {
    past: stack.slice(0, index),
    future: [...undone, ...redo].slice(-HISTORY_LIMIT),
    state: rest[0].state,
  };
}

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

  const exportSnapshot = useCallback(() => ({
    state,
    past: past.current.slice(),
    future: future.current.slice(),
  }), [state]);

  const restoreSnapshot = useCallback((snap) => {
    past.current = Array.isArray(snap?.past) ? snap.past.slice() : [];
    future.current = Array.isArray(snap?.future) ? snap.future.slice() : [];
    setState(snap?.state ?? EMPTY_WORKSPACE);
    rerender();
  }, [rerender]);

  const jumpToPast = useCallback((index) => {
    setState((current) => {
      const next = jumpPastStacks(past.current, future.current, current, index);
      past.current = next.past;
      future.current = next.future;
      return next.state;
    });
    rerender();
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
    jumpToPast,
    exportSnapshot,
    restoreSnapshot,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
    undoLabel: past.current.length ? past.current[past.current.length - 1].label : '',
    redoLabel: future.current.length ? future.current[future.current.length - 1].label : '',
    depth: past.current.length,
    pastEntries: past.current.slice(),
    futureEntries: future.current.slice(),
  }), [state, commit, reset, undo, redo, jumpToPast, exportSnapshot, restoreSnapshot]);
}

export function newId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
