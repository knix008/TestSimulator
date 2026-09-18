// In-app modal dialogs. They are stacked (a conflict question appears on top
// of the progress dialog) and promise-based: App calls e.g.
// `await dialogs.prompt({...})` and gets the user's answer back.
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { formatSize, truncateMiddle } from '../lib/format';
import { Icon } from '../components/Icons';
import { writeClipboardText, fitWindow } from '../lib/backend';
import { SettingsDialog } from './SettingsDialog';
import { ViewerDialog, EditorDialog, MultiRenameDialog } from './ToolDialogs';
import { InfoDialog } from './InfoDialog';
import { describeError } from '../lib/errors';

// ── Frame ─────────────────────────────────────────────────

// `windowed`: the dialog is the whole page of a separate tool window — no
// backdrop, no in-page title bar (the OS window has one; the title goes to
// document.title), and it fills the window.
export function DialogFrame({ title, children, footer, width = 440, onClose, className = '', icon, windowed = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // First field, else the first footer button — never the title-bar X.
    const focusable = el.querySelector('.dlg-body input, .dlg-body select, .dlg-footer button, .dlg-body button, .dlg-body textarea');
    if (focusable) focusable.focus();
  }, []);
  useEffect(() => { if (windowed && title) document.title = title; }, [windowed, title]);
  const onKey = (e) => {
    if (e.key === 'Escape' && onClose) { e.stopPropagation(); onClose(); }
  };
  if (windowed) {
    return (
      <div className={`dlg windowed ${className}`} ref={ref} role="dialog" aria-label={title} onKeyDown={onKey}>
        <div className="dlg-body">{children}</div>
        {footer && <div className="dlg-footer">{footer}</div>}
      </div>
    );
  }
  return (
    <div className="dlg-backdrop" onMouseDown={(e) => e.stopPropagation()} onKeyDown={onKey}>
      <div className={`dlg ${className}`} style={{ width }} ref={ref} role="dialog" aria-modal="true" aria-label={title}>
        <div className="dlg-title">
          {icon && <Icon name={icon} />}
          <span>{title}</span>
          {onClose && <button className="dlg-x" onClick={onClose} title={t('close')}><Icon name="close" /></button>}
        </div>
        <div className="dlg-body">{children}</div>
        {footer && <div className="dlg-footer">{footer}</div>}
      </div>
    </div>
  );
}

// ── Prompt (new folder / new file / rename / extract folder) ──

function PromptDialog({ spec, done }) {
  const [value, setValue] = useState(spec.value || '');
  const inputRef = useRef(null);
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    // Select the stem (before the extension) like a rename box.
    const dot = spec.selectStem ? el.value.lastIndexOf('.') : -1;
    el.setSelectionRange(0, dot > 0 ? dot : el.value.length);
  }, [spec]);
  const submit = (e) => { e.preventDefault(); if (value.trim()) done(value.trim()); };
  return (
    <DialogFrame title={spec.title} onClose={() => done(null)} icon={spec.icon}
      footer={<>
        <button className="btn" onClick={() => done(null)}>{t('cancel')}</button>
        <button className="btn primary" onClick={submit} disabled={!value.trim()}>{spec.okLabel || t('ok')}</button>
      </>}>
      <form onSubmit={submit} className="form-row">
        <label>{spec.label}</label>
        <input ref={inputRef} value={value} onChange={(e) => setValue(e.target.value)} spellCheck={false} />
      </form>
    </DialogFrame>
  );
}

// ── Confirm ──

function ConfirmDialog({ spec, done }) {
  return (
    <DialogFrame title={spec.title} onClose={() => done(false)} icon={spec.danger ? 'trash' : 'info'} className={spec.danger ? 'danger' : ''}
      footer={<>
        <button className="btn" onClick={() => done(false)} autoFocus>{spec.noLabel || t('no')}</button>
        <button className={`btn ${spec.danger ? 'danger' : 'primary'}`} onClick={() => done(true)}>{spec.yesLabel || t('yes')}</button>
      </>}>
      <p className="pre">{spec.message}</p>
    </DialogFrame>
  );
}

// ── Error / message ──
// Errors always carry their details (code, path, stack from whichever
// process raised them) and a button that copies everything to the clipboard.

function MessageDialog({ spec, done }) {
  const [copied, setCopied] = useState(false);
  const isError = (spec.kind || 'error') === 'error';
  const copy = async () => {
    const text = [spec.title || t('error_title'), '', spec.message, spec.detail ? `\n${t('error_details')}:\n${spec.detail}` : ''].join('\n').trim();
    try {
      if (spec.copyText) await spec.copyText(text);
      else await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard unavailable */ }
  };
  return (
    <DialogFrame title={spec.title || t('error_title')} onClose={() => done()} icon={spec.icon || (isError ? 'delete' : 'info')} className={spec.kind || 'error'} width={560}
      footer={<>
        {isError && <button className="btn" onClick={copy}><Icon name={copied ? 'check' : 'clipboard'} /> {copied ? t('copied_details') : t('copy_details')}</button>}
        <span className="spacer" />
        <button className="btn primary" onClick={() => done()} autoFocus>{t('ok')}</button>
      </>}>
      <p className="pre" style={{ userSelect: 'text' }}>{spec.message}</p>
      {spec.detail && <>
        <div className="muted small">{t('error_details')}</div>
        <pre className="detail">{spec.detail}</pre>
      </>}
    </DialogFrame>
  );
}

