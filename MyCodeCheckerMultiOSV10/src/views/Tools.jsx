// Required / recommended external software: start-up offer and a permanent
// manager (Tools › Required software…, Administration › Required software).
// Nothing is installed until the user presses Install for that tool.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { t, textOf, useLanguage } from '../lib/i18n';
import { call, openExternal } from '../lib/backend';
import { Icon, Dialog } from '../components/Chrome';
import { Btn, BtnGroup, Toggle, Empty, copyText } from './common';

const TOOL_ICON = { git: 'branch', clang: 'cpu' };
const POLL_MS = 700;

// Install jobs per tool id, polled while running.
function useInstaller(onFinished) {
  const [jobs, setJobs] = useState({});
  const [errors, setErrors] = useState({});
  const timers = useRef({});
  const finished = useRef(onFinished);
  finished.current = onFinished;
  useEffect(() => () => { Object.values(timers.current).forEach(clearTimeout); }, []);
  const poll = useCallback((toolId, jobId) => {
    timers.current[toolId] = setTimeout(async () => {
      try {
        const job = await call('tools.job', { id: jobId });
        setJobs((all) => ({ ...all, [toolId]: job }));
        window.dispatchEvent(new CustomEvent('mcc-job', { detail: job }));
        if (job.status === 'running') poll(toolId, jobId);
        else if (finished.current) finished.current(toolId, job);
      } catch (err) {
        setErrors((all) => ({ ...all, [toolId]: err.message }));
      }
    }, POLL_MS);
  }, []);
  const install = useCallback(async (tool) => {
    setErrors((all) => ({ ...all, [tool.id]: '' }));
    try {
      const job = await call('tools.install', { id: tool.id, manager: tool.manager || undefined });
      setJobs((all) => ({ ...all, [tool.id]: job }));
      window.dispatchEvent(new CustomEvent('mcc-job', { detail: job }));
      if (job.status === 'running') poll(tool.id, job.id);
      else if (finished.current) finished.current(tool.id, job);
    } catch (err) {
      setErrors((all) => ({ ...all, [tool.id]: err.message }));
    }
  }, [poll]);
  const busy = Object.values(jobs).some((j) => j && j.status === 'running');
  return { jobs, errors, install, busy };
}

function ToolBadges({ tool }) {
  useLanguage();
  return (
    <span className="tool-badges">
      {tool.required && <span className="status-pill tone-bad"><Icon name="alert" size={12} />{t('tl_required')}</span>}
      {!tool.required && tool.recommended && <span className="status-pill tone-info"><Icon name="star" size={12} />{t('tl_recommended')}</span>}
      {!tool.required && !tool.recommended && <span className="status-pill tone-muted"><Icon name="circleDot" size={12} />{t('tl_optional')}</span>}
      {tool.installed
        ? <span className="status-pill tone-ok"><Icon name="checkCircle" size={12} />{t('tl_installed')}{tool.version ? ` ${tool.version}` : ''}</span>
        : <span className="status-pill tone-warn"><Icon name="xCircle" size={12} />{t('tl_missing')}</span>}
      {tool.declined && !tool.installed && <span className="status-pill tone-muted"><Icon name="ban" size={12} />{t('tl_declined')}</span>}
    </span>
  );
}

function CommandLine({ command }) {
  useLanguage();
  const [copied, setCopied] = useState(false);
  if (!command) return null;
  return (
    <div className="tool-cmd">
      <span className="tool-cmd-label"><Icon name="terminal" size={13} />{t('tl_command')}</span>
      <code className="mono selectable">{command}</code>
      <button type="button" className="icon-btn" title={copied ? t('tl_copied') : t('tl_copy')} aria-label={t('tl_copy')}
        onClick={async () => { if (await copyText(command)) { setCopied(true); setTimeout(() => setCopied(false), 1500); } }}>
        <Icon name={copied ? 'check' : 'copy'} size={14} />
      </button>
    </div>
  );
}

