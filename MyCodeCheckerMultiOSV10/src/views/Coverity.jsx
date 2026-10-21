import React, { useMemo, useState } from 'react';
import { t, textOf, useLanguage } from '../lib/i18n';

const PRESETS = ['outstanding', 'new', 'high', 'dismissed', 'fixed'];
const CLASSIFICATIONS = ['Unclassified', 'Pending', 'Bug', 'False Positive', 'Intentional'];
const ACTIONS = ['Undecided', 'Fix Required', 'Fix Submitted', 'Modeling Required', 'Ignore'];

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
  return (
    <div>
      <div className="hrow">
        {PRESETS.map((id) => (
          <button key={id} type="button" className={preset === id ? 'primary' : 'ghost'} onClick={() => setPreset(id)}>{t(`cov_${id}`)}</button>
        ))}
        <span className="spacer" />
        <span className={policy.status === 'ERROR' ? 'bad' : 'ok'}>{t('cov_policy')} {policy.status || '—'}</span>
      </div>
      <p className="small">{cov.reference ? t('cov_reference') : t('cov_compare')} {t('cov_hint')}</p>
      <div className="card-grid">
        <Stat n={outstanding} label={t('cov_outstanding')} />
        <Stat n={outstandingHigh} label={t('cov_high')} />
        <Stat n={newlyDetected} label={t('cov_new')} />
        <Stat n={dismissedCount} label={t('cov_dismissed')} />
        <Stat n={fixed.length} label={t('cov_fixed')} />
      </div>
      <div className="hrow">
        <input value={q} placeholder={t('search')} onChange={(e) => setQ(e.target.value)} />
        <select value={checker} onChange={(e) => setChecker(e.target.value)}>
          <option value="">{t('cov_checker')}</option>
          {checkers.map((name) => <option key={name}>{name}</option>)}
        </select>
      </div>
      <div className="split">
        <div className="panel" style={{ padding: 0 }}>
          <table>
            <thead><tr><th>CID</th><th>{t('cov_impact')}</th><th>{t('cov_checker')}</th><th>{t('message')}</th><th>{t('location')}</th></tr></thead>
            <tbody>
              {list.map((issue) => (
                <tr key={`${issue.cid}-${issue.line}`} className={`click ${selected && selected.cid === issue.cid ? 'sel' : ''}`} onClick={() => setCid(issue.cid)}>
                  <td>{issue.cid}</td>
                  <td><span className={`impact ${issue.impact}`}>{issue.impact}</span></td>
                  <td className="small">{issue.checker}<div>{issue.kind}</div></td>
                  <td>{text(issue.message)}<div className="small">{issue.component} · {issue.function}</div></td>
                  <td className="small">{issue.file}:{issue.line}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {list.length === 0 && <p className="small" style={{ padding: 12 }}>{t('empty')}</p>}
        </div>
        <aside className="panel drawer">
          {!selected && <p className="small">{t('cov_pick')}</p>}
          {selected && (
            <>
              <h3>CID {selected.cid}</h3>
              <p>{text(selected.message)}</p>
              <p className="small">{selected.checker} · {selected.category} · {selected.cwe} {selected.cert}</p>
              <p className="small">{selected.file}:{selected.line} · {selected.function} · {selected.component}{selected.componentOwner ? ` (${selected.componentOwner})` : ''}</p>
              <h3>{t('cov_events')}</h3>
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
                  <label className="form-row inline">{t('cov_classification')}
                    <select value={selected.classification || 'Unclassified'} onChange={(e) => triage({ classification: e.target.value })}>
                      {CLASSIFICATIONS.map((item) => <option key={item}>{item}</option>)}
                    </select>
                  </label>
                  <label className="form-row inline">{t('cov_action')}
                    <select value={selected.action || 'Undecided'} onChange={(e) => triage({ action: e.target.value })}>
                      {ACTIONS.map((item) => <option key={item}>{item}</option>)}
                    </select>
                  </label>
                  <Owner key={selected.cid} issue={selected} onUpdate={onUpdate} />
                </>
              )}
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

function Stat({ n, label }) {
  return <div className="card"><div className="k">{label}</div><div className="v">{n == null ? '—' : n}</div></div>;
}

function Owner({ issue, onUpdate }) {
  const [owner, setOwner] = useState(issue.owner || '');
  return (
    <label className="form-row inline">{t('cov_owner')}
      <input value={owner} onChange={(e) => setOwner(e.target.value)} />
      <button type="button" onClick={() => onUpdate([issue.key], { owner, cid: issue.cid })}>{t('save')}</button>
    </label>
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
  return (
    <div>
      <p className="small">{t('cov_stream_hint')}</p>
      <div className="panel" style={{ padding: 0 }}>
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
                  <td className={c.policy === 'ERROR' ? 'bad' : 'ok'}>{c.policy || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <p className="small" style={{ padding: 12 }}>{t('empty')}</p>}
      </div>
      {rows.length > 1 && (
        <div className="hrow">
          <span>{t('cov_from')}</span>
          <select value={left} onChange={(e) => setLeft(Number(e.target.value))}>{rows.map((row, i) => <option key={i} value={i}>{i + 1}</option>)}</select>
          <span>{t('cov_to')}</span>
          <select value={right} onChange={(e) => setRight(Number(e.target.value))}>{rows.map((row, i) => <option key={i} value={i}>{i + 1}</option>)}</select>
          <span>{t('cov_new')} {added}</span>
          <span>{t('cov_fixed')} {removed}</span>
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
      <h3 style={{ padding: '8px 12px' }}>{title}</h3>
      <table>
        <tbody>{entries.map(([name, n]) => <tr key={name}><td>{name}</td><td>{n}</td></tr>)}</tbody>
      </table>
      {entries.length === 0 && <p className="small" style={{ padding: 12 }}>{t('empty')}</p>}
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
    <div>
      <p className="small">{t('cov_component_hint')}</p>
      <div className="panel" style={{ padding: 0 }}>
        <table>
          <thead><tr><th>{t('name')}</th><th>{t('cov_owner')}</th><th>{t('pattern')}</th><th /></tr></thead>
          <tbody>
            {(components || []).map((component, i) => (
              <tr key={`${component.name}-${i}`}>
                <td>{component.name}</td>
                <td>{component.owner}</td>
                <td className="small">{(component.patterns || []).join(', ')}</td>
                <td><button type="button" className="ghost" onClick={() => onChange(components.filter((_, n) => n !== i))}>{t('remove')}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="hrow">
        <input placeholder={t('name')} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        <input placeholder={t('cov_owner')} value={draft.owner} onChange={(e) => setDraft({ ...draft, owner: e.target.value })} />
        <textarea placeholder={'src/api/**\nsrc/web/**'} value={draft.patterns} onChange={(e) => setDraft({ ...draft, patterns: e.target.value })} />
        <button type="button" className="primary" onClick={add}>{t('add')}</button>
      </div>
    </div>
  );
}

export function PoliciesEditor({ policies, project, onChange, onAssign }) {
  useLanguage();
  const current = project && project.policyId;
  return (
    <div>
      <p className="small">{t('cov_policy_hint')}</p>
      {(policies || []).map((policy) => (
        <div key={policy.id} className="panel">
          <div className="hrow">
            <strong>{text(policy.name) || policy.id}</strong>
            {project && <button type="button" className={current === policy.id || (!current && policy.isDefault) ? 'primary' : 'ghost'} onClick={() => onAssign(policy.id)}>{t('cov_assign')}</button>}
          </div>
          <ul>{(policy.conditions || []).map((c, i) => <li key={i} className="small">{c.metric} {c.op} {c.threshold}</li>)}</ul>
        </div>
      ))}
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
    <div>
      <p className="small">{t('cov_model_hint')}</p>
      <div className="panel" style={{ padding: 0 }}>
        <table>
          <thead><tr><th>{t('name')}</th><th>{t('type')}</th><th>{t('pattern')}</th><th /></tr></thead>
          <tbody>
            {(models || []).map((model, i) => (
              <tr key={model.key || i}><td>{model.name}</td><td>{model.kind}</td><td className="small">{model.pattern}</td>
                <td><button type="button" className="ghost" onClick={() => onChange(models.filter((_, n) => n !== i))}>{t('remove')}</button></td></tr>
            ))}
          </tbody>
        </table>
        {(models || []).length === 0 && <p className="small" style={{ padding: 12 }}>{t('empty')}</p>}
      </div>
      <div className="hrow">
        <input placeholder={t('name')} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        <select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value })}>
          {['sink', 'allocator', 'source'].map((kind) => <option key={kind}>{kind}</option>)}
        </select>
        <input placeholder={t('pattern')} value={draft.pattern} onChange={(e) => setDraft({ ...draft, pattern: e.target.value })} />
        <button type="button" className="primary" onClick={add}>{t('add')}</button>
      </div>
    </div>
  );
}
