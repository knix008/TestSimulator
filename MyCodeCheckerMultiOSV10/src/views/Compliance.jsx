// Security reports (OWASP, ASVS, CWE Top 25, PCI DSS, STIG, SANS, CERT) and
// MISRA compliance (GCS, recategorization plan, deviation records).
import React, { useEffect, useMemo, useState } from 'react';
import { t, useLanguage, getLanguage } from '../lib/i18n';
import { call } from '../lib/backend';
import { Icon } from '../components/Chrome';
import { useApi, ApiState, Btn, BtnGroup, IconSelect, Toggle, Tabs, Stat, Rating, ViewHeader, Empty, DateField, NoProject } from './common';

export const SECURITY_STANDARDS = [
  { value: 'mois2021', label: '행정안전부 SW 보안약점 49 (2021)', icon: 'shield' },
  { value: 'kisaWeb', label: '주요정보통신기반시설 웹', icon: 'globe' },
  { value: 'owasp2021', label: 'OWASP Top 10 2021', icon: 'lock' },
  { value: 'owasp2017', label: 'OWASP Top 10 2017', icon: 'lock' },
  { value: 'asvs4:1', label: 'OWASP ASVS 4.0 L1', icon: 'check' },
  { value: 'asvs4:2', label: 'OWASP ASVS 4.0 L2', icon: 'check' },
  { value: 'asvs4:3', label: 'OWASP ASVS 4.0 L3', icon: 'check' },
  { value: 'cweTop25_2024', label: 'CWE Top 25 2024', icon: 'alert' },
  { value: 'cweTop25_2023', label: 'CWE Top 25 2023', icon: 'alert' },
  { value: 'pciDss40', label: 'PCI DSS 4.0', icon: 'key' },
  { value: 'pciDss321', label: 'PCI DSS 3.2.1', icon: 'key' },
  { value: 'stigAsdV5R3', label: 'DISA STIG ASD V5R3', icon: 'shield' },
  { value: 'sansTop25', label: 'SANS Top 25', icon: 'alert' },
  { value: 'certC', label: 'SEI CERT C', icon: 'shield' },
  { value: 'certCpp', label: 'SEI CERT C++', icon: 'shield' },
];

export const MISRA_STANDARDS = [
  { value: 'misraC2012', label: 'MISRA C:2012', icon: 'shield' },
  { value: 'misraC2023', label: 'MISRA C:2023', icon: 'shield' },
  { value: 'misraCpp2023', label: 'MISRA C++:2023', icon: 'shield' },
];

function rowsOf(report) {
  if (!report) return [];
  return report.categories || report.requirements || report.rules || [];
}

