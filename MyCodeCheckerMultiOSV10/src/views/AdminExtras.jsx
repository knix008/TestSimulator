// Administration › Scheduled analysis and Audit log.
import React, { useEffect, useState } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { call } from '../lib/backend';
import { ask } from '../lib/ui';
import { Icon } from '../components/Chrome';
import { Btn, BtnGroup, IconSelect, Toggle, Stepper, Empty, Confirm, fmtDate, errorText } from './common';

// ── Scheduled analysis ────────────────────────────────────
export const CRON_PRESETS = [
  { value: '0 2 * * *', key: 'sc_daily_2', icon: 'clock' },
  { value: '0 9 * * 1-5', key: 'sc_weekdays_9', icon: 'calendar' },
  { value: '0 3 * * 0', key: 'sc_sunday', icon: 'calendar' },
  { value: '0 * * * *', key: 'sc_hourly', icon: 'refresh' },
];
const CUSTOM = '__custom__';

function cronLabel(cron) {
  const p = CRON_PRESETS.find((x) => x.value === cron);
  return p ? t(p.key) : cron;
}

function statusTone(status) {
  if (!status) return 'muted';
  if (/^(ok|done|success|passed)$/i.test(status)) return 'ok';
  if (/^(running|pending)$/i.test(status)) return 'info';
  return 'bad';
}

function StatusOf({ status }) {
  if (!status) return <span className="muted">—</span>;
  const tone = statusTone(status);
  return <span className={`status-pill tone-${tone}`}><Icon name={tone === 'ok' ? 'checkCircle' : tone === 'info' ? 'hourglass' : 'xCircle'} size={12} />{status}</span>;
}

const EMPTY_SCHEDULE = { id: '', name: '', kind: 'scan', projectId: '', path: '', branch: '', target: '', mode: 'passive', cron: '0 2 * * *', enabled: true };

