import React, { useMemo, useState } from 'react';
import { t, textOf, useLanguage, getLanguage } from '../lib/i18n';

const METRIC_NAME = {
  bugs: ['버그', 'Bugs'],
  vulnerabilities: ['취약점', 'Vulnerabilities'],
  code_smells: ['코드 스멜', 'Code smells'],
  security_hotspots: ['보안 핫스팟', 'Security hotspots'],
  security_hotspots_reviewed: ['검토한 핫스팟 %', 'Hotspots reviewed %'],
  coverage: ['커버리지', 'Coverage'],
  duplicated_lines_density: ['중복 줄 %', 'Duplicated lines %'],
  ncloc: ['코드 줄', 'Lines of code'],
  sqale_index: ['기술 부채(분)', 'Technical debt (min)'],
  sqale_debt_ratio: ['부채 비율', 'Debt ratio'],
  complexity: ['복잡도', 'Complexity'],
  reliability_rating: ['신뢰성 등급', 'Reliability rating'],
  security_rating: ['보안 등급', 'Security rating'],
  maintainability_rating: ['유지보수성 등급', 'Maintainability rating'],
  security_review_rating: ['보안 검토 등급', 'Security review rating'],
  duplicated_lines: ['중복 줄', 'Duplicated lines'],
  comment_density: ['주석 밀도', 'Comment density'],
  files: ['파일', 'Files'],
};

function metricLabel(key, lang) {
  const base = String(key).replace(/^new_/, '');
  const pair = METRIC_NAME[base];
  const name = pair ? (lang === 'ko' ? pair[0] : pair[1]) : base;
  if (String(key).startsWith('new_')) return lang === 'ko' ? `새 코드 · ${name}` : `New code · ${name}`;
  return name;
}

const SEV = ['BLOCKER', 'CRITICAL', 'MAJOR', 'MINOR', 'INFO'];
const TYPES = ['BUG', 'VULNERABILITY', 'CODE_SMELL'];

export function msg(issue) {
  return textOf(issue.message);
}