export function ComplianceView({ project, branch, stamp, onDrill }) {
  useLanguage();
  const [standard, setStandard] = useState('owasp2021');
  const [newOnly, setNewOnly] = useState(false);
  const [hideEmpty, setHideEmpty] = useState(false);
  const [std, level] = standard.split(':');
  const state = useApi('compliance.report', { projectId: project && project.id, branch, standard: std, level: level ? Number(level) : undefined, newCodeOnly: newOnly, lang: getLanguage() },
    [project && project.id, branch, standard, newOnly, stamp, getLanguage()], !!project);
  const report = state.data;
  const rows = rowsOf(report).filter((r) => !hideEmpty || r.total > 0);
  const isAsvs = std === 'asvs4';
  const isCert = std === 'certC' || std === 'certCpp';
  const totals = report && (report.totals || null);
  return (
    <div className="view">
      <ViewHeader icon="lock" title={t('nav_compliance')} hint={t('cp_hint')}>
        <IconSelect value={standard} options={SECURITY_STANDARDS} onChange={setStandard} title={t('cp_standard')} width={230} />
        <Toggle checked={newOnly} onChange={setNewOnly} label={t('new_only')} icon="clock" />
        <Toggle checked={hideEmpty} onChange={setHideEmpty} label={t('cp_hide_empty')} icon="filter" />
        <span className="spacer" />
        <Btn icon="refresh" label={t('pf_refresh')} onClick={state.reload} />
      </ViewHeader>
      {!project && <NoProject />}
      <ApiState state={state} />
      {report && (
        <>
          <div className="card-grid">
            {totals && <div className="card"><div className="k">{t('cp_rating')}</div><div className={`rating ${totals.rating}`}>{totals.rating}</div><div className="small">{report.title}</div></div>}
            {totals && <Stat icon="unlock" label={t('vulns')} value={totals.vulnerabilities} />}
            {totals && <Stat icon="shield" label={t('cp_hotspots_review')} value={`${totals.hotspotsToReview} / ${totals.hotspots}`} />}
            {totals && <Stat icon="list" label={t('cp_rules')} value={(totals.rules || []).length} />}
            {report.unmapped != null && <Stat icon="info" label={t('cp_unmapped')} value={report.unmapped} sub={t('cp_unmapped_hint')} />}
            {isAsvs && <Stat icon="checkCircle" label={t('cp_passed')} value={report.passed} />}
            {isAsvs && <Stat icon="xCircle" label={t('cp_failed')} value={report.failed} tone={report.failed ? 'bad' : 'ok'} />}
            {isAsvs && <Stat icon="gate" label={t('cp_verdict')} value={report.compliant ? t('cp_compliant') : t('cp_not_compliant')} tone={report.compliant ? 'ok' : 'bad'} />}
            {isCert && <Stat icon="list" label={t('cp_checked_rules')} value={(report.checkedRules || []).length} />}
            {isCert && <Stat icon="alert" label={t('cp_violated_rules')} value={report.violatedRules} tone={report.violatedRules ? 'bad' : 'ok'} />}
            {isCert && <Stat icon="bug" label={t('cp_issues')} value={report.issues} />}
          </div>
          <div className="panel tpanel">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t('cp_category')}</th>
                    <th>{t('cp_title')}</th>
                    {isAsvs && <th>{t('status')}</th>}
                    <th className="num">{t('cp_rating')}</th>
                    <th className="num">{t('vulns')}</th>
                    <th className="num">{t('hotspots')}</th>
                    <th className="num">{t('cp_total')}</th>
                    <th>{t('cp_rules')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className={r.total ? 'click' : ''} title={r.total ? t('cp_drill') : ''}
                      onClick={() => { if (r.total) onDrill({ rules: r.rules || [], keys: r.issueKeys || [], label: `${report.title} · ${r.id}` }); }}>
                      <td className="nowrap"><strong>{r.id}</strong>{r.rank ? <div className="small">#{r.rank}</div> : null}{r.cat ? <div className="small">{r.cat}</div> : null}</td>
                      <td className="wrap">{r.title || r.section || ''}{r.cwes && r.cwes.length ? <div className="small ellipsis2">CWE {r.cwes.slice(0, 8).join(', ')}{r.cwes.length > 8 ? '…' : ''}</div> : null}</td>
                      {isAsvs && <td className={r.status === 'FAILED' ? 'bad' : 'ok'}>{r.status === 'FAILED' ? t('cp_failed') : t('cp_passed')}</td>}
                      <td className="num"><Rating letter={r.rating} /></td>
                      <td className="num">{r.vulnerabilities}</td>
                      <td className="num">{r.hotspotsToReview ? `${r.hotspotsToReview} / ${r.hotspots}` : r.hotspots}</td>
                      <td className="num">{r.total}</td>
                      <td className="wrap">{(r.rules || []).slice(0, 4).map((k) => <span key={k} className="pill tag">{k}</span>)}{(r.rules || []).length > 4 && <span className="small"> +{r.rules.length - 4}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length === 0 && <Empty text={t('empty')} />}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── MISRA ─────────────────────────────────────────────────

const CATEGORIES = ['Mandatory', 'Required', 'Advisory', 'Disapplied'];
const CAT_ICON = { Mandatory: 'lock', Required: 'alert', Advisory: 'info', Disapplied: 'minus' };
const STATUSES = ['Compliant', 'Deviations', 'Violations', 'Disapplied', 'Not checked'];
const STATUS_ICON = { Compliant: 'check', Deviations: 'edit', Violations: 'alert', Disapplied: 'minus', 'Not checked': 'eye' };

function catLabel(c) { return t(`ms_cat_${String(c || '').toLowerCase()}`); }
function statusLabel(s) { return t(`ms_st_${String(s || '').replace(/\s+/g, '_').toLowerCase()}`); }

const EMPTY_DEV = { id: '', rule: '', scope: '', justification: '', approver: '', date: '', expires: '', permit: '' };

export function MisraView({ project, branch, stamp, onDrill }) {
  useLanguage();
  const [standard, setStandard] = useState('misraC2012');
  const [tab, setTab] = useState('gcs');
  const [catFilter, setCatFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [q, setQ] = useState('');
  const [plan, setPlan] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [note, setNote] = useState('');
  const pid = project && project.id;
  const comp = useApi('misra.compliance', { projectId: pid, branch, standard, lang: getLanguage() }, [pid, branch, standard, stamp], !!project);
  useEffect(() => {
    let cancel = false;
    if (!pid) return undefined;
    call('misra.plan', { projectId: pid, standard }).then((p) => { if (!cancel) { setPlan(p); setDirty(false); } }).catch(() => {});
    return () => { cancel = true; };
  }, [pid, standard]);

  const report = comp.data;
  const gcs = useMemo(() => ((report && report.gcs) || []).filter((r) => {
    if (catFilter && r.effectiveCategory !== catFilter) return false;
    if (statusFilter && r.status !== statusFilter) return false;
    if (q && !r.guideline.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  }), [report, catFilter, statusFilter, q]);

  const editPlan = (patch) => { setPlan({ ...plan, ...patch }); setDirty(true); };
  const save = async () => {
    try {
      const saved = await call('misra.savePlan', { projectId: pid, plan: { ...plan, standard } });
      setPlan(saved);
      setDirty(false);
      setNote(t('ms_saved'));
      comp.reload();
    } catch (err) { setNote(err.message); }
  };

  const guidelineRows = (report && report.guidelines) || [];
  const catOptions = [{ value: '', label: t('ms_all_categories'), icon: 'layers' }, ...CATEGORIES.map((c) => ({ value: c, label: catLabel(c), icon: CAT_ICON[c] }))];
  const statusOptions = [{ value: '', label: t('ms_all_statuses'), icon: 'list' }, ...STATUSES.map((s) => ({ value: s, label: statusLabel(s), icon: STATUS_ICON[s] }))];

  return (
    <div className="view">
      <ViewHeader icon="shield" title={t('nav_misra')} hint={t('ms_hint')}>
        <IconSelect value={standard} options={MISRA_STANDARDS} onChange={setStandard} title={t('cp_standard')} width={190} />
        <span className="spacer" />
        <BtnGroup>
          <Btn icon="save" label={t('ms_save_plan')} primary={dirty} disabled={!plan || !dirty} onClick={save} />
          <Btn icon="refresh" label={t('pf_refresh')} onClick={comp.reload} />
        </BtnGroup>
      </ViewHeader>
      {note && <p className="small">{note}</p>}
      {!project && <NoProject />}
      <ApiState state={comp} />
      {report && (
        <>
          <div className={`banner ${report.compliant ? 'OK' : 'ERROR'}`}>
            <div>
              <div className="k muted">{report.title} · {report.framework}</div>
              <strong style={{ fontSize: 20 }}><Icon name={report.compliant ? 'check' : 'alert'} size={18} /> {report.compliant ? t('cp_compliant') : t('cp_not_compliant')}</strong>
            </div>
            <div className="small banner-side">
              {report.reasons.length > 0 && <div>{report.reasons.slice(0, 4).map((r) => `${r.guideline} (${r.reason === 'violations' ? `${t('ms_violations')} ${r.count}` : statusLabel('Not checked')})`).join(' · ')}{report.reasons.length > 4 ? ' …' : ''}</div>}
              <div>{t('ms_advisory_violations')} {report.advisoryViolations}</div>
            </div>
          </div>
          <div className="card-grid">
            {STATUSES.map((s) => <Stat key={s} icon={STATUS_ICON[s]} label={statusLabel(s)} value={report.summary[s] || 0} tone={s === 'Violations' && report.summary[s] ? 'bad' : ''} />)}
            <Stat icon="alert" label={t('ms_invalid_devs')} value={(report.invalidDeviations || []).length} tone={(report.invalidDeviations || []).length ? 'bad' : ''} />
          </div>
          <Tabs value={tab} onChange={setTab} tabs={[
            { id: 'gcs', label: t('ms_gcs'), icon: 'list', count: (report.gcs || []).length },
            { id: 'recat', label: t('ms_grp'), icon: 'layers', count: Object.keys((plan && plan.recategorization) || {}).length },
            { id: 'devs', label: t('ms_deviations'), icon: 'edit', count: ((plan && plan.deviations) || []).length },
          ]} />
          {tab === 'gcs' && (
            <>
              <div className="view-toolbar">
                <input className="search" placeholder={t('search')} value={q} onChange={(e) => setQ(e.target.value)} />
                <IconSelect value={catFilter} options={catOptions} onChange={setCatFilter} title={t('ms_category')} width={170} />
                <IconSelect value={statusFilter} options={statusOptions} onChange={setStatusFilter} title={t('status')} width={170} />
              </div>
              <div className="panel tpanel">
                <div className="table-wrap">
                  <table>
                    <thead><tr>
                      <th>{t('ms_guideline')}</th><th>{t('ms_category')}</th><th>{t('ms_recat')}</th><th>{t('status')}</th>
                      <th className="num">{t('ms_violations')}</th><th className="num">{t('ms_deviations')}</th><th>{t('ms_enforcement')}</th>
                    </tr></thead>
                    <tbody>
                      {gcs.map((r) => {
                        const full = guidelineRows.find((g) => g.guideline === r.guideline) || {};
                        return (
                          <tr key={r.guideline} className={r.violations ? 'click' : ''} onClick={() => { if (r.violations) onDrill({ rules: full.toolRules || [], keys: full.violationKeys || [], label: `${report.title} · ${r.guideline}` }); }}>
                            <td className="nowrap"><strong>{r.guideline}</strong>{full.decidable === false && <div className="small">{t('ms_undecidable')}</div>}</td>
                            <td>{catLabel(r.category)}</td>
                            <td>{r.effectiveCategory !== r.category ? <span className="pill">{catLabel(r.effectiveCategory)}</span> : <span className="muted">—</span>}</td>
                            <td className={`ms-status ${r.status.replace(/\s+/g, '-')}`}><Icon name={STATUS_ICON[r.status] || 'info'} size={13} /> {statusLabel(r.status)}</td>
                            <td className="num">{r.violations}</td>
                            <td className="num">{r.deviations}</td>
                            <td className="small">{full.enforcement || ''}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {gcs.length === 0 && <Empty text={(report.gcs || []).length ? t('empty') : t('ms_no_guidelines')} />}
                </div>
              </div>
            </>
          )}
          {tab === 'recat' && plan && <RecatEditor plan={plan} grp={report.grp || []} guidelines={guidelineRows} onChange={editPlan} />}
          {tab === 'devs' && plan && <DeviationEditor plan={plan} checked={report.deviations || []} guidelines={guidelineRows} onChange={editPlan} />}
        </>
      )}
    </div>
  );
}

function RecatEditor({ plan, grp, guidelines, onChange }) {
  useLanguage();
  const [guideline, setGuideline] = useState('');
  const [to, setTo] = useState('Required');
  const entries = Object.entries(plan.recategorization || {});
  const set = (next) => onChange({ recategorization: next });
  const toOptions = CATEGORIES.map((c) => ({ value: c, label: catLabel(c), icon: CAT_ICON[c] }));
  return (
    <>
      <p className="small">{t('ms_grp_hint')}</p>
      <div className="panel tpanel">
        <div className="table-wrap">
          <table>
            <thead><tr><th>{t('ms_guideline')}</th><th>{t('ms_category')}</th><th>{t('ms_recat')}</th><th>{t('status')}</th><th className="act" /></tr></thead>
            <tbody>
              {entries.map(([id, cat]) => {
                const check = grp.find((g) => g.guideline === id || g.guideline.endsWith(id)) || {};
                const g = guidelines.find((x) => x.guideline === check.guideline);
                return (
                  <tr key={id}>
                    <td><strong>{id}</strong></td>
                    <td>{g ? catLabel(g.category) : <span className="muted">—</span>}</td>
                    <td><IconSelect value={cat} options={toOptions} onChange={(v) => set({ ...plan.recategorization, [id]: v })} width={150} /></td>
                    <td className={check.applied ? 'ok' : 'bad'}>{check.applied ? t('ms_applied') : check.reason ? t(`ms_reason_${check.reason.replace(/-/g, '_')}`) : t('ms_pending')}</td>
                    <td className="act"><Btn icon="trash" label={t('remove')} onClick={() => { const next = { ...plan.recategorization }; delete next[id]; set(next); }} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {entries.length === 0 && <Empty text={t('empty')} />}
        </div>
      </div>
      <div className="form-grid">
        <label>{t('ms_guideline')}<input value={guideline} placeholder="Rule 15.5" list="misra-guidelines" onChange={(e) => setGuideline(e.target.value)} /></label>
        <label>{t('ms_recat')}<IconSelect value={to} options={toOptions} onChange={setTo} /></label>
        <div className="form-end"><Btn icon="plus" label={t('add')} primary disabled={!guideline.trim()} onClick={() => { set({ ...(plan.recategorization || {}), [guideline.trim()]: to }); setGuideline(''); }} /></div>
      </div>
      <datalist id="misra-guidelines">{guidelines.map((g) => <option key={g.guideline} value={g.guideline} />)}</datalist>
    </>
  );
}

function DeviationEditor({ plan, checked, guidelines, onChange }) {
  useLanguage();
  const [draft, setDraft] = useState(EMPTY_DEV);
  const [editing, setEditing] = useState(null);
  const devs = plan.deviations || [];
  const setDevs = (next) => onChange({ deviations: next });
  const commit = () => {
    if (!draft.rule.trim() || badDate) return;
    const scopes = String(draft.scope || '').split(',').map((s) => s.trim()).filter(Boolean);
    const rec = { ...draft, id: draft.id || `DEV-${String(devs.length + 1).padStart(3, '0')}`, rule: draft.rule.trim(), scope: scopes.length > 1 ? scopes : scopes[0] || '**' };
    for (const k of ['expires', 'permit']) if (!rec[k]) delete rec[k];
    if (editing != null) setDevs(devs.map((d, i) => (i === editing ? rec : d)));
    else setDevs([...devs, rec]);
    setDraft(EMPTY_DEV);
    setEditing(null);
  };
  const field = (key, label, props = {}) => (
    <label>{label}<input value={draft[key] || ''} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} {...props} /></label>
  );
  const badDate = ['date', 'expires'].some((k) => draft[k] && !/^\d{4}-\d{2}-\d{2}$/.test(draft[k]));
  const dateField = (key, label) => (
    <div className="form-field"><span>{label}</span><DateField value={draft[key] || ''} onChange={(v) => setDraft({ ...draft, [key]: v })} /></div>
  );
  return (
    <>
      <p className="small">{t('ms_dev_hint')}</p>
      <div className="panel tpanel">
        <div className="table-wrap">
          <table>
            <thead><tr>
              <th>ID</th><th>{t('ms_guideline')}</th><th>{t('ms_scope')}</th><th>{t('ms_justification')}</th><th>{t('ms_approver')}</th>
              <th>{t('ms_date')}</th><th>{t('ms_expires')}</th><th>{t('ms_permit')}</th><th>{t('status')}</th><th className="act" />
            </tr></thead>
            <tbody>
              {devs.map((d, i) => {
                const c = checked.find((x) => x.id === d.id) || {};
                return (
                  <tr key={`${d.id}-${i}`} className={editing === i ? 'sel' : ''}>
                    <td className="nowrap">{d.id}</td>
                    <td className="nowrap">{d.rule}</td>
                    <td className="small wrap">{Array.isArray(d.scope) ? d.scope.join(', ') : d.scope}</td>
                    <td className="small wrap">{d.justification}</td>
                    <td>{d.approver}</td>
                    <td className="nowrap small">{d.date}</td>
                    <td className="nowrap small">{d.expires || '—'}</td>
                    <td className="small">{d.permit || '—'}</td>
                    <td className={c.valid ? 'ok' : 'bad'}>{c.valid ? `${t('ms_valid')} (${c.covers || 0})` : (c.problems || []).join(', ') || t('ms_pending')}</td>
                    <td className="act">
                      <BtnGroup>
                        <Btn icon="edit" label={t('ms_edit')} onClick={() => { setEditing(i); setDraft({ ...EMPTY_DEV, ...d, scope: Array.isArray(d.scope) ? d.scope.join(', ') : d.scope || '' }); }} />
                        <Btn icon="trash" label={t('remove')} onClick={() => setDevs(devs.filter((_, n) => n !== i))} />
                      </BtnGroup>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {devs.length === 0 && <Empty text={t('empty')} />}
        </div>
      </div>
      <h3 className="sub-title">{editing != null ? t('ms_edit_dev') : t('ms_add_dev')}</h3>
      <div className="form-grid four">
        {field('id', 'ID', { placeholder: 'DEV-001' })}
        {field('rule', t('ms_guideline'), { placeholder: 'Rule 11.5', list: 'misra-guidelines-dev' })}
        {field('scope', t('ms_scope'), { placeholder: 'src/hal/**' })}
        {field('permit', t('ms_permit'), { placeholder: 'PERMIT-1' })}
        {field('approver', t('ms_approver'))}
        {dateField('date', t('ms_date'))}
        {dateField('expires', t('ms_expires'))}
        <span />
        <label className="span4">{t('ms_justification')}<textarea value={draft.justification} onChange={(e) => setDraft({ ...draft, justification: e.target.value })} /></label>
        <div className="form-end">
          <BtnGroup>
            <Btn icon={editing != null ? 'check' : 'plus'} label={editing != null ? t('ms_apply') : t('add')} primary disabled={!draft.rule.trim() || badDate} onClick={commit} />
            <Btn icon="close" label={t('cancel')} onClick={() => { setDraft(EMPTY_DEV); setEditing(null); }} />
          </BtnGroup>
        </div>
      </div>
      <datalist id="misra-guidelines-dev">{guidelines.map((g) => <option key={g.guideline} value={g.guideline} />)}</datalist>
    </>
  );
}
