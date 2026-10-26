import React, { useMemo, useState } from 'react';
import { t, textOf, useLanguage } from '../lib/i18n';
import { Icon } from '../components/Chrome';
import { Btn, IconSelect, Toggle, ViewHeader, Empty, NoProject, Stat, CovPill, emitAction } from './common';

const PRESETS = ['outstanding', 'new', 'high', 'dismissed', 'fixed'];
const CLASSIFICATIONS = ['Unclassified', 'Pending', 'Bug', 'False Positive', 'Intentional'];
const ACTIONS = ['Undecided', 'Fix Required', 'Fix Submitted', 'Modeling Required', 'Ignore'];
const PRESET_ICON = { outstanding: 'alert', new: 'clock', high: 'shield', dismissed: 'close', fixed: 'check' };
const CLASSIFICATION_ICON = { Unclassified: 'info', Pending: 'clock', Bug: 'bug', 'False Positive': 'close', Intentional: 'check' };
const ACTION_ICON = { Undecided: 'info', 'Fix Required': 'alert', 'Fix Submitted': 'check', 'Modeling Required': 'code', Ignore: 'eye' };
const MODEL_KIND_ICON = { sink: 'download', allocator: 'package', source: 'upload' };

function dismissed(issue) {
  if (!issue) return false;
  if (issue.classification === 'False Positive' || issue.classification === 'Intentional') return true;
  if (issue.action === 'Ignore') return true;
  if (issue.resolution === 'FALSE-POSITIVE' || issue.resolution === 'WONTFIX') return true;
  return false;
}

function text(value) {
  return textOf(value);
}

