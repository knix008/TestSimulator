// Unsaved-change tracking for the save-on-exit prompt. Open editors (script
// tabs, models, the settings window) report with useEditorDirty(key, dirty,
// { label, save }). Editors in a child window (desktop settings) report over
// a broadcast; the main window asks them to save with 'msm-editor-save'.
import { useEffect, useRef } from 'react';
import { broadcast, onBroadcast, popupRoute } from './popups';

const editors = new Map(); // key -> { label, save, remote }
const subs = new Set();
const emit = () => subs.forEach((fn) => fn());
export function subscribeDirty(fn) { subs.add(fn); return () => subs.delete(fn); }

function apply(key, dirty, meta = {}) {
  const had = editors.has(key);
  if (dirty) editors.set(key, { ...(editors.get(key) || {}), ...meta });
  else editors.delete(key);
  if (had !== !!dirty) emit();
}

export function setEditorDirty(key, dirty, meta = {}) {
  const { save, ...plain } = meta;
  if (popupRoute()) broadcast('msm-editor-dirty', { key, dirty: !!dirty, label: plain.label || '' }).catch(() => {});
  else apply(key, !!dirty, { ...plain, save });
}

/** In an editor: report unsaved edits while `dirty` (cleared on unmount). */
export function useEditorDirty(key, dirty, { label = '', save } = {}) {
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    setEditorDirty(key, !!dirty, { label, save: () => (saveRef.current ? saveRef.current() : undefined) });
  }, [key, dirty, label]);
  useEffect(() => () => setEditorDirty(key, false), [key]);
  // A child-window editor saves when the main window asks.
  useEffect(() => {
    if (!popupRoute()) return undefined;
    let off = null;
    onBroadcast('msm-editor-save', (p) => { if (p && p.key === key && saveRef.current) Promise.resolve(saveRef.current()).catch(() => {}); }).then((u) => { off = u; });
    return () => { if (off) off(); };
  }, [key]);
}

export const dirtyEditors = () => [...editors.entries()].map(([key, v]) => ({ key, label: v.label || key, remote: !!v.remote }));

/** Main window: listen to editors in child windows. */
export function listenChildEditors() {
  return onBroadcast('msm-editor-dirty', (p) => { if (p && p.key) apply(p.key, p.dirty, { label: p.label, remote: true }); });
}

/** Saves every dirty editor (child windows are asked and given a moment). */
export async function saveEditors() {
  for (const [key, v] of [...editors.entries()]) {
    if (v.remote) {
      await broadcast('msm-editor-save', { key });
      const t0 = Date.now();
      while (editors.has(key) && Date.now() - t0 < 4000) await new Promise((r) => setTimeout(r, 100));
      if (editors.has(key)) throw Object.assign(new Error(v.label || key), { code: 'NOT_SAVED' });
    } else if (v.save) {
      const ok = await v.save();
      if (ok === false) throw Object.assign(new Error(v.label || key), { code: 'NOT_SAVED' });
      editors.delete(key);
      emit();
    }
  }
}

export function clearEditors() { editors.clear(); emit(); }
