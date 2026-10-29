// The dialogs a desktop child window can show (components/InWindow.jsx opens
// them from the main window): each entry renders the same dialog component
// the web build shows in the page, from the payload the main window sent,
// and answers through done(value) (closes the window) or notify(value)
// (keeps it open). The outermost Dialog becomes the window itself
// (DialogWindowCtx) and the window takes the dialog's height.
import React, { useEffect, useRef, useState } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { call, isDesktop, pickFolder } from '../lib/backend';
import { Dialog, DialogWindowCtx, Icon } from '../components/Chrome';
import { sendResult, fitPopupHeight, onBroadcast, closeSelf } from '../lib/popups';
import { Btn, BtnGroup, Confirm } from './common';
import { ExcludeDirsDialog } from '../components/ExcludeDirs';
import { NewProjectDialog, OpenProjectDialog } from './ProjectFiles';
import { ToolsDialog, ToolOfferDialog } from './Tools';
import { ScanProgress } from './ScanProgress';
import { PasswordDialog, TokenDialog } from './Admin';
import { CustomRuleDialog } from './CustomRuleDialog';
import { PRINT_SIZE_KEY } from '../components/InWindow';

// ── dialogs shared by the page and the windows ───────────
/** Analyze a folder typed by hand (File › Open folder on the web build). */
export function PathDialog({ initial = '', onRun, onClose }) {
  useLanguage();
  const [path, setPath] = useState(initial);
  const run = () => { if (path.trim()) onRun(path.trim()); };
  return (
    <Dialog title={t('open_folder')} icon="folder" onClose={onClose}>
      <label className="form-row">{t('path_label')}
        <input value={path} onChange={(e) => setPath(e.target.value)} autoFocus onKeyDown={(e) => { if (e.key === 'Enter') run(); }} />
      </label>
      <p className="small">{t('path_hint')}</p>
      <div className="dialog-actions">
        <BtnGroup>
          <Btn icon="play" label={t('run_analysis')} primary disabled={!path.trim()} onClick={run} />
          <Btn icon="close" label={t('cancel')} onClick={onClose} />
        </BtnGroup>
      </div>
    </Dialog>
  );
}

/** An error message with OK. */
export function ErrorBox({ title, body, onClose }) {
  useLanguage();
  return (
    <Dialog title={title || t('error_title')} icon="alert" onClose={onClose} className="ui-ask" dataTour="ui-error">
      <p className="error-line"><Icon name="xCircle" size={18} /><span>{body}</span></p>
      <div className="dialog-actions"><Btn icon="check" label={t('ok')} primary onClick={onClose} /></div>
    </Dialog>
  );
}

/** A question with several buttons (lib/ui.js ask with buttons). */
export function AskBox({ title, body, icon, buttons, onAnswer }) {
  useLanguage();
  return (
    <Dialog title={title} icon={icon || 'alert'} onClose={() => onAnswer('cancel')} className="ui-ask" dataTour="ui-ask">
      <p style={{ margin: '4px 0 8px', lineHeight: 1.5, whiteSpace: 'pre-line' }}>{body}</p>
      <div className="dialog-actions">
        <BtnGroup>
          {(buttons || []).map((b) => <Btn key={b.id} icon={b.icon} label={b.label} primary={b.primary} danger={b.danger} onClick={() => onAnswer(b.id)} />)}
        </BtnGroup>
      </div>
    </Dialog>
  );
}

/** Load an advisory database for dependency checks (SCA view). */
export function OsvSourceDialog({ onLoaded, onClose }) {
  useLanguage();
  const [path, setPath] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await call('sca.setOsvSource', { source: path.trim() });
      onLoaded(res);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return (
    <Dialog title={t('sca_load_osv')} onClose={onClose}>
      <p className="small">{t('sca_osv_hint')}</p>
      <div className="input-row">
        <input value={path} placeholder={isDesktop ? 'C:\\osv\\all.zip' : '/data/osv'} onChange={(e) => setPath(e.target.value)} autoFocus />
        {isDesktop && <Btn icon="folder" label={t('sca_browse')} onClick={async () => { const p = await pickFolder(); if (p) setPath(p); }} />}
      </div>
      {error && <p className="small bad"><Icon name="alert" size={12} /> {error}</p>}
      <div className="dialog-actions">
        <BtnGroup>
          <Btn icon="upload" label={path.trim() ? t('sca_load') : t('sca_clear_source')} primary disabled={busy} onClick={load} />
          <Btn icon="close" label={t('cancel')} onClick={onClose} />
        </BtnGroup>
      </div>
    </Dialog>
  );
}

// ── the windows ──────────────────────────────────────────
// The value the main window keeps sending (InWindow live).
function useLive(payload) {
  const [value, setValue] = useState(payload.live);
  useEffect(() => {
    let off = null;
    onBroadcast('mcc-window-live', (m) => { if (m && m.channel === payload.channel) setValue(m.value); }).then((u) => { off = u; });
    return () => { if (off) off(); };
  }, [payload.channel]);
  return value;
}

function ProgressWindow({ payload, notify }) {
  const job = useLive(payload);
  return <ScanProgress job={job} title={payload.title} icon={payload.icon} onCancel={() => notify('cancel')} />;
}