// ── Conflict ──

function ConflictDialog({ spec, done }) {
  const [applyAll, setApplyAll] = useState(false);
  const { name, destPath, destIsDir, isMove } = spec.info;
  return (
    <DialogFrame title={isMove ? t('conflict_title_move') : t('conflict_title_copy')} onClose={() => done({ answer: 'cancel', applyAll: false })} icon="copy" width={520}
      footer={<>
        <button className="btn" onClick={() => done({ answer: 'cancel', applyAll: false })}>{t('cancel')}</button>
        <button className="btn" onClick={() => done({ answer: 'skip', applyAll })}>{t('skip')}</button>
        <button className="btn primary" onClick={() => done({ answer: 'overwrite', applyAll })} autoFocus>{t('overwrite')}</button>
      </>}>
      <p className="pre">{t('conflict_msg', { kind: destIsDir ? t('folder') : t('file'), name, path: destPath })}</p>
      <label className="check"><input type="checkbox" checked={applyAll} onChange={(e) => setApplyAll(e.target.checked)} /> {t('apply_all')}</label>
    </DialogFrame>
  );
}

// ── Progress ──

function ProgressDialog({ spec }) {
  const job = spec.job || {};
  const total = job.total || 0;
  const frac = total > 0 ? Math.min(1, (job.current || 0) / total) : 0;
  const pct = total > 0 ? `${Math.round(frac * 100)}%` : '';
  return (
    <DialogFrame title={spec.verb} width={540} className="progress" icon="refresh">
      <div className="progress-row">
        <span className="progress-verb">{spec.verb} :</span>
        <span className="progress-path mono" title={job.detail || ''}>{truncateMiddle(job.detail || '', 48) || '…'}</span>
      </div>
      <div className={`bar ${total > 0 ? '' : 'indeterminate'}`}>
        <div className="bar-fill" style={{ width: total > 0 ? `${frac * 100}%` : undefined }} />
        <span className="bar-text">{pct}</span>
      </div>
      <div className="progress-actions">
        <button className="btn" onClick={spec.onCancel} disabled={spec.cancelled}>{t('progress_cancel')}</button>
      </div>
    </DialogFrame>
  );
}

// ── Compress options ──

const UNITS = [['KB', 1024], ['MB', 1024 * 1024], ['GB', 1024 * 1024 * 1024]];

function CompressDialog({ spec, done }) {
  const [name, setName] = useState(spec.name || 'archive');
  const [format, setFormat] = useState('tar.gz');
  const [split, setSplit] = useState(false);
  const [size, setSize] = useState(String(spec.splitSizeMB || 10));
  const [unit, setUnit] = useState(1);
  const submit = (e) => {
    if (e) e.preventDefault();
    if (!name.trim()) return;
    let n = parseInt(size, 10);
    if (!Number.isFinite(n) || n <= 0) n = 10;
    done({ name: name.trim(), format, split, splitSize: split ? n * UNITS[unit][1] : 0 });
  };
  return (
    <DialogFrame title={t('compress_title')} onClose={() => done(null)} icon="archive"
      footer={<>
        <button className="btn" onClick={() => done(null)}>{t('cancel')}</button>
        <button className="btn primary" onClick={submit} disabled={!name.trim()}>{t('compress')}</button>
      </>}>
      <form onSubmit={submit} className="form-grid">
        <label>{t('lbl_archive_name')}</label>
        <input value={name} onChange={(e) => setName(e.target.value)} autoFocus spellCheck={false} />
        <label>{t('lbl_format')}</label>
        <select value={format} onChange={(e) => setFormat(e.target.value)}>
          <option value="tar.gz">.tar.gz</option>
          <option value="tar.bz2">.tar.bz2</option>
          <option value="zip">.zip</option>
        </select>
        <span />
        <label className="check"><input type="checkbox" checked={split} onChange={(e) => setSplit(e.target.checked)} /> {t('split_check')}</label>
        <label>{t('lbl_split_size')}</label>
        <div className="row">
          <input value={size} onChange={(e) => setSize(e.target.value.replace(/[^\d]/g, ''))} disabled={!split} style={{ width: 90 }} inputMode="numeric" />
          <select value={unit} onChange={(e) => setUnit(Number(e.target.value))} disabled={!split}>
            {UNITS.map(([u], i) => <option key={u} value={i}>{u}</option>)}
          </select>
        </div>
      </form>
    </DialogFrame>
  );
}

// ── About ──

