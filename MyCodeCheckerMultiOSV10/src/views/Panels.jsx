import { ask } from '../lib/ui';
import React, { useEffect, useMemo, useState } from 'react';
import { t, textOf, useLanguage, getLanguage } from '../lib/i18n';
import { Icon, CloseButton, TYPE_ICON, SEV_ICON, STATUS_ICON } from '../components/Chrome';
import { IconSelect, Btn, BtnGroup, Stepper, Toggle, FilePickButton, saveText, ViewHeader, Empty, NoProject, Stat, SevBadge, TypeBadge, StatusPill, sevLabel, statusLabel, emitAction, errorText, useRowWindow } from './common';
import { call, openExternal } from '../lib/backend';
import { Inspector } from '../components/Layout';
import { AiFixBox } from './AiFix';
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

export function metricLabel(key, lang) {
  const base = String(key).replace(/^new_/, '');
  const pair = METRIC_NAME[base];
  const name = pair ? (lang === 'ko' ? pair[0] : pair[1]) : base;
  if (String(key).startsWith('new_')) return lang === 'ko' ? `새 코드 · ${name}` : `New code · ${name}`;
  return name;
}

export const SEV = ['BLOCKER', 'CRITICAL', 'MAJOR', 'MINOR', 'INFO'];
const TYPES = ['BUG', 'VULNERABILITY', 'CODE_SMELL'];

// One changelog field in words: "상태: 확인됨".
function changeText(k, v) {
  const name = t(`hist_f_${k}`) === `hist_f_${k}` ? k : t(`hist_f_${k}`);
  let value = Array.isArray(v) ? v.join(', ') : v;
  if (k === 'status') value = statusLabel(v);
  else if (k === 'resolution') value = v ? (t(`res_${v}`) === `res_${v}` ? v : t(`res_${v}`)) : '—';
  else if (value === null || value === undefined || value === '') value = '—';
  return `${name}: ${value}`;
}

export function msg(issue) {
  return textOf(issue.message);
}

const START_FEATURES = [
  ['bug', 'BUG', 'start_f_bugs'],
  ['unlock', 'VULNERABILITY', 'start_f_vulns'],
  ['smell', 'CODE_SMELL', 'start_f_smells'],
  ['shield', 'SECURITY_HOTSPOT', 'start_f_hotspots'],
  ['gate', 'gate', 'start_f_gate'],
  ['lock', 'lock', 'start_f_compliance'],
];

export function StartPage({ projects, onOpen, onSample, onRecent, showOnLaunch, onShowOnLaunch }) {
  useLanguage();
  return (
    <div className="hero">
      <img src="./icon.svg" alt="" width={64} height={64} />
      <h1>{t('start_title')}</h1>
      <p>{t('start_body')}</p>
      <div className="hero-actions">
        <Btn icon="folder" label={t('open_folder')} primary onClick={onOpen} title={`${t('open_folder')} (Ctrl+O)`} />
        <Btn icon="play" label={t('open_sample')} onClick={onSample} title={t('start_sample_tip')} />
        <Btn icon="installBox" label={t('tl_menu')} onClick={() => emitAction('tools')} title={t('tl_hint')} />
      </div>
      <div className="feature-grid">
        {START_FEATURES.map(([icon, kind, key]) => (
          <div key={key} className={`feature kind-${kind}`}><Icon name={icon} size={18} /><span>{t(key)}</span></div>
        ))}
      </div>
      {projects.length > 0 && (
        <div className="panel recent-panel">
          <h2 className="sub-title"><Icon name="history" size={15} />{t('recent')}</h2>
          {projects.map((p) => {
            const gate = branchGate(p);
            return (
              <button key={p.id} type="button" className="recent-item" onClick={() => onRecent(p)} title={p.path}>
                <Icon name="folder" size={18} />
                <span className="recent-text"><strong>{p.name}</strong><span className="muted ellipsis">{p.path}</span></span>
                {gate && <span className={`status-pill tone-${gate === 'OK' ? 'ok' : 'bad'}`}><Icon name={gate === 'OK' ? 'checkCircle' : 'xCircle'} size={12} />{gate === 'OK' ? t('passed') : t('failed')}</span>}
                <Icon name="chevronRight" size={15} />
              </button>
            );
          })}
        </div>
      )}
      <div className="hero-launch">
        <Toggle icon="home" label={t('show_start_on_launch')} checked={showOnLaunch} onChange={onShowOnLaunch} />
      </div>
    </div>
  );
}

const RATING_WORD = { A: 'rt_A', B: 'rt_B', C: 'rt_C', D: 'rt_D', E: 'rt_E' };

