// The editor screen's side panes:
//   OutlinePane   문서 구조 (left, navigation): %% sections, classdef, functions
//                 with line numbers; click to jump; follows typing (debounced).
//   DebugPane     디버그 (right, state): the call stack while paused, every
//                 breakpoint by file (jump, remove), the step buttons.
//   DocPropsPane  문서 속성 (right, properties): path, type, encoding, lines,
//                 size, modified time, and this document's tab size / wrap.
import React, { useEffect, useMemo, useState } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { Icon } from '../components/Chrome';
import { Stepper, Toggle } from '../views/common';
import { fsApi, baseName, dirName } from '../lib/backend';
import { outlineOf } from '../lib/outline';
import { fileKind } from '../lib/files';

/** The active editor's text, re-read (debounced) as it is typed in. */
function useEditorText(doc, editors, delay = 250) {
  const [text, setText] = useState(null);
  useEffect(() => {
    if (!doc) { setText(null); return undefined; }
    let timer = null;
    let poll = null;
    const read = () => {
      const api = editors && editors.current ? editors.current.get(doc.id) : null;
      const ed = api && api.editor;
      if (!ed) return false;
      setText(ed.getText());
      return true;
    };
    if (!read()) poll = setInterval(() => { if (read()) { clearInterval(poll); poll = null; } }, 300);
    const on = (e) => { if (e.detail && e.detail.id === doc.id) { clearTimeout(timer); timer = setTimeout(read, delay); } };
    window.addEventListener('msm-editor-change', on);
    return () => { clearTimeout(timer); if (poll) clearInterval(poll); window.removeEventListener('msm-editor-change', on); };
  }, [doc && doc.id, editors, delay]); // eslint-disable-line react-hooks/exhaustive-deps
  return text;
}

const KIND_ICON = { section: 'runSection', classdef: 'package', block: 'layers', function: 'code', local: 'code', nested: 'branch', method: 'code' };

