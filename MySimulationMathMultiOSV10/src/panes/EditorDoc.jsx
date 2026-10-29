// 편집기 / Editor: one CodeMirror view per open file tab (kept mounted while
// other tabs are shown). The text is read through the host API; Save writes
// it back. The App reaches each editor through `register(id, api)`.
import React, { useEffect, useRef, useState } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { createMEditor } from '../lib/editor';
import { fsApi } from '../lib/backend';
import { useEditorDirty } from '../lib/dirty';

export function EditorDoc({ doc, active, settings, register, onDirty, onCursor, onBreakpoints, breakpoints, debugLine, actions }) {
  useLanguage();
  const host = useRef(null);
  const ed = useRef(null);
  const saved = useRef('');
  const [dirty, setDirty] = useState(false);
  const [state, setState] = useState(doc.path ? 'loading' : 'ready');
  const [error, setError] = useState('');
  const actionsRef = useRef({});
  const pathRef = useRef(doc.path);
  pathRef.current = doc.path;

  // The editor calls back through actionsRef (always the latest handlers).
  actionsRef.current = {
    ...actions,
    ctrlEnterSection: settings.keyboard.ctrlEnterSection !== false,
    onChange: (text) => { const d = text !== saved.current; setDirty(d); window.dispatchEvent(new CustomEvent('msm-editor-change', { detail: { id: doc.id } })); },
    onCursor: (c) => { if (active) onCursor(c); },
    onBreakpoints: (lines) => onBreakpoints(lines),
  };

  const save = async (path) => {
    const target = path || pathRef.current;
    if (!target || !ed.current) return false;
    const text = ed.current.getText();
    await fsApi.writeText(target, text);
    saved.current = text;
    setDirty(false);
    return target;
  };

  useEffect(() => {
    let alive = true;
    const start = (text) => {
      if (!alive || !host.current) return;
      saved.current = text;
      ed.current = createMEditor({ parent: host.current, doc: text, settings: { ...settings.editor, ...(doc.options || {}) }, actions: new Proxy({}, { get: (_, k) => actionsRef.current[k] }) });
      if (breakpoints && breakpoints.length) ed.current.setBreakpoints(breakpoints);
      if (doc.initialText != null && !doc.path) { ed.current.setText(doc.initialText); }
      setState('ready');
      if (doc.line) setTimeout(() => ed.current && ed.current.gotoLine(doc.line), 0);
      else if (active) ed.current.focus();
    };
    if (doc.path) fsApi.readText(doc.path).then(start, (e) => { if (alive) { setError(e.message); setState('error'); } });
    else start('');
    return () => { alive = false; if (ed.current) { ed.current.destroy(); ed.current = null; } };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    register(doc.id, {
      get editor() { return ed.current; },
      save,
      isDirty: () => (ed.current ? ed.current.getText() !== saved.current : false),
      reload: async () => { if (!pathRef.current || !ed.current) return; const text = await fsApi.readText(pathRef.current); saved.current = text; ed.current.setText(text); setDirty(false); },
    });
    return () => register(doc.id, null);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { onDirty(doc.id, dirty); }, [dirty]); // eslint-disable-line react-hooks/exhaustive-deps
  useEditorDirty(`doc:${doc.id}`, dirty, { label: doc.title, save: () => (pathRef.current ? save() : actions.saveAs(doc.id)) });

  // Settings → editor options; a document's own options (문서 속성: tab size, wrap) win.
  useEffect(() => { if (ed.current) ed.current.configure({ ...settings.editor, ...(doc.options || {}) }); }, [settings.editor, doc.options]);
  useEffect(() => { if (ed.current) ed.current.setDebugLine(debugLine || null); }, [debugLine, state]);
  useEffect(() => { if (active && ed.current) { ed.current.focus(); const v = ed.current.view; const head = v.state.selection.main.head; const line = v.state.doc.lineAt(head); onCursor({ line: line.number, col: head - line.from + 1, sel: 0 }); } }, [active]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (doc.line && ed.current) ed.current.gotoLine(doc.line); }, [doc.line, doc.lineSeq]); // eslint-disable-line react-hooks/exhaustive-deps

  // Autosave: a saved file with edits is written after the pause set in Settings.
  useEffect(() => {
    if (!dirty || !doc.path || !settings.editor.autosave) return undefined;
    const timer = setTimeout(() => { save().catch(() => {}); }, Math.max(5, settings.editor.autosaveSec || 30) * 1000);
    return () => clearTimeout(timer);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="editor-doc">
      {state === 'loading' && <div className="pane-empty small muted">{t('loading')}</div>}
      {state === 'error' && <div className="pane-empty small bad">{t('ed_open_failed', { error })}</div>}
      <div ref={host} className="editor-host" style={{ display: state === 'error' ? 'none' : undefined }} />
    </div>
  );
}
