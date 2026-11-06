import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { baseName, downloadBytes, isDesktop, invoke, pickFiles, pickFolder, pickSave, readEntry, webFetch } from '../../lib/host';
import { formatDate, formatSize, parseSize, SIZE_UNITS, ratioText, errorKey, FORMATS } from '../../lib/format';
import buildInfo from '../../build-info.json';
import Stepper, { SIZE_STEP } from '../Stepper';
import { IconCheck, IconCopy, IconDownload, IconExternal, IconGauge, IconInfo, IconJoin, IconKey, IconSplit, IconTest, IconUnpack, IconX, IconHash, IconRepair, IconEye } from '../Icons';

function Modal({ size = '', icon: Icon = IconInfo, title, testid, onClose, children, foot }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && onClose) {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  const { t } = useTranslation();
  return (
    <div className="modal-backdrop" data-testid={testid}>
      <div className={`modal ${size}`} role="dialog" aria-label={title}>
        <div className="modal-head">
          <div className="modal-title"><span className="mh-icon"><Icon size={18} /></span><h2>{title}</h2></div>
          {onClose && <button className="iconbtn" onClick={onClose} title={t('common.close')}><IconX /></button>}
        </div>
        {children}
        {foot && <div className="modal-foot">{foot}</div>}
      </div>
    </div>
  );
}

// ── Asking ────────────────────────────────────────────────────────────────────────────────────

export function PasswordDialog({ wrong, onSubmit, onCancel }) {
  const { t } = useTranslation();
  const [value, setValue] = useState('');
  const [show, setShow] = useState(false);
  const ref = useRef(null);
  useEffect(() => ref.current?.focus(), []);
  const submit = () => {
    if (value) onSubmit(value);
  };
  return (
    <Modal icon={IconKey} title={t('password.title')} testid="password-dialog" onClose={onCancel} foot={(
      <>
        <button className="btn" onClick={onCancel}>{t('common.cancel')}</button>
        <button className="btn primary" data-testid="password-ok" disabled={!value} onClick={submit}>{t('common.ok')}</button>
      </>
    )}>
      <div className="modal-text">
        <p style={{ marginTop: 0 }} className={wrong ? 'hint warn' : ''} data-testid="password-prompt">{wrong ? t('password.wrong') : t('password.prompt')}</p>
        <div className="form-row">
          <input ref={ref} className="input grow" data-testid="password-input" type={show ? 'text' : 'password'} value={value} autoComplete="off" onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
          <label className="check"><input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />{t('password.show')}</label>
        </div>
      </div>
    </Modal>
  );
}

export function ConfirmDialog({ title, body, danger, onYes, onNo }) {
  const { t } = useTranslation();
  return (
    <Modal title={title} testid="confirm-dialog" onClose={onNo} foot={(
      <>
        <button className="btn" data-testid="confirm-no" onClick={onNo}>{t('confirm.no')}</button>
        <button className="btn primary" data-testid="confirm-yes" style={danger ? { background: 'var(--danger)', borderColor: 'var(--danger)' } : undefined} onClick={onYes}>{t('confirm.yes')}</button>
      </>
    )}>
      <div className="modal-text">{body}</div>
    </Modal>
  );
}