export function OutlinePane({ doc, editors }) {
  useLanguage();
  const text = useEditorText(doc, editors);
  const items = useMemo(() => (text == null ? [] : outlineOf(text)), [text]);
  const jump = (line) => { const api = editors.current.get(doc.id); if (api && api.editor) api.editor.gotoLine(line); };
  if (!doc) return <div className="pane"><div className="pane-empty small muted"><Icon name="script" size={14} />{t('px_ol_none')}</div></div>;
  return (
    <div className="pane ol-pane">
      <div className="pane-tools"><Icon name="script" size={13} /><span className="small ellipsis" title={doc.path || doc.title}>{doc.title}</span><span className="spacer" /><span className="small muted">{items.length}</span></div>
      <div className="pane-scroll">
        {!items.length && <div className="pane-empty small muted">{text == null ? t('loading') : t('px_ol_empty')}</div>}
        {items.map((it, i) => (
          <button key={`${it.line}:${i}`} type="button" className={`ol-item ol-${it.kind}`} style={{ paddingLeft: 8 + it.depth * 14 }} title={`${t(`px_k_${it.kind}`)} — ${t('px_line', { line: it.line })}`} onClick={() => jump(it.line)}>
            <Icon name={KIND_ICON[it.kind] || 'code'} size={13} />
            <span className={`ol-name ellipsis ${it.kind === 'section' ? '' : 'mono'}`}>{it.name || (it.kind === 'section' ? t('px_ol_untitled') : '?')}</span>
            <span className="ol-line small muted">{it.line}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function DebugPane({ debug, breakpoints, onOpen, onRemove, onRemoveFile, onReply }) {
  useLanguage();
  const files = Object.entries(breakpoints || {}).filter(([, lines]) => lines && lines.length).sort((a, b) => a[0].localeCompare(b[0]));
  const steps = [['continue', 'continue', 'rb_continue', 'F5'], ['step', 'stepOver', 'rb_step', 'F10'], ['stepIn', 'stepIn', 'rb_step_in', 'F11'], ['stepOut', 'stepOut', 'rb_step_out', 'Shift+F11'], ['stop', 'stop', 'rb_stop', '']];
  return (
    <div className="pane dbg-pane">
      {debug && (
        <div className="pane-tools dbg-steps">
          {steps.map(([id, icon, label, keys]) => (
            <button key={id} type="button" className="icon-btn" title={`${t(label)}${keys ? ` (${keys})` : ''}`} aria-label={t(label)} onClick={() => onReply(id)}><Icon name={icon} size={14} /></button>
          ))}
        </div>
      )}
      <div className="pane-scroll">
        <div className="dbg-section small"><Icon name="layers" size={12} />{t('px_dbg_stack')}</div>
        {!debug && <div className="pane-empty small muted">{t('px_dbg_running')}</div>}
        {debug && (debug.stack && debug.stack.length ? debug.stack : [{ file: debug.file, name: '', line: debug.line }]).map((fr, i) => (
          <button key={i} type="button" className={`dbg-item ${i === 0 ? 'on' : ''}`} title={`${fr.file || ''}:${fr.line}`} onClick={() => fr.file && onOpen(fr.file, fr.line)}>
            <Icon name={i === 0 ? 'stepOver' : 'code'} size={13} />
            <span className="mono ellipsis">{fr.name || baseName(fr.file || '') || '?'}</span>
            <span className="small muted">{t('px_line', { line: fr.line })}</span>
          </button>
        ))}
        <div className="dbg-section small"><Icon name="breakpoint" size={12} />{t('px_dbg_bps')}</div>
        {!files.length && <div className="pane-empty small muted">{t('px_dbg_no_bps')}</div>}
        {files.map(([file, lines]) => (
          <div key={file} className="dbg-file">
            <div className="dbg-file-head" title={file}>
              <Icon name="script" size={13} /><span className="ellipsis">{baseName(file)}</span><span className="small muted ellipsis">{dirName(file)}</span><span className="spacer" />
              <button type="button" className="icon-btn" title={t('px_dbg_remove_file')} aria-label={t('px_dbg_remove_file')} onClick={() => onRemoveFile(file)}><Icon name="breakpointOff" size={13} /></button>
            </div>
            {[...lines].sort((a, b) => a - b).map((line) => (
              <div key={line} className="dbg-bp">
                <button type="button" className="dbg-item" onClick={() => onOpen(file, line)} title={`${file}:${line}`}>
                  <span className="cm-bp-dot" aria-hidden="true" />
                  <span>{t('px_line', { line })}</span>
                </button>
                <button type="button" className="icon-btn close-x" title={t('px_dbg_remove')} aria-label={`${t('px_dbg_remove')} ${line}`} onClick={() => onRemove(file, line)}><Icon name="close" size={11} /></button>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

const sizeText = (n) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`);

export function DocPropsPane({ doc, editors, dirty, editorSettings, onOptions }) {
  useLanguage();
  const text = useEditorText(doc, editors, 400);
  const [stat, setStat] = useState(null);
  useEffect(() => {
    let alive = true;
    setStat(null);
    if (doc && doc.path) fsApi.stat(doc.path).then((s) => { if (alive) setStat(s); }, () => {});
    return () => { alive = false; };
  }, [doc && doc.path, dirty]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!doc) return <div className="pane"><div className="pane-empty small muted"><Icon name="info" size={14} />{t('px_dp_none')}</div></div>;
  const opts = { tabSize: (editorSettings && editorSettings.tabSize) || 4, wrap: !!(editorSettings && editorSettings.wrap), ...(doc.options || {}) };
  const first = text != null ? outlineOf(text).find((x) => x.kind !== 'section') : null;
  const kind = fileKind(doc.title) !== 'script' ? t('sb_lang_text') : first && first.kind === 'classdef' ? t('px_k_classdef') : first && first.kind === 'function' ? t('px_k_function') : t('sb_lang_m');
  const rows = [
    ['folder', t('px_dp_path'), doc.path || t('px_dp_unsaved'), true],
    ['file', t('px_dp_kind'), kind],
    ['globe', t('px_dp_encoding'), 'UTF-8'],
    ['list', t('px_dp_lines'), text == null ? '…' : String(text.split('\n').length)],
    ['hash', t('px_dp_chars'), text == null ? '…' : String(text.length)],
    ['archive', t('px_dp_size'), stat ? sizeText(stat.size || 0) : '—'],
    ['clock', t('px_dp_modified'), stat && stat.mtimeMs ? new Date(stat.mtimeMs).toLocaleString() : '—'],
    [dirty ? 'edit' : 'checkCircle', t('px_dp_state'), dirty ? t('px_dp_dirty') : t('px_dp_clean')],
  ];
  return (
    <div className="pane dp-pane">
      <div className="pane-scroll">
        <dl className="prop-list">
          {rows.map(([icon, k, v, path]) => (
            <div key={k} className="prop-row"><dt><Icon name={icon} size={12} />{k}</dt><dd className={path ? 'mono prop-path' : ''} title={String(v)}>{v}</dd></div>
          ))}
        </dl>
        <div className="fp-section small">{t('px_dp_options')}</div>
        <div className="fp-row"><span className="fp-label">{t('px_dp_tab')}</span><Stepper value={opts.tabSize} min={1} max={8} step={1} width={44} ariaLabel={t('px_dp_tab')} onChange={(v) => onOptions(doc.id, { ...(doc.options || {}), tabSize: v })} /></div>
        <div className="fp-toggles">
          <Toggle checked={opts.wrap} icon="waves" label={t('px_dp_wrap')} onChange={(on) => onOptions(doc.id, { ...(doc.options || {}), wrap: on })} />
          <button type="button" className="vbtn" disabled={!doc.options} onClick={() => onOptions(doc.id, null)}><Icon name="refresh" size={13} /><span>{t('px_dp_reset')}</span></button>
        </div>
      </div>
    </div>
  );
}
