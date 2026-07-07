import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useProject } from './ProjectContext.jsx';
import {
  applyRedo,
  applyUndo,
  createHistoryStacks,
  pushHistory,
} from '../lib/requirementUndoActions.js';

const UndoHistoryContext = createContext(null);

function isEditableTarget(target) {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

export function UndoHistoryProvider({ children }) {
  const { activeProject, canEditProject } = useProject();
  const projectId = activeProject?.id ?? null;
  const stacksRef = useRef(createHistoryStacks());
  const listenersRef = useRef(new Set());
  const [revision, setRevision] = useState(0);

  const notify = useCallback(() => {
    setRevision((value) => value + 1);
    listenersRef.current.forEach((listener) => listener());
  }, []);

  useEffect(() => {
    stacksRef.current = createHistoryStacks();
    notify();
  }, [projectId, notify]);

  const push = useCallback((action) => {
    if (!canEditProject || !projectId) return;
    pushHistory(stacksRef.current, { ...action, projectId: action.projectId ?? projectId });
    notify();
  }, [canEditProject, projectId, notify]);

  const undo = useCallback(async () => {
    const stacks = stacksRef.current;
    const action = stacks.undo.pop();
    if (!action) return false;

    try {
      await applyUndo(action);
      stacks.redo.push(action);
      notify();
      return true;
    } catch (err) {
      stacks.undo.push(action);
      throw err;
    }
  }, [notify]);

  const redo = useCallback(async () => {
    const stacks = stacksRef.current;
    const action = stacks.redo.pop();
    if (!action) return false;

    try {
      await applyRedo(action);
      stacks.undo.push(action);
      notify();
      return true;
    } catch (err) {
      stacks.redo.push(action);
      throw err;
    }
  }, [notify]);

  const subscribe = useCallback((listener) => {
    listenersRef.current.add(listener);
    return () => listenersRef.current.delete(listener);
  }, []);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (isEditableTarget(event.target)) return;

      const mod = event.ctrlKey || event.metaKey;
      if (!mod) return;

      if (event.key.toLowerCase() === 'z' && !event.shiftKey) {
        event.preventDefault();
        void undo();
        return;
      }

      if (event.key.toLowerCase() === 'y' || (event.key.toLowerCase() === 'z' && event.shiftKey)) {
        event.preventDefault();
        void redo();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undo, redo]);

  const canUndo = stacksRef.current.undo.length > 0;
  const canRedo = stacksRef.current.redo.length > 0;

  const value = useMemo(() => ({
    push,
    undo,
    redo,
    canUndo,
    canRedo,
    subscribe,
    revision,
  }), [push, undo, redo, canUndo, canRedo, subscribe, revision]);

  return (
    <UndoHistoryContext.Provider value={value}>
      {children}
    </UndoHistoryContext.Provider>
  );
}

export function useUndoHistory() {
  const context = useContext(UndoHistoryContext);
  if (!context) {
    throw new Error('useUndoHistory must be used within UndoHistoryProvider');
  }
  return context;
}