export function DefectsView({ analysis, onUpdate }) {
  useLanguage();
  const [preset, setPreset] = useState('outstanding');
  const [q, setQ] = useState('');
  const [checker, setChecker] = useState('');
  const [cid, setCid] = useState(null);
  const issues = (analysis && analysis.issues) || [];
  const fixed = (analysis && analysis.coverity && analysis.coverity.fixedDefects) || [];
  const checkers = [...new Set(issues.map((i) => i.checker).filter(Boolean))].sort();
  const list = useMemo(() => {
    const base = preset === 'fixed' ? fixed : issues.filter((issue) => {
      if (preset === 'outstanding') return !dismissed(issue);
      if (preset === 'new') return issue.coverityStatus === 'New' && !dismissed(issue);
      if (preset === 'high') return issue.impact === 'High' && !dismissed(issue);
      if (preset === 'dismissed') return dismissed(issue);
      return true;
    });
    return base.filter((issue) => {
      if (checker && issue.checker !== checker) return false;
      if (!q) return true;
      const blob = `${issue.cid} ${issue.checker} ${issue.file} ${issue.function} ${text(issue.message)}`.toLowerCase();
      return blob.includes(q.toLowerCase());
    });
  }, [issues, fixed, preset, q, checker]);
  const selected = list.find((issue) => issue.cid === cid) || null;
  const outstanding = issues.filter((issue) => !dismissed(issue)).length;
  const outstandingHigh = issues.filter((issue) => !dismissed(issue) && issue.impact === 'High').length;
  const newlyDetected = issues.filter((issue) => issue.coverityStatus === 'New' && !dismissed(issue)).length;
  const dismissedCount = issues.filter(dismissed).length;
  const cov = (analysis && analysis.coverity) || {};
  const policy = cov.policy || {};
  const triage = (patch) => {
    if (!selected) return;
    onUpdate([selected.key], { ...patch, cid: selected.cid });
  };
  if (!analysis) {
    return (
      <div className="view">
        <ViewHeader icon="alert" title={t('nav_defects')} hint={t('vh_defects')} />
        <NoProject text={t('es_no_analysis')} />
      </div>
    );
  }
  const counts = { outstanding, new: newlyDetected, high: outstandingHigh, dismissed: dismissedCount, fixed: fixed.length };
  const impactIcon = (impact) => (impact === 'High' ? 'chevronsUp' : impact === 'Medium' ? 'chevronUp' : 'chevronDown');
  const impactLabel = (impact) => { const k = `cov_impact_${impact}`; const s = t(k); return s === k ? impact : s; };
  return (
    <div className="view">
      <ViewHeader icon="alert" title={t('nav_defects')} hint={`${cov.reference ? t('cov_reference') : t('cov_compare')} ${t('cov_hint')}`} />
      <div className="hrow">
        <div className="type-tabs flat">
          {PRESETS.map((id) => (
            <button key={id} type="button" className={`type-tab ${preset === id ? 'on' : ''}`} aria-pressed={preset === id} onClick={() => setPreset(id)}>
              <Icon name={PRESET_ICON[id]} size={15} /><span>{t(`cov_${id}`)}</span><span className="vtab-count">{counts[id]}</span>
            </button>
          ))}
        </div>
        <span className="spacer" />
        <span className={`status-pill big tone-${policy.status === 'ERROR' ? 'bad' : policy.status ? 'ok' : 'muted'}`} title={t('cov_policy')}>
          <Icon name={policy.status === 'ERROR' ? 'xCircle' : policy.status ? 'checkCircle' : 'minus'} size={14} />{t('cov_policy')} {policy.status === 'ERROR' ? t('failed') : policy.status ? t('passed') : '—'}
        </span>
      </div>
      <div className="card-grid compact">
        <Stat icon="alert" value={outstanding} label={t('cov_outstanding')} onClick={() => setPreset('outstanding')} />
        <Stat icon="chevronsUp" value={outstandingHigh} label={t('cov_high')} tone={outstandingHigh ? 'bad' : ''} onClick={() => setPreset('high')} />
        <Stat icon="sparkle" value={newlyDetected} label={t('cov_new')} tone={newlyDetected ? 'bad' : ''} onClick={() => setPreset('new')} />
        <Stat icon="xCircle" value={dismissedCount} label={t('cov_dismissed')} onClick={() => setPreset('dismissed')} />
        <Stat icon="checkCircle" value={fixed.length} label={t('cov_fixed')} tone={fixed.length ? 'ok' : ''} onClick={() => setPreset('fixed')} />
      </div>
      <div className="view-toolbar">
        <span className="search-box"><Icon name="search" size={14} /><input className="search" value={q} placeholder={t('cov_search_ph')} aria-label={t('search')} onChange={(e) => setQ(e.target.value)} /></span>
        <IconSelect value={checker} onChange={setChecker} title={t('cov_checker')} ariaLabel={t('cov_checker')} width={220}
          options={[{ value: '', label: t('cov_any_checker'), icon: 'list' }, ...checkers.map((name) => ({ value: name, label: name, icon: 'bug' }))]} />
      </div>
      <div className="split">
        <div className="panel tpanel">
          <div className="table-wrap tall">
            <table>
              <thead><tr><th>CID</th><th>{t('cov_impact')}</th><th>{t('cov_checker')}</th><th>{t('message')}</th><th>{t('location')}</th></tr></thead>
              <tbody>
                {list.map((issue) => (
                  <tr key={`${issue.cid}-${issue.line}`} className={`click ${selected && selected.cid === issue.cid ? 'sel' : ''}`} onClick={() => setCid(issue.cid)}>
                    <td className="mono">{issue.cid}</td>
                    <td className="nowrap"><span className={`impact-badge impact-${issue.impact}`}><Icon name={impactIcon(issue.impact)} size={12} />{impactLabel(issue.impact)}</span></td>
                    <td className="small">{issue.checker}<div>{issue.kind}</div></td>
                    <td className="wrap">{text(issue.message)}<div className="small">{issue.component} · {issue.function}</div>
                      {((issue.classification && issue.classification !== 'Unclassified') || (issue.action && issue.action !== 'Undecided')) && (
                        <div className="chips">{issue.classification && issue.classification !== 'Unclassified' && <CovPill value={issue.classification} />}{issue.action && issue.action !== 'Undecided' && <CovPill value={issue.action} />}</div>
                      )}
                    </td>
                    <td className="small wrap loc">{issue.file}:{issue.line}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {list.length === 0 && <Empty icon={preset === 'fixed' ? 'wrench' : 'checkCircle'} text={t('es_no_defects')} hint={q || checker ? t('es_no_match_hint') : t('es_no_defects_hint')} />}
          </div>
        </div>
        <aside className="panel drawer">
          {!selected && <Empty icon="eye" text={t('cov_pick')} hint={t('es_pick_defect_hint')} />}
          {selected && (
            <>
              <div className="chips">
                <span className={`impact-badge impact-${selected.impact}`}><Icon name={impactIcon(selected.impact)} size={12} />{impactLabel(selected.impact)}</span>
                <CovPill value={selected.classification || 'Unclassified'} /><CovPill value={selected.action || 'Undecided'} />
              </div>
              <h3>CID {selected.cid}</h3>
              <p>{text(selected.message)}</p>
              <p className="small">{selected.checker} · {selected.category} · {selected.cwe} {selected.cert}</p>
              <p className="small">{selected.file}:{selected.line} · {selected.function} · {selected.component}{selected.componentOwner ? ` (${selected.componentOwner})` : ''}</p>
              <h3 className="sub-title"><Icon name="flow" size={15} />{t('cov_events')}</h3>
              <ol className="events">
                {(selected.events || []).map((event, i) => (
                  <li key={i} className={event.main ? 'main' : ''}><span className="ln">{event.line}</span> {text(event.text)}</li>
                ))}
              </ol>
              {selected.snippet && <div className="snippet">{selected.snippet.map((row) => (
                <div key={row.line} className={row.hit ? 'hit' : ''}><span className="ln">{row.line}</span><span>{row.text}</span></div>
              ))}</div>}
              {preset !== 'fixed' && selected.key && (
                <>
                  <h3 className="sub-title"><Icon name="userCheck" size={15} />{t('cov_triage')}</h3>
                  <div className="form-grid single">
                    <label>{t('cov_classification')}
                      <IconSelect value={selected.classification || 'Unclassified'} onChange={(v) => triage({ classification: v })} ariaLabel={t('cov_classification')}
                        options={CLASSIFICATIONS.map((item) => ({ value: item, label: item, icon: CLASSIFICATION_ICON[item] }))} />
                    </label>
                    <label>{t('cov_action')}
                      <IconSelect value={selected.action || 'Undecided'} onChange={(v) => triage({ action: v })} ariaLabel={t('cov_action')}
                        options={ACTIONS.map((item) => ({ value: item, label: item, icon: ACTION_ICON[item] }))} />
                    </label>
                    <label>{t('cov_triage_severity')}
                      <IconSelect value={selected.triageSeverity || 'Unspecified'} onChange={(v) => triage({ triageSeverity: v })} ariaLabel={t('cov_triage_severity')}
                        options={['Unspecified', 'Major', 'Moderate', 'Minor'].map((item) => ({ value: item, label: item, icon: item === 'Major' ? 'alert' : item === 'Unspecified' ? 'minus' : 'info' }))} />
                    </label>
                    <Owner key={selected.cid} issue={selected} onUpdate={onUpdate} />
                    <ExtRef key={`x${selected.cid}`} issue={selected} onUpdate={onUpdate} />
                    <div className="form-field"><span>{t('cov_legacy')}</span><Toggle checked={!!selected.legacy} label={t('cov_legacy_label')} icon="history" onChange={(v) => triage({ legacy: v })} /></div>
                  </div>
                </>
              )}
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

function ExtRef({ issue, onUpdate }) {
  const [ref, setRef] = useState(issue.externalReference || '');
  return (
    <div className="form-field">
      <span>{t('cov_ext_ref')}</span>
      <div className="input-row">
        <input value={ref} aria-label={t('cov_ext_ref')} placeholder="JIRA-123" onChange={(e) => setRef(e.target.value)} />
        <Btn icon="save" label={t('save')} onClick={() => onUpdate([issue.key], { externalReference: ref, cid: issue.cid })} />
      </div>
    </div>
  );
}

function Owner({ issue, onUpdate }) {
  const [owner, setOwner] = useState(issue.owner || '');
  return (
    <div className="form-field">
      <span>{t('cov_owner')}</span>
      <div className="input-row">
        <input value={owner} aria-label={t('cov_owner')} onChange={(e) => setOwner(e.target.value)} />
        <Btn icon="save" label={t('save')} onClick={() => onUpdate([issue.key], { owner, cid: issue.cid })} />
      </div>
    </div>
  );
}

export function StreamsView({ history, analysis }) {
  useLanguage();
  const rows = history || [];
  const [left, setLeft] = useState(Math.max(0, rows.length - 2));
  const [right, setRight] = useState(Math.max(0, rows.length - 1));
  const older = rows[left];
  const newer = rows[right];
  let added = 0;
  let removed = 0;
  if (older && newer && older.cids && newer.cids) {
    const a = new Set(older.cids);
    const b = new Set(newer.cids);
    added = [...b].filter((cid) => !a.has(cid)).length;
    removed = [...a].filter((cid) => !b.has(cid)).length;
  }
  const cov = (analysis && analysis.coverity) || {};
  const snapOptions = rows.map((row, i) => ({ value: i, label: String(i + 1), icon: 'history' }));
  return (
    <div className="view">
      <ViewHeader icon="layers" title={t('nav_streams')} hint={t('cov_stream_hint')} />
      {rows.length === 0 && <Empty icon="layers" text={t('es_no_snapshots')} hint={t('es_no_activity_hint')}><Btn icon="play" label={t('cov_commit')} primary onClick={() => emitAction('analyze')} /></Empty>}
      {rows.length > 0 && <div className="panel tpanel">
        <div className="table-wrap">
        <table>
          <thead><tr><th>#</th><th>{t('when')}</th><th>{t('cov_outstanding')}</th><th>{t('cov_new')}</th><th>{t('cov_fixed')}</th><th>{t('cov_policy')}</th></tr></thead>
          <tbody>
            {rows.map((row, i) => {
              const c = row.coverity || {};
              return (
                <tr key={row.at || i}>
                  <td>{c.snapshot || i + 1}</td>
                  <td className="small">{row.at}</td>
                  <td>{c.outstanding == null ? '—' : c.outstanding}</td>
                  <td>{c.newlyDetected == null ? '—' : c.newlyDetected}</td>
                  <td>{c.fixed == null ? '—' : c.fixed}</td>
                  <td>{c.policy ? <span className={`status-pill tone-${c.policy === 'ERROR' ? 'bad' : 'ok'}`}><Icon name={c.policy === 'ERROR' ? 'xCircle' : 'checkCircle'} size={12} />{c.policy === 'ERROR' ? t('failed') : t('passed')}</span> : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>}
      {rows.length > 1 && (
        <div className="panel compare-row">
          <span className="sub-title" style={{ margin: 0 }}><Icon name="scale" size={15} />{t('cov_compare_snaps')}</span>
          <span className="tb-label">{t('cov_from')}</span>
          <IconSelect value={left} onChange={setLeft} options={snapOptions} width={110} ariaLabel={t('cov_from')} />
          <span className="tb-label">{t('cov_to')}</span>
          <IconSelect value={right} onChange={setRight} options={snapOptions} width={110} ariaLabel={t('cov_to')} />
          <span className={`status-pill tone-${added ? 'bad' : 'muted'}`}><Icon name="sparkle" size={12} />{t('cov_new')} {added}</span>
          <span className={`status-pill tone-${removed ? 'ok' : 'muted'}`}><Icon name="checkCircle" size={12} />{t('cov_fixed')} {removed}</span>
        </div>
      )}
      {cov.byChecker && (
        <div className="split">
          <CountTable title={t('cov_checker')} rows={cov.byChecker} />
          <CountTable title={t('cov_component')} rows={cov.byComponent} />
        </div>
      )}
    </div>
  );
}

function CountTable({ title, rows }) {
  const entries = Object.entries(rows || {}).sort((a, b) => b[1] - a[1]);
  return (
    <div className="panel" style={{ padding: 0 }}>
      <h3 className="sub-title pad"><Icon name="chart" size={15} />{title}</h3>
      <table>
        <tbody>{entries.map(([name, n]) => <tr key={name}><td className="wrap">{name}</td><td className="num">{n}</td></tr>)}</tbody>
      </table>
      {entries.length === 0 && <Empty text={t('empty')} />}
    </div>
  );
}

export function ComponentsEditor({ components, onChange }) {
  useLanguage();
  const [draft, setDraft] = useState({ name: '', owner: '', patterns: '' });
  const add = () => {
    if (!draft.name.trim()) return;
    onChange([...(components || []), { name: draft.name.trim(), owner: draft.owner.trim(), patterns: draft.patterns.split(/\r?\n/).map((l) => l.trim()).filter(Boolean) }]);
    setDraft({ name: '', owner: '', patterns: '' });
  };
  return (
    <div className="view">
      <ViewHeader icon="grid" title={t('nav_components')} hint={t('cov_component_hint')} />
      <div className="panel tpanel">
        <table>
          <thead><tr><th>{t('name')}</th><th>{t('cov_owner')}</th><th>{t('pattern')}</th><th className="act" /></tr></thead>
          <tbody>
            {(components || []).map((component, i) => (
              <tr key={`${component.name}-${i}`}>
                <td><Icon name="grid" size={13} /> {component.name}</td>
                <td>{component.owner ? <><Icon name="user" size={13} /> {component.owner}</> : <span className="muted">—</span>}</td>
                <td className="small mono wrap">{(component.patterns || []).join(', ')}</td>
                <td className="act"><Btn icon="trash" label={t('remove')} onClick={() => onChange(components.filter((_, n) => n !== i))} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {(components || []).length === 0 && <Empty icon="grid" text={t('es_no_components')} hint={t('es_no_components_hint')} />}
      </div>
      <div className="panel" style={{ marginTop: 12 }}>
        <h3 className="sub-title" style={{ marginTop: 0 }}><Icon name="plus" size={15} />{t('cov_add_component')}</h3>
        <div className="form-grid">
          <label>{t('name')}<input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
          <label>{t('cov_owner')}<input value={draft.owner} onChange={(e) => setDraft({ ...draft, owner: e.target.value })} /></label>
          <label className="span2">{t('pattern')}<textarea placeholder={'src/api/**\nsrc/web/**'} value={draft.patterns} onChange={(e) => setDraft({ ...draft, patterns: e.target.value })} /></label>
          <div className="form-end"><Btn icon="plus" label={t('add')} primary disabled={!draft.name.trim()} onClick={add} /></div>
        </div>
      </div>
    </div>
  );
}

export function PoliciesEditor({ policies, project, onChange, onAssign }) {
  useLanguage();
  const current = project && project.policyId;
  return (
    <div className="view">
      <ViewHeader icon="gate" title={t('nav_policies')} hint={t('cov_policy_hint')} />
      {(policies || []).length === 0 && <Empty icon="gate" text={t('empty')} />}
      {(policies || []).map((policy) => {
        const inUse = current === policy.id || (!current && policy.isDefault);
        return (
          <div key={policy.id} className={`panel policy-card ${inUse ? 'in-use' : ''}`}>
            <div className="section-head">
              <span className="sub-title" style={{ margin: 0 }}><Icon name={policy.isDefault ? 'star' : 'gate'} size={15} /><strong>{text(policy.name) || policy.id}</strong></span>
              {inUse && project && <span className="status-pill tone-ok"><Icon name="link" size={12} />{t('gate_in_use')}</span>}
              <span className="spacer" />
              {project && <Btn icon="link" label={t('cov_assign')} primary={inUse} onClick={() => onAssign(policy.id)} />}
            </div>
            <ul className="cond-list">{(policy.conditions || []).map((c, i) => <li key={i} className="small"><Icon name="filter" size={12} /> <span className="mono">{c.metric} {c.op} {c.threshold}</span></li>)}</ul>
          </div>
        );
      })}
    </div>
  );
}

export function ModelsEditor({ models, onChange }) {
  useLanguage();
  const [draft, setDraft] = useState({ name: '', kind: 'sink', pattern: '', langs: '*' });
  const add = () => {
    if (!draft.pattern.trim()) return;
    onChange([...(models || []), {
      name: draft.name.trim() || draft.pattern,
      kind: draft.kind,
      pattern: draft.pattern,
      langs: draft.langs.split(',').map((l) => l.trim()).filter(Boolean),
      key: `cov:model:${Date.now().toString(36)}`,
      checker: draft.kind === 'sink' ? 'TAINTED_SCALAR' : draft.kind.toUpperCase(),
    }]);
    setDraft({ name: '', kind: 'sink', pattern: '', langs: '*' });
  };
  return (
    <div className="view">
      <ViewHeader icon="flow" title={t('nav_models')} hint={t('cov_model_hint')} />
      <div className="panel tpanel">
        <table>
          <thead><tr><th>{t('name')}</th><th>{t('type')}</th><th>{t('pattern')}</th><th className="act" /></tr></thead>
          <tbody>
            {(models || []).map((model, i) => (
              <tr key={model.key || i}><td className="wrap">{model.name}</td><td className="nowrap"><Icon name={MODEL_KIND_ICON[model.kind] || 'code'} size={13} /> {model.kind}</td><td className="small mono wrap">{model.pattern}</td>
                <td className="act"><Btn icon="trash" label={t('remove')} onClick={() => onChange(models.filter((_, n) => n !== i))} /></td></tr>
            ))}
          </tbody>
        </table>
        {(models || []).length === 0 && <Empty icon="flow" text={t('es_no_models')} hint={t('es_no_models_hint')} />}
      </div>
      <div className="view-toolbar" style={{ marginTop: 12 }}>
        <input placeholder={t('name')} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        <IconSelect value={draft.kind} onChange={(v) => setDraft({ ...draft, kind: v })} width={150} title={t('type')} ariaLabel={t('type')}
          options={['sink', 'allocator', 'source'].map((kind) => ({ value: kind, label: kind, icon: MODEL_KIND_ICON[kind] }))} />
        <input placeholder={t('pattern')} value={draft.pattern} onChange={(e) => setDraft({ ...draft, pattern: e.target.value })} />
        <Btn icon="plus" label={t('add')} primary onClick={add} />
      </div>
    </div>
  );
}
