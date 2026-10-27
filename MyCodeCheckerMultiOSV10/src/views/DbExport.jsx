// Saving an analysis to the database as a job (db.exportStart / db.exportJob):
// after about half a second a progress popup shows the step, rows written,
// elapsed / remaining time and the per-statement time limit, with Cancel.
// A timeout or any other failure rejects with the server's coded error, which
// callers show with showError (a popup).
import React, { useRef, useState } from 'react';
import { t } from '../lib/i18n';
import { call } from '../lib/backend';
import { ScanProgress } from './ScanProgress';

export function useDbExport() {
  const [state, setState] = useState(null); // { id, job, shown }
  const ref = useRef(null);
  ref.current = state;
  const run = async (args) => {
    const started = await call('db.exportStart', args);
    if (!started || !started.jobId) return started;
    const id = started.jobId;
    const t0 = performance.now();
    setState({ id, job: { status: 'running', progress: { phase: 'db', dbPhase: 'connect', percent: 0 } }, shown: false });
    try {
      for (;;) {
        await new Promise((r) => setTimeout(r, 300));
        const job = await call('db.exportJob', { jobId: id });
        if (job.status === 'running') {
          setState((s) => (s && s.id === id ? { ...s, job: s.job.status === 'cancelling' ? { ...job, status: 'cancelling' } : job, shown: s.shown || performance.now() - t0 > 500 } : s));
          continue;
        }
        if (job.status === 'done') return job.result;
        const e = job.error || {};
        throw Object.assign(new Error(e.message || t('dbj_failed')), { code: e.code || (job.status === 'cancelled' ? 'CANCELLED' : 'ERROR'), text: e.text });
      }
    } finally {
      setState((s) => (s && s.id === id ? null : s));
    }
  };
  const cancel = async () => {
    const cur = ref.current;
    if (!cur) return;
    setState((s) => (s && s.id === cur.id ? { ...s, job: { ...s.job, status: 'cancelling' } } : s));
    try { await call('db.exportCancel', { jobId: cur.id }); } catch { /* finished */ }
  };
  const popup = state && state.shown ? (
    <ScanProgress title={t('dbj_title')} icon="database" onCancel={cancel}
      job={{ ...state.job, progress: { ...(state.job.progress || {}), detail: state.job.timeoutSec ? t('dbj_limit', { s: state.job.timeoutSec }) : '' } }} />
  ) : null;
  return { run, popup, busy: !!state };
}
