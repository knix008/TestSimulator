'use strict';

// History: Coverity snapshot comparison by CID, defect lifecycle, Sonar
// activity events, metric trend series and issue age statistics.

const { isClosed } = require('./util');

const TRIAGE_FIELDS = ['classification', 'action', 'owner', 'impact', 'severity', 'status', 'resolution'];

function dismissed(issue) {
  if (!issue) return false;
  return issue.classification === 'False Positive' || issue.classification === 'Intentional' || issue.action === 'Ignore'
    || issue.resolution === 'FALSE-POSITIVE' || issue.resolution === 'WONTFIX';
}

function byCid(issues) {
  const map = new Map();
  for (const i of issues || []) if (i && i.cid && !map.has(i.cid)) map.set(i.cid, i);
  return map;
}

/**
 * Compare two snapshots by CID (Coverity "snapshot compare").
 * @param {object[]} before issues of the older snapshot
 * @param {object[]} after issues of the newer snapshot
 * @returns {{newlyDetected:object[], fixed:object[], outstanding:object[], triaged:object[], newlyDismissed:object[], reopened:object[], counts:object}}
 *   triaged entries carry `changes: {field: [old, new]}`
 */
function compareSnapshots(before, after) {
  const a = byCid(before);
  const b = byCid(after);
  const newlyDetected = []; const fixed = []; const outstanding = []; const triaged = []; const newlyDismissed = []; const reopened = [];
  for (const [cid, issue] of b) {
    const old = a.get(cid);
    if (!old) { if (!dismissed(issue)) newlyDetected.push(issue); continue; }
    if (!dismissed(issue)) outstanding.push(issue);
    const changes = {};
    for (const f of TRIAGE_FIELDS) if ((old[f] || null) !== (issue[f] || null)) changes[f] = [old[f] || null, issue[f] || null];
    if (Object.keys(changes).length) triaged.push({ ...issue, changes });
    if (!dismissed(old) && dismissed(issue)) newlyDismissed.push(issue);
    if (dismissed(old) && !dismissed(issue)) reopened.push(issue);
  }
  for (const [cid, issue] of a) if (!b.has(cid) && !dismissed(issue)) fixed.push({ ...issue, coverityStatus: 'Fixed' });
  return {
    newlyDetected, fixed, outstanding, triaged, newlyDismissed, reopened,
    counts: { newlyDetected: newlyDetected.length, fixed: fixed.length, outstanding: outstanding.length, triaged: triaged.length, newlyDismissed: newlyDismissed.length, reopened: reopened.length },
  };
}

/**
 * Defect lifecycle over an ordered list of snapshots.
 * @param {{snapshot:number, at:string, issues:object[]}[]} snapshots oldest first
 * @returns {Map<string,{cid:string, checker:string, file:string, firstDetected:{snapshot,at}, lastDetected:{snapshot,at}, fixedIn:{snapshot,at}|null, lastTriaged:string|null, reintroduced:number, status:'New'|'Outstanding'|'Dismissed'|'Fixed', occurrences:number}>}
 */
function defectLifecycle(snapshots) {
  const out = new Map();
  const list = [...(snapshots || [])].sort((x, y) => (x.snapshot || 0) - (y.snapshot || 0));
  list.forEach((snap, n) => {
    const present = byCid(snap.issues);
    for (const [cid, issue] of present) {
      let rec = out.get(cid);
      if (!rec) {
        rec = { cid, checker: issue.checker || issue.rule, file: issue.file, firstDetected: { snapshot: snap.snapshot, at: snap.at }, lastDetected: null, fixedIn: null, lastTriaged: null, reintroduced: 0, status: 'New', occurrences: 0 };
        out.set(cid, rec);
      } else if (rec.fixedIn) {
        rec.reintroduced += 1;
        rec.fixedIn = null;
      }
      rec.lastDetected = { snapshot: snap.snapshot, at: snap.at };
      rec.occurrences += 1;
      rec.file = issue.file;
      const triage = (issue.changelog || []).filter((c) => c && c.patch && TRIAGE_FIELDS.some((f) => c.patch[f] !== undefined || (f === 'owner' && c.patch.assignee !== undefined))).map((c) => c.at).sort().pop();
      if (triage) rec.lastTriaged = triage;
      rec.status = dismissed(issue) ? 'Dismissed' : (n === 0 || rec.occurrences === 1 ? 'New' : 'Outstanding');
    }
    for (const rec of out.values()) {
      if (!present.has(rec.cid) && !rec.fixedIn && rec.status !== 'Dismissed') { rec.fixedIn = { snapshot: snap.snapshot, at: snap.at }; rec.status = 'Fixed'; }
    }
  });
  return out;
}

