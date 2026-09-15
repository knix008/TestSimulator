// Installing a formatter (install.start / install.status): shows the command,
// an activity bar while the package manager runs and its output as it
// arrives (long poll), then the result. Cancel kills the installer.
import React, { useEffect, useRef, useState } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { call } from '../lib/backend';
import { Icon } from '../components/Icons';
import { Dialog } from './Dialogs';

export function InstallDialog({ tool, jobId, onResult, doneLabel }) {
  useLanguage();
  const [state, setState] = useState('running');
  const [command, setCommand] = useState('');
  const [log, setLog] = useState('');
  const logRef = useRef(null);

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
        setState(st.state);
        if (st.state !== 'running') return;
      }
    })();
    return () => { stop = true; };
  }, [jobId]);
  useEffect(() => { const el = logRef.current; if (el) el.scrollTop = el.scrollHeight; }, [log]);

  const running = state === 'running';
  const title = t(running ? 'inst_title' : state === 'done' ? 'inst_done' : state === 'cancelled' ? 'inst_cancelled' : 'inst_failed', { tool });
  return (
    <Dialog title={title} icon={state === 'done' ? 'check' : state === 'failed' ? 'warning' : 'download'} kind={state === 'failed' ? 'danger' : 'info'} width={640} onClose={() => { if (running) call('install.cancel', { id: jobId }).catch(() => {}); onResult(state === 'done'); }}
      footer={running
        ? <button className="btn" onClick={() => call('install.cancel', { id: jobId }).catch(() => {})}>{t('cancel')}</button>
        : <button className="btn primary" onClick={() => onResult(state === 'done')}>{state === 'done' ? (doneLabel || t('close')) : t('close')}</button>}>
      <div className="inst">
        <div className="inst-head">
          {running ? <span className="inst-spinner" /> : <Icon name={state === 'done' ? 'check' : 'warning'} size={16} />}
          <span>{running ? t('inst_running', { tool }) : title}</span>
        </div>
        {running && <div className="inst-bar"><span /></div>}
        {command && <div className="mono small muted inst-cmd">{command}</div>}
        <pre className="inst-log mono selectable" ref={logRef}>{log || '…'}</pre>
      </div>
    </Dialog>
  );
}

export default InstallDialog;