export function StartPage({ projects, onOpen, onSample, onRecent }) {
  useLanguage();
  return (
    <div className="hero">
      <img src="./icon.svg" alt="" width={64} height={64} />
      <h1>{t('start_title')}</h1>
      <p>{t('start_body')}</p>
      <div className="hero-actions">
        <button className="primary" onClick={onOpen}>{t('open_folder')}</button>
        <button className="ghost" onClick={onSample}>{t('open_sample')}</button>
      </div>
      {projects.length > 0 && (
        <div className="panel" style={{ textAlign: 'left', marginTop: 28 }}>
          <h2>{t('recent')}</h2>
          {projects.map((p) => (
            <button key={p.id} className="nav-item" onClick={() => onRecent(p)}>
              <strong>{p.name}</strong>
              <span className="muted ellipsis">{p.path}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Overview({ analysis }) {
  useLanguage();
  const lang = getLanguage();
  if (!analysis) return <p className="muted">{t('no_project')}</p>;
  const g = analysis.qualityGate;
  const r = analysis.ratings;
  const m = analysis.measures;
  return (
    <div>
      <div className={`banner ${g.status}`}>
        <div>
          <div className="k muted">{t('gate')}</div>
          <strong style={{ fontSize: 22 }}>{g.status === 'OK' ? t('passed') : t('failed')}</strong>
        </div>
        <div className="small">{analysis.hasBaseline ? t('baseline_prev') : t('baseline_all')}</div>
      </div>
      <div className="card-grid">
        <RatingCard label={t('reliability')} letter={r.reliability} hint={`${t('new_code')} ${analysis.ratingsNew.reliability}`} />
        <RatingCard label={t('security')} letter={r.security} hint={`${t('new_code')} ${analysis.ratingsNew.security}`} />
        <RatingCard label={t('maintainability')} letter={r.maintainability} hint={`${r.debtRatio}%`} />
        <RatingCard label={t('sec_review')} letter={r.securityReview} hint={`${r.hotspotsReviewed}%`} />
      </div>
      <div className="card-grid">
        <Num label={t('bugs')} value={m.bugs} sub={`${t('new_code')} ${m.new_bugs}`} />
        <Num label={t('vulns')} value={m.vulnerabilities} sub={`${t('new_code')} ${m.new_vulnerabilities}`} />
        <Num label={t('smells')} value={m.code_smells} sub={`${t('new_code')} ${m.new_code_smells}`} />
        <Num label={t('hotspots')} value={m.security_hotspots} sub={t('sec_review')} />
        <Num label={t('debt')} value={`${m.sqale_index}`} sub={t('minutes')} />
        <Num label={t('coverage')} value={m.coverage == null ? '—' : `${m.coverage}%`} sub={m.coverage == null ? t('no_coverage') : ''} />
        <Num label={t('dup_density')} value={`${m.duplicated_lines_density}%`} sub={`${m.duplicated_lines} ${t('lines')}`} />
        <Num label={t('ncloc')} value={m.ncloc} sub={`${m.files} ${t('files')}`} />
      </div>
      <div className="panel">
        <h2>{t('conditions')}</h2>
        <table>
          <tbody>
            {g.conditions.map((c) => (
              <tr key={c.id}>
                <td>{metricLabel(c.metric, lang)}</td>
                <td className="muted">{c.op} {c.threshold}</td>
                <td>{c.actual == null ? '—' : c.actual}</td>
                <td className={c.status === 'ERROR' ? 'bad' : c.status === 'OK' ? 'ok' : 'muted'}>{c.status === 'NO_DATA' ? t('no_data') : c.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="panel" style={{ marginTop: 12 }}>
        <h2>{t('languages')}</h2>
        <div className="hrow">
          {Object.entries(analysis.languages).map(([k, n]) => <span key={k} className="pill">{k} {n}</span>)}
        </div>
      </div>
    </div>
  );
}

function RatingCard({ label, letter, hint }) {
  return <div className="card"><div className="k">{label}</div><div className={`rating ${letter}`}>{letter}</div><div className="small">{hint}</div></div>;
}
function Num({ label, value, sub }) {
  return <div className="card"><div className="k">{label}</div><div className="v">{value}</div><div className="small">{sub}</div></div>;
}

export function IssueBrowser({ issues, rules, filter, setFilter, selected, onSelect, checked, setChecked, onUpdate }) {
  useLanguage();
  const [comment, setComment] = useState('');
  const [assignee, setAssignee] = useState('');
  const list = useMemo(() => filterIssues(issues, filter, false), [issues, filter]);
  const rule = selected && rules.find((r) => r.key === selected.rule);
  const toggle = (key) => setChecked(checked.includes(key) ? checked.filter((k) => k !== key) : [...checked, key]);
  return (
    <div>
      <Filters filter={filter} setFilter={setFilter} types={TYPES} />
      <div className="split">
        <div className="panel" style={{ padding: 0 }}>
          <table>
            <thead><tr><th /><th>{t('severity')}</th><th>{t('message')}</th><th>{t('location')}</th><th>{t('status')}</th></tr></thead>
            <tbody>
              {list.map((issue) => (
                <tr key={issue.key} className={`click ${selected && selected.key === issue.key ? 'sel' : ''}`} onClick={() => onSelect(issue)}>
                  <td onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={checked.includes(issue.key)} onChange={() => toggle(issue.key)} /></td>
                  <td><span className={`sev ${issue.severity}`}>{issue.severity}</span>{issue.isNew && <div className="pill">{t('new_code')}</div>}</td>
                  <td><div>{msg(issue)}</div><div className="small">{issue.rule} · {issue.type}</div></td>
                  <td className="small">{issue.file}:{issue.line}</td>
                  <td className="small">{issue.status}{issue.resolution ? ` / ${issue.resolution}` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {list.length === 0 && <p className="small" style={{ padding: 12 }}>{t('empty')}</p>}
        </div>
        <aside className="panel drawer">
          {!selected && <p className="small">{t('empty')}</p>}
          {selected && (
            <>
              <h3>{msg(selected)}</h3>
              <div className="small">{selected.file}:{selected.line}</div>
              <div className="snippet">{(selected.snippet || []).map((row) => (
                <div key={row.line} className={row.hit ? 'hit' : ''}><span className="ln">{row.line}</span><span>{row.text}</span></div>
              ))}</div>
              {rule && <><h3>{t('why')}</h3><p className="small">{textOf(rule.why)}</p><h3>{t('how_to_fix')}</h3><p className="small">{textOf(rule.fix)}</p></>}
              <div className="actions">
                <button onClick={() => onUpdate([selected.key], { status: 'CONFIRMED' })}>{t('confirmed')}</button>
                <button onClick={() => onUpdate([selected.key], { status: 'RESOLVED', resolution: 'FALSE-POSITIVE' })}>{t('false_positive')}</button>
                <button onClick={() => onUpdate([selected.key], { status: 'RESOLVED', resolution: 'WONTFIX' })}>{t('wontfix')}</button>
                <button onClick={() => onUpdate([selected.key], { status: 'REOPENED', resolution: null })}>{t('reopen')}</button>
              </div>
              {(selected.comments || []).map((c, i) => <p key={i} className="small"><strong>{c.author}</strong> {c.text}</p>)}
              <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t('comment')} />
              <button className="ghost" onClick={() => { if (!comment.trim()) return; onUpdate([selected.key], { comment }); setComment(''); }}>{t('add_comment')}</button>
            </>
          )}
          {checked.length > 0 && (
            <div className="actions">
              <span className="small">{t('bulk')} ({checked.length})</span>
              <input value={assignee} placeholder={t('assignee')} onChange={(e) => setAssignee(e.target.value)} />
              <button onClick={() => onUpdate(checked, { assignee })}>{t('assignee')}</button>
              <button onClick={() => onUpdate(checked, { status: 'RESOLVED', resolution: 'FALSE-POSITIVE' })}>{t('false_positive')}</button>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

export function Hotspots({ issues, rules, onUpdate }) {
  useLanguage();
  const [cur, setCur] = useState(null);
  const list = issues.filter((i) => i.type === 'SECURITY_HOTSPOT');
  const selected = list.find((i) => i.key === cur) || null;
  const rule = selected && rules.find((r) => r.key === selected.rule);
  return (
    <div className="split">
      <div className="panel" style={{ padding: 0 }}>
        <table>
          <thead><tr><th>{t('severity')}</th><th>{t('message')}</th><th>{t('status')}</th></tr></thead>
          <tbody>
            {list.map((issue) => (
              <tr key={issue.key} className={`click ${selected && selected.key === issue.key ? 'sel' : ''}`} onClick={() => setCur(issue.key)}>
                <td className={`sev ${issue.severity}`}>{issue.severity}</td>
                <td>{msg(issue)}<div className="small">{issue.file}:{issue.line}</div></td>
                <td className="small">{labelStatus(issue.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.length === 0 && <p className="small" style={{ padding: 12 }}>{t('empty')}</p>}
      </div>
      <aside className="panel drawer">
        {selected && (
          <>
            <h3>{msg(selected)}</h3>
            <div className="snippet">{(selected.snippet || []).map((row) => (
              <div key={row.line} className={row.hit ? 'hit' : ''}><span className="ln">{row.line}</span><span>{row.text}</span></div>
            ))}</div>
            {rule && <p className="small">{textOf(rule.why)} {textOf(rule.fix)}</p>}
            <div className="actions">
              <button onClick={() => onUpdate([selected.key], { status: 'ACKNOWLEDGED' })}>{t('acknowledged')}</button>
              <button onClick={() => onUpdate([selected.key], { status: 'FIXED', resolution: 'FIXED' })}>{t('fixed')}</button>
              <button onClick={() => onUpdate([selected.key], { status: 'SAFE', resolution: 'SAFE' })}>{t('safe')}</button>
              <button onClick={() => onUpdate([selected.key], { status: 'TO_REVIEW', resolution: null })}>{t('to_review')}</button>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}

function labelStatus(status) {
  if (status === 'TO_REVIEW') return t('to_review');
  if (status === 'ACKNOWLEDGED') return t('acknowledged');
  if (status === 'FIXED') return t('fixed');
  if (status === 'SAFE') return t('safe');
  return status;
}

function Filters({ filter, setFilter, types }) {
  const set = (patch) => setFilter({ ...filter, ...patch });
  return (
    <div className="hrow">
      <input placeholder={t('search')} value={filter.q} onChange={(e) => set({ q: e.target.value })} />
      <select value={filter.severity} onChange={(e) => set({ severity: e.target.value })}>
        <option value="">{t('severity')}</option>
        {SEV.map((s) => <option key={s}>{s}</option>)}
      </select>
      <select value={filter.type} onChange={(e) => set({ type: e.target.value })}>
        <option value="">{t('type')}</option>
        {types.map((s) => <option key={s}>{s}</option>)}
      </select>
      <select value={filter.status} onChange={(e) => set({ status: e.target.value })}>
        <option value="">{t('status')}</option>
        {['OPEN', 'CONFIRMED', 'REOPENED', 'RESOLVED', 'CLOSED', 'TO_REVIEW'].map((s) => <option key={s}>{s}</option>)}
      </select>
      <label className="check"><input type="checkbox" checked={filter.newOnly} onChange={(e) => set({ newOnly: e.target.checked })} />{t('new_only')}</label>
    </div>
  );
}

function filterIssues(issues, filter, hotspots) {
  return issues.filter((issue) => {
    if (hotspots) return issue.type === 'SECURITY_HOTSPOT';
    if (issue.type === 'SECURITY_HOTSPOT') return false;
    if (filter.type && issue.type !== filter.type) return false;
    if (filter.severity && issue.severity !== filter.severity) return false;
    if (filter.status && issue.status !== filter.status) return false;
    if (filter.newOnly && !issue.isNew) return false;
    if (filter.q) {
      const blob = `${issue.rule} ${msg(issue)} ${issue.file}`.toLowerCase();
      if (!blob.includes(filter.q.toLowerCase())) return false;
    }
    return true;
  });
}

export function Measures({ analysis }) {
  useLanguage();
  const lang = getLanguage();
  if (!analysis) return <p className="muted">{t('empty')}</p>;
  const rows = Object.entries(analysis.measures);
  return (
    <div>
      <p className="small">{t('measures_hint')}</p>
      <table>
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}><td>{metricLabel(k, lang)}</td><td>{k}</td><td>{v == null ? '—' : String(v)}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CodeView({ analysis, file, text, onOpen }) {
  useLanguage();
  if (!analysis) return <p className="muted">{t('empty')}</p>;
  const marks = new Set((analysis.issues || []).filter((i) => i.file === file).map((i) => i.line));
  const lines = text == null ? [] : String(text).split(/\r?\n/);
  return (
    <div className="code-wrap" style={{ height: 'calc(100vh - 180px)' }}>
      <div className="filetree">
        {analysis.files.map((f) => (
          <button key={f.path} className={f.path === file ? 'on' : ''} onClick={() => onOpen(f.path)} title={f.path}>
            {f.path} <span className="muted">{f.issues || 0}</span>
          </button>
        ))}
      </div>
      <div className="codepane selectable">
        {lines.map((line, i) => (
          <div key={i} className={`row ${marks.has(i + 1) ? 'mark' : ''}`}><span className="ln">{i + 1}</span><span>{line || ' '}</span></div>
        ))}
      </div>
    </div>
  );
}

export function Duplications({ analysis, onOpen }) {
  useLanguage();
  const blocks = (analysis && analysis.duplications) || [];
  return (
    <div>
      <p className="small">{t('dup_hint')}</p>
      {blocks.length === 0 && <p className="muted">{t('empty')}</p>}
      {blocks.map((b) => (
        <div key={b.hash + b.instances[0].path + b.instances[0].start} className="panel" style={{ marginBottom: 8 }}>
          <strong>{b.lines} {t('lines')}</strong>
          {b.instances.map((inst) => (
            <button key={inst.path + inst.start} className="nav-item" onClick={() => onOpen(inst.path)}>
              {inst.path}:{inst.start}–{inst.end}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

export function Activity({ history }) {
  useLanguage();
  const rows = history || [];
  const max = Math.max(1, ...rows.map((h) => (h.measures && h.measures.bugs + h.measures.vulnerabilities + h.measures.code_smells) || 0));
  return (
    <div>
      <p className="small">{t('activity_hint')}</p>
      <div className="bars">
        {rows.map((h) => {
          const n = h.measures ? h.measures.bugs + h.measures.vulnerabilities + h.measures.code_smells : 0;
          return <div key={h.at} className="bar" style={{ height: `${Math.max(6, (n / max) * 110)}px` }} title={`${h.at} ${n}`} />;
        })}
      </div>
      <table>
        <thead><tr><th>{t('when')}</th><th>{t('gate')}</th><th>{t('bugs')}</th><th>{t('vulns')}</th><th>{t('smells')}</th><th>{t('duration')}</th></tr></thead>
        <tbody>
          {[...rows].reverse().map((h) => (
            <tr key={h.at}>
              <td className="small">{h.at}</td>
              <td className={h.gate === 'OK' ? 'ok' : 'bad'}>{h.gate}</td>
              <td>{h.measures && h.measures.bugs}</td>
              <td>{h.measures && h.measures.vulnerabilities}</td>
              <td>{h.measures && h.measures.code_smells}</td>
              <td className="small">{h.durationMs} ms</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function RulesView({ rules, onDeactivate }) {
  useLanguage();
  const [q, setQ] = useState('');
  const [lang, setLang] = useState('');
  const langs = [...new Set(rules.flatMap((r) => r.langs))].sort();
  const list = rules.filter((r) => {
    if (lang && !r.langs.includes(lang) && !r.langs.includes('*')) return false;
    if (!q) return true;
    const blob = `${r.key} ${textOf(r.name)} ${(r.tags || []).join(' ')}`.toLowerCase();
    return blob.includes(q.toLowerCase());
  });
  return (
    <div>
      <p className="small">{t('rules_hint')} ({rules.length})</p>
      <div className="hrow">
        <input placeholder={t('search')} value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={lang} onChange={(e) => setLang(e.target.value)}>
          <option value="">{t('all')}</option>
          {langs.map((l) => <option key={l}>{l}</option>)}
        </select>
      </div>
      <table>
        <thead><tr><th>{t('rule')}</th><th>{t('severity')}</th><th>{t('type')}</th><th /></tr></thead>
        <tbody>
          {list.map((r) => (
            <tr key={r.key}>
              <td><strong>{textOf(r.name)}</strong><div className="small">{r.key} {(r.tags || []).map((tag) => <span key={tag} className="pill tag">{tag}</span>)}</div><div className="small">{textOf(r.why)}</div></td>
              <td className={`sev ${r.severity}`}>{r.severity}</td>
              <td className="small">{r.type}</td>
              <td><button className="ghost" onClick={() => onDeactivate(r.key)}>{t('inactive')}</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ProfilesView({ profiles, rules, onChange }) {
  useLanguage();
  const [id, setId] = useState((profiles[0] && profiles[0].id) || '');
  const [q, setQ] = useState('');
  const profile = profiles.find((p) => p.id === id) || profiles[0];
  if (!profile) return null;
  const inactive = new Set(profile.inactive || []);
  const list = rules.filter((r) => {
    const langs = r.langs || [];
    if (profile.language !== '*' && !langs.includes(profile.language) && !langs.includes('*')) return false;
    if (!q) return true;
    return `${r.key} ${textOf(r.name)}`.toLowerCase().includes(q.toLowerCase());
  });
  const update = (next) => onChange(profiles.map((p) => (p.id === profile.id ? next : p)));
  return (
    <div>
      <div className="hrow">
        <select value={profile.id} onChange={(e) => setId(e.target.value)}>
          {profiles.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.language})</option>)}
        </select>
        <input placeholder={t('search')} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <table>
        <thead><tr><th>{t('active')}</th><th>{t('rule')}</th><th>{t('severity')}</th></tr></thead>
        <tbody>
          {list.map((r) => (
            <tr key={r.key}>
              <td><input type="checkbox" checked={!inactive.has(r.key)} onChange={(e) => {
                const set = new Set(profile.inactive || []);
                if (e.target.checked) set.delete(r.key); else set.add(r.key);
                update({ ...profile, inactive: [...set] });
              }} /></td>
              <td>{textOf(r.name)}<div className="small">{r.key}</div></td>
              <td>
                <select value={(profile.overrides && profile.overrides[r.key]) || r.severity} onChange={(e) => {
                  const overrides = { ...(profile.overrides || {}) };
                  if (e.target.value === r.severity) delete overrides[r.key];
                  else overrides[r.key] = e.target.value;
                  update({ ...profile, overrides });
                }}>
                  {SEV.map((s) => <option key={s}>{s}</option>)}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function GatesView({ gates, project, onChange, onAssign }) {
  useLanguage();
  const lang = getLanguage();
  const [id, setId] = useState((gates[0] && gates[0].id) || '');
  const gate = gates.find((g) => g.id === id) || gates[0];
  if (!gate) return null;
  const metrics = ['new_bugs', 'new_vulnerabilities', 'new_code_smells', 'new_coverage', 'new_duplicated_lines_density', 'new_reliability_rating', 'new_security_rating', 'new_maintainability_rating', 'new_security_hotspots_reviewed', 'bugs', 'vulnerabilities', 'coverage', 'duplicated_lines_density', 'reliability_rating', 'security_rating', 'maintainability_rating'];
  const update = (next) => onChange(gates.map((g) => (g.id === gate.id ? next : g)));
  return (
    <div>
      <div className="hrow">
        <select value={gate.id} onChange={(e) => setId(e.target.value)}>
          {gates.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <button className="ghost" onClick={() => {
          const copy = { ...gate, id: `gate-${Date.now().toString(36)}`, name: `${gate.name} copy`, isDefault: false, conditions: gate.conditions.map((c) => ({ ...c, id: `c-${Math.random().toString(36).slice(2, 7)}` })) };
          onChange([...gates, copy]);
          setId(copy.id);
        }}>{t('add')}</button>
        {project && <button className="ghost" onClick={() => onAssign(gate.id)}>{t('profile')}: {project.name}</button>}
      </div>
      <table>
        <thead><tr><th>{t('measures_hint') && ''}</th><th>op</th><th></th><th /></tr></thead>
        <tbody>
          {gate.conditions.map((c) => (
            <tr key={c.id}>
              <td>
                <select value={c.metric} onChange={(e) => update({ ...gate, conditions: gate.conditions.map((x) => x.id === c.id ? { ...x, metric: e.target.value } : x) })}>
                  {metrics.map((m) => <option key={m} value={m}>{metricLabel(m, lang)}</option>)}
                </select>
              </td>
              <td>
                <select value={c.op} onChange={(e) => update({ ...gate, conditions: gate.conditions.map((x) => x.id === c.id ? { ...x, op: e.target.value } : x) })}>
                  {['GT', 'LT', 'GTE', 'LTE', 'EQ'].map((op) => <option key={op}>{op}</option>)}
                </select>
              </td>
              <td><input type="number" value={c.threshold} onChange={(e) => update({ ...gate, conditions: gate.conditions.map((x) => x.id === c.id ? { ...x, threshold: Number(e.target.value) } : x) })} /></td>
              <td><button className="ghost" onClick={() => update({ ...gate, conditions: gate.conditions.filter((x) => x.id !== c.id) })}>{t('remove')}</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="primary" onClick={() => update({ ...gate, conditions: [...gate.conditions, { id: `c-${Date.now().toString(36)}`, metric: 'bugs', op: 'GT', threshold: 0, on: 'overall' }] })}>{t('add')}</button>
    </div>
  );
}

export function Portfolios({ portfolios, projects, onChange }) {
  useLanguage();
  const [name, setName] = useState('');
  return (
    <div>
      <div className="hrow">
        <input placeholder={t('name')} value={name} onChange={(e) => setName(e.target.value)} />
        <button className="primary" onClick={() => { if (!name.trim()) return; onChange([...portfolios, { id: `pf-${Date.now().toString(36)}`, name: name.trim(), projectIds: [] }]); setName(''); }}>{t('create_portfolio')}</button>
      </div>
      {portfolios.map((pf) => {
        const members = projects.filter((p) => pf.projectIds.includes(p.id));
        const failed = members.filter((p) => branchGate(p) === 'ERROR').length;
        return (
          <div key={pf.id} className="panel" style={{ marginTop: 10 }}>
            <div className="hrow">
              <strong>{pf.name}</strong>
              <span className={failed ? 'bad' : 'ok'}>{failed ? t('failed') : t('passed')} ({members.length})</span>
              <button className="ghost" onClick={() => onChange(portfolios.filter((x) => x.id !== pf.id))}>{t('remove')}</button>
            </div>
            {projects.map((p) => (
              <label key={p.id} className="check">
                <input type="checkbox" checked={pf.projectIds.includes(p.id)} onChange={(e) => {
                  const projectIds = e.target.checked ? [...pf.projectIds, p.id] : pf.projectIds.filter((id) => id !== p.id);
                  onChange(portfolios.map((x) => x.id === pf.id ? { ...x, projectIds } : x));
                }} />
                {p.name} <span className="muted">{branchGate(p) || '—'}</span>
              </label>
            ))}
          </div>
        );
      })}
      {portfolios.length === 0 && <p className="muted">{t('empty')}</p>}
    </div>
  );
}

function branchGate(project) {
  const name = project.mainBranch || 'main';
  const branch = project.branches && project.branches[name];
  if (!branch) return '';
  if (branch.latest && branch.latest.qualityGate) return branch.latest.qualityGate.status;
  return branch.measures ? '' : '';
}

export function Tasks({ tasks }) {
  useLanguage();
  return (
    <div>
      <p className="small">{t('tasks_hint')}</p>
      <table>
        <thead><tr><th>{t('when')}</th><th>{t('branch')}</th><th>{t('status')}</th><th>{t('gate')}</th><th>{t('duration')}</th></tr></thead>
        <tbody>
          {(tasks || []).map((task) => (
            <tr key={task.id}>
              <td className="small">{task.submittedAt}</td>
              <td>{task.branch}</td>
              <td>{task.status}</td>
              <td className={task.gate === 'OK' ? 'ok' : 'bad'}>{task.gate || task.error || ''}</td>
              <td className="small">{task.durationMs ? `${task.durationMs} ms` : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export { filterIssues };
