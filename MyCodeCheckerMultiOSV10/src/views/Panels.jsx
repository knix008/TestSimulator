import React, { useMemo, useState } from 'react';
import { t, textOf, useLanguage, getLanguage } from '../lib/i18n';
import { Icon } from '../components/Chrome';
import { IconSelect, Btn, Stepper, Toggle } from './common';
import { ISSUE_STANDARDS, standardsOf, matchesStandard, standardChips, engineOf, ENGINE_ICON } from './standards';

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

export const SEV = ['BLOCKER', 'CRITICAL', 'MAJOR', 'MINOR', 'INFO'];
const TYPES = ['BUG', 'VULNERABILITY', 'CODE_SMELL'];

export function msg(issue) {
  return textOf(issue.message);
}

export function StartPage({ projects, onOpen, onSample, onRecent, showOnLaunch, onShowOnLaunch }) {
  useLanguage();
  return (
    <div className="hero">
      <img src="./icon.svg" alt="" width={64} height={64} />
      <h1>{t('start_title')}</h1>
      <p>{t('start_body')}</p>
      <div className="hero-actions">
        <Btn icon="folder" label={t('open_folder')} primary onClick={onOpen} />
        <Btn icon="play" label={t('open_sample')} onClick={onSample} />
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
      <div className="hero-launch">
        <Toggle icon="home" label={t('show_start_on_launch')} checked={showOnLaunch} onChange={onShowOnLaunch} />
      </div>
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
  const ruleMap = useMemo(() => new Map(rules.map((r) => [r.key, r])), [rules]);
  const list = useMemo(() => filterIssues(issues, filter, false, ruleMap), [issues, filter, ruleMap]);
  const engines = useMemo(() => [...new Set(issues.map(engineOf))].sort(), [issues]);
  const rule = selected && ruleMap.get(selected.rule);
  const toggle = (key) => setChecked(checked.includes(key) ? checked.filter((k) => k !== key) : [...checked, key]);
  const chips = selected ? standardChips(standardsOf(selected, rule)) : [];
  const misraCategory = selected && (selected.misraCategory || (rule && rule.misraCategory));
  return (
    <div>
      <Filters filter={filter} setFilter={setFilter} types={TYPES} engines={engines} />
      {filter.drillLabel && (
        <div className="drill-bar">
          <Icon name="filter" size={14} /><span>{t('ib_drill')}: <strong>{filter.drillLabel}</strong> ({list.length})</span>
          <Btn icon="close" label={t('ib_clear_drill')} onClick={() => setFilter({ ...filter, rules: null, keys: null, drillLabel: '' })} />
        </div>
      )}
      <div className="split">
        <div className="panel tpanel">
          <div className="table-wrap tall">
          <table>
            <thead><tr><th /><th>{t('severity')}</th><th>{t('message')}</th><th>{t('location')}</th><th>{t('status')}</th></tr></thead>
            <tbody>
              {list.map((issue) => (
                <tr key={issue.key} className={`click ${selected && selected.key === issue.key ? 'sel' : ''}`} onClick={() => onSelect(issue)}>
                  <td onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={checked.includes(issue.key)} onChange={() => toggle(issue.key)} /></td>
                  <td><span className={`sev ${issue.severity}`}>{issue.severity}</span>{issue.isNew && <div className="pill">{t('new_code')}</div>}</td>
                  <td className="wrap"><div>{msg(issue)}</div><div className="small">{issue.rule} · {issue.type}{engineOf(issue) !== 'core' ? ` · ${engineOf(issue)}` : ''}</div></td>
                  <td className="small wrap">{issue.file}:{issue.line}</td>
                  <td className="small">{issue.status}{issue.resolution ? ` / ${issue.resolution}` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {list.length === 0 && <p className="small" style={{ padding: 12 }}>{t('empty')}</p>}
          </div>
        </div>
        <aside className="panel drawer">
          {!selected && <p className="small">{t('empty')}</p>}
          {selected && (
            <>
              <h3>{msg(selected)}</h3>
              <div className="small wrap">{selected.file}:{selected.line}</div>
              <div className="chips">
                <span className="chip engine"><Icon name={ENGINE_ICON[engineOf(selected)] || 'search'} size={11} />{t('ib_engine')} {engineOf(selected)}</span>
                {misraCategory && <span className="chip misra">{t('ib_misra_category')} {misraCategory}</span>}
                {chips.map((c) => <span key={c.text} className={`chip ${c.kind}`}>{c.text}</span>)}
              </div>
              {(selected.events || []).length > 1 && <EventPath events={selected.events} file={selected.file} />}
              {(selected.snippet || []).length > 0 && <div className="snippet">{(selected.snippet || []).map((row) => (
                <div key={row.line} className={row.hit ? 'hit' : ''}><span className="ln">{row.line}</span><span>{row.text}</span></div>
              ))}</div>}
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
            <div className="actions bulk">
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

// Source → sink steps of a finding; cross-file steps show their file.
function EventPath({ events, file }) {
  useLanguage();
  return (
    <>
      <h3>{t('ib_path')}</h3>
      <ol className="events path">
        {events.map((ev, i) => (
          <li key={i} className={`${ev.main ? 'main' : ''} ${ev.tag || ''}`}>
            <span className="ev-tag">{t(`ib_ev_${ev.tag || 'step'}`) === `ib_ev_${ev.tag || 'step'}` ? (ev.tag || '') : t(`ib_ev_${ev.tag || 'step'}`)}</span>
            {ev.file && ev.file !== file && <span className="ev-file">{ev.file}</span>}
            <span className="ln">{ev.line}</span>
            <span>{textOf(ev.text)}</span>
          </li>
        ))}
      </ol>
    </>
  );
}

export const TYPE_ICON = { BUG: 'bug', VULNERABILITY: 'lock', CODE_SMELL: 'code', SECURITY_HOTSPOT: 'shield' };
export const SEV_ICON = { BLOCKER: 'alert', CRITICAL: 'alert', MAJOR: 'alert', MINOR: 'info', INFO: 'info' };

function Filters({ filter, setFilter, types, engines }) {
  useLanguage();
  const set = (patch) => setFilter({ ...filter, ...patch });
  const typeLabel = (s) => ({ BUG: t('bugs'), VULNERABILITY: t('vulns'), CODE_SMELL: t('smells'), SECURITY_HOTSPOT: t('hotspots') }[s] || s);
  return (
    <div className="view-toolbar">
      <input className="search" placeholder={t('search')} value={filter.q} onChange={(e) => set({ q: e.target.value })} />
      <IconSelect value={filter.severity} onChange={(v) => set({ severity: v })} title={t('severity')} width={150}
        options={[{ value: '', label: t('ib_any_severity'), icon: 'list' }, ...SEV.map((s) => ({ value: s, label: s, icon: SEV_ICON[s] }))]} />
      <IconSelect value={filter.type} onChange={(v) => set({ type: v })} title={t('type')} width={150}
        options={[{ value: '', label: t('ib_any_type'), icon: 'list' }, ...types.map((s) => ({ value: s, label: typeLabel(s), icon: TYPE_ICON[s] }))]} />
      <IconSelect value={filter.status} onChange={(v) => set({ status: v })} title={t('status')} width={150}
        options={[{ value: '', label: t('ib_any_status'), icon: 'list' }, ...['OPEN', 'CONFIRMED', 'REOPENED', 'RESOLVED', 'CLOSED', 'TO_REVIEW'].map((s) => ({ value: s, label: s, icon: s === 'RESOLVED' || s === 'CLOSED' ? 'check' : 'clock' }))]} />
      {engines && (
        <IconSelect value={filter.engine || ''} onChange={(v) => set({ engine: v })} title={t('ib_engine')} width={150}
          options={[{ value: '', label: t('ib_any_engine'), icon: 'cpu' }, ...engines.map((e) => ({ value: e, label: e, icon: ENGINE_ICON[e] || 'cpu' }))]} />
      )}
      <IconSelect value={filter.standard || ''} onChange={(v) => set({ standard: v })} title={t('ib_standard')} width={160}
        options={[{ value: '', label: t('ib_any_standard'), icon: 'shield' }, ...ISSUE_STANDARDS]} />
      <button type="button" role="switch" aria-checked={!!filter.newOnly} className={`vbtn toggle ${filter.newOnly ? 'on' : ''}`} onClick={() => set({ newOnly: !filter.newOnly })}>
        <span className="switch" aria-hidden="true"><span /></span><Icon name="clock" size={15} /><span>{t('new_only')}</span>
      </button>
    </div>
  );
}

function filterIssues(issues, filter, hotspots, ruleMap) {
  const drillRules = filter.rules && filter.rules.length ? new Set(filter.rules) : null;
  const drillKeys = filter.keys && filter.keys.length ? new Set(filter.keys) : null;
  const drilled = !!(drillRules || drillKeys);
  return issues.filter((issue) => {
    if (hotspots) return issue.type === 'SECURITY_HOTSPOT';
    if (issue.type === 'SECURITY_HOTSPOT' && !drilled) return false;
    if (drilled && !((drillKeys && drillKeys.has(issue.key)) || (drillRules && drillRules.has(issue.rule)))) return false;
    if (filter.type && issue.type !== filter.type) return false;
    if (filter.severity && issue.severity !== filter.severity) return false;
    if (filter.status && issue.status !== filter.status) return false;
    if (filter.newOnly && !issue.isNew) return false;
    if (filter.engine && engineOf(issue) !== filter.engine) return false;
    if (filter.standard && !matchesStandard(standardsOf(issue, ruleMap && ruleMap.get(issue.rule)), filter.standard)) return false;
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
  const [engine, setEngine] = useState('');
  const [standard, setStandard] = useState('');
  const [limit, setLimit] = useState(300);
  const langs = [...new Set(rules.flatMap((r) => r.langs || []))].sort();
  const engines = [...new Set(rules.map(engineOf))].sort();
  const list = rules.filter((r) => {
    if (lang && !(r.langs || []).includes(lang) && !(r.langs || []).includes('*')) return false;
    if (engine && engineOf(r) !== engine) return false;
    if (standard && !matchesStandard(standardsOf(null, r), standard)) return false;
    if (!q) return true;
    const blob = `${r.key} ${textOf(r.name)} ${(r.tags || []).join(' ')}`.toLowerCase();
    return blob.includes(q.toLowerCase());
  });
  return (
    <div>
      <p className="small">{t('rules_hint')} ({list.length} / {rules.length})</p>
      <div className="view-toolbar">
        <input className="search" placeholder={t('search')} value={q} onChange={(e) => setQ(e.target.value)} />
        <IconSelect value={lang} onChange={setLang} title={t('languages')} width={150}
          options={[{ value: '', label: t('ib_any_language'), icon: 'code' }, ...langs.map((l) => ({ value: l, label: l === '*' ? t('all') : l, icon: 'file' }))]} />
        <IconSelect value={engine} onChange={setEngine} title={t('ib_engine')} width={150}
          options={[{ value: '', label: t('ib_any_engine'), icon: 'cpu' }, ...engines.map((e) => ({ value: e, label: e, icon: ENGINE_ICON[e] || 'cpu' }))]} />
        <IconSelect value={standard} onChange={setStandard} title={t('ib_standard')} width={160}
          options={[{ value: '', label: t('ib_any_standard'), icon: 'shield' }, ...ISSUE_STANDARDS]} />
      </div>
      <div className="panel tpanel">
        <div className="table-wrap tall">
          <table>
            <thead><tr><th>{t('rule')}</th><th>{t('severity')}</th><th>{t('type')}</th><th className="act" /></tr></thead>
            <tbody>
              {list.slice(0, limit).map((r) => {
                const chips = standardChips(standardsOf(null, r));
                return (
                  <tr key={r.key}>
                    <td className="wrap">
                      <strong>{textOf(r.name)}</strong>
                      <div className="small">{r.key} {(r.tags || []).map((tag) => <span key={tag} className="pill tag">{tag}</span>)}</div>
                      {(chips.length > 0 || r.misraCategory || r.decidable != null || engineOf(r) !== 'core') && (
                        <div className="chips">
                          {engineOf(r) !== 'core' && <span className="chip engine"><Icon name={ENGINE_ICON[engineOf(r)] || 'cpu'} size={11} />{engineOf(r)}</span>}
                          {r.misraCategory && <span className="chip misra">{t('ib_misra_category')} {r.misraCategory}</span>}
                          {r.decidable != null && <span className="chip">{r.decidable ? t('ib_decidable') : t('ms_undecidable')}</span>}
                          {chips.map((c) => <span key={c.text} className={`chip ${c.kind}`}>{c.text}</span>)}
                        </div>
                      )}
                      <div className="small">{textOf(r.why)}</div>
                    </td>
                    <td className={`sev ${r.severity}`}>{r.severity}</td>
                    <td className="small">{r.type}</td>
                    <td className="act"><Btn icon="minus" label={t('inactive')} onClick={() => onDeactivate(r.key)} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {list.length > limit && <div className="more-row"><Btn icon="plus" label={t('ib_show_more', { n: list.length - limit })} onClick={() => setLimit(limit + 300)} /></div>}
        </div>
      </div>
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
  const sevOptions = SEV.map((s) => ({ value: s, label: s, icon: SEV_ICON[s] }));
  return (
    <div>
      <div className="view-toolbar">
        <IconSelect value={profile.id} onChange={setId} title={t('profile')} ariaLabel={t('profile')} width={240}
          options={profiles.map((p) => ({ value: p.id, label: `${p.name} (${p.language})`, icon: 'layers' }))} />
        <input className="search" placeholder={t('search')} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="panel tpanel">
        <div className="table-wrap tall">
          <table>
            <thead><tr><th>{t('active')}</th><th>{t('rule')}</th><th>{t('severity')}</th></tr></thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.key}>
                  <td><input type="checkbox" aria-label={t('active')} checked={!inactive.has(r.key)} onChange={(e) => {
                    const set = new Set(profile.inactive || []);
                    if (e.target.checked) set.delete(r.key); else set.add(r.key);
                    update({ ...profile, inactive: [...set] });
                  }} /></td>
                  <td className="wrap">{textOf(r.name)}<div className="small">{r.key}</div></td>
                  <td className="nowrap">
                    <IconSelect value={(profile.overrides && profile.overrides[r.key]) || r.severity} options={sevOptions} width={150} ariaLabel={t('severity')}
                      onChange={(v) => {
                        const overrides = { ...(profile.overrides || {}) };
                        if (v === r.severity) delete overrides[r.key];
                        else overrides[r.key] = v;
                        update({ ...profile, overrides });
                      }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const GATE_OPS = { GT: '>', LT: '<', GTE: '≥', LTE: '≤', EQ: '=' };

export function GatesView({ gates, project, onChange, onAssign }) {
  useLanguage();
  const lang = getLanguage();
  const [id, setId] = useState((gates[0] && gates[0].id) || '');
  const gate = gates.find((g) => g.id === id) || gates[0];
  if (!gate) return null;
  const metrics = ['new_bugs', 'new_vulnerabilities', 'new_code_smells', 'new_coverage', 'new_duplicated_lines_density', 'new_reliability_rating', 'new_security_rating', 'new_maintainability_rating', 'new_security_hotspots_reviewed', 'bugs', 'vulnerabilities', 'coverage', 'duplicated_lines_density', 'reliability_rating', 'security_rating', 'maintainability_rating'];
  const update = (next) => onChange(gates.map((g) => (g.id === gate.id ? next : g)));
  const setCond = (c, patch) => update({ ...gate, conditions: gate.conditions.map((x) => x.id === c.id ? { ...x, ...patch } : x) });
  const metricOptions = metrics.map((m) => ({ value: m, label: metricLabel(m, lang), icon: m.startsWith('new_') ? 'clock' : 'chart' }));
  const opOptions = Object.keys(GATE_OPS).map((op) => ({ value: op, label: `${op} (${GATE_OPS[op]})`, icon: 'filter' }));
  return (
    <div>
      <div className="view-toolbar">
        <IconSelect value={gate.id} onChange={setId} title={t('gate_pick')} ariaLabel={t('gate_pick')} width={240}
          options={gates.map((g) => ({ value: g.id, label: g.name, icon: 'gate' }))} />
        <Btn icon="copy" label={t('gate_copy')} onClick={() => {
          const copy = { ...gate, id: `gate-${Date.now().toString(36)}`, name: `${gate.name} copy`, isDefault: false, conditions: gate.conditions.map((c) => ({ ...c, id: `c-${Math.random().toString(36).slice(2, 7)}` })) };
          onChange([...gates, copy]);
          setId(copy.id);
        }} />
        {project && <Btn icon="link" label={t('gate_assign', { name: project.name })} onClick={() => onAssign(gate.id)} />}
      </div>
      <div className="panel tpanel">
        <div className="table-wrap">
          <table>
            <thead><tr><th>{t('gate_metric')}</th><th>{t('gate_op')}</th><th>{t('gate_threshold')}</th><th className="act" /></tr></thead>
            <tbody>
              {gate.conditions.map((c) => (
                <tr key={c.id}>
                  <td><IconSelect value={c.metric} options={metricOptions} width={300} ariaLabel={t('gate_metric')} onChange={(v) => setCond(c, { metric: v })} /></td>
                  <td><IconSelect value={c.op} options={opOptions} width={120} ariaLabel={t('gate_op')} onChange={(v) => setCond(c, { op: v })} /></td>
                  <td><Stepper value={c.threshold} min={0} max={1000000} ariaLabel={t('gate_threshold')} onChange={(v) => setCond(c, { threshold: v })} /></td>
                  <td className="act"><Btn icon="trash" label={t('remove')} onClick={() => update({ ...gate, conditions: gate.conditions.filter((x) => x.id !== c.id) })} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="table-foot">
        <Btn icon="plus" label={t('gate_add_condition')} primary onClick={() => update({ ...gate, conditions: [...gate.conditions, { id: `c-${Date.now().toString(36)}`, metric: 'bugs', op: 'GT', threshold: 0, on: 'overall' }] })} />
      </div>
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