export function PromptDialog({ title, label, initial = '', onSubmit, onCancel }) {
  const { t } = useTranslation();
  const [value, setValue] = useState(initial);
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const submit = () => {
    if (value.trim() && !/[\\/:*?"<>|]/.test(value)) onSubmit(value.trim());
  };
  return (
    <Modal title={title} testid="prompt-dialog" onClose={onCancel} foot={(
      <>
        <button className="btn" onClick={onCancel}>{t('common.cancel')}</button>
        <button className="btn primary" data-testid="prompt-ok" disabled={!value.trim()} onClick={submit}>{t('common.ok')}</button>
      </>
    )}>
      <div className="modal-text">
        <div className="form-grid" style={{ gridTemplateColumns: 'auto minmax(0,1fr)' }}>
          <label>{label}</label>
          <input ref={ref} className="input" data-testid="prompt-input" value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
        </div>
      </div>
    </Modal>
  );
}

// What a person can paste into a message: which program, when, and what went wrong.
export function errorReportText({ code, title, detail, stack }) {
  return [
    `MyZipMaster ${buildInfo.version} (${isDesktop ? 'desktop' : 'web'})`,
    `Time: ${new Date().toISOString()}`,
    `System: ${navigator.userAgent}`,
    code ? `Code: ${code}` : null,
    title ? `Message: ${title}` : null,
    detail ? `Detail: ${detail}` : null,
    stack ? `Stack:\n${stack}` : null,
  ].filter(Boolean).join('\n');
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Some windows refuse the clipboard API without a user gesture it recognises.
    const area = document.createElement('textarea');
    area.value = text;
    document.body.append(area);
    area.select();
    const done = document.execCommand('copy');
    area.remove();
    return done;
  }
}

function CopyReport({ text }) {
  const { t } = useTranslation();
  const [state, setState] = useState('idle');
  const copy = async () => setState((await copyText(text)) ? 'done' : 'failed');
  return (
    <button className="btn" data-testid="error-copy" data-state={state} onClick={copy}>
      <IconCopy size={14} />{state === 'done' ? t('error.copied') : state === 'failed' ? t('error.copyFailed') : t('error.copy')}
    </button>
  );
}

export function ErrorDialog({ code, detail, stack, onClose }) {
  const { t } = useTranslation();
  const text = t(errorKey(code, detail));
  const report = useMemo(() => errorReportText({ code, title: text, detail, stack }), [code, text, detail, stack]);
  return (
    <Modal title={t('error.title')} testid="error-dialog" onClose={onClose} foot={(
      <>
        <CopyReport text={report} />
        <button className="btn primary" data-testid="error-ok" onClick={onClose}>{t('common.ok')}</button>
      </>
    )}>
      <div className="modal-text">
        <p style={{ marginTop: 0 }} data-testid="error-text" data-code={code}>{text}</p>
        <div className="pre error-details" data-testid="error-details">{report}</div>
      </div>
    </Modal>
  );
}

// When the page itself could not be drawn: nothing else is left on it.
export function ErrorReport({ detail, stack }) {
  const { t } = useTranslation();
  useEffect(() => {
    if (isDesktop) invoke('window_ready').catch(() => {});
  }, []);
  const title = t('error.unexpected');
  const report = useMemo(() => errorReportText({ code: 'unexpected', title, detail, stack }), [title, detail, stack]);
  return (
    <div className="error-page" data-testid="error-page">
      <h2>{t('error.title')}</h2>
      <p>{title}</p>
      <div className="pre error-details" data-testid="error-details">{report}</div>
      <div className="error-page-foot">
        <CopyReport text={report} />
        <button className="btn primary" data-testid="error-reload" onClick={() => window.location.reload()}>{t('error.reload')}</button>
      </div>
    </div>
  );
}

// ── Progress ──────────────────────────────────────────────────────────────────────────────────

export function ProgressDialog({ title, done, total, name, onCancel, cancelling }) {
  const { t } = useTranslation();
  const percent = total > 0 ? Math.min(100, Math.floor((done / total) * 100)) : 0;
  return (
    <Modal title={title} testid="progress-dialog" foot={<button className="btn" data-testid="progress-cancel" disabled={cancelling} onClick={onCancel}>{cancelling ? t('progress.cancelling') : t('progress.cancel')}</button>}>
      <div className="progress-body">
        <div className="progress-track big"><span style={{ width: `${percent}%` }} data-testid="progress-bar" /></div>
        <div className="progress-meta">
          <span>{total > 0 ? `${formatSize(done)} / ${formatSize(total)}` : ''}</span>
          <span>{total > 0 ? `${percent}%` : ''}</span>
        </div>
        <div className="progress-file" title={name}>{name || ' '}</div>
      </div>
    </Modal>
  );
}

// ── Extract ───────────────────────────────────────────────────────────────────────────────────

export function ExtractDialog({ initial, selectionCount, archiveCount, onCancel, onSubmit }) {
  const { t } = useTranslation();
  const [form, setForm] = useState(initial);
  const patch = (p) => setForm((f) => ({ ...f, ...p }));
  const browse = async () => {
    const path = await pickFolder({ title: t('extract.dest'), defaultPath: form.dest });
    if (path) patch({ dest: path });
  };
  return (
    <Modal size="mid" icon={IconUnpack} title={t('extract.title')} testid="extract-dialog" onClose={onCancel} foot={(
      <>
        <button className="btn" onClick={onCancel}>{t('common.cancel')}</button>
        <button className="btn primary" data-testid="extract-start" disabled={isDesktop && !form.dest.trim()} onClick={() => onSubmit(form)}>{t('extract.start')}</button>
      </>
    )}>
      <div className="modal-scroll">
        <div className="form-grid">
          {archiveCount > 1 && <div className="full hint">{t('extract.many', { count: archiveCount })}</div>}
          {isDesktop ? (
            <>
              <label>{t('extract.dest')}</label>
              <div className="form-row">
                <input className="input grow" data-testid="extract-dest" value={form.dest} onChange={(e) => patch({ dest: e.target.value })} />
                <button className="btn" data-testid="extract-browse" onClick={browse}>{t('extract.browse')}</button>
              </div>
            </>
          ) : <div className="full hint">{t('extract.webDest')}</div>}
          {selectionCount > 0 && (
            <>
              <label>{t('extract.scope')}</label>
              <select className="select" data-testid="extract-scope" value={form.scope} onChange={(e) => patch({ scope: e.target.value })}>
                <option value="all">{t('extract.all')}</option>
                <option value="selected">{t('extract.selected', { count: selectionCount })}</option>
              </select>
            </>
          )}
          <label>{t('extract.overwrite')}</label>
          <select className="select" data-testid="extract-overwrite" value={form.overwrite} onChange={(e) => patch({ overwrite: e.target.value })}>
            <option value="ask">{t('extract.overAsk')}</option>
            <option value="overwrite">{t('extract.overOverwrite')}</option>
            <option value="skip">{t('extract.overSkip')}</option>
            <option value="rename">{t('extract.overRename')}</option>
            <option value="update">{t('extract.overUpdate')}</option>
          </select>
          <span />
          <label className="check"><input type="checkbox" data-testid="extract-flatten" checked={form.flatten} onChange={(e) => patch({ flatten: e.target.checked })} />{t('extract.flatten')}</label>
          <span />
          <label className="check"><input type="checkbox" data-testid="extract-keep-broken" checked={form.keepBroken} onChange={(e) => patch({ keepBroken: e.target.checked })} />{t('extract.keepBroken')}</label>
          {isDesktop && (
            <>
              <span />
              <label className="check"><input type="checkbox" data-testid="extract-open" checked={form.openAfter} onChange={(e) => patch({ openAfter: e.target.checked })} />{t('extract.openAfter')}</label>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

export function ConflictDialog({ names, onChoose, onCancel }) {
  const { t } = useTranslation();
  return (
    <Modal size="mid" icon={IconUnpack} title={t('extract.conflictTitle')} testid="conflict-dialog" onClose={onCancel} foot={(
      <>
        <button className="btn" onClick={onCancel}>{t('common.cancel')}</button>
        <button className="btn" data-testid="conflict-skip" onClick={() => onChoose('skip')}>{t('extract.overSkip')}</button>
        <button className="btn" data-testid="conflict-rename" onClick={() => onChoose('rename')}>{t('extract.overRename')}</button>
        <button className="btn primary" data-testid="conflict-overwrite" onClick={() => onChoose('overwrite')}>{t('extract.overOverwrite')}</button>
      </>
    )}>
      <div className="modal-text">
        <p style={{ marginTop: 0 }} data-testid="conflict-text">{t('extract.conflictBody', { count: names.length })}</p>
        <div className="pre">{names.slice(0, 200).join('\n')}{names.length > 200 ? '\n…' : ''}</div>
      </div>
    </Modal>
  );
}

// ── Results ───────────────────────────────────────────────────────────────────────────────────

function Line({ ok, children }) {
  return <div className={`result-line ${ok ? 'ok' : 'bad'}`} data-testid="result-line">{ok ? <IconCheck size={18} /> : <IconX size={18} />}<span>{children}</span></div>;
}

// A list of files produced, each with what you can do with it where you are.
function OutputList({ files }) {
  const { t } = useTranslation();
  return (
    <div className="output-list" data-testid="output-list">
      {files.map((f) => (
        <div className="output-row" key={f.path} data-output={baseName(f.path)}>
          <span className="path" title={f.path}>{isDesktop ? f.path : baseName(f.path)}</span>
          <span className="size" data-size={f.size}>{formatSize(f.size)}</span>
          {!isDesktop && (
            <button className="btn" data-testid="download-one" onClick={async () => downloadBytes(await webFetch(f.path), baseName(f.path))}><IconDownload size={14} />{t('result.download')}</button>
          )}
        </div>
      ))}
    </div>
  );
}

export function CreateResult({ report, title, onClose, onOpen, onReveal }) {
  const { t } = useTranslation();
  const downloadAll = async () => {
    for (const f of report.volumes) {
      downloadBytes(await webFetch(f.path), baseName(f.path));
      // Browsers refuse a burst of downloads started at once.
      await new Promise((r) => setTimeout(r, 400));
    }
  };
  const ratio = ratioText(report.totalSize, report.packedSize);
  return (
    <Modal size="mid" title={title ?? t('result.createTitle')} testid="result-dialog" onClose={onClose} foot={(
      <>
        {isDesktop && <button className="btn" data-testid="result-reveal" onClick={() => onReveal(report.volumes[0].path)}>{t('result.reveal')}</button>}
        {!isDesktop && report.volumes.length > 1 && <button className="btn" data-testid="download-all" onClick={downloadAll}><IconDownload size={14} />{t('result.downloadAll')}</button>}
        <button className="btn" data-testid="result-open" onClick={() => onOpen(report.volumes[0].path)}>{t('result.openArchive')}</button>
        <button className="btn primary" data-testid="result-close" onClick={onClose}>{t('common.ok')}</button>
      </>
    )}>
      <div className="modal-scroll">
        <Line ok>{t('result.created', { files: report.files, size: formatSize(report.packedSize), ratio })}</Line>
        {report.sourcesRemoved?.state === 'done' && <Line ok><span data-testid="result-sources-removed">{t('result.sourcesRemoved', { count: report.sourcesRemoved.count })}</span></Line>}
        {report.sourcesRemoved && report.sourcesRemoved.state !== 'done' && <Line ok={false}><span data-testid="result-sources-kept">{t('result.sourcesKept')}{report.sourcesRemoved.detail ? ` (${report.sourcesRemoved.detail})` : ''}</span></Line>}
        {report.volumes.length > 1 && <p className="hint" data-testid="result-volumes">{t('result.volumes', { count: report.volumes.length })}</p>}
        <OutputList files={report.volumes} />
      </div>
    </Modal>
  );
}

export function ExtractResult({ report, onClose, onReveal, onDownloadZip, onSaveFolder }) {
  const { t } = useTranslation();
  const notes = [
    report.skipped.length ? t('result.skipped', { count: report.skipped.length }) : null,
    report.renamed.length ? t('result.renamed', { count: report.renamed.length }) : null,
    report.unsafePaths.length ? t('result.blocked', { count: report.unsafePaths.length }) : null,
    report.links.length ? t('result.links', { count: report.links.length }) : null,
    report.failed.length ? t('result.failed', { count: report.failed.length }) : null,
  ].filter(Boolean);
  return (
    <Modal size="mid" icon={IconUnpack} title={t('result.extractTitle')} testid="result-dialog" onClose={onClose} foot={(
      <>
        {isDesktop && <button className="btn" data-testid="result-reveal" onClick={() => onReveal(report.dest)}>{t('result.openFolder')}</button>}
        {!isDesktop && report.written.length > 0 && <button className="btn" data-testid="download-zip" onClick={onDownloadZip}><IconDownload size={14} />{t('result.downloadZip')}</button>}
        {!isDesktop && report.written.length > 0 && typeof window.showDirectoryPicker === 'function' && <button className="btn" data-testid="save-folder" onClick={onSaveFolder}>{t('result.saveToFolder')}</button>}
        <button className="btn primary" data-testid="result-close" onClick={onClose}>{t('common.ok')}</button>
      </>
    )}>
      <div className="modal-scroll">
        <Line ok={!report.failed.length}><span data-testid="extract-count" data-files={report.files}>{t('result.extracted', { files: report.files, size: formatSize(report.bytes) })}</span></Line>
        {notes.length > 0 && <p className="hint" data-testid="result-notes">{notes.join(' · ')}</p>}
        {report.failed.length > 0 && <div className="pre" data-testid="result-failed">{report.failed.map((f) => `${f.path}: ${f.detail}`).join('\n')}</div>}
        {!isDesktop && report.written.length > 0 && (
          <OutputList files={report.written.map((p) => ({ path: p, size: null }))} />
        )}
      </div>
    </Modal>
  );
}

export function TestResult({ report, onClose }) {
  const { t } = useTranslation();
  return (
    <Modal size="mid" icon={IconTest} title={t('result.testTitle')} testid="result-dialog" onClose={onClose} foot={<button className="btn primary" data-testid="result-close" onClick={onClose}>{t('common.ok')}</button>}>
      <div className="modal-scroll">
        <Line ok={report.ok}>{report.ok ? t('result.testOk') : t('result.testBad', { count: report.failed.length })}</Line>
        <p className="hint">{t('result.testFiles', { files: report.files, size: formatSize(report.bytes) })}</p>
        {report.failed.length > 0 && <div className="pre" data-testid="result-failed">{report.failed.map((f) => `${f.path || ''} ${f.detail}`.trim()).join('\n')}</div>}
      </div>
    </Modal>
  );
}

export function RepairResult({ report, onClose, onOpen }) {
  const { t } = useTranslation();
  return (
    <Modal size="mid" icon={IconRepair} title={t('result.repairTitle')} testid="result-dialog" onClose={onClose} foot={(
      <>
        <button className="btn" data-testid="result-open" onClick={() => onOpen(report.output)}>{t('result.openArchive')}</button>
        {!isDesktop && <button className="btn" data-testid="download-one" onClick={async () => downloadBytes(await webFetch(report.output), baseName(report.output))}><IconDownload size={14} />{t('result.download')}</button>}
        <button className="btn primary" data-testid="result-close" onClick={onClose}>{t('common.ok')}</button>
      </>
    )}>
      <div className="modal-scroll">
        {report.format === 'zip' ? (
          <>
            <Line ok={!report.lost}>{t('result.repaired', { recovered: report.recovered })}</Line>
            {report.lost > 0 && <p className="hint warn" data-testid="result-lost">{t('result.repairedLost', { lost: report.lost })}</p>}
            {report.lostNames.length > 0 && <div className="pre">{report.lostNames.join('\n')}</div>}
          </>
        ) : (
          <Line ok>{report.changed ? t('result.rarRepaired') : t('result.rarUnchanged')}</Line>
        )}
        <p className="hint" data-testid="repair-output">{isDesktop ? report.output : baseName(report.output)}</p>
      </div>
    </Modal>
  );
}

// ── Info ──────────────────────────────────────────────────────────────────────────────────────

export function InfoDialog({ info, onSaveComment, onClose }) {
  const { t } = useTranslation();
  const [comment, setComment] = useState(info.comment ?? '');
  const files = info.entries.filter((e) => !e.isDir);
  const size = files.reduce((n, e) => n + (e.size ?? 0), 0);
  const known = files.every((e) => e.size != null);
  const yesNo = (v) => (v ? t('info.yes') : t('info.no'));
  const spec = FORMATS[info.format];
  const canComment = !!spec?.comment && !info.readOnly;
  return (
    <Modal size="wide" title={t('info.title')} testid="info-dialog" onClose={onClose} foot={(
      <>
        {canComment && <button className="btn" data-testid="save-comment" disabled={comment === (info.comment ?? '')} onClick={() => onSaveComment(comment)}>{t('info.saveComment')}</button>}
        <button className="btn primary" onClick={onClose}>{t('common.ok')}</button>
      </>
    )}>
      <div className="modal-scroll">
        <dl className="info-grid">
          <dt>{t('info.path')}</dt><dd data-testid="info-path">{info.path}</dd>
          <dt>{t('info.format')}</dt><dd data-testid="info-format">{info.format.toUpperCase()}</dd>
          <dt>{t('info.files')}</dt><dd data-testid="info-files">{files.length}</dd>
          <dt>{t('info.folders')}</dt><dd>{info.entries.length - files.length}</dd>
          <dt>{t('info.size')}</dt><dd>{known ? `${formatSize(size)} (${size.toLocaleString()} B)` : '—'}</dd>
          <dt>{t('info.packed')}</dt><dd>{formatSize(info.packedSize)} ({info.packedSize.toLocaleString()} B)</dd>
          <dt>{t('info.ratio')}</dt><dd>{known ? ratioText(size, info.packedSize) : '—'}</dd>
          <dt>{t('info.volumes')}</dt><dd data-testid="info-volumes">{info.volumes.length}</dd>
          <dt>{t('info.encryption')}</dt><dd data-testid="info-encrypted">{yesNo(info.encrypted)}</dd>
          <dt>{t('info.headerEncrypted')}</dt><dd>{yesNo(info.headerEncrypted)}</dd>
          <dt>{t('info.solid')}</dt><dd>{yesNo(info.solid)}</dd>
          <dt>{t('info.recovery')}</dt><dd data-testid="info-recovery">{yesNo(info.hasRecovery)}</dd>
        </dl>
        {info.volumes.length > 1 && <div className="pre" style={{ marginTop: 10 }} data-testid="info-volume-list">{info.volumes.map(baseName).join('\n')}</div>}
        <div style={{ marginTop: 12 }}>
          <div className="hint" style={{ marginBottom: 4 }}>{t('info.comment')}</div>
          {canComment
            ? <textarea className="textarea" style={{ height: 90 }} data-testid="info-comment" value={comment} onChange={(e) => setComment(e.target.value)} />
            : (info.comment ? <div className="pre" data-testid="info-comment-text">{info.comment}</div> : <div className="hint">{t('info.noComment')}</div>)}
        </div>
      </div>
    </Modal>
  );
}

// ── Preview ───────────────────────────────────────────────────────────────────────────────────

const PREVIEW_LIMIT = 8 * 1024 * 1024;
const IMAGE = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml', ico: 'image/x-icon', avif: 'image/avif' };

function looksBinary(bytes) {
  const n = Math.min(bytes.length, 8000);
  // UTF-16 text has its own marks; anything else with NULs is not text.
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return false;
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return false;
  for (let i = 0; i < n; i += 1) if (bytes[i] === 0) return true;
  return false;
}

export function decodeText(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('euc-kr').decode(bytes);
  }
}

export function hexDump(bytes, limit = 4096) {
  const lines = [];
  const n = Math.min(bytes.length, limit);
  for (let i = 0; i < n; i += 16) {
    const row = [...bytes.slice(i, i + 16)];
    const hex = row.map((b) => b.toString(16).padStart(2, '0')).join(' ').padEnd(47, ' ');
    const text = row.map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : '.')).join('');
    lines.push(`${i.toString(16).padStart(8, '0')}  ${hex}  ${text}`);
  }
  return lines.join('\n');
}

export function PreviewDialog({ archive, password, encoding, entry, onClose, onError, onOpenExternal }) {
  const { t } = useTranslation();
  const [state, setState] = useState(null);
  useEffect(() => {
    let dead = false;
    let url = null;
    readEntry({ path: archive, entry: entry.path, password: password ?? undefined, encoding: encoding === 'auto' ? undefined : encoding, limit: PREVIEW_LIMIT })
      .then((bytes) => {
        if (dead) return;
        const ext = entry.name.toLowerCase().split('.').pop();
        if (IMAGE[ext]) {
          url = URL.createObjectURL(new Blob([bytes], { type: IMAGE[ext] }));
          setState({ kind: 'image', url });
        } else if (looksBinary(bytes)) {
          setState({ kind: 'hex', text: hexDump(bytes) });
        } else {
          setState({ kind: 'text', text: decodeText(bytes), truncated: (entry.size ?? 0) > bytes.length });
        }
      })
      .catch((e) => {
        if (!dead) onError(e);
      });
    return () => {
      dead = true;
      if (url) URL.revokeObjectURL(url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [archive, entry.path]);

  return (
    <Modal size="xwide" icon={IconEye} title={`${t('preview.title')} — ${entry.name}`} testid="preview-dialog" onClose={onClose} foot={(
      <>
        {isDesktop && <button className="btn" data-testid="preview-external" onClick={onOpenExternal}><IconExternal size={14} />{t('preview.openExternal')}</button>}
        <button className="btn primary" onClick={onClose}>{t('common.close')}</button>
      </>
    )}>
      <div className="preview-body">
        {state?.kind === 'image' && <img className="preview-img" data-testid="preview-image" src={state.url} alt={entry.name} />}
        {state?.kind === 'text' && (
          <>
            {state.truncated && <div className="hint" style={{ padding: '8px 14px 0' }}>{t('preview.truncated', { size: formatSize(PREVIEW_LIMIT) })}</div>}
            <pre className="preview-text" data-testid="preview-text">{state.text}</pre>
          </>
        )}
        {state?.kind === 'hex' && (
          <>
            <div className="hint" style={{ padding: '8px 14px 0' }}>{t('preview.binary')}</div>
            <pre className="preview-text" data-testid="preview-hex">{state.text}</pre>
          </>
        )}
      </div>
    </Modal>
  );
}

// ── Tools ─────────────────────────────────────────────────────────────────────────────────────

// The user's own theme. Colours apply as they are chosen; Cancel puts the old ones back.
export function CustomThemeDialog({ initial, onChange, onSave, onCancel }) {
  const { t } = useTranslation();
  const [colors, setColors] = useState(initial);
  const set = (key, value) => {
    const next = { ...colors, [key]: value };
    setColors(next);
    onChange(next);
  };
  return (
    <Modal title={t('theme.customTitle')} testid="custom-theme-dialog" onClose={onCancel} foot={(
      <>
        <button className="btn" data-testid="custom-cancel" onClick={onCancel}>{t('common.cancel')}</button>
        <button className="btn primary" data-testid="custom-save" onClick={() => onSave(colors)}>{t('common.ok')}</button>
      </>
    )}>
      <div className="modal-scroll">
        <div className="form-grid">
          {['bg', 'panel', 'text', 'accent'].map((key) => (
            <React.Fragment key={key}>
              <label>{t(`theme.color_${key}`)}</label>
              <div className="form-row">
                <input className="color-input" type="color" data-custom-color={key} value={colors[key]} onChange={(e) => set(key, e.target.value)} />
                <code className="hint">{colors[key]}</code>
              </div>
            </React.Fragment>
          ))}
        </div>
      </div>
    </Modal>
  );
}

export const HASHES = ['crc32', 'crc64', 'md5', 'sha1', 'sha256', 'sha512', 'blake3'];

export function HashDialog({ initial, onRun, onAddWeb, onClose, onCopied }) {
  const { t } = useTranslation();
  const [files, setFiles] = useState(initial);
  const [algos, setAlgos] = useState(['crc32', 'sha256']);
  const [rows, setRows] = useState(null);

  const addFiles = async () => {
    if (!isDesktop) return onAddWeb('files', (items) => setFiles((f) => [...f, ...items]));
    const paths = await pickFiles({ title: t('hash.addFiles') });
    if (paths) setFiles((f) => [...f, ...paths.map((path) => ({ path, label: baseName(path) }))]);
    return undefined;
  };
  const addFolder = async () => {
    if (!isDesktop) return onAddWeb('folder', (items) => setFiles((f) => [...f, ...items]));
    const path = await pickFolder({ title: t('hash.addFolder') });
    if (path) setFiles((f) => [...f, { path, label: baseName(path) }]);
    return undefined;
  };
  const start = async () => setRows(await onRun(files.map((f) => f.path), algos));
  const toggle = (a) => setAlgos((list) => (list.includes(a) ? list.filter((x) => x !== a) : [...list, a]));
  const asText = rows?.map((r) => algos.filter((a) => r.hashes[a]).map((a) => `${r.hashes[a]}  ${baseName(r.path)}  (${a})`).join('\n')).join('\n');
  const copy = async () => {
    await navigator.clipboard.writeText(asText);
    onCopied();
  };
  return (
    <Modal size="xwide" icon={IconHash} title={t('hash.title')} testid="hash-dialog" onClose={onClose} foot={(
      <>
        <button className="btn" data-testid="hash-add-files" onClick={addFiles}>{t('hash.addFiles')}</button>
        <button className="btn" data-testid="hash-add-folder" onClick={addFolder}>{t('hash.addFolder')}</button>
        <span style={{ flex: 1 }} />
        {rows && <button className="btn" data-testid="hash-copy" onClick={copy}><IconCopy size={14} />{t('hash.copy')}</button>}
        <button className="btn primary" data-testid="hash-start" disabled={!files.length || !algos.length} onClick={start}>{t('hash.start')}</button>
      </>
    )}>
      <div className="modal-scroll">
        <div className="form-row" style={{ flexWrap: 'wrap', marginBottom: 10 }}>
          {HASHES.map((a) => <label key={a} className="check"><input type="checkbox" data-hash={a} checked={algos.includes(a)} onChange={() => toggle(a)} />{a.toUpperCase()}</label>)}
        </div>
        {!files.length && <p className="hint">{t('hash.noFiles')}</p>}
        {files.length > 0 && !rows && <div className="pre" data-testid="hash-files">{files.map((f) => f.label ?? f.path).join('\n')}</div>}
        {rows && (
          <table className="mini-table" data-testid="hash-table">
            <thead><tr><th>{t('hash.file')}</th><th>{t('hash.algorithms')}</th><th>{t('hash.value')}</th></tr></thead>
            <tbody>
              {rows.flatMap((r) => algos.filter((a) => r.hashes[a]).map((a) => (
                <tr key={`${r.path}-${a}`}>
                  <td title={r.path}>{baseName(r.path)}</td>
                  <td>{a.toUpperCase()}</td>
                  <td className="hash-value" data-testid={`hash-${a}`}>{r.hashes[a]}</td>
                </tr>
              )))}
            </tbody>
          </table>
        )}
      </div>
    </Modal>
  );
}

export function SplitDialog({ onRun, onPickWeb, onClose }) {
  const { t } = useTranslation();
  const [file, setFile] = useState(null);
  const [text, setText] = useState('100');
  const [unit, setUnit] = useState('MB');
  const [outDir, setOutDir] = useState('');
  const bytes = parseSize(text, unit);
  const pick = async () => {
    if (!isDesktop) return onPickWeb((items) => setFile(items[0]));
    const paths = await pickFiles({ multiple: false, title: t('split.pick') });
    if (paths?.[0]) setFile({ path: paths[0], label: baseName(paths[0]) });
    return undefined;
  };
  const dir = async () => {
    const path = await pickFolder({ title: t('split.outDir') });
    if (path) setOutDir(path);
  };
  return (
    <Modal size="mid" icon={IconSplit} title={t('split.title')} testid="split-dialog" onClose={onClose} foot={(
      <>
        <button className="btn" onClick={onClose}>{t('common.cancel')}</button>
        <button className="btn primary" data-testid="split-start" disabled={!file || !bytes} onClick={() => onRun({ path: file.path, volumeSize: bytes, outDir: outDir || undefined })}>{t('split.start')}</button>
      </>
    )}>
      <div className="modal-scroll">
        <p className="hint" style={{ marginTop: 0 }}>{t('split.hint')}</p>
        <div className="form-grid">
          <label>{t('split.file')}</label>
          <div className="form-row">
            <span className="grow" data-testid="split-file" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{file?.label ?? ''}</span>
            <button className="btn" data-testid="split-pick" onClick={pick}>{t('split.pick')}</button>
          </div>
          <label>{t('split.size')}</label>
          <div className="form-row">
            <Stepper
              id="split-size"
              value={text}
              step={SIZE_STEP[unit] ?? 1}
              min={1}
              invalid={!bytes}
              onChange={setText}
              unitNode={<select className="stepper-unit-select" data-testid="split-size-unit" value={unit} onChange={(e) => setUnit(e.target.value)}>{SIZE_UNITS.map((u) => <option key={u}>{u}</option>)}</select>}
            />
            {!bytes && <span className="hint warn">{t('split.err')}</span>}
          </div>
          {isDesktop && (
            <>
              <label>{t('split.outDir')}</label>
              <div className="form-row">
                <input className="input grow" data-testid="split-outdir" placeholder={t('split.outDirHint')} value={outDir} onChange={(e) => setOutDir(e.target.value)} />
                <button className="btn" onClick={dir}>{t('extract.browse')}</button>
              </div>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

export function SplitResult({ files, onClose, onReveal }) {
  const { t } = useTranslation();
  return (
    <Modal size="mid" icon={IconSplit} title={t('result.splitTitle')} testid="result-dialog" onClose={onClose} foot={(
      <>
        {isDesktop && <button className="btn" data-testid="result-reveal" onClick={() => onReveal(files[0].path)}>{t('result.reveal')}</button>}
        <button className="btn primary" data-testid="result-close" onClick={onClose}>{t('common.ok')}</button>
      </>
    )}>
      <div className="modal-scroll">
        <Line ok>{t('result.part', { count: files.length, size: formatSize(Math.max(...files.map((f) => f.size))) })}</Line>
        <OutputList files={files} />
      </div>
    </Modal>
  );
}

export function JoinDialog({ onRun, onPickWeb, onClose }) {
  const { t } = useTranslation();
  const [part, setPart] = useState(null);
  const [output, setOutput] = useState('');
  const pick = async () => {
    if (!isDesktop) return onPickWeb((items) => setPart(items.find((i) => /\.0*1$/.test(i.path)) ?? items[0]));
    const paths = await pickFiles({ multiple: false, title: t('join.first') });
    if (paths?.[0]) setPart({ path: paths[0], label: baseName(paths[0]) });
    return undefined;
  };
  const browse = async () => {
    const path = await pickSave({ title: t('join.output') });
    if (path) setOutput(path);
  };
  return (
    <Modal size="mid" icon={IconJoin} title={t('join.title')} testid="join-dialog" onClose={onClose} foot={(
      <>
        <button className="btn" onClick={onClose}>{t('common.cancel')}</button>
        <button className="btn primary" data-testid="join-start" disabled={!part} onClick={() => onRun({ path: part.path, output: output || undefined })}>{t('join.start')}</button>
      </>
    )}>
      <div className="modal-scroll">
        <div className="form-grid">
          <label>{t('join.first')}</label>
          <div className="form-row">
            <span className="grow" data-testid="join-file" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{part?.label ?? ''}</span>
            <button className="btn" data-testid="join-pick" onClick={pick}>{t('split.pick')}</button>
          </div>
          {isDesktop && (
            <>
              <label>{t('join.output')}</label>
              <div className="form-row">
                <input className="input grow" data-testid="join-output" placeholder={t('join.outputHint')} value={output} onChange={(e) => setOutput(e.target.value)} />
                <button className="btn" onClick={browse}>{t('create.browse')}</button>
              </div>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

export function BenchmarkDialog({ onRun, onClose }) {
  const { t } = useTranslation();
  const [mb, setMb] = useState(32);
  const [rows, setRows] = useState(null);
  const speed = (v) => `${v.toFixed(1)} MB/s`;
  return (
    <Modal size="wide" icon={IconGauge} title={t('bench.title')} testid="benchmark-dialog" onClose={onClose} foot={(
      <>
        <button className="btn" onClick={onClose}>{t('common.close')}</button>
        <button className="btn primary" data-testid="bench-run" disabled={!(Number(mb) >= 1 && Number(mb) <= 512)} onClick={async () => setRows(await onRun(Number(mb)))}>{t('bench.run')}</button>
      </>
    )}>
      <div className="modal-scroll">
        <p className="hint" style={{ marginTop: 0 }}>{t('bench.hint')}</p>
        <div className="form-row" style={{ marginBottom: 10 }}>
          <span>{t('bench.size')}</span>
          <Stepper id="bench-size" value={mb} unit="MB" step={8} min={1} max={512} onChange={(v) => setMb(v)} />
        </div>
        {rows && (
          <table className="mini-table" data-testid="bench-table">
            <thead><tr><th>{t('bench.method')}</th><th className="num">{t('bench.compress')}</th><th className="num">{t('bench.decompress')}</th><th className="num">{t('bench.ratio')}</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.method} data-method={r.method}>
                  <td>{r.method}</td>
                  <td className="num">{speed(r.compressMbS)}</td>
                  <td className="num">{speed(r.decompressMbS)}</td>
                  <td className="num">{ratioText(r.size, r.packed)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Modal>
  );
}

export function useAppInfo() {
  const [info, setInfo] = useState(null);
  useEffect(() => {
    if (isDesktop) invoke('app_info').then(setInfo).catch(() => {});
    else setInfo({ platform: 'web' });
  }, []);
  return info;
}

export { formatDate, useMemo };