const GATE_NAMES = { OK: { en: 'Passed', ko: '통과' }, ERROR: { en: 'Failed', ko: '실패' }, WARN: { en: 'Warning', ko: '경고' }, NONE: { en: 'None', ko: '없음' } };

/**
 * Sonar project activity events from the branch history summaries
 * ({at, gate, measures, version?, profiles?: [{language,name,rulesHash?}] , policy?}).
 * @returns {{at:string, category:'QUALITY_GATE'|'VERSION'|'QUALITY_PROFILE'|'COVERITY_POLICY'|'OTHER', name:{en,ko}, description:{en,ko}}[]} newest first
 */
function activityEvents(history, opts = {}) {
  const events = [];
  let prev = null;
  for (const h of history || []) {
    if (prev && h.gate && prev.gate && h.gate !== prev.gate) {
      const n = GATE_NAMES[h.gate] || { en: h.gate, ko: h.gate };
      const failed = ((h.failedConditions || []).map((c) => c.metric || c)).join(', ');
      events.push({ at: h.at, category: 'QUALITY_GATE', name: { en: `${n.en} (was ${(GATE_NAMES[prev.gate] || { en: prev.gate }).en})`, ko: `${n.ko} (이전 ${(GATE_NAMES[prev.gate] || { ko: prev.gate }).ko})` }, description: { en: failed, ko: failed } });
    }
    if (h.version && (!prev || h.version !== prev.version)) events.push({ at: h.at, category: 'VERSION', name: { en: h.version, ko: h.version }, description: { en: '', ko: '' } });
    const pp = new Map(((prev && prev.profiles) || []).map((p) => [p.language, p]));
    if (prev) {
      for (const p of h.profiles || []) {
        const old = pp.get(p.language);
        if (!old) events.push({ at: h.at, category: 'QUALITY_PROFILE', name: { en: `Use '${p.name}' (${p.language})`, ko: `'${p.name}' 사용 (${p.language})` }, description: { en: '', ko: '' } });
        else if (old.name !== p.name || (old.rulesHash && p.rulesHash && old.rulesHash !== p.rulesHash)) {
          events.push({ at: h.at, category: 'QUALITY_PROFILE', name: old.name !== p.name ? { en: `Use '${p.name}' instead of '${old.name}' (${p.language})`, ko: `'${old.name}' 대신 '${p.name}' 사용 (${p.language})` } : { en: `Changes in '${p.name}' (${p.language})`, ko: `'${p.name}' 변경 (${p.language})` }, description: { en: '', ko: '' } });
        }
      }
    }
    const pol = h.coverity && h.coverity.policy;
    const prevPol = prev && prev.coverity && prev.coverity.policy;
    if (pol && prevPol && pol !== prevPol) events.push({ at: h.at, category: 'COVERITY_POLICY', name: { en: `Policy ${pol === 'OK' ? 'passed' : 'violated'}`, ko: `정책 ${pol === 'OK' ? '통과' : '위반'}` }, description: { en: '', ko: '' } });
    for (const e of h.events || []) events.push({ at: h.at, category: 'OTHER', name: typeof e === 'string' ? { en: e, ko: e } : e, description: { en: '', ko: '' } });
    prev = h;
  }
  const list = events.sort((x, y) => String(y.at).localeCompare(String(x.at)));
  return opts.category ? list.filter((e) => e.category === opts.category) : list;
}

/**
 * Trend series per metric from history summaries.
 * @param {object[]} history [{at, measures, coverity?}]
 * @param {string[]} metrics measure keys; 'coverity.outstanding' style paths reach nested values
 * @returns {Record<string,{at:string, value:number|null}[]>}
 */
function trendSeries(history, metrics) {
  const out = {};
  for (const m of metrics || []) {
    out[m] = (history || []).map((h) => {
      let v;
      if (m.includes('.')) v = m.split('.').reduce((o, k) => (o == null ? undefined : o[k]), h);
      else v = h.measures ? h.measures[m] : undefined;
      return { at: h.at, value: v == null || Number.isNaN(Number(v)) ? null : Number(v) };
    });
  }
  return out;
}

