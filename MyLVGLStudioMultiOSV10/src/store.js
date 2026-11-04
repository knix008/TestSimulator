// The open project with its undo history. Every change works on a copy, so an entry in the
// history is simply the whole project as it was.
import { useCallback, useRef, useState } from "react";
import { newProject } from "./lvgl/project.js";

const HISTORY_LIMIT = 200;

export function useProjectStore() {
  const [project, setProject] = useState(() => newProject());
  const [, setRevision] = useState(0);
  const history = useRef({ past: [], future: [], coalesce: null, gesture: null, saved: null });
  const current = useRef(project);
  if (history.current.saved === null) history.current.saved = project;

  const publish = useCallback((next) => {
    current.current = next;
    setProject(next);
    setRevision((value) => value + 1);
  }, []);

  /**
   * Changes the project: `change` receives a draft. Consecutive edits with the same
   * `coalesce` key (typing in one field) become one undo step.
   */
  const update = useCallback((change, { coalesce = null } = {}) => {
    const h = history.current;
    const before = current.current;
    const draft = structuredClone(before);
    const result = change(draft);
    if (result === false) return;
    if (!h.gesture && !(coalesce && h.coalesce === coalesce)) {
      h.past.push(before);
      if (h.past.length > HISTORY_LIMIT) h.past.shift();
    }
    if (!h.gesture) h.future = [];
    h.coalesce = coalesce;
    publish(draft);
  }, [publish]);

  /** While a gesture (a drag) lasts, its many updates count as one undo step. */
  const beginGesture = useCallback(() => {
    history.current.gesture = { before: current.current, changed: false };
  }, []);

  const endGesture = useCallback(() => {
    const h = history.current;
    const gesture = h.gesture;
    h.gesture = null;
    h.coalesce = null;
    if (gesture && gesture.before !== current.current) {
      h.past.push(gesture.before);
      h.future = [];
      setRevision((value) => value + 1);
    }
  }, []);

  const undo = useCallback(() => {
    const h = history.current;
    if (!h.past.length) return;
    h.future.push(current.current);
    h.coalesce = null;
    publish(h.past.pop());
  }, [publish]);

  const redo = useCallback(() => {
    const h = history.current;
    if (!h.future.length) return;
    h.past.push(current.current);
    h.coalesce = null;
    publish(h.future.pop());
  }, [publish]);

  /** A different document: a new history. */
  const replace = useCallback((next) => {
    history.current = { past: [], future: [], coalesce: null, gesture: null, saved: next };
    publish(next);
  }, [publish]);

  const markSaved = useCallback(() => {
    history.current.saved = current.current;
    setRevision((value) => value + 1);
  }, []);

  return {
    project,
    get: () => current.current,
    update,
    beginGesture,
    endGesture,
    undo,
    redo,
    replace,
    markSaved,
    canUndo: history.current.past.length > 0,
    canRedo: history.current.future.length > 0,
    dirty: history.current.saved !== project,
  };
}