export function Overview({ analysis, onGo }) {
  useLanguage();
  const lang = getLanguage();
  if (!analysis) {
    return (
      <div className="view">
        <ViewHeader icon="chart" title={t('nav_overview')} hint={t('vh_overview')} />
        <NoProject text={t('es_no_analysis')} />
      </div>
    );
  }
  const g = analysis.qualityGate;
  const r = analysis.ratings;
  const rn = analysis.ratingsNew || {};
  const m = analysis.measures;
  const ok = g.status === 'OK';
  const failedConds = g.conditions.filter((c) => c.status === 'ERROR');
  const go = (id) => onGo && onGo(id);
  return (
    <div className="view">
      <ViewHeader icon="chart" title={t('nav_overview')} hint={t('vh_overview')} />
      <div className={`banner gate-banner ${g.status}`} data-tour="quality-gate">
        <span className="gate-icon"><Icon name={ok ? 'checkCircle' : 'xCircle'} size={34} /></span>
        <div className="gate-text">
          <div className="k muted">{t('gate')}</div>
          <strong className="gate-status">{ok ? t('passed') : t('failed')}</strong>
          <div className="small">{ok ? t('ov_gate_ok_hint') : t('ov_gate_bad_hint', { n: failedConds.length })}</div>
        </div>
        <div className="banner-side small">
          <div><Icon name="sparkle" size={12} /> {analysis.hasBaseline ? t('baseline_prev') : t('baseline_all')}</div>
          {!ok && <Btn icon="gate" label={t('ov_see_conditions')} onClick={() => { const el = document.getElementById('ov-conditions'); if (el) el.scrollIntoView({ behavior: 'smooth' }); }} />}
        </div>
      </div>
      <div className="rating-grid" data-tour="ratings">
        <RatingCard icon="bug" term="reliability_rating" label={t('reliability')} letter={r.reliability} newLetter={rn.reliability} hint={`${t('bugs')} ${m.bugs}`} onClick={() => go('issues:BUG')} />
        <RatingCard icon="unlock" term="security_rating" label={t('security')} letter={r.security} newLetter={rn.security} hint={`${t('vulns')} ${m.vulnerabilities}`} onClick={() => go('issues:VULNERABILITY')} />
        <RatingCard icon="smell" term="maintainability_rating" label={t('maintainability')} letter={r.maintainability} newLetter={rn.maintainability} hint={`${t('ov_debt_ratio')} ${r.debtRatio}%`} onClick={() => go('issues:CODE_SMELL')} />
        <RatingCard icon="shield" term="security_review_rating" label={t('sec_review')} letter={r.securityReview} newLetter={rn.securityReview} hint={`${t('ov_reviewed')} ${r.hotspotsReviewed}%`} onClick={() => go('view:hotspots')} />
      </div>
      <h3 className="sub-title"><Icon name="layers" size={15} />{t('ov_new_vs_overall')}</h3>
      <div className="card-grid ov-grid" data-tour="new-code">
        <Stat icon="bug" kind="BUG" term="bugs" label={t('bugs')} value={m.bugs} sub={<NewSub n={m.new_bugs} />} onClick={() => go('issues:BUG')} title={t('ov_open_list')} />
        <Stat icon="unlock" kind="VULNERABILITY" term="vulnerabilities" label={t('vulns')} value={m.vulnerabilities} sub={<NewSub n={m.new_vulnerabilities} />} onClick={() => go('issues:VULNERABILITY')} title={t('ov_open_list')} />
        <Stat icon="smell" kind="CODE_SMELL" term="code_smells" label={t('smells')} value={m.code_smells} sub={<NewSub n={m.new_code_smells} />} onClick={() => go('issues:CODE_SMELL')} title={t('ov_open_list')} />
        <Stat icon="shield" kind="SECURITY_HOTSPOT" term="security_hotspots" label={t('hotspots')} value={m.security_hotspots} sub={<NewSub n={m.new_security_hotspots} />} onClick={() => go('view:hotspots')} title={t('ov_open_list')} />
        <Stat icon="clock" term="sqale_index" label={t('debt')} value={fmtDebt(m.sqale_index)} sub={`${m.sqale_index} ${t('minutes')}`} />
        <Stat icon="checkCircle" term="coverage" label={t('coverage')} value={m.coverage == null ? '—' : `${m.coverage}%`} sub={m.coverage == null ? t('no_coverage') : (m.new_coverage != null ? `${t('new_code')} ${m.new_coverage}%` : '')} />
        <Stat icon="copy" term="duplicated_lines_density" label={t('dup_density')} value={`${m.duplicated_lines_density}%`} sub={`${m.duplicated_lines} ${t('lines')}`} onClick={() => go('view:duplications')} title={t('nav_dup')} />
        <Stat icon="code" term="ncloc" label={t('ncloc')} value={m.ncloc} sub={`${m.files} ${t('files')}`} onClick={() => go('view:code')} title={t('nav_code')} />
      </div>
      <div className="panel" id="ov-conditions">
        <h2 className="sub-title"><Icon name="gate" size={15} />{t('conditions')}</h2>
        <table>
          <tbody>
            {g.conditions.map((c) => (
              <tr key={c.id} className={c.status === 'ERROR' ? 'row-bad' : ''}>
                <td className="icon-col"><Icon name={c.status === 'ERROR' ? 'xCircle' : c.status === 'OK' ? 'checkCircle' : 'minus'} size={14} className={c.status === 'ERROR' ? 'bad' : c.status === 'OK' ? 'ok' : 'muted'} /></td>
                <td><span data-term={c.metric}>{metricLabel(c.metric, lang)}</span></td>
                <td className="muted">{c.op} {c.threshold}</td>
                <td>{c.actual == null ? '—' : c.actual}</td>
                <td className={c.status === 'ERROR' ? 'bad' : c.status === 'OK' ? 'ok' : 'muted'}>{c.status === 'NO_DATA' ? t('no_data') : c.status === 'OFF' ? t('gate_off') : c.status === 'OK' ? t('passed') : c.status === 'ERROR' ? t('failed') : c.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="panel" style={{ marginTop: 12 }}>
        <h2 className="sub-title"><Icon name="globe" size={15} />{t('languages')}</h2>
        <div className="hrow">
          {Object.entries(analysis.languages).map(([k, n]) => <span key={k} className="pill"><Icon name="file" size={11} /> {k} {n}</span>)}
        </div>
      </div>
    </div>
  );
}

function NewSub({ n }) {
  return <span className={`new-sub ${n ? 'has' : ''}`}><Icon name="sparkle" size={11} />{t('new_code')} {n == null ? '—' : n}</span>;
}

function fmtDebt(min) {
  const n = Number(min) || 0;
  if (n < 60) return `${n}${t('u_min')}`;
  if (n < 480 * 2) return `${Math.round(n / 6) / 10}${t('u_hour')}`;
  return `${Math.round(n / 48) / 10}${t('u_day')}`;
}

function RatingCard({ icon, label, letter, newLetter, hint, onClick, term }) {
  useLanguage();
  return (
    <button type="button" className={`card rating-card r-${letter}`} onClick={onClick} title={`${label}: ${letter} — ${t(RATING_WORD[letter] || 'rt_A')}`}>
      <div className="k"><Icon name={icon} size={14} /><span data-term={term}>{label}</span></div>
      <div className="rating-row">
        <span className={`rating-big ${letter}`}>{letter}</span>
        <span className="rating-desc">
          <span>{t(RATING_WORD[letter] || 'rt_A')}</span>
          <span className="small">{hint}</span>
        </span>
      </div>
      {newLetter && <div className="small rating-new"><Icon name="sparkle" size={11} />{t('new_code')} <span className={`rating-chip ${newLetter}`}>{newLetter}</span></div>}
    </button>
  );
}

// Exception request (예외 신청) and its approval, 보안 약점 점검 style.
function ReviewBox({ issue, approval, onReview }) {
  useLanguage();
  const [reason, setReason] = useState('');
  const [resolution, setResolution] = useState('FALSE-POSITIVE');
  const r = issue.review;
  const pending = r && r.state === 'REQUESTED';
  const act = async (action) => {
    if ((action === 'request' || action === 'reject') && !reason.trim()) return;
    const ok = await onReview([issue.key], action, { reason, resolution });
    if (ok !== false) setReason('');
  };
  return (
    <div className="review-box" data-tour="issue-review">
      <h3 className="sub-title"><Icon name="userCheck" size={15} />{t('rv_title')}</h3>
      {r && (
        <p className="small">
          <span className={`pill rv-${r.state.toLowerCase()}`}><Icon name={r.state === 'REQUESTED' ? 'hourglass' : r.state === 'APPROVED' ? 'checkCircle' : r.state === 'REJECTED' ? 'xCircle' : 'circleDot'} size={11} /> {t(`rv_state_${r.state.toLowerCase()}`)}</span>{' '}
          {r.resolution === 'WONTFIX' ? t('accept') : t('false_positive')} · {r.requestedBy}: {r.reason}
          {r.decidedBy && <><br />{r.decidedBy}{r.comment ? `: ${r.comment}` : ''}</>}
        </p>
      )}
      {!pending && (
        <IconSelect value={resolution} onChange={setResolution} width={200} ariaLabel={t('rv_kind')}
          options={[{ value: 'FALSE-POSITIVE', label: t('false_positive'), icon: 'close' }, { value: 'WONTFIX', label: t('accept'), icon: 'check' }]} />
      )}
      <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder={pending ? t('rv_decision_note') : t('rv_reason')} />
      <div className="actions">
        {!pending && <Btn icon="upload" label={t('rv_request')} disabled={!reason.trim()} onClick={() => act('request')} title={reason.trim() ? t('rv_request') : t('rv_need_reason')} />}
        {pending && <Btn icon="thumbsUp" label={t('rv_approve')} primary onClick={() => act('approve')} />}
        {pending && <Btn icon="xCircle" label={t('rv_reject')} disabled={!reason.trim()} onClick={() => act('reject')} title={reason.trim() ? t('rv_reject') : t('rv_need_reason')} />}
        {pending && <Btn icon="close" label={t('rv_cancel')} onClick={() => act('cancel')} />}
      </div>
      {approval && approval.required && <p className="small">{t('rv_required_hint')}</p>}
    </div>
  );
}

function TagEditor({ issue, onUpdate }) {
  useLanguage();
  const [draft, setDraft] = useState('');
  const tags = issue.tags || [];
  const save = (next) => onUpdate([issue.key], { tags: next });
  return (
    <div className="chips">
      {tags.map((tag) => (
        <span key={tag} className="pill removable">{tag}<CloseButton aria-label={t('remove')} onClick={() => save(tags.filter((x) => x !== tag))} size={10} /></span>
      ))}
      <input className="tag-input" value={draft} placeholder={t('ib_add_tag')} onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && draft.trim()) { save([...new Set([...tags, draft.trim().toLowerCase()])]); setDraft(''); } }} />
    </div>
  );
}

function ExtRefChip({ value }) {
  useLanguage();
  const isUrl = /^https?:\/\//i.test(String(value));
  if (!isUrl) return <span className="chip link-chip" title={t('tk_external_ref')}><Icon name="link" size={11} />{value}</span>;
  return (
    <button type="button" className="chip link-chip" title={`${t('tk_open')}: ${value}`} onClick={() => openExternal(value)}>
      <Icon name="external" size={11} />{String(value).replace(/^https?:\/\//i, '').slice(0, 48)}
    </button>
  );
}

const TRACKER_KINDS = [
  { value: 'jira', label: 'Jira', icon: 'bug' },
  { value: 'redmine', label: 'Redmine', icon: 'bug' },
  { value: 'github', label: 'GitHub', icon: 'branch' },
  { value: 'gitlab', label: 'GitLab', icon: 'branch' },
];
let trackerCache = null;

// Create tracker tickets for issues (only trackers set up in Administration › Integrations).
function TicketBox({ keys, onTicket }) {
  useLanguage();
  const [kinds, setKinds] = useState(trackerCache);
  const [kind, setKind] = useState('');
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (trackerCache) return;
    call('integrations.get').then((c) => {
      const set = Object.keys((c && c.trackers) || {});
      trackerCache = TRACKER_KINDS.filter((k) => set.includes(k.value));
      setKinds(trackerCache);
    }).catch(() => { trackerCache = TRACKER_KINDS; setKinds(TRACKER_KINDS); });
  }, []);
  useEffect(() => { setMade(null); setError(''); }, [keys.join(',')]);
  if (!kinds) return null;
  const chosen = kind || (kinds[0] && kinds[0].value) || '';
  const create = async () => {
    setBusy(true);
    setError('');
    try { setMade(await onTicket(keys, chosen)); } catch (err) { setError(errorText(err)); } finally { setBusy(false); }
  };
  return (
    <div className="ticket-box" data-tour="issue-ticket">
      <h3 className="sub-title"><Icon name="external" size={15} />{t('tk_title')}{keys.length > 1 ? ` (${keys.length})` : ''}</h3>
      {!kinds.length && <p className="small">{t('tk_none')}</p>}
      {kinds.length > 0 && (
        <div className="input-row">
          <IconSelect value={chosen} options={kinds} width={150} ariaLabel={t('tk_tracker')} onChange={setKind} />
          <Btn icon={busy ? 'hourglass' : 'plus'} label={busy ? t('tk_creating') : t('tk_create')} primary disabled={busy || !keys.length} onClick={create} />
        </div>
      )}
      {error && <p className="small bad">{error}</p>}
      {made && made.map((m) => (
        <div key={m.issue + (m.key || m.id)} className="small tk-made">
          <Icon name="checkCircle" size={12} className="ok" /> {t('tk_created')}{' '}
          {m.url ? <button type="button" className="link-btn" onClick={() => openExternal(m.url)}>{m.key || m.id || m.url} <Icon name="external" size={11} /></button> : (m.key || m.id)}
        </div>
      ))}
    </div>
  );
}

export function IssueBrowser({ issues, rules, filter, setFilter, selected, onSelect, checked, setChecked, onUpdate, onReview, approval, hasAnalysis, onTicket, project, branch }) {
  useLanguage();
  const [comment, setComment] = useState('');
  const [assignee, setAssignee] = useState('');
  const ruleMap = useMemo(() => new Map(rules.map((r) => [r.key, r])), [rules]);
  const list = useMemo(() => filterIssues(issues, filter, false, ruleMap), [issues, filter, ruleMap]);
  const { rows: shown, footer } = useRowWindow(list);
  const checkedSet = useMemo(() => new Set(checked), [checked]);
  const engines = useMemo(() => [...new Set(issues.map(engineOf))].sort(), [issues]);
  const rule = selected && ruleMap.get(selected.rule);
  const toggle = (key) => setChecked(checkedSet.has(key) ? checked.filter((k) => k !== key) : [...checked, key]);
  const chips = selected ? standardChips(standardsOf(selected, rule)) : [];
  const misraCategory = selected && (selected.misraCategory || (rule && rule.misraCategory));
  const noFix = approval && approval.required;
  if (!issues.length && !hasAnalysis) {
    return (
      <div className="view">
        <ViewHeader icon="bug" title={t('nav_issues')} hint={t('vh_issues')} />
        <NoProject text={t('es_no_analysis')} />
      </div>
    );
  }
  const visible = issues.filter((i) => i.type !== 'SECURITY_HOTSPOT');
  const typeCount = (type) => visible.filter((i) => i.type === type).length;
  return (
    <div className="view view-list">
      <ViewHeader icon="bug" title={t('nav_issues')} hint={t('vh_issues')} />
      <div className="type-tabs">
        {[['', 'list', t('all'), visible.length], ...TYPES.map((ty) => [ty, TYPE_ICON[ty], { BUG: t('bugs'), VULNERABILITY: t('vulns'), CODE_SMELL: t('smells') }[ty], typeCount(ty)])].map(([ty, icon, label, n]) => (
          <button key={ty || 'all'} type="button" className={`type-tab ${ty ? `kind-${ty}` : ''} ${filter.type === ty ? 'on' : ''}`} onClick={() => setFilter({ ...filter, type: ty })} aria-pressed={filter.type === ty}>
            <Icon name={icon} size={15} /><span>{label}</span><span className="vtab-count">{n}</span>
          </button>
        ))}
      </div>
      <Filters filter={filter} setFilter={setFilter} types={TYPES} engines={engines} />
      {filter.drillLabel && (
        <div className="drill-bar">
          <Icon name="filter" size={14} /><span>{t('ib_drill')}: <strong>{filter.drillLabel}</strong> ({list.length})</span>
          <Btn icon="close" label={t('ib_clear_drill')} onClick={() => setFilter({ ...filter, rules: null, keys: null, drillLabel: '' })} />
        </div>
      )}
      {filter.lang && (
        <div className="drill-bar" data-filter="lang">
          <Icon name="code" size={14} /><span>{t('ib_lang_filter')}: <strong>{LANG_NAME[filter.lang] || filter.lang}</strong> ({list.length})</span>
          <Btn icon="close" label={t('ib_clear_drill')} onClick={() => setFilter({ ...filter, lang: '' })} />
        </div>
      )}
      <div className="list-full list-grow">
        <div className="panel tpanel">
          <div className="table-wrap tall">
          <table>
            <thead><tr><th /><th><span data-term="severity">{t('severity')}</span></th><th>{t('message')}</th><th>{t('location')}</th><th>{t('status')}</th></tr></thead>
            <tbody>
              {shown.map((issue, idx) => (
                <tr key={`${issue.key}-${idx}`} data-tour="issue-row" className={`click ${selected && selected.key === issue.key ? 'sel' : ''}`} onClick={() => onSelect(issue)}>
                  <td onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label={t('ib_select')} checked={checkedSet.has(issue.key)} onChange={() => toggle(issue.key)} /></td>
                  <td className="nowrap"><SevBadge sev={issue.severity} />{issue.isNew && <div><span className="pill new-pill"><Icon name="sparkle" size={10} /> {t('new_code')}</span></div>}</td>
                  <td className="wrap"><div className="msg-line"><TypeBadge type={issue.type} short />{msg(issue)}</div><div className="small">{issue.rule}{engineOf(issue) !== 'core' ? ` · ${engineOf(issue)}` : ''}{issue.review && issue.review.state === 'REQUESTED' ? <> · <span className="warn-text"><Icon name="hourglass" size={11} /> {t('rv_state_requested')}</span></> : null}</div></td>
                  <td className="small wrap loc">{issue.file}:{issue.line}</td>
                  <td><StatusPill status={issue.status} resolution={issue.resolution} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {footer}
          {list.length === 0 && (visible.length
            ? <Empty icon="filter" text={t('es_no_match')} hint={t('es_no_match_hint')}><Btn icon="close" label={t('es_clear_filters')} onClick={() => setFilter({ ...filter, q: '', severity: '', type: '', status: '', newOnly: false, engine: '', standard: '', rules: null, keys: null, drillLabel: '' })} /></Empty>
            : <Empty icon="checkCircle" text={t('es_no_issues')} hint={t('es_no_issues_hint')} />)}
          </div>
        </div>
        <Inspector revealKey={selected ? selected.key : (checked.length ? `bulk${checked.length}` : null)}>
          {!selected && <Empty icon="eye" text={t('es_pick_issue')} hint={t('es_pick_issue_hint')} />}
          {selected && (
            <>
              <div className="chips"><TypeBadge type={selected.type} /><SevBadge sev={selected.severity} /><StatusPill status={selected.status} resolution={selected.resolution} /></div>
              <h3>{msg(selected)}</h3>
              <div className="small wrap"><Icon name="file" size={12} /> {selected.file}:{selected.line}</div>
              <div className="chips">
                <span className="chip engine"><Icon name={ENGINE_ICON[engineOf(selected)] || 'search'} size={11} />{t('ib_engine')} {engineOf(selected)}</span>
                {misraCategory && <span className="chip misra">{t('ib_misra_category')} {misraCategory}</span>}
                {chips.map((c) => <span key={c.text} className={`chip ${c.kind}`}>{c.text}</span>)}
                {selected.externalReference && <ExtRefChip value={selected.externalReference} />}
              </div>
              {(selected.events || []).length > 1 && <EventPath events={selected.events} file={selected.file} />}
              {(selected.snippet || []).length > 0 && <div className="snippet">{(selected.snippet || []).map((row) => (
                <div key={row.line} className={row.hit ? 'hit' : ''}><span className="ln">{row.line}</span><span>{row.text}</span></div>
              ))}</div>}
              {rule && <><h3 className="sub-title"><Icon name="lightbulb" size={15} />{t('why')}</h3><p className="small">{textOf(rule.why)}</p><h3 className="sub-title"><Icon name="wrench" size={15} />{t('how_to_fix')}</h3><p className="small">{textOf(rule.fix)}</p></>}
              <div className="actions" data-tour="issue-actions">
                <Btn icon="userCheck" label={t('confirmed')} onClick={() => onUpdate([selected.key], { status: 'CONFIRMED' })} title={t('tip_confirm')} />
                {!noFix && <Btn icon="thumbsUp" label={t('accept')} onClick={() => onUpdate([selected.key], { status: 'ACCEPTED' })} title={t('tip_accept')} />}
                {!noFix && <Btn icon="xCircle" label={t('false_positive')} onClick={() => onUpdate([selected.key], { status: 'RESOLVED', resolution: 'FALSE-POSITIVE' })} title={t('tip_false_positive')} />}
                <Btn icon="refresh" label={t('reopen')} onClick={() => onUpdate([selected.key], { status: 'REOPENED', resolution: null })} />
              </div>
              {onTicket && <TicketBox keys={[selected.key]} onTicket={onTicket} />}
              {selected.type !== 'SECURITY_HOTSPOT' && <AiFixBox project={project} branch={branch} issue={selected} />}
              <h3 className="sub-title"><Icon name="hash" size={15} />{t('ib_tags')}</h3>
              <TagEditor issue={selected} onUpdate={onUpdate} />
              {onReview && <ReviewBox issue={selected} approval={approval} onReview={onReview} />}
              {(selected.changelog || []).length > 0 && (
                <details className="changelog">
                  <summary>{t('ib_changelog')} ({selected.changelog.length})</summary>
                  {[...selected.changelog].reverse().map((c, i) => (
                    <div key={i} className="small">{new Date(c.at).toLocaleString()} · {c.by || '—'} · {Object.entries(c.patch || {}).filter(([k]) => k !== 'review' && k !== 'comment').map(([k, v]) => changeText(k, v)).join(' · ') || (c.patch && c.patch.review ? t(`rv_state_${String(c.patch.review.state).toLowerCase()}`) : t('comment'))}</div>
                  ))}
                </details>
              )}
              {(selected.comments || []).map((c, i) => <p key={i} className="small"><strong>{c.author}</strong> {c.text}</p>)}
              <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t('comment')} />
              <Btn icon="plus" label={t('add_comment')} disabled={!comment.trim()} onClick={() => { if (!comment.trim()) return; onUpdate([selected.key], { comment }); setComment(''); }} />
            </>
          )}
          {checked.length > 0 && (
            <div className="bulk-box">
              <h3 className="sub-title"><Icon name="check" size={15} />{t('bulk')} ({checked.length})</h3>
              <div className="input-row">
                <input value={assignee} placeholder={t('assignee')} aria-label={t('assignee')} onChange={(e) => setAssignee(e.target.value)} />
                <Btn icon="user" label={t('assignee')} onClick={() => onUpdate(checked, { assignee })} />
              </div>
              <div className="actions">
                <Btn icon="userCheck" label={t('confirmed')} onClick={() => onUpdate(checked, { status: 'CONFIRMED' })} />
                {!noFix && <Btn icon="thumbsUp" label={t('accept')} onClick={async () => { if (await ask({ title: t('accept'), body: t('cf_bulk_accept', { n: checked.length }), okLabel: t('accept') })) onUpdate(checked, { status: 'ACCEPTED' }); }} />}
                {!noFix && <Btn icon="xCircle" label={t('false_positive')} onClick={async () => { if (await ask({ title: t('false_positive'), body: t('cf_bulk_fp', { n: checked.length }), okLabel: t('false_positive'), danger: true })) onUpdate(checked, { status: 'RESOLVED', resolution: 'FALSE-POSITIVE' }); }} />}
                <Btn icon="refresh" label={t('reopen')} onClick={() => onUpdate(checked, { status: 'REOPENED', resolution: null })} />
                <Btn icon="close" label={t('ib_clear_selection')} onClick={() => setChecked([])} />
              </div>
              {onTicket && <TicketBox keys={checked} onTicket={onTicket} />}
            </div>
          )}
        </Inspector>
      </div>
    </div>
  );
}

export function Hotspots({ issues, rules, onUpdate, hasAnalysis }) {
  useLanguage();
  const [cur, setCur] = useState(null);
  const [only, setOnly] = useState('');
  const all = useMemo(() => issues.filter((i) => i.type === 'SECURITY_HOTSPOT'), [issues]);
  const list = useMemo(() => (only ? all.filter((i) => (only === 'TO_REVIEW' ? i.status === 'TO_REVIEW' : i.status !== 'TO_REVIEW')) : all), [all, only]);
  const { rows: shown, footer } = useRowWindow(list);
  const selected = list.find((i) => i.key === cur) || null;
  const rule = selected && rules.find((r) => r.key === selected.rule);
  const toReview = all.filter((i) => i.status === 'TO_REVIEW').length;
  if (!hasAnalysis) {
    return (
      <div className="view">
        <ViewHeader icon="shield" title={t('nav_hotspots')} hint={t('vh_hotspots')} />
        <NoProject text={t('es_no_analysis')} />
      </div>
    );
  }
  return (
    <div className="view view-list">
      <ViewHeader icon="shield" title={t('nav_hotspots')} hint={t('vh_hotspots')} />
      <div className="type-tabs">
        {[['', 'list', t('all'), all.length], ['TO_REVIEW', 'eye', t('to_review'), toReview], ['REVIEWED', 'shieldCheck', t('hs_reviewed'), all.length - toReview]].map(([id, icon, label, n]) => (
          <button key={id || 'all'} type="button" className={`type-tab ${only === id ? 'on' : ''}`} aria-pressed={only === id} onClick={() => setOnly(id)}>
            <Icon name={icon} size={15} /><span>{label}</span><span className="vtab-count">{n}</span>
          </button>
        ))}
      </div>
      <div className="list-full list-grow">
        <div className="panel tpanel">
          <div className="table-wrap tall">
            <table>
              <thead><tr><th>{t('severity')}</th><th>{t('message')}</th><th>{t('status')}</th></tr></thead>
              <tbody>
                {shown.map((issue) => (
                  <tr key={issue.key} className={`click ${selected && selected.key === issue.key ? 'sel' : ''}`} onClick={() => setCur(issue.key)}>
                    <td className="nowrap"><SevBadge sev={issue.severity} /></td>
                    <td className="wrap">{msg(issue)}<div className="small">{issue.file}:{issue.line}</div></td>
                    <td><StatusPill status={issue.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {footer}
            {list.length === 0 && <Empty icon="shieldCheck" text={t('es_no_hotspots')} hint={t('es_no_hotspots_hint')} />}
          </div>
        </div>
        <Inspector revealKey={cur}>
          {!selected && <Empty icon="eye" text={t('es_pick_hotspot')} hint={t('es_pick_hotspot_hint')} />}
          {selected && (
            <>
              <div className="chips"><TypeBadge type="SECURITY_HOTSPOT" /><SevBadge sev={selected.severity} /><StatusPill status={selected.status} /></div>
              <h3>{msg(selected)}</h3>
              <div className="small wrap"><Icon name="file" size={12} /> {selected.file}:{selected.line}</div>
              <div className="snippet">{(selected.snippet || []).map((row) => (
                <div key={row.line} className={row.hit ? 'hit' : ''}><span className="ln">{row.line}</span><span>{row.text}</span></div>
              ))}</div>
              {rule && <><h3 className="sub-title"><Icon name="lightbulb" size={15} />{t('why')}</h3><p className="small">{textOf(rule.why)} {textOf(rule.fix)}</p></>}
              <h3 className="sub-title"><Icon name="userCheck" size={15} />{t('hs_review_as')}</h3>
              <div className="actions">
                <Btn icon="userCheck" label={t('acknowledged')} active={selected.status === 'ACKNOWLEDGED'} onClick={() => onUpdate([selected.key], { status: 'ACKNOWLEDGED' })} title={t('tip_acknowledged')} />
                <Btn icon="wrench" label={t('fixed')} active={selected.status === 'FIXED'} onClick={() => onUpdate([selected.key], { status: 'FIXED', resolution: 'FIXED' })} title={t('tip_fixed')} />
                <Btn icon="shieldCheck" label={t('safe')} active={selected.status === 'SAFE'} onClick={() => onUpdate([selected.key], { status: 'SAFE', resolution: 'SAFE' })} title={t('tip_safe')} />
                <Btn icon="eye" label={t('to_review')} active={selected.status === 'TO_REVIEW'} onClick={() => onUpdate([selected.key], { status: 'TO_REVIEW', resolution: null })} />
              </div>
            </>
          )}
        </Inspector>
      </div>
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

export { TYPE_ICON, SEV_ICON };

function Filters({ filter, setFilter, types, engines }) {
  useLanguage();
  const set = (patch) => setFilter({ ...filter, ...patch });
  const typeLabel = (s) => ({ BUG: t('bugs'), VULNERABILITY: t('vulns'), CODE_SMELL: t('smells'), SECURITY_HOTSPOT: t('hotspots') }[s] || s);
  return (
    <div className="view-toolbar" data-tour="issue-filters">
      <span className="search-box"><Icon name="search" size={14} /><input className="search" placeholder={t('ib_search_ph')} aria-label={t('search')} value={filter.q} onChange={(e) => set({ q: e.target.value })} /></span>
      <IconSelect value={filter.severity} onChange={(v) => set({ severity: v })} title={t('severity')} width={150}
        options={[{ value: '', label: t('ib_any_severity'), icon: 'list' }, ...SEV.map((s) => ({ value: s, label: sevLabel(s), icon: SEV_ICON[s] }))]} />
      <IconSelect value={filter.type} onChange={(v) => set({ type: v })} title={t('type')} width={150}
        options={[{ value: '', label: t('ib_any_type'), icon: 'list' }, ...types.map((s) => ({ value: s, label: typeLabel(s), icon: TYPE_ICON[s] }))]} />
      <IconSelect value={filter.status} onChange={(v) => set({ status: v })} title={t('status')} width={150}
        options={[{ value: '', label: t('ib_any_status'), icon: 'list' }, ...['OPEN', 'CONFIRMED', 'REOPENED', 'RESOLVED', 'CLOSED', 'TO_REVIEW'].map((s) => ({ value: s, label: statusLabel(s), icon: STATUS_ICON[s] || 'clock' }))]} />
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

// Start-page language tiles filter the issues by file extension.
const LANG_EXT = { java: ['.java', '.kt', '.kts'], js: ['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx'], py: ['.py'], cs: ['.cs'] };
const LANG_NAME = { java: 'Java · Kotlin', js: 'JavaScript / TypeScript', py: 'Python', cs: 'C#' };

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
    if (filter.lang && !(LANG_EXT[filter.lang] || []).some((x) => String(issue.file || '').toLowerCase().endsWith(x))) return false;
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
  if (!analysis) return <div className="view"><ViewHeader icon="gauge" title={t('nav_measures')} hint={t('measures_hint')} /><NoProject text={t('es_no_analysis')} /></div>;
  const rows = Object.entries(analysis.measures);
  const iconOf = (k) => {
    const b = String(k).replace(/^new_/, '');
    if (b.startsWith('bug') || b.startsWith('reliab')) return 'bug';
    if (b.startsWith('vuln') || b === 'security_rating') return 'unlock';
    if (b.startsWith('code_smell') || b.startsWith('sqale') || b.startsWith('maint')) return 'smell';
    if (b.includes('hotspot') || b.includes('review')) return 'shield';
    if (b.includes('dup')) return 'copy';
    if (b.includes('cover')) return 'checkCircle';
    if (b.includes('complex')) return 'flow';
    if (b.includes('comment')) return 'edit';
    if (b === 'files' || b === 'ncloc' || b.includes('line')) return 'code';
    return 'gauge';
  };
  return (
    <div className="view view-list">
      <ViewHeader icon="gauge" title={t('nav_measures')} hint={t('measures_hint')} />
      <div className="panel tpanel list-grow">
        <div className="table-wrap tall">
          <table>
            <thead><tr><th>{t('ms_metric')}</th><th>{t('ms_key')}</th><th className="num">{t('ms_value')}</th></tr></thead>
            <tbody>
              {rows.map(([k, v]) => (
                <tr key={k}>
                  <td><span className="metric-name"><Icon name={iconOf(k)} size={14} /><span data-term={k}>{metricLabel(k, lang)}</span>{String(k).startsWith('new_') && <span className="pill new-pill"><Icon name="sparkle" size={10} /> {t('new_code')}</span>}</span></td>
                  <td className="small mono">{k}</td>
                  <td className="num">{v == null ? '—' : String(v)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function CodeView({ analysis, file, text, onOpen, line, error }) {
  useLanguage();
  const [q, setQ] = useState('');
  // Jump to a line (HIS / architecture links open code at file:line).
  useEffect(() => {
    if (!line) return;
    const el = document.querySelector(`.codepane .row[data-ln="${line}"]`);
    if (el) el.scrollIntoView({ block: 'center' });
  }, [line, text]);
  if (!analysis) return <div className="view"><ViewHeader icon="code" title={t('nav_code')} hint={t('vh_code')} /><NoProject text={t('es_no_analysis')} /></div>;
  const fileIssues = (analysis.issues || []).filter((i) => i.file === file).sort((a, b) => a.line - b.line);
  const marks = new Set(fileIssues.map((i) => i.line));
  const fileRow = (analysis.files || []).find((f) => f.path === file);
  const lines = text == null ? [] : String(text).split(/\r?\n/);
  const files = q ? analysis.files.filter((f) => f.path.toLowerCase().includes(q.toLowerCase())) : analysis.files;
  return (
    <div className="view view-fill">
      <ViewHeader icon="code" title={t('nav_code')} hint={t('vh_code')} />
      <div className="code-wrap">
        <div className="filetree">
          <div className="filetree-search"><Icon name="search" size={13} /><input placeholder={t('cv_filter')} aria-label={t('cv_filter')} value={q} onChange={(e) => setQ(e.target.value)} /></div>
          {files.map((f) => (
            <button key={f.path} className={f.path === file ? 'on' : ''} onClick={() => onOpen(f.path)} title={f.path}>
              <Icon name="file" size={13} /><span className="ft-name">{f.path}</span>{f.issues ? <span className="nav-count warn">{f.issues}</span> : null}
            </button>
          ))}
        </div>
        <div className="codepane selectable">
          {!file && <Empty icon="file" text={t('cv_pick')} hint={t('cv_pick_hint')} />}
          {file && error && (
            <Empty icon="alert" text={t('cv_load_failed', { file })} hint={error}>
              <Btn icon="refresh" label={t('cv_retry')} onClick={() => onOpen(file, line)} />
            </Empty>
          )}
          {lines.map((src, i) => (
            <div key={i} data-ln={i + 1} className={`row ${marks.has(i + 1) ? 'mark' : ''} ${line === i + 1 ? 'goto' : ''}`} title={marks.has(i + 1) ? t('cv_issue_here') : undefined}><span className="ln">{marks.has(i + 1) ? '● ' : ''}{i + 1}</span><span>{src || ' '}</span></div>
          ))}
        </div>
      </div>
      {file && (
        <Inspector revealKey={null}>
          <div className="chips"><span className="chip"><Icon name="file" size={11} />{t('cv_file')}</span>{fileRow && fileRow.lang && <span className="chip">{fileRow.lang}</span>}</div>
          <h3 className="mono wrap">{file}</h3>
          <div className="card-grid compact">
            <Stat icon="code" term="ncloc" label={t('ncloc')} value={fileRow ? (fileRow.ncloc ?? fileRow.lines ?? '—') : '—'} />
            <Stat icon="bug" label={t('nav_issues')} value={fileIssues.length} tone={fileIssues.length ? 'bad' : 'ok'} />
          </div>
          <h3 className="sub-title"><Icon name="list" size={15} />{t('cv_file_issues')}</h3>
          {fileIssues.length === 0 && <Empty icon="checkCircle" text={t('es_no_issues')} />}
          {fileIssues.map((i) => (
            <button key={i.key} type="button" className="insp-row" onClick={() => onOpen(file, i.line)} title={t('bp_jump')}>
              <SevBadge sev={i.severity} /><span className="insp-row-text">{msg(i)}</span><span className="small mono">:{i.line}</span>
            </button>
          ))}
        </Inspector>
      )}
    </div>
  );
}

export function Duplications({ analysis, onOpen }) {
  useLanguage();
  const blocks = (analysis && analysis.duplications) || [];
  return (
    <div className="view">
      <ViewHeader icon="copy" title={t('nav_dup')} hint={t('dup_hint')} />
      {!analysis && <NoProject text={t('es_no_analysis')} />}
      {analysis && blocks.length === 0 && <Empty icon="checkCircle" text={t('es_no_dup')} hint={t('es_no_dup_hint')} />}
      {blocks.map((b) => (
        <div key={b.hash + b.instances[0].path + b.instances[0].start} className="panel dup-block">
          <div className="sub-title"><Icon name="copy" size={15} /><strong>{b.lines} {t('lines')}</strong><span className="small">· {t('dup_places', { n: b.instances.length })}</span></div>
          {b.instances.map((inst) => (
            <button key={inst.path + inst.start} type="button" className="recent-item compact" onClick={() => onOpen(inst.path)} title={t('dup_open')}>
              <Icon name="file" size={14} /><span className="recent-text"><span className="mono">{inst.path}:{inst.start}–{inst.end}</span></span><Icon name="chevronRight" size={14} />
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
    <div className="view">
      <ViewHeader icon="clock" title={t('nav_activity')} hint={t('activity_hint')} />
      {rows.length === 0 && <Empty icon="clock" text={t('es_no_activity')} hint={t('es_no_activity_hint')}><Btn icon="play" label={t('run_analysis')} primary onClick={() => emitAction('analyze')} /></Empty>}
      {rows.length > 0 && (
        <>
          <div className="panel">
            <h3 className="sub-title"><Icon name="chart" size={15} />{t('act_chart')}</h3>
            <div className="bars">
              {rows.map((h) => {
                const n = h.measures ? h.measures.bugs + h.measures.vulnerabilities + h.measures.code_smells : 0;
                return <div key={h.at} className={`bar ${h.gate === 'OK' ? '' : 'bar-bad'}`} style={{ height: `${Math.max(6, (n / max) * 110)}px` }} title={`${h.at} · ${t('nav_issues')} ${n} · ${t('gate')} ${h.gate === 'OK' ? t('passed') : t('failed')}`} />;
              })}
            </div>
          </div>
          <div className="panel tpanel" style={{ marginTop: 12 }}>
            <div className="table-wrap">
              <table>
                <thead><tr><th>{t('when')}</th><th>{t('gate')}</th><th className="num"><Icon name="bug" size={12} /> {t('bugs')}</th><th className="num"><Icon name="unlock" size={12} /> {t('vulns')}</th><th className="num"><Icon name="smell" size={12} /> {t('smells')}</th><th className="num">{t('duration')}</th></tr></thead>
                <tbody>
                  {[...rows].reverse().map((h) => (
                    <tr key={h.at}>
                      <td className="small nowrap">{h.at}</td>
                      <td><span className={`status-pill tone-${h.gate === 'OK' ? 'ok' : 'bad'}`}><Icon name={h.gate === 'OK' ? 'checkCircle' : 'xCircle'} size={12} />{h.gate === 'OK' ? t('passed') : t('failed')}</span></td>
                      <td className="num">{h.measures && h.measures.bugs}</td>
                      <td className="num">{h.measures && h.measures.vulnerabilities}</td>
                      <td className="num">{h.measures && h.measures.code_smells}</td>
                      <td className="small num">{h.durationMs} ms</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function RuleInspector({ rule, onDeactivate }) {
  useLanguage();
  if (!rule) return null;
  const chips = standardChips(standardsOf(null, rule));
  return (
    <Inspector revealKey={rule.key}>
      <div className="chips"><TypeBadge type={rule.type} /><SevBadge sev={rule.severity} /><span className="chip engine"><Icon name={ENGINE_ICON[engineOf(rule)] || 'cpu'} size={11} />{engineOf(rule)}</span></div>
      <h3>{textOf(rule.name)}</h3>
      <div className="small mono">{rule.key}</div>
      <div className="chips">
        {(rule.langs || []).map((l) => <span key={l} className="chip"><Icon name="file" size={11} />{l === '*' ? t('all') : l}</span>)}
        {(rule.tags || []).map((tag) => <span key={tag} className="pill tag">{tag}</span>)}
        {rule.misraCategory && <span className="chip misra">{t('ib_misra_category')} {rule.misraCategory}</span>}
        {chips.map((c) => <span key={c.text} className={`chip ${c.kind}`}>{c.text}</span>)}
      </div>
      <h3 className="sub-title"><Icon name="lightbulb" size={15} />{t('why')}</h3>
      <p className="small">{textOf(rule.why) || '—'}</p>
      <h3 className="sub-title"><Icon name="wrench" size={15} />{t('how_to_fix')}</h3>
      <p className="small">{textOf(rule.fix) || '—'}</p>
      <div className="actions"><Btn icon="minus" label={t('inactive')} title={t('tip_deactivate')} onClick={() => onDeactivate(rule.key)} /></div>
    </Inspector>
  );
}

export function RulesView({ rules, onDeactivate }) {
  useLanguage();
  const [sel, setSel] = useState(null);
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
    <div className="view view-list">
      <ViewHeader icon="search" title={t('nav_rules')} hint={`${t('rules_hint')} (${list.length} / ${rules.length})`} />
      <div className="view-toolbar">
        <span className="search-box"><Icon name="search" size={14} /><input className="search" placeholder={t('rl_search_ph')} aria-label={t('search')} value={q} onChange={(e) => setQ(e.target.value)} /></span>
        <IconSelect value={lang} onChange={setLang} title={t('languages')} width={150}
          options={[{ value: '', label: t('ib_any_language'), icon: 'code' }, ...langs.map((l) => ({ value: l, label: l === '*' ? t('all') : l, icon: 'file' }))]} />
        <IconSelect value={engine} onChange={setEngine} title={t('ib_engine')} width={150}
          options={[{ value: '', label: t('ib_any_engine'), icon: 'cpu' }, ...engines.map((e) => ({ value: e, label: e, icon: ENGINE_ICON[e] || 'cpu' }))]} />
        <IconSelect value={standard} onChange={setStandard} title={t('ib_standard')} width={160}
          options={[{ value: '', label: t('ib_any_standard'), icon: 'shield' }, ...ISSUE_STANDARDS]} />
      </div>
      <div className="panel tpanel list-grow">
        <div className="table-wrap tall">
          <table>
            <thead><tr><th>{t('rule')}</th><th>{t('severity')}</th><th>{t('type')}</th><th className="act" /></tr></thead>
            <tbody>
              {list.slice(0, limit).map((r) => {
                const chips = standardChips(standardsOf(null, r));
                return (
                  <tr key={r.key} className={`click ${sel === r.key ? 'sel' : ''}`} onClick={() => setSel(r.key)}>
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
                    <td className="nowrap"><SevBadge sev={r.severity} /></td>
                    <td className="nowrap"><TypeBadge type={r.type} /></td>
                    <td className="act" onClick={(e) => e.stopPropagation()}><Btn icon="minus" label={t('inactive')} title={t('tip_deactivate')} onClick={() => onDeactivate(r.key)} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {list.length === 0 && <Empty icon="search" text={t('es_no_match')} hint={t('es_no_match_hint')} />}
          {list.length > limit && <div className="more-row"><Btn icon="plus" label={t('ib_show_more', { n: list.length - limit })} onClick={() => setLimit(limit + 300)} /></div>}
        </div>
      </div>
      <RuleInspector rule={rules.find((r) => r.key === sel) || null} onDeactivate={onDeactivate} />
    </div>
  );
}

// Quality profiles: per-language rule sets with inheritance, project
// assignment, compare, backup / restore and a changelog (code quality).
export function ProfilesView({ profiles, rules, project, onChange, onAssign, onReload }) {
  useLanguage();
  const [id, setId] = useState((profiles[0] && profiles[0].id) || '');
  const [q, setQ] = useState('');
  const [tab, setTab] = useState('rules');
  const [other, setOther] = useState('');
  const [diff, setDiff] = useState(null);
  const [error, setError] = useState('');
  const profile = profiles.find((p) => p.id === id) || profiles[0];
  if (!profile) return null;
  const byId = new Map(profiles.map((p) => [p.id, p]));
  // Effective set after inheritance (same order as core/profiles.js).
  const lineage = [];
  for (let p = profile, guard = 0; p && guard < 16 && !lineage.includes(p); p = byId.get(p.parentId), guard++) lineage.unshift(p);
  const inactive = new Set();
  const overridesEff = {};
  for (const p of lineage) {
    for (const k of p.inactive || []) inactive.add(k);
    for (const k of p.activated || []) inactive.delete(k);
    Object.assign(overridesEff, p.overrides || {});
  }
  const inheritedOff = new Set();
  for (const p of lineage.slice(0, -1)) for (const k of p.inactive || []) inheritedOff.add(k);
  const sameLang = profiles.filter((p) => p.language === profile.language);
  const list = rules.filter((r) => {
    const langs = r.langs || [];
    if (profile.language !== '*' && !langs.includes(profile.language) && !langs.includes('*')) return false;
    if (!q) return true;
    return `${r.key} ${textOf(r.name)}`.toLowerCase().includes(q.toLowerCase());
  });
  const update = (next) => onChange(profiles.map((p) => (p.id === profile.id ? next : p)));
  const setActive = (key, on) => {
    const off = new Set(profile.inactive || []);
    const act = new Set(profile.activated || []);
    if (on) { off.delete(key); if (inheritedOff.has(key)) act.add(key); }
    else { act.delete(key); off.add(key); }
    update({ ...profile, inactive: [...off], activated: [...act] });
  };
  const create = (asChild) => {
    const copy = {
      id: `${profile.language === '*' ? 'all' : profile.language}-${Date.now().toString(36)}`,
      name: `${profile.name} ${asChild ? t('qp_child') : t('qp_copy')}`,
      language: profile.language,
      isDefault: false,
      parentId: asChild ? profile.id : (profile.parentId || null),
      inactive: asChild ? [] : [...(profile.inactive || [])],
      activated: asChild ? [] : [...(profile.activated || [])],
      overrides: asChild ? {} : { ...(profile.overrides || {}) },
    };
    onChange([...profiles, copy]);
    setId(copy.id);
  };
  const remove = async () => {
    if (profile.isDefault || profiles.some((p) => p.parentId === profile.id)) { setError(t('qp_cannot_delete')); return; }
    if (!(await ask({ title: t('cf_delete_title'), body: t('cf_profile_delete', { name: profile.name }), okLabel: t('delete_ok'), danger: true }))) return;
    onChange(profiles.filter((p) => p.id !== profile.id));
    setId(sameLang.find((p) => p.id !== profile.id)?.id || '');
  };
  const setDefault = () => onChange(profiles.map((p) => (p.language === profile.language ? { ...p, isDefault: p.id === profile.id } : p)));
  const runCompare = async (b) => {
    setOther(b);
    setDiff(null);
    if (!b) return;
    try { setDiff(await call('profile.compare', { a: profile.id, b })); } catch (err) { setError(err.message); }
  };
  const backup = async () => {
    try {
      const data = await call('profile.backup', { id: profile.id });
      saveText(`${profile.language}-${profile.name.replace(/[^\w.-]+/g, '_')}.profile.json`, JSON.stringify(data, null, 2), 'application/json');
    } catch (err) { setError(err.message); }
  };
  const restore = async (text) => {
    try {
      const restored = await call('profile.restore', { data: text });
      await onReload();
      setId(restored.id);
    } catch (err) { setError(err.message); }
  };
  const used = project && project.profiles && project.profiles[profile.language];
  const isUsed = used ? used === profile.id : !!profile.isDefault;
  const sevOptions = SEV.map((s) => ({ value: s, label: sevLabel(s), icon: SEV_ICON[s] }));
  const ruleName = (key) => { const r = rules.find((x) => x.key === key); return r ? textOf(r.name) : key; };
  return (
    <div className={`view ${tab !== 'compare' || diff ? 'view-list' : ''}`}>
      <ViewHeader icon="layers" title={t('nav_profiles')} hint={t('vh_profiles')} />
      <div className="view-toolbar" data-tour="profile-tools">
        <IconSelect value={profile.id} onChange={(v) => { setId(v); setDiff(null); setOther(''); setError(''); }} title={t('profile')} ariaLabel={t('profile')} width={260}
          options={profiles.map((p) => ({ value: p.id, label: `${p.name} (${p.language})${p.isDefault ? ' ★' : ''}`, icon: p.isDefault ? 'star' : 'layers' }))} />
        <input className="search" aria-label={t('qp_name')} value={profile.name} onChange={(e) => update({ ...profile, name: e.target.value })} />
        <Btn icon="copy" label={t('qp_copy')} onClick={() => create(false)} />
        <Btn icon="layers" label={t('qp_extend')} onClick={() => create(true)} />
        <Btn icon="star" label={t('qp_set_default')} disabled={profile.isDefault} onClick={setDefault} />
        {project && <Btn icon="check" label={t('qp_use_for_project')} active={isUsed} onClick={() => onAssign(profile.language, profile.isDefault ? null : profile.id)} />}
        <Btn icon="download" label={t('qp_backup')} onClick={backup} />
        <FilePickButton label={t('qp_restore')} accept=".json,application/json" onText={restore} />
        <Btn icon="trash" label={t('remove')} danger disabled={profile.isDefault} onClick={remove} />
      </div>
      <div className="view-toolbar">
        <span className="tb-label">{t('qp_parent')}</span>
        <IconSelect value={profile.parentId || ''} width={240} ariaLabel={t('qp_parent')}
          options={[{ value: '', label: t('qp_no_parent'), icon: 'close' }, ...sameLang.filter((p) => p.id !== profile.id && !lineage.includes(p)).map((p) => ({ value: p.id, label: p.name, icon: 'layers' }))]}
          onChange={(v) => update({ ...profile, parentId: v || null })} />
        <BtnGroup>
          <Btn icon="list" label={t('qp_tab_rules')} active={tab === 'rules'} onClick={() => setTab('rules')} />
          <Btn icon="scale" label={t('qp_tab_compare')} active={tab === 'compare'} onClick={() => setTab('compare')} />
          <Btn icon="clock" label={t('qp_tab_changelog')} active={tab === 'changelog'} onClick={() => setTab('changelog')} />
        </BtnGroup>
        {tab === 'rules' && <input className="search" placeholder={t('search')} value={q} onChange={(e) => setQ(e.target.value)} />}
        <span className="small">{t('qp_active_count').replace('{0}', String(list.filter((r) => !inactive.has(r.key)).length)).replace('{1}', String(list.length))}</span>
      </div>
      {error && <p className="small bad">{error}</p>}
      {tab === 'rules' && (
        <div className="panel tpanel list-grow">
          <div className="table-wrap tall">
            <table>
              <thead><tr><th>{t('active')}</th><th>{t('rule')}</th><th>{t('severity')}</th></tr></thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.key}>
                    <td><input type="checkbox" aria-label={t('active')} checked={!inactive.has(r.key)} onChange={(e) => setActive(r.key, e.target.checked)} /></td>
                    <td className="wrap">{textOf(r.name)}<div className="small">{r.key}{inheritedOff.has(r.key) && !(profile.activated || []).includes(r.key) ? ` · ${t('qp_inherited')}` : ''}</div></td>
                    <td className="nowrap">
                      <IconSelect value={overridesEff[r.key] || r.severity} options={sevOptions} width={150} ariaLabel={t('severity')}
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
      )}
      {tab === 'compare' && (
        <div className={`panel ${diff ? 'list-grow' : ''}`}>
          <div className="view-toolbar">
            <span className="tb-label">{t('qp_compare_with')}</span>
            <IconSelect value={other} width={260} ariaLabel={t('qp_compare_with')} onChange={runCompare}
              options={[{ value: '', label: '—', icon: 'close' }, ...sameLang.filter((p) => p.id !== profile.id).map((p) => ({ value: p.id, label: p.name, icon: 'layers' }))]} />
          </div>
          {diff && (
            <div className="table-wrap tall">
              <table>
                <thead><tr><th>{t('rule')}</th><th>{profile.name}</th><th>{(byId.get(diff.b) || {}).name}</th></tr></thead>
                <tbody>
                  {diff.onlyA.map((k) => <tr key={`a${k}`}><td className="wrap">{ruleName(k)}<div className="small">{k}</div></td><td>✓</td><td>—</td></tr>)}
                  {diff.onlyB.map((k) => <tr key={`b${k}`}><td className="wrap">{ruleName(k)}<div className="small">{k}</div></td><td>—</td><td>✓</td></tr>)}
                  {diff.severity.map((d) => <tr key={`s${d.key}`}><td className="wrap">{ruleName(d.key)}<div className="small">{d.key}</div></td><td>{d.a}</td><td>{d.b}</td></tr>)}
                  {!diff.onlyA.length && !diff.onlyB.length && !diff.severity.length && <tr><td colSpan={3}>{t('qp_same')}</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {tab === 'changelog' && (
        <div className="panel tpanel list-grow">
          <div className="table-wrap tall">
            <table>
              <thead><tr><th>{t('ms_date')}</th><th>{t('qp_by')}</th><th>{t('qp_action')}</th><th>{t('rule')}</th></tr></thead>
              <tbody>
                {[...(profile.changelog || [])].reverse().map((c, i) => (
                  <tr key={i}>
                    <td className="nowrap">{new Date(c.at).toLocaleString()}</td>
                    <td>{c.by || '—'}</td>
                    <td>{t(`qp_act_${c.action}`)}{c.action === 'severity' ? ` ${c.from || '·'} → ${c.to || '·'}` : ''}</td>
                    <td className="wrap">{c.rule ? <>{ruleName(c.rule)}<div className="small">{c.rule}</div></> : ''}</td>
                  </tr>
                ))}
                {!(profile.changelog || []).length && <tr><td colSpan={4}>{t('qp_no_changes')}</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

const GATE_OPS = { GT: '>', LT: '<', GTE: '≥', LTE: '≤', EQ: '=' };

const RATING_OPTIONS = ['A', 'B', 'C', 'D', 'E'].map((l, i) => ({ value: String(i + 1), label: l, icon: 'star' }));

export function GatesView({ gates, project, onChange, onAssign }) {
  useLanguage();
  const lang = getLanguage();
  const [id, setId] = useState((gates[0] && gates[0].id) || '');
  const [renaming, setRenaming] = useState(null);
  const gate = gates.find((g) => g.id === id) || gates[0];
  if (!gate) return null;
  const builtIn = gate.id === 'checker-way' || gate.isBuiltIn;
  const metrics = ['new_bugs', 'new_vulnerabilities', 'new_code_smells', 'new_coverage', 'new_duplicated_lines_density', 'new_reliability_rating', 'new_security_rating', 'new_maintainability_rating', 'new_security_hotspots_reviewed', 'bugs', 'vulnerabilities', 'coverage', 'duplicated_lines_density', 'reliability_rating', 'security_rating', 'maintainability_rating'];
  const update = (next) => onChange(gates.map((g) => (g.id === gate.id ? next : g)));
  const setCond = (c, patch) => update({ ...gate, conditions: gate.conditions.map((x) => x.id === c.id ? { ...x, ...patch } : x) });
  const metricOptions = metrics.map((m) => ({ value: m, label: metricLabel(m, lang), icon: m.startsWith('new_') ? 'clock' : 'chart' }));
  const opOptions = Object.keys(GATE_OPS).map((op) => ({ value: op, label: `${op} (${GATE_OPS[op]})`, icon: 'filter' }));
  const copyGate = () => {
    const copy = { ...gate, id: `gate-${Date.now().toString(36)}`, name: t('gate_copy_name', { name: gate.name }), isDefault: false, conditions: gate.conditions.map((c) => ({ ...c, id: `c-${Math.random().toString(36).slice(2, 7)}` })) };
    onChange([...gates, copy]);
    setId(copy.id);
  };
  const removeGate = async () => {
    if (await ask({ title: t('cf_delete_title'), body: t('cf_gate_delete', { name: gate.name }), okLabel: t('delete_ok'), danger: true })) {
      const rest = gates.filter((g) => g.id !== gate.id);
      onChange(rest);
      setId((rest[0] && rest[0].id) || '');
    }
  };
  const commitName = () => {
    const name = (renaming || '').trim();
    setRenaming(null);
    if (name && name !== gate.name) update({ ...gate, name });
  };
  return (
    <div className="view">
      <ViewHeader icon="gate" title={t('nav_gates')} hint={t('vh_gates')} />
      <div className="view-toolbar">
        {renaming === null
          ? <IconSelect value={gate.id} onChange={setId} title={t('gate_pick')} ariaLabel={t('gate_pick')} width={240}
              options={gates.map((g) => ({ value: g.id, label: `${g.name}${g.isDefault ? ' ★' : ''}`, icon: g.isDefault ? 'star' : 'gate' }))} />
          : <input autoFocus className="gate-rename" aria-label={t('gate_rename')} value={renaming} onChange={(e) => setRenaming(e.target.value)} onBlur={commitName}
              onKeyDown={(e) => { if (e.key === 'Enter') commitName(); if (e.key === 'Escape') { e.stopPropagation(); setRenaming(null); } }} />}
        {gate.isDefault && <span className="status-pill tone-ok"><Icon name="star" size={12} />{t('gate_default')}</span>}
        {project && project.gateId === gate.id && <span className="status-pill tone-ok"><Icon name="link" size={12} />{t('gate_in_use')}</span>}
        <Btn icon="copy" label={t('gate_copy')} onClick={copyGate} />
        <Btn icon="edit" label={t('gate_rename')} disabled={builtIn} title={builtIn ? t('gate_builtin_ro') : t('gate_rename')} onClick={() => setRenaming(gate.name)} />
        <Btn icon="star" label={t('gate_set_default')} disabled={!!gate.isDefault} onClick={() => onChange(gates.map((g) => ({ ...g, isDefault: g.id === gate.id })))} />
        <Btn icon="trash" label={t('remove')} danger disabled={builtIn || !!gate.isDefault} title={builtIn ? t('gate_builtin_ro') : gate.isDefault ? t('gate_default_no_delete') : t('remove')} onClick={removeGate} />
        {project && <Btn icon="link" label={t('gate_assign', { name: project.name })} onClick={() => onAssign(gate.id)} />}
      </div>
      {builtIn && (
        <div className="banner">
          <div><strong><Icon name="lock" size={15} /> {t('gate_builtin_ro')}</strong><div className="small">{t('gate_builtin_hint')}</div></div>
          <BtnGroup>
            <Btn icon="settings" label={t('gate_in_settings')} primary onClick={() => emitAction('settings:gate')} />
            <Btn icon="copy" label={t('gate_copy')} onClick={copyGate} />
          </BtnGroup>
        </div>
      )}
      <div className="panel tpanel">
        <div className="table-wrap">
          <table>
            <thead><tr><th>{t('gate_metric')}</th><th>{t('gate_op')}</th><th>{t('gate_threshold')}</th><th className="act" /></tr></thead>
            <tbody>
              {gate.conditions.map((c) => {
                const rating = /_rating$/.test(c.metric);
                return (
                  <tr key={c.id}>
                    <td>{builtIn ? metricLabel(c.metric, lang) : <IconSelect value={c.metric} options={metricOptions} width={300} ariaLabel={t('gate_metric')} onChange={(v) => setCond(c, /_rating$/.test(v) && !rating ? { metric: v, threshold: 1 } : { metric: v })} />}</td>
                    <td>{builtIn ? `${c.op} (${GATE_OPS[c.op] || ''})` : <IconSelect value={c.op} options={opOptions} width={120} ariaLabel={t('gate_op')} onChange={(v) => setCond(c, { op: v })} />}</td>
                    <td>{rating
                      ? (builtIn ? (RATING_OPTIONS[Math.max(0, Math.min(4, Number(c.threshold) - 1))] || {}).label : <IconSelect value={String(Math.max(1, Math.min(5, Number(c.threshold) || 1)))} options={RATING_OPTIONS} width={90} ariaLabel={t('gate_threshold')} onChange={(v) => setCond(c, { threshold: Number(v) })} />)
                      : (builtIn ? c.threshold : <Stepper value={c.threshold} min={0} max={1000000} ariaLabel={t('gate_threshold')} onChange={(v) => setCond(c, { threshold: v })} />)}</td>
                    <td className="act">{!builtIn && <Btn icon="trash" label={t('remove')} onClick={() => update({ ...gate, conditions: gate.conditions.filter((x) => x.id !== c.id) })} />}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {gate.conditions.length === 0 && <Empty icon="gate" text={t('es_no_conditions')} hint={t('es_no_conditions_hint')} />}
        </div>
      </div>
      {!builtIn && (
        <div className="table-foot">
          <Btn icon="plus" label={t('gate_add_condition')} primary onClick={() => update({ ...gate, conditions: [...gate.conditions, { id: `c-${Date.now().toString(36)}`, metric: 'bugs', op: 'GT', threshold: 0, on: 'overall' }] })} />
        </div>
      )}
    </div>
  );
}

const PF_RATINGS = [
  ['reliability_rating', 'reliability', 'bug'],
  ['security_rating', 'security', 'unlock'],
  ['maintainability_rating', 'maintainability', 'smell'],
  ['security_review_rating', 'sec_review', 'shield'],
];

export function Portfolios({ portfolios, projects, onChange }) {
  useLanguage();
  const [name, setName] = useState('');
  const [agg, setAgg] = useState({});
  const [editing, setEditing] = useState('');
  const [error, setError] = useState('');
  const create = () => { if (!name.trim()) return; onChange([...portfolios, { id: `pf-${Date.now().toString(36)}`, name: name.trim(), projectIds: [], projects: [] }]); setName(''); };
  // Aggregated measures per portfolio (portfolio.measures), refreshed when membership changes.
  const sig = portfolios.map((pf) => `${pf.id}:${(pf.projectIds || pf.projects || []).join(',')}`).join('|');
  useEffect(() => {
    let stop = false;
    call('portfolio.measures', {}).then((list) => { if (!stop) setAgg(Object.fromEntries((list || []).map((x) => [x.id, x]))); }).catch((err) => { if (!stop) setError(errorText(err)); });
    return () => { stop = true; };
  }, [sig]);
  const idsOf = (pf) => pf.projectIds || pf.projects || [];
  // projectIds is what this view keeps; projects is what the server aggregates.
  const setMembers = (pf, ids) => onChange(portfolios.map((x) => (x.id === pf.id ? { ...x, projectIds: ids, projects: ids } : x)));
  return (
    <div className="view">
      <ViewHeader icon="folder" title={t('nav_portfolios')} hint={t('vh_portfolios')} />
      <div className="view-toolbar">
        <input placeholder={t('pf_name_ph')} aria-label={t('name')} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') create(); }} />
        <Btn icon="plus" label={t('create_portfolio')} primary disabled={!name.trim()} onClick={create} />
      </div>
      {error && <p className="small bad">{error}</p>}
      {portfolios.map((pf) => {
        const ids = idsOf(pf);
        const a = agg[pf.id];
        const rel = a ? a.releasability : (ids.length ? 'NONE' : 'NONE');
        const m = (a && a.measures) || {};
        const rows = (a && a.projects) || projects.filter((p) => ids.includes(p.id)).map((p) => ({ id: p.id, name: p.name, gate: branchGate(p) || 'NONE', measures: null }));
        return (
          <div key={pf.id} className="panel pf-card">
            <div className="section-head">
              <span className="sub-title" style={{ margin: 0 }}><Icon name="folder" size={15} /><strong>{pf.name}</strong></span>
              <span className={`status-pill big tone-${rel === 'OK' ? 'ok' : rel === 'ERROR' ? 'bad' : 'muted'}`} title={t('pf_releasability')}>
                <Icon name={rel === 'OK' ? 'checkCircle' : rel === 'ERROR' ? 'xCircle' : 'minus'} size={13} />{t('pf_releasability')}: {rel === 'OK' ? t('passed') : rel === 'ERROR' ? t('failed') : t('no_data')}
              </span>
              {a && <span className="small">{t('pf_gates', { ok: a.gates.OK || 0, bad: a.gates.ERROR || 0, none: a.gates.NONE || 0 })}</span>}
              <span className="spacer" />
              <Btn icon="edit" label={t('pf_edit_members')} active={editing === pf.id} onClick={() => setEditing(editing === pf.id ? '' : pf.id)} />
              <Btn icon="trash" label={t('remove')} danger onClick={async () => { if (await ask({ title: t('cf_delete_title'), body: t('cf_portfolio_delete', { name: pf.name }), okLabel: t('delete_ok'), danger: true })) onChange(portfolios.filter((x) => x.id !== pf.id)); }} />
            </div>
            {ids.length === 0 && <Empty icon="folder" text={t('pf_no_members')} hint={t('pf_no_members_hint')}><Btn icon="edit" label={t('pf_edit_members')} primary onClick={() => setEditing(pf.id)} /></Empty>}
            {ids.length > 0 && a && (
              <>
                <div className="rating-grid">
                  {PF_RATINGS.map(([key, label, icon]) => {
                    const letter = a.ratings && a.ratings[key];
                    return (
                      <div key={key} className={`card rating-card r-${letter || 'none'}`}>
                        <div className="k"><Icon name={icon} size={14} /><span>{t(label)}</span></div>
                        <div className="rating-row">
                          {letter ? <span className={`rating-big ${letter}`}>{letter}</span> : <span className="rating-big none">—</span>}
                          <span className="rating-desc"><span>{letter ? t(RATING_WORD[letter]) : t('no_data')}</span><span className="small">{t('pf_worst')}</span></span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="card-grid compact">
                  <Stat icon="bug" kind="BUG" term="bugs" label={t('bugs')} value={m.bugs ?? 0} sub={<NewSub n={m.new_bugs} />} />
                  <Stat icon="unlock" kind="VULNERABILITY" term="vulnerabilities" label={t('vulns')} value={m.vulnerabilities ?? 0} sub={<NewSub n={m.new_vulnerabilities} />} />
                  <Stat icon="smell" kind="CODE_SMELL" term="code_smells" label={t('smells')} value={m.code_smells ?? 0} sub={<NewSub n={m.new_code_smells} />} />
                  <Stat icon="shield" kind="SECURITY_HOTSPOT" term="security_hotspots" label={t('hotspots')} value={m.security_hotspots ?? 0} />
                  <Stat icon="clock" term="sqale_index" label={t('debt')} value={fmtDebt(m.sqale_index)} />
                  <Stat icon="code" term="ncloc" label={t('ncloc')} value={m.ncloc ?? 0} sub={`${t('dup_density')} ${m.duplicated_lines_density ?? 0}%`} />
                </div>
              </>
            )}
            {ids.length > 0 && (
              <div className="panel tpanel">
                <div className="table-wrap short">
                  <table>
                    <thead><tr><th>{t('projects')}</th><th>{t('gate')}</th><th className="num"><Icon name="bug" size={12} /> {t('bugs')}</th><th className="num"><Icon name="unlock" size={12} /> {t('vulns')}</th><th className="num"><Icon name="smell" size={12} /> {t('smells')}</th><th className="num">{t('coverage')}</th><th className="num">{t('ncloc')}</th></tr></thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.id}>
                          <td><Icon name="folder" size={13} /> {r.name}</td>
                          <td><span className={`status-pill tone-${r.gate === 'OK' ? 'ok' : r.gate === 'ERROR' ? 'bad' : 'muted'}`}><Icon name={r.gate === 'OK' ? 'checkCircle' : r.gate === 'ERROR' ? 'xCircle' : 'minus'} size={12} />{r.gate === 'OK' ? t('passed') : r.gate === 'ERROR' ? t('failed') : t('no_data')}</span></td>
                          <td className="num">{r.measures ? r.measures.bugs : '—'}</td>
                          <td className="num">{r.measures ? r.measures.vulnerabilities : '—'}</td>
                          <td className="num">{r.measures ? r.measures.code_smells : '—'}</td>
                          <td className="num">{r.measures && r.measures.coverage != null ? `${r.measures.coverage}%` : '—'}</td>
                          <td className="num">{r.measures ? r.measures.ncloc : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {editing === pf.id && (
              <div className="pf-members">
                <h4 className="sub-title"><Icon name="edit" size={14} />{t('pf_edit_members')}</h4>
                <div className="toggle-grid">
                  {projects.map((p) => (
                    <Toggle key={p.id} checked={ids.includes(p.id)} icon="folder" label={p.name}
                      onChange={(on) => setMembers(pf, on ? [...ids, p.id] : ids.filter((id) => id !== p.id))} />
                  ))}
                  {!projects.length && <span className="small">{t('no_project')}</span>}
                </div>
              </div>
            )}
          </div>
        );
      })}
      {portfolios.length === 0 && <Empty icon="folder" text={t('es_no_portfolios')} hint={t('es_no_portfolios_hint')} />}
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
  const statusIcon = (s) => (s === 'SUCCESS' ? 'checkCircle' : s === 'FAILED' ? 'xCircle' : s === 'CANCELED' ? 'cancelCircle' : s === 'IN_PROGRESS' || s === 'PENDING' ? 'hourglass' : 'circleDot');
  return (
    <div className="view view-list">
      <ViewHeader icon="hourglass" title={t('nav_tasks')} hint={t('tasks_hint')} />
      {(tasks || []).length === 0 && <Empty icon="hourglass" text={t('es_no_tasks')} hint={t('es_no_tasks_hint')} />}
      {(tasks || []).length > 0 && (
        <div className="panel tpanel list-grow">
          <div className="table-wrap tall">
            <table>
              <thead><tr><th>{t('when')}</th><th>{t('branch')}</th><th>{t('status')}</th><th>{t('gate')}</th><th className="num">{t('duration')}</th></tr></thead>
              <tbody>
                {(tasks || []).map((task) => (
                  <tr key={task.id}>
                    <td className="small nowrap">{task.submittedAt}</td>
                    <td><Icon name="branch" size={12} /> {task.branch}</td>
                    <td><span className={`status-pill tone-${task.status === 'SUCCESS' ? 'ok' : task.status === 'FAILED' ? 'bad' : task.status === 'CANCELED' ? 'warn' : 'info'}`}><Icon name={statusIcon(task.status)} size={12} />{task.status}</span></td>
                    <td className={task.gate === 'OK' ? 'ok' : 'bad'}>{task.gate === 'OK' ? t('passed') : task.gate === 'ERROR' ? t('failed') : (task.gate || task.error || '')}</td>
                    <td className="small num">{task.durationMs ? `${task.durationMs} ms` : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export { filterIssues };