function JobView({ job, error, tool }) {
  useLanguage();
  const logRef = useRef(null);
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [job && job.log && job.log.length]);
  if (!job && !error) return null;
  const status = error ? 'failed' : job.status;
  return (
    <div className={`tool-job job-${status}`}>
      <div className="tool-job-head">
        {status === 'running' && <><Icon name="spinner" size={15} className="spin" /><strong>{t('tl_installing')}</strong></>}
        {status === 'done' && <><Icon name="checkCircle" size={15} /><strong>{t('tl_done')}</strong></>}
        {status === 'failed' && <><Icon name="xCircle" size={15} /><strong>{t('tl_failed')}</strong></>}
        {job && job.exitCode != null && <span className="small">{t('tl_exit', { n: job.exitCode })}</span>}
      </div>
      {status === 'running' && <div className="progress-bar indeterminate"><span /></div>}
      {error && <p className="small bad">{error}</p>}
      {job && job.log && job.log.length > 0 && <pre ref={logRef} className="pre small-pre tool-log selectable">{job.log.join('\n')}</pre>}
      {status === 'failed' && tool.url && (
        <div className="tool-fail-help">
          <span className="small">{t('tl_failed_hint')}</span>
          <Btn icon="external" label={t('tl_download')} onClick={() => openExternal(tool.url)} title={tool.url} />
        </div>
      )}
    </div>
  );
}

function ToolCard({ tool, job, error, children }) {
  useLanguage();
  return (
    <div className={`tool-card ${tool.installed ? 'is-installed' : ''}`}>
      <div className="tool-head">
        <span className="tool-icon"><Icon name={TOOL_ICON[tool.id] || 'package'} size={22} /></span>
        <div className="tool-title">
          <strong>{tool.name}</strong>
          <ToolBadges tool={tool} />
        </div>
      </div>
      <div className="tool-body">
        <p className="tool-line"><Icon name="lightbulb" size={14} /><span><b>{t('tl_why')}</b> {textOf(tool.why)}</span></p>
        <p className="tool-line"><Icon name="info" size={14} /><span><b>{t('tl_without')}</b> {textOf(tool.without)}</span></p>
        {tool.installed && tool.path && <p className="tool-line"><Icon name="folder" size={14} /><span className="mono selectable">{tool.path}</span></p>}
        {!tool.installed && <CommandLine command={job ? job.command : tool.command} />}
        {!tool.installed && !tool.canInstall && (
          <p className="tool-line warn-text"><Icon name="alert" size={14} /><span>{t('tl_no_manager')}</span></p>
        )}
        <JobView job={job} error={error} tool={tool} />
      </div>
      {children && <div className="tool-actions">{children}</div>}
    </div>
  );
}

// ── Start-up offer ────────────────────────────────────────
export function ToolOfferDialog({ offers, onClose, onChanged }) {
  useLanguage();
  const [handled, setHandled] = useState({});
  const [askOnStart, setAskOnStart] = useState(true);
  const [error, setError] = useState('');
  const { jobs, errors, install, busy } = useInstaller(() => onChanged && onChanged());
  const later = (id) => setHandled((h) => ({ ...h, [id]: 'later' }));
  const decline = async (id) => {
    setError('');
    try { await call('tools.decline', { id }); setHandled((h) => ({ ...h, [id]: 'declined' })); if (onChanged) onChanged(); } catch (err) { setError(err.message); }
  };
  const setAsk = async (value) => {
    setAskOnStart(value);
    try { await call('tools.askOnStart', { value }); if (onChanged) onChanged(); } catch (err) { setError(err.message); }
  };
  const open = offers.filter((tool) => !handled[tool.id] || jobs[tool.id]);
  return (
    <Dialog title={t('tl_offer_title')} icon="installBox" onClose={busy ? () => {} : onClose} wide>
      <p className="tool-intro"><Icon name="info" size={15} /><span>{t('tl_offer_body')}</span></p>
      {open.length === 0 && <Empty icon="checkCircle" text={t('tl_offer_all_done')} />}
      {open.map((tool) => {
        const job = jobs[tool.id];
        const done = job && job.status === 'done';
        const running = job && job.status === 'running';
        return (
          <ToolCard key={tool.id} tool={done ? { ...tool, installed: true } : tool} job={job} error={errors[tool.id]}>
            {!done && (
              <BtnGroup>
                <Btn icon="installBox" label={running ? t('tl_installing') : t('tl_install')} primary disabled={busy || !tool.canInstall} onClick={() => install(tool)} title={tool.command || t('tl_install')} />
                <Btn icon="clock" label={t('tl_later')} disabled={running} onClick={() => later(tool.id)} title={t('tl_later_tip')} />
                <Btn icon="ban" label={t('tl_never')} disabled={running} onClick={() => decline(tool.id)} title={t('tl_never_tip')} />
              </BtnGroup>
            )}
          </ToolCard>
        );
      })}
      {error && <p className="small bad">{error}</p>}
      <div className="dialog-actions tool-offer-foot">
        <Toggle icon="clock" label={t('tl_ask_on_start')} checked={askOnStart} onChange={setAsk} />
        <span className="spacer" />
        <Btn icon="close" label={t('close')} disabled={busy} onClick={onClose} />
      </div>
    </Dialog>
  );
}