// Sizes a windowed dialog to the content it just drew, so its window shows
// everything without a scrollbar (the settings window does the same).
function useFitToContent(windowed) {
  useLayoutEffect(() => {
    if (!windowed || !fitWindow) return;
    const body = document.querySelector('.dlg.windowed .dlg-body');
    if (!body) return;
    // The body fills the window (flex), so its own height says nothing about the content: let it take its
    // natural height for one measurement, then put it back and ask for a window that fits exactly.
    const around = window.innerHeight - body.clientHeight;   // footer and margins, from the real layout
    const flex = body.style.flex, h = body.style.height, ovf = body.style.overflow;
    body.style.flex = 'none'; body.style.height = 'auto'; body.style.overflow = 'visible';
    const content = body.scrollHeight;
    body.style.flex = flex; body.style.height = h; body.style.overflow = ovf;
    fitWindow(Math.ceil(content + around));
  }, [windowed]);
}

export function AboutDialog({ spec, done }) {
  const info = spec.info || {};
  const build = info.buildInfo || {};
  useLanguage();
  useFitToContent(spec.windowed);
  return (
    <DialogFrame title={t('about_title')} onClose={() => done()} icon="info" width={460} windowed={spec.windowed} className="about-dlg"
      footer={<button className="btn close-btn" onClick={() => done()} autoFocus>{t('close')}</button>}>
      <div className="about">
        <img src="./icon.svg" alt="" width={112} height={112} />
        <div className="about-text">
          <div className="about-name">{t('appName')}</div>
          <div><b>{t('version')}</b>&nbsp; {info.version || build.version || '1.0.0'}</div>
          <div><b>{t('author')}</b>&nbsp; {t('author_name')}</div>
          <div className="muted">{t('about_desc')}</div>
          <div className="muted small">{t('about_host')}: {info.host === 'electron' ? t('host_electron') : t('host_web')} · {info.platform}</div>
          {build.buildTime && <div className="muted small">{t('about_build')}: {build.buildTime.replace('T', ' ').slice(0, 16)}{build.gitCommit ? ` (${build.gitCommit})` : ''}</div>}
          <div className="about-copy">{t('copyright')}</div>
        </div>
      </div>
    </DialogFrame>
  );
}

// ── Properties ──

// ── Host ──

const RENDERERS = {
  prompt: PromptDialog,
  confirm: ConfirmDialog,
  message: MessageDialog,
  conflict: ConflictDialog,
  progress: ProgressDialog,
  compress: CompressDialog,
  about: AboutDialog,
  properties: InfoDialog,
  settings: SettingsDialog,
  viewer: ViewerDialog,
  editor: EditorDialog,
  multiRename: MultiRenameDialog,
};

export function DialogHost({ stack, resolve }) {
  useLanguage();
  if (!stack.length) return null;
  return (
    <>
      {stack.map((spec) => {
        const R = RENDERERS[spec.type];
        if (!R) return null;
        return <R key={spec.id} spec={spec} done={(v) => resolve(spec.id, v)} />;
      })}
    </>
  );
}

// Hook that owns the stack and exposes promise-based openers.
let seq = 1;
export function useDialogs() {
  const [stack, setStack] = useState([]);
  const resolvers = useRef(new Map());

  const push = (spec) => new Promise((res) => {
    const id = seq++;
    resolvers.current.set(id, res);
    setStack((s) => [...s, { ...spec, id }]);
  });
  const resolve = (id, value) => {
    setStack((s) => s.filter((d) => d.id !== id));
    const r = resolvers.current.get(id);
    resolvers.current.delete(id);
    if (r) r(value);
  };
  const update = (id, patch) => setStack((s) => s.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  // Opens a dialog without waiting; returns {id, close(value)}.
  const open = (spec) => {
    const id = seq++;
    setStack((s) => [...s, { ...spec, id }]);
    return { id, close: (v) => resolve(id, v), update: (patch) => update(id, patch) };
  };

  return {
    stack,
    resolve,
    open,
    update,
    prompt: (spec) => push({ type: 'prompt', ...spec }),
    confirm: (spec) => push({ type: 'confirm', ...spec }),
    message: (spec) => push({ type: 'message', ...spec }),
    // error(err | message, extraDetail?) — an Error's code/path/stack become the details block.
    error: (err, detail) => push({ type: 'message', kind: 'error', copyText: writeClipboardText, ...describeError(err, detail) }),
    conflict: (info) => push({ type: 'conflict', info }),
    compress: (spec) => push({ type: 'compress', ...spec }),
    about: (info) => push({ type: 'about', info }),
    properties: (info) => push({ type: 'properties', info }),
    settings: (values, extra) => push({ type: 'settings', values, ...(extra || {}) }),
    viewer: (spec) => push({ type: 'viewer', ...spec }),
    editor: (spec) => push({ type: 'editor', ...spec }),
    multiRename: (spec) => push({ type: 'multiRename', ...spec }),
    get isOpen() { return stack.length > 0; },
  };
}
