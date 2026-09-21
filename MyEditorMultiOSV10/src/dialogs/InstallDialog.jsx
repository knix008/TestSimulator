// Installing a formatter or checker (install.start / install.status): a
// four-step checklist (ready → download → install → ready to use), the
// command, then the package-manager log folded away until asked for.
import React, { useEffect, useRef, useState } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { call } from '../lib/backend';
import { Icon } from '../components/Icons';
import { Dialog } from './Dialogs';
import { INSTALL_KIND_LABEL, installProgress } from '../lib/install-progress';

function StepMark({ status }) {
  if (status === 'done') return <Icon name="check" size={14} />;
  if (status === 'run') return <span className="inst-spinner" />;
  if (status === 'failed') return <Icon name="warning" size={14} />;
  return <span className="inst-dot" />;
}

export function InstallDialog({ tool, jobId: jobId0, onResult, onApplied, doneLabel, installRuntime = false }) {
  useLanguage();
  const [jobId, setJobId] = useState(jobId0);
  const [state, setState] = useState('running');
  const [command, setCommand] = useState('');
  const [kind, setKind] = useState('');
  const [log, setLog] = useState('');
  const [showLog, setShowLog] = useState(false);
  const logRef = useRef(null);
  const onAppliedRef = useRef(onApplied);
  onAppliedRef.current = onApplied;
  const applied = useRef(false);

  useEffect(() => { applied.current = false; }, [jobId]);
  useEffect(() => {
    let stop = false;
    let since = 0;
    (async () => {
      while (!stop) {
        let st;
        try { st = await call('install.status', { id: jobId, since, wait: 2000 }); } catch { await new Promise((r) => setTimeout(r, 500)); continue; }
        if (stop) return;
        if (!st) { setState('failed'); return; }
        if (st.log.length) setLog((prev) => prev + st.log.join(''));
        since = st.seq;
        setCommand(st.command || '');
        setKind(st.kind || '');
        setState(st.state);
        if (st.state === 'failed' || st.state === 'cancelled') setShowLog(true);
        if (st.state === 'done' && !applied.current) {
          applied.current = true;
          try { await onAppliedRef.current?.(true); } catch { /* listing / re-check is best-effort */ }
        }
        if (st.state !== 'running') return;
      }
    })();
    return () => { stop = true; };
  }, [jobId]);
  useEffect(() => { const el = logRef.current; if (el) el.scrollTop = el.scrollHeight; }, [log, showLog]);

  const retry = async () => {
    setLog('');
    setCommand('');
    setShowLog(false);
    setState('running');
    let st;
    try { st = await call('install.start', { tool, reinstall: true, installRuntime }); } catch (e) { st = { error: e.message }; }
    if (st.error || st.manual || st.missing) {
      setState('failed');
      setLog(st.error || st.manual || (st.missing ? t('inst_missing_pm', { pm: st.missing, tool }) : ''));
      setShowLog(true);
      return;
    }
    applied.current = false;
    setJobId(st.id);
  };

  const running = state === 'running';
  const title = t(running ? 'inst_title' : state === 'done' ? 'inst_done' : state === 'cancelled' ? 'inst_cancelled' : 'inst_failed', { tool });
  const steps = installProgress(state, log);
  const kindLabel = kind && INSTALL_KIND_LABEL[kind] ? t(INSTALL_KIND_LABEL[kind]) : '';
  const canRetry = state === 'failed' || state === 'cancelled';
  return (
    <Dialog title={title} icon={state === 'done' ? 'check' : state === 'failed' ? 'warning' : 'download'} kind={state === 'failed' ? 'danger' : 'info'} width={640} onClose={() => { if (running) call('install.cancel', { id: jobId }).catch(() => {}); onResult(state === 'done'); }}
      footer={running
        ? <button className="btn" onClick={() => call('install.cancel', { id: jobId }).catch(() => {})}>{t('cancel')}</button>
        : <>
            {canRetry && <button className="btn primary" onClick={retry}>{t('inst_retry')}</button>}
            <button className={canRetry ? 'btn' : 'btn primary'} onClick={() => onResult(state === 'done')}>{state === 'done' ? (doneLabel || t('close')) : t('close')}</button>
          </>}>
      <div className="inst">
        <div className="inst-head">
          {running ? <span className="inst-spinner" /> : <Icon name={state === 'done' ? 'check' : 'warning'} size={16} />}
          <span>{running ? t('inst_running', { tool }) : title}</span>
        </div>
        {kindLabel ? <div className="muted small">{t('inst_via', { pm: kindLabel })}</div> : null}
        {running && <div className="inst-bar"><span /></div>}
        <ol className="inst-steps">
          {steps.map((s, i) => (
            <li key={s.id} className={`inst-step ${s.status}`}>
              <StepMark status={s.status} />
              <span className="inst-step-n">{i + 1}</span>
              <span>{t(s.label)}</span>
            </li>
          ))}
        </ol>
        {command && <div className="mono small muted inst-cmd">{command}</div>}
        <button type="button" className="btn small inst-log-toggle" onClick={() => setShowLog((v) => !v)}>
          {t(showLog ? 'inst_log_hide' : 'inst_log_show')}
        </button>
        {showLog && <pre className="inst-log mono selectable" ref={logRef}>{log || '…'}</pre>}
      </div>
    </Dialog>
  );
}

export default InstallDialog;