// The print window: the report in a frame, printed when it is shown (the
// system print preview then fills this window, which can be moved and
// resized freely). Its size is kept for the next time.
function PrintWindow({ payload }) {
  useLanguage();
  const frame = useRef(null);
  const printed = useRef(false);
  const print = () => {
    const win = frame.current && frame.current.contentWindow;
    if (!win) return;
    try { win.focus(); win.print(); } catch { /* the preview stays */ }
  };
  useEffect(() => {
    let timer = null;
    const keep = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        try { localStorage.setItem(PRINT_SIZE_KEY, JSON.stringify({ width: window.innerWidth, height: window.innerHeight })); } catch { /* not kept */ }
      }, 300);
    };
    window.addEventListener('resize', keep);
    return () => { clearTimeout(timer); window.removeEventListener('resize', keep); };
  }, []);
  return (
    <div className="print-window">
      <div className="print-bar">
        <strong><Icon name="print" size={14} /> {payload.fileName || t('rp_print')}</strong>
        <span className="spacer" />
        <Btn icon="print" label={t('rp_print')} primary onClick={print} />
        <Btn icon="close" label={t('win_close')} onClick={() => closeSelf()} />
      </div>
      <iframe ref={frame} title={payload.fileName || 'print'} sandbox="allow-same-origin allow-modals" srcDoc={payload.html || ''}
        onLoad={() => { if (!printed.current) { printed.current = true; setTimeout(print, 150); } }} />
    </div>
  );
}

const DIALOG_WINDOWS = {
  confirm: (p, done) => <Confirm title={p.title} body={p.body} okLabel={p.okLabel} danger={p.danger} onOk={() => done(true)} onCancel={() => done(false)} />,
  error: (p, done) => <ErrorBox title={p.title} body={p.body} onClose={() => done(true)} />,
  ask: (p, done) => <AskBox title={p.title} body={p.body} icon={p.icon} buttons={p.buttons} onAnswer={done} />,
  path: (p, done) => <PathDialog initial={p.initial} onRun={(path) => done({ path })} onClose={() => closeSelf()} />,
  excludeDirs: (p, done) => <ExcludeDirsDialog root={p.root} value={p.value} onSave={(dirs) => done({ dirs })} onClose={() => closeSelf()} />,
  newProject: (p, done) => <NewProjectDialog onClose={() => closeSelf()} onOpenExisting={(pid) => done({ openExisting: pid })} onDone={(res, opts) => done({ done: res, analyze: !!(opts && opts.analyze) })} />,
  openProject: (p, done) => <OpenProjectDialog onClose={() => closeSelf()} onOpen={(file) => done({ file })} />,
  tools: (p, done, notify) => <ToolsDialog onClose={() => closeSelf()} onChanged={() => notify('changed')} />,
  toolOffers: (p, done, notify) => <ToolOfferDialog offers={p.offers} onClose={() => closeSelf()} onChanged={() => notify('changed')} />,
  customRule: (p, done) => <CustomRuleDialog onClose={() => closeSelf()} onSave={(rule) => { done({ rule }); return true; }} />,
  password: (p, done) => <PasswordDialog login={p.login} onClose={() => closeSelf()} onSave={async (pw) => {
    try { await call('security.call', { fn: 'setPassword', args: [p.login, pw] }); done({ saved: true }); return ''; } catch (err) { return err.message; }
  }} />,
  token: (p) => <TokenDialog token={p.token} projectKey={p.projectKey} projectPath={p.projectPath} onClose={() => closeSelf()} />,
  osvSource: (p, done) => <OsvSourceDialog onLoaded={(res) => done(res)} onClose={() => closeSelf()} />,
};

export const isDialogWindow = (kind) => kind === 'print' || kind === 'progress' || Object.prototype.hasOwnProperty.call(DIALOG_WINDOWS, kind);

/** A dialog as a window of its own, as high as the dialog (at most 90% of the screen). */
export function DialogWindow({ kind, id, payload }) {
  useLanguage();
  const box = useRef(null);
  const done = (value) => sendResult(id, { value });
  const notify = (event) => sendResult(id, { event }, { close: false });
  useEffect(() => {
    if (kind === 'print' || kind === 'progress') return undefined;
    const el = box.current;
    if (!el) return undefined;
    const fit = () => {
      const d = el.querySelector('.dialog');
      if (!d) return;
      const title = d.querySelector('.dialog-title');
      const body = d.querySelector('.dialog-body');
      // The body stretches to the window: its content ends at its last child.
      const last = body && body.lastElementChild;
      const content = last
        ? last.getBoundingClientRect().bottom - body.getBoundingClientRect().top + body.scrollTop + parseFloat(getComputedStyle(body).paddingBottom || '0')
        : d.scrollHeight;
      const h = (title ? title.offsetHeight : 0) + content + 2;
      fitPopupHeight(Math.ceil(h), Math.round(window.screen.availHeight * 0.9));
    };
    // Fitted once per frame at most: when the content changes (a tree opens,
    // an error line appears) and when the window is resized.
    let frame = 0;
    const later = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(fit); };
    fit();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(later) : null;
    if (ro) ro.observe(el);
    const mo = typeof MutationObserver !== 'undefined' ? new MutationObserver(later) : null;
    if (mo) mo.observe(el, { childList: true, subtree: true, characterData: true });
    return () => { cancelAnimationFrame(frame); if (ro) ro.disconnect(); if (mo) mo.disconnect(); };
  }, [kind]);
  if (kind === 'print') return <PrintWindow payload={payload} />;
  if (kind === 'progress') return <div className="dialog-window progress-window"><ProgressWindow payload={payload} notify={notify} /></div>;
  const render = DIALOG_WINDOWS[kind];
  return (
    <div className="dialog-window" ref={box}>
      <DialogWindowCtx.Provider value>{render(payload, done, notify)}</DialogWindowCtx.Provider>
    </div>
  );
}