export function SchedulesPanel({ projects }) {
  useLanguage();
  const [list, setList] = useState(null);
  const [draft, setDraft] = useState(null);
  const [custom, setCustom] = useState(false);
  const [preview, setPreview] = useState({ dates: [], error: '' });
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busyId, setBusyId] = useState('');
  const [confirmDel, setConfirmDel] = useState(null);
  const [open, setOpen] = useState('');
  const load = async () => {
    try { setList(await call('schedule.list')); } catch (err) { setError(errorText(err)); setList([]); }
  };
  useEffect(() => { load(); }, []);
  // Live preview of the next five runs while the cron text changes.
  useEffect(() => {
    if (!draft) return undefined;
    const cron = draft.cron.trim();
    if (!cron) { setPreview({ dates: [], error: '' }); return undefined; }
    const timer = setTimeout(async () => {
      try { setPreview({ dates: await call('schedule.preview', { cron, count: 5 }), error: '' }); } catch (err) { setPreview({ dates: [], error: err.message }); }
    }, 250);
    return () => clearTimeout(timer);
  }, [draft && draft.cron]);
  const set = (patch) => setDraft({ ...draft, ...patch });
  const edit = (s) => {
    const d = { ...EMPTY_SCHEDULE, ...s, projectId: s.projectId || '', path: s.path || '', branch: s.branch || '', target: s.target || '' };
    setDraft(d);
    setCustom(!CRON_PRESETS.some((p) => p.value === d.cron));
    setError('');
  };
  const save = async () => {
    setError('');
    const s = { ...draft };
    if (!s.id) delete s.id;
    if (s.kind === 'scan') { delete s.target; delete s.mode; if (!s.projectId) delete s.projectId; if (!s.path) delete s.path; } else { delete s.projectId; delete s.path; }
    if (!s.branch) delete s.branch;
    delete s.history;
    // Active DAST probes the target with attacks: the same question as a manual run.
    if (s.kind === 'dast' && s.mode === 'active' && !(await ask({ title: t('da_active'), body: t('da_active_confirm'), okLabel: t('da_i_am_authorized'), danger: true }))) return;
    try {
      await call('schedule.save', { schedule: s });
      setDraft(null);
      setNote(t('sc_saved'));
      load();
    } catch (err) { setError(errorText(err)); }
  };
  const runNow = async (s) => {
    setBusyId(s.id);
    setNote('');
    try {
      const r = await call('schedule.runNow', { id: s.id });
      setNote(`${s.name}: ${r.status}${r.summary ? ` — ${r.summary}` : ''}`);
      load();
    } catch (err) { setError(errorText(err)); } finally { setBusyId(''); }
  };
  const toggle = async (s, enabled) => {
    try { await call('schedule.save', { schedule: { ...s, enabled } }); load(); } catch (err) { setError(errorText(err)); }
  };
  const remove = async () => {
    try { await call('schedule.delete', { id: confirmDel.id }); setConfirmDel(null); load(); } catch (err) { setError(errorText(err)); }
  };
  const projectName = (id) => { const p = projects.find((x) => x.id === id); return p ? p.name : id; };
  const presetOptions = [...CRON_PRESETS.map((p) => ({ value: p.value, label: `${t(p.key)}  (${p.value})`, icon: p.icon })), { value: CUSTOM, label: t('sc_custom'), icon: 'edit' }];
  const projectOptions = [{ value: '', label: t('sc_folder_instead'), icon: 'folder' }, ...projects.map((p) => ({ value: p.id, label: p.name, icon: 'layers' }))];
  if (!list) return <Empty icon="hourglass" text={t('loading')} />;
  return (
    <div className="view view-list">
      <div className="view-toolbar">
        <Btn icon="plus" label={t('sc_new')} primary onClick={() => edit(EMPTY_SCHEDULE)} />
        <Btn icon="refresh" label={t('pf_refresh')} onClick={load} />
        {note && <span className="small"><Icon name="info" size={13} /> {note}</span>}
      </div>
      {error && <p className="small bad">{error}</p>}
      {draft && (
        <section className="panel" style={{ marginBottom: 12 }}>
          <h3 className="sub-title" style={{ marginTop: 0 }}><Icon name={draft.id ? 'edit' : 'plus'} size={15} />{draft.id ? t('sc_edit') : t('sc_new')}</h3>
          <div className="form-grid">
            <label>{t('name')}<input value={draft.name} placeholder={t('sc_name_ph')} onChange={(e) => set({ name: e.target.value })} /></label>
            <label>{t('sc_kind')}<IconSelect value={draft.kind} onChange={(v) => set({ kind: v })} ariaLabel={t('sc_kind')}
              options={[{ value: 'scan', label: t('sc_kind_scan'), icon: 'play' }, { value: 'dast', label: t('sc_kind_dast'), icon: 'globe' }]} /></label>
            {draft.kind === 'scan' && <label>{t('sc_project')}<IconSelect value={draft.projectId} onChange={(v) => set({ projectId: v })} options={projectOptions} ariaLabel={t('sc_project')} /></label>}
            {draft.kind === 'scan' && !draft.projectId && <label>{t('path_label')}<input value={draft.path} placeholder={'C:\\src\\app'} onChange={(e) => set({ path: e.target.value })} /></label>}
            {draft.kind === 'scan' && <label>{t('branch')}<input value={draft.branch} placeholder="main" onChange={(e) => set({ branch: e.target.value })} /></label>}
            {draft.kind === 'dast' && <label className="span2">{t('sc_target')}<input value={draft.target} placeholder="https://staging.example.com" onChange={(e) => set({ target: e.target.value })} /></label>}
            {draft.kind === 'dast' && <label>{t('sc_mode')}<IconSelect value={draft.mode || 'passive'} onChange={(v) => set({ mode: v })} ariaLabel={t('sc_mode')}
              options={[{ value: 'passive', label: t('sc_mode_passive'), icon: 'eye' }, { value: 'active', label: t('sc_mode_active'), icon: 'alert' }]} /></label>}
            <label>{t('sc_when')}<IconSelect value={custom ? CUSTOM : draft.cron} ariaLabel={t('sc_when')} options={presetOptions}
              onChange={(v) => { if (v === CUSTOM) setCustom(true); else { setCustom(false); set({ cron: v }); } }} /></label>
            {custom && <label>{t('sc_cron')}<input className="mono" value={draft.cron} placeholder="*/30 8-18 * * 1-5" onChange={(e) => set({ cron: e.target.value })} /></label>}
            <div className="form-field"><span>{t('sc_enabled')}</span><Toggle checked={draft.enabled} label={t('sc_enabled_label')} icon="clock" onChange={(v) => set({ enabled: v })} /></div>
          </div>
          {custom && <p className="small">{t('sc_cron_hint')}</p>}
          <div className="preview-box">
            <span className="sub-title" style={{ margin: 0 }}><Icon name="calendar" size={14} />{t('sc_next5')}</span>
            {preview.error ? <span className="small bad"><Icon name="xCircle" size={12} /> {preview.error}</span>
              : preview.dates.length ? <div className="chips">{preview.dates.map((d) => <span key={d} className="chip"><Icon name="clock" size={11} />{fmtDate(d)}</span>)}</div>
                : <span className="small">—</span>}
          </div>
          <div className="dialog-actions">
            <BtnGroup>
              <Btn icon="save" label={t('save')} primary disabled={!!preview.error || !draft.cron.trim()} onClick={save} />
              <Btn icon="close" label={t('cancel')} onClick={() => setDraft(null)} />
            </BtnGroup>
          </div>
        </section>
      )}
      <div className="panel tpanel list-grow">
        <div className="table-wrap">
          <table>
            <thead><tr><th>{t('name')}</th><th>{t('sc_target')}</th><th>{t('sc_when')}</th><th>{t('sc_next')}</th><th>{t('sc_last')}</th><th className="act" /></tr></thead>
            <tbody>
              {list.map((s) => (
                <React.Fragment key={s.id}>
                  <tr>
                    <td className="wrap"><span className="metric-name"><Icon name={s.kind === 'dast' ? 'globe' : 'play'} size={14} /><strong>{s.name}</strong></span>
                      <div><Toggle checked={s.enabled !== false} label={s.enabled !== false ? t('sc_on') : t('sc_off')} onChange={(v) => toggle(s, v)} /></div></td>
                    <td className="small wrap">{s.kind === 'dast' ? s.target : (s.projectId ? projectName(s.projectId) : s.path)}{s.branch ? <div><Icon name="branch" size={11} /> {s.branch}</div> : null}</td>
                    <td className="small"><div>{cronLabel(s.cron)}</div><span className="mono">{s.cron}</span></td>
                    <td className="small nowrap">{s.enabled !== false && s.nextRun ? fmtDate(s.nextRun) : '—'}</td>
                    <td className="small"><StatusOf status={s.lastStatus} /><div>{s.lastRun ? fmtDate(s.lastRun) : ''}</div>{s.lastSummary && <div className="ellipsis2">{s.lastSummary}</div>}</td>
                    <td className="act">
                      <BtnGroup>
                        <Btn icon={busyId === s.id ? 'hourglass' : 'play'} label={busyId === s.id ? t('analyzing') : t('sc_run_now')} disabled={!!busyId} onClick={() => runNow(s)} />
                        <Btn icon="history" label={t('sc_history')} active={open === s.id} disabled={!(s.history || []).length} onClick={() => setOpen(open === s.id ? '' : s.id)} />
                        <Btn icon="edit" label={t('edit')} onClick={() => edit(s)} />
                        <Btn icon="trash" label={t('remove')} danger onClick={() => setConfirmDel(s)} />
                      </BtnGroup>
                    </td>
                  </tr>
                  {open === s.id && (
                    <tr><td colSpan={6}>
                      <ol className="events">{[...(s.history || [])].reverse().map((h, i) => <li key={i} className="small"><StatusOf status={h.status} /> {fmtDate(h.at)} {h.summary || ''}</li>)}</ol>
                    </td></tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
          {list.length === 0 && <Empty icon="calendar" text={t('sc_empty')} hint={t('sc_empty_hint')}><Btn icon="plus" label={t('sc_new')} primary onClick={() => edit(EMPTY_SCHEDULE)} /></Empty>}
        </div>
      </div>
      {confirmDel && <Confirm title={t('remove')} body={t('sc_confirm_delete', { name: confirmDel.name })} okLabel={t('remove')} danger onOk={remove} onCancel={() => setConfirmDel(null)} />}
    </div>
  );
}

// ── Audit log ─────────────────────────────────────────────
function outcomeTone(outcome) {
  if (!outcome) return 'muted';
  if (/^ok$/i.test(outcome)) return 'ok';
  if (/^(forbidden|unauthorized|failed|error)/i.test(outcome)) return 'bad';
  return 'warn';
}

export function AuditPanel() {
  useLanguage();
  const [q, setQ] = useState('');
  const [login, setLogin] = useState('');
  const [method, setMethod] = useState('');
  const [limit, setLimit] = useState(200);
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const load = async () => {
    setError('');
    try { setRows(await call('audit.list', { q: q.trim() || undefined, login: login.trim() || undefined, method: method.trim() || undefined, limit })); } catch (err) { setError(errorText(err)); setRows([]); }
  };
  useEffect(() => { const timer = setTimeout(load, 250); return () => clearTimeout(timer); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [q, login, method, limit]);
  return (
    <div className="view view-list">
      <div className="view-toolbar">
        <span className="search-box"><Icon name="search" size={14} /><input className="search" placeholder={t('au_search_ph')} aria-label={t('search')} value={q} onChange={(e) => setQ(e.target.value)} /></span>
        <label className="field-inline"><Icon name="user" size={14} /><input value={login} placeholder={t('au_login')} aria-label={t('au_login')} style={{ width: 130 }} onChange={(e) => setLogin(e.target.value)} /></label>
        <label className="field-inline"><Icon name="code" size={14} /><input value={method} placeholder={t('au_method')} aria-label={t('au_method')} style={{ width: 170 }} onChange={(e) => setMethod(e.target.value)} /></label>
        <Stepper label={t('au_limit')} value={limit} min={10} max={5000} step={50} onChange={setLimit} />
        <Btn icon="refresh" label={t('pf_refresh')} onClick={load} />
      </div>
      {error && <Empty icon="alert" text={error} />}
      {rows && (
        <div className="panel tpanel list-grow">
          <div className="table-wrap tall">
            <table>
              <thead><tr><th>{t('when')}</th><th>{t('au_login')}</th><th>{t('au_method')}</th><th>{t('au_outcome')}</th><th>{t('au_detail')}</th></tr></thead>
              <tbody>
                {rows.map((r, i) => {
                  const tone = outcomeTone(r.outcome);
                  return (
                    <tr key={`${r.at}-${i}`}>
                      <td className="small nowrap">{fmtDate(r.at)}</td>
                      <td className="nowrap"><Icon name="user" size={12} /> {r.login || '—'}</td>
                      <td className="mono small">{r.method}</td>
                      <td><span className={`status-pill tone-${tone}`}><Icon name={tone === 'ok' ? 'checkCircle' : tone === 'bad' ? 'xCircle' : 'info'} size={12} />{r.outcome || '—'}</span></td>
                      <td className="small wrap">{typeof r.detail === 'string' ? r.detail : r.detail ? JSON.stringify(r.detail) : ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {rows.length === 0 && !error && <Empty icon="list" text={t('au_empty')} hint={t('au_empty_hint')} />}
          </div>
        </div>
      )}
    </div>
  );
}