// ── Permanent manager ─────────────────────────────────────
export function ToolsManager({ onChanged }) {
  useLanguage();
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try { setStatus(await call('tools.status')); } catch (err) { setError(err.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const { jobs, errors, install, busy } = useInstaller(() => { load(); if (onChanged) onChanged(); });
  const apply = async (method, args) => {
    setError('');
    try { setStatus(await call(method, args)); if (onChanged) onChanged(); } catch (err) { setError(err.message); }
  };
  if (!status) return error ? <Empty icon="alert" text={error} /> : <Empty icon="hourglass" text={t('loading')} />;
  const missing = status.tools.filter((tool) => !tool.installed).length;
  return (
    <div className="tools-manager">
      <div className="tools-summary">
        <span className="status-pill tone-info"><Icon name="cpu" size={12} />{t('tl_platform')} {status.platform}</span>
        <span className="status-pill tone-muted"><Icon name="package" size={12} />{t('tl_managers')} {status.managers.length ? status.managers.join(', ') : t('tl_none')}</span>
        <span className="status-pill tone-muted"><Icon name="code" size={12} />Node {status.node}</span>
        <span className={`status-pill tone-${missing ? 'warn' : 'ok'}`}><Icon name={missing ? 'alert' : 'checkCircle'} size={12} />{missing ? t('tl_missing_n', { n: missing }) : t('tl_all_installed')}</span>
        <span className="spacer" />
        <Toggle icon="clock" label={t('tl_ask_on_start')} checked={status.askOnStart} onChange={(v) => apply('tools.askOnStart', { value: v })} />
        <Btn icon="refresh" label={t('tl_refresh')} disabled={loading || busy} onClick={load} />
      </div>
      {error && <p className="small bad">{error}</p>}
      <div className="tool-list">
        {status.tools.map((tool) => {
          const job = jobs[tool.id];
          const running = job && job.status === 'running';
          return (
            <ToolCard key={tool.id} tool={tool} job={job} error={errors[tool.id]}>
              {!tool.installed && (
                <BtnGroup>
                  {tool.canInstall && <Btn icon="installBox" label={running ? t('tl_installing') : t('tl_install')} primary disabled={busy} onClick={() => install(tool)} title={tool.command || t('tl_install')} />}
                  {tool.url && <Btn icon="external" label={t('tl_download')} onClick={() => openExternal(tool.url)} title={tool.url} />}
                  {tool.declined
                    ? <Btn icon="refresh" label={t('tl_ask_again')} disabled={running} onClick={() => apply('tools.decline', { id: tool.id, undo: true })} title={t('tl_ask_again_tip')} />
                    : <Btn icon="ban" label={t('tl_never')} disabled={running} onClick={() => apply('tools.decline', { id: tool.id })} title={t('tl_never_tip')} />}
                </BtnGroup>
              )}
            </ToolCard>
          );
        })}
      </div>
    </div>
  );
}

export function ToolsDialog({ onClose, onChanged }) {
  useLanguage();
  return (
    <Dialog title={t('tl_title')} icon="installBox" onClose={onClose} wide>
      <p className="small view-hint">{t('tl_hint')}</p>
      <ToolsManager onChanged={onChanged} />
    </Dialog>
  );
}