/** Delta between the first and last non-null values of a series. */
function seriesDelta(series) {
  const vals = (series || []).filter((p) => p.value != null);
  if (vals.length < 2) return null;
  return vals[vals.length - 1].value - vals[0].value;
}

/**
 * Carry creation dates forward: issues seen before keep their creationDate,
 * new keys get `now`. Returns new issue objects.
 */
function stampCreationDates(previous, current, now = new Date().toISOString()) {
  const seen = new Map((previous || []).map((i) => [i.key, i.creationDate || i.createdAt]));
  return (current || []).map((i) => ({ ...i, creationDate: i.creationDate || seen.get(i.key) || now }));
}

const AGE_BUCKETS = [
  { id: 'lt1d', maxDays: 1, label: { en: '< 1 day', ko: '1일 미만' } },
  { id: 'lt1w', maxDays: 7, label: { en: '< 1 week', ko: '1주 미만' } },
  { id: 'lt1m', maxDays: 30, label: { en: '< 1 month', ko: '1개월 미만' } },
  { id: 'lt3m', maxDays: 90, label: { en: '< 3 months', ko: '3개월 미만' } },
  { id: 'lt1y', maxDays: 365, label: { en: '< 1 year', ko: '1년 미만' } },
  { id: 'ge1y', maxDays: Infinity, label: { en: '1 year or more', ko: '1년 이상' } },
];

/**
 * Age of open issues (from creationDate / createdAt / first changelog entry).
 * @returns {{count:number, averageDays:number|null, medianDays:number|null, oldest:object|null, buckets:{id,label,count}[], byType:Record<string,{count,averageDays}>, unknown:number}}
 */
function issueAge(issues, now = Date.now()) {
  const t = typeof now === 'number' ? now : new Date(now).getTime();
  const ages = [];
  let unknown = 0;
  const buckets = AGE_BUCKETS.map((b) => ({ id: b.id, label: b.label, count: 0 }));
  const byType = {};
  let oldest = null;
  for (const i of issues || []) {
    if (isClosed(i)) continue;
    const created = i.creationDate || i.createdAt || (i.changelog && i.changelog[0] && i.changelog[0].at);
    const ms = created ? new Date(created).getTime() : NaN;
    if (Number.isNaN(ms)) { unknown += 1; continue; }
    const days = Math.max(0, (t - ms) / 86400000);
    ages.push(days);
    buckets[AGE_BUCKETS.findIndex((b) => days < b.maxDays)].count += 1;
    const bt = byType[i.type] || (byType[i.type] = { count: 0, total: 0 });
    bt.count += 1; bt.total += days;
    if (!oldest || days > oldest.days) oldest = { key: i.key, rule: i.rule, file: i.file, line: i.line, days: Math.round(days * 10) / 10 };
  }
  ages.sort((x, y) => x - y);
  const round = (v) => Math.round(v * 10) / 10;
  const median = ages.length ? (ages.length % 2 ? ages[(ages.length - 1) / 2] : (ages[ages.length / 2 - 1] + ages[ages.length / 2]) / 2) : null;
  const out = {};
  for (const [k, v] of Object.entries(byType)) out[k] = { count: v.count, averageDays: round(v.total / v.count) };
  return {
    count: ages.length, averageDays: ages.length ? round(ages.reduce((n, d) => n + d, 0) / ages.length) : null,
    medianDays: median == null ? null : round(median), oldest, buckets, byType: out, unknown,
  };
}

/** Mean time to fix (days) from a lifecycle map: firstDetected.at -> fixedIn.at. */
function meanTimeToFix(lifecycle) {
  const days = [];
  for (const rec of lifecycle.values ? lifecycle.values() : Object.values(lifecycle || {})) {
    if (rec.fixedIn && rec.fixedIn.at && rec.firstDetected && rec.firstDetected.at) days.push((Date.parse(rec.fixedIn.at) - Date.parse(rec.firstDetected.at)) / 86400000);
  }
  return days.length ? Math.round((days.reduce((n, d) => n + d, 0) / days.length) * 10) / 10 : null;
}

module.exports = {
  TRIAGE_FIELDS, AGE_BUCKETS, compareSnapshots, defectLifecycle, activityEvents, trendSeries, seriesDelta, stampCreationDates, issueAge, meanTimeToFix,
};
