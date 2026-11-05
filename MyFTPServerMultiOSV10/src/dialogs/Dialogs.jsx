// In-app modal dialogs. They are stacked and promise-based: App calls e.g.
// `await dialogs.prompt({...})` and gets the user's answer back.
import React, { useEffect, useRef, useState } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { Icon } from '../components/Icons';
import { writeClipboardText } from '../lib/backend';
import { SettingsDialog } from './SettingsDialog';
import { ShareDialog } from './ShareDialog';
import { UserDialog } from './UserDialog';
import { CertDialog } from './CertDialog';
import { PathPicker } from './PathPicker';
import { describeError } from '../lib/errors';

// ── Frame ─────────────────────────────────────────────────

// `fill`: a fixed-size dialog whose body stretches (the settings window).
export function DialogFrame({ title, children, footer, width = 440, onClose, className = '', icon, fill = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const focusable = el.querySelector('.dlg-body input:not([disabled]), .dlg-body select, .dlg-body [tabindex], .dlg-footer button, .dlg-body button');
    if (focusable) focusable.focus();
  }, []);
  const onKey = (e) => {
    if (e.key === 'Escape' && onClose) { e.stopPropagation(); onClose(); }
  };
  return (
    <div className="dlg-backdrop" onMouseDown={(e) => e.stopPropagation()} onKeyDown={onKey}>
      <div className={`dlg ${className}${fill ? ' fill' : ''}`} style={{ width }} ref={ref} role="dialog" aria-modal="true" aria-label={title}>
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

// ── Prompt (profile name / new folder) ──

function PromptDialog({ spec, done }) {
  const [value, setValue] = useState(spec.value || '');
  const inputRef = useRef(null);
  useEffect(() => { const el = inputRef.current; if (el) { el.focus(); el.select(); } }, [spec]);
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
    <DialogFrame title={spec.title} onClose={() => done(false)} icon={spec.icon || (spec.danger ? 'warning' : 'info')} className={spec.danger ? 'danger' : ''}
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
    const text = [spec.title || t('dlg_error'), '', spec.message, spec.detail ? `\n${t('error_details')}:\n${spec.detail}` : ''].join('\n').trim();
    try { await writeClipboardText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard unavailable */ }
  };
  return (
    <DialogFrame title={spec.title || t('dlg_error')} onClose={() => done()} icon={spec.icon || (isError ? 'warning' : 'info')} className={spec.kind || 'error'} width={560}
      footer={<>
        {(isError || spec.detail) && <button className="btn" onClick={copy}><Icon name={copied ? 'check' : 'clipboard'} /> {copied ? t('copied_details') : t('copy_details')}</button>}
        <span className="spacer" />
        <button className="btn primary" onClick={() => done()} autoFocus>{t('ok')}</button>
      </>}>
      <p className="pre selectable">{spec.message}</p>
      {spec.detail && <>
        <div className="muted small">{t('error_details')}</div>
        <pre className="detail">{spec.detail}</pre>
      </>}
      {isError && <div className="muted small" style={{ marginTop: 8 }}>{t('error_hint')}</div>}
    </DialogFrame>
  );
}

// ── About ──

function AboutDialog({ spec, done }) {
  const info = spec.info || {};
  const build = info.buildInfo || {};
  return (
    <DialogFrame title={t('about_title')} onClose={() => done()} icon="info" width={520}
      footer={<button className="btn close-btn" onClick={() => done()} autoFocus>{t('close')}</button>}>
      <div className="about">
        <img src="./icon.svg" alt="" width={112} height={112} />
        <div className="about-text">
          <div className="about-name">{t('appName')}</div>
          <div><b>{t('version')}</b>&nbsp; {info.version || build.version || '1.0.0'}</div>
          <div><b>{t('author')}</b>&nbsp; {t('author_name')}</div>
          <div className="muted">{t('about_desc')}</div>
          <div className="muted small">{t('about_libs')}</div>
          <div className="muted small">{t('about_host')}: {info.host === 'electron' ? t('host_electron') : t('host_web')} · {info.platform}</div>
          <div className="muted small selectable">{t('about_config')}: {info.configDir}</div>
          {build.buildTime && <div className="muted small">{t('about_build')}: {build.buildTime.replace('T', ' ').slice(0, 16)}{build.gitCommit ? ` (${build.gitCommit})` : ''}</div>}
          <div className="about-copy">{t('copyright')}</div>
        </div>
      </div>
    </DialogFrame>
  );
}

// ── Host ──

const RENDERERS = {
  prompt: PromptDialog,
  confirm: ConfirmDialog,
  message: MessageDialog,
  about: AboutDialog,
  settings: SettingsDialog,
  share: ShareDialog,
  user: UserDialog,
  cert: CertDialog,
  path: PathPicker,
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

  return {
    stack,
    resolve,
    prompt: (spec) => push({ type: 'prompt', ...spec }),
    confirm: (spec) => push({ type: 'confirm', ...spec }),
    message: (spec) => push({ type: 'message', ...spec }),
    // error(err | message, extraDetail?, title?) — an Error's code/path/stack become the details block.
    error: (err, detail, title) => push({ type: 'message', kind: 'error', title, ...describeError(err, detail) }),
    about: (info) => push({ type: 'about', info }),
    settings: (values) => push({ type: 'settings', values }),
    share: (spec) => push({ type: 'share', ...spec }),
    user: (spec) => push({ type: 'user', ...spec }),
    cert: (spec) => push({ type: 'cert', ...spec }),
    path: (spec) => push({ type: 'path', ...spec }),
    get isOpen() { return stack.length > 0; },
  };
}
