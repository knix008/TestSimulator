'use strict';

// CVSS base score calculation.
//   v3.0 / v3.1  exact base-score formulas from the FIRST specification
//                (including the v3.1 Roundup that avoids float artefacts)
//   v2           exact base-score formula
//   v4.0         best-effort approximation: the official v4 score uses a
//                270-entry macro-vector lookup table that is not reproduced
//                here. The approximation maps v4 metrics onto the v3.1
//                formula and is flagged `approximate: true`.

function parseVector(vector) {
  const s = String(vector || '').trim();
  const parts = s.split('/');
  let version = null;
  const metrics = {};
  for (const p of parts) {
    const [k, v] = p.split(':');
    if (!k || v === undefined) continue;
    if (k === 'CVSS') { version = v; continue; }
    metrics[k] = v;
  }
  if (!version) version = metrics.Au !== undefined ? '2.0' : null;
  return { version, metrics };
}

function roundup31(x) {
  const n = Math.round(x * 100000);
  if (n % 10000 === 0) return n / 100000;
  return (Math.floor(n / 10000) + 1) / 10;
}

function roundup30(x) {
  return Math.ceil(x * 10 - 1e-9) / 10;
}

const V3 = {
  AV: { N: 0.85, A: 0.62, L: 0.55, P: 0.2 },
  AC: { L: 0.77, H: 0.44 },
  PR: { N: 0.85, L: 0.62, H: 0.27 },
  PRC: { N: 0.85, L: 0.68, H: 0.5 },
  UI: { N: 0.85, R: 0.62 },
  CIA: { H: 0.56, L: 0.22, N: 0 },
};

function scoreV3(m, version) {
  const need = ['AV', 'AC', 'PR', 'UI', 'S', 'C', 'I', 'A'];
  for (const k of need) if (m[k] === undefined) return null;
  const changed = m.S === 'C';
  const av = V3.AV[m.AV];
  const ac = V3.AC[m.AC];
  const pr = (changed ? V3.PRC : V3.PR)[m.PR];
  const ui = V3.UI[m.UI];
  const c = V3.CIA[m.C];
  const i = V3.CIA[m.I];
  const a = V3.CIA[m.A];
  if ([av, ac, pr, ui, c, i, a].some((x) => x === undefined)) return null;
  const iss = 1 - (1 - c) * (1 - i) * (1 - a);
  const impact = changed ? 7.52 * (iss - 0.029) - 3.25 * Math.pow(iss - 0.02, 15) : 6.42 * iss;
  const exploit = 8.22 * av * ac * pr * ui;
  const ru = version === '3.0' ? roundup30 : roundup31;
  if (impact <= 0) return 0;
  return changed ? ru(Math.min(1.08 * (impact + exploit), 10)) : ru(Math.min(impact + exploit, 10));
}

const V2 = {
  AV: { L: 0.395, A: 0.646, N: 1.0 },
  AC: { H: 0.35, M: 0.61, L: 0.71 },
  Au: { M: 0.45, S: 0.56, N: 0.704 },
  CIA: { N: 0, P: 0.275, C: 0.66 },
};

function scoreV2(m) {
  const av = V2.AV[m.AV];
  const ac = V2.AC[m.AC];
  const au = V2.Au[m.Au];
  const c = V2.CIA[m.C];
  const i = V2.CIA[m.I];
  const a = V2.CIA[m.A];
  if ([av, ac, au, c, i, a].some((x) => x === undefined)) return null;
  const impact = 10.41 * (1 - (1 - c) * (1 - i) * (1 - a));
  const exploit = 20 * av * ac * au;
  const f = impact === 0 ? 0 : 1.176;
  return Math.round(((0.6 * impact) + (0.4 * exploit) - 1.5) * f * 10) / 10;
}

function scoreV4(m) {
  const need = ['AV', 'AC', 'AT', 'PR', 'UI', 'VC', 'VI', 'VA', 'SC', 'SI', 'SA'];
  for (const k of need) if (m[k] === undefined) return null;
  const av = V3.AV[m.AV];
  const ac = V3.AC[m.AC];
  const at = m.AT === 'P' ? 0.9 : 1;
  const ui = { N: 0.85, P: 0.68, A: 0.62 }[m.UI];
  const subsequent = [m.SC, m.SI, m.SA].some((x) => x === 'H');
  const pr = (subsequent ? V3.PRC : V3.PR)[m.PR];
  const c = V3.CIA[m.VC];
  const i = V3.CIA[m.VI];
  const a = V3.CIA[m.VA];
  if ([av, ac, pr, ui, c, i, a].some((x) => x === undefined)) return null;
  const sub = Math.max(V3.CIA[m.SC] || 0, V3.CIA[m.SI] || 0, V3.CIA[m.SA] || 0);
  let iss = 1 - (1 - c) * (1 - i) * (1 - a);
  if (iss === 0 && sub > 0) iss = sub * 0.6;
  const impact = subsequent ? 7.52 * (iss - 0.029) - 3.25 * Math.pow(iss - 0.02, 15) : 6.42 * iss;
  if (impact <= 0) return 0;
  const exploit = 8.22 * av * ac * at * pr * ui;
  const raw = subsequent ? Math.min(1.08 * (impact + exploit), 10) : Math.min(impact + exploit, 10);
  let score = Math.round(raw * 0.95 * 10) / 10;
  if (m.E === 'U') score = Math.round(score * 0.8 * 10) / 10;
  return Math.min(10, score);
}

function severityOf(score) {
  if (score == null || Number.isNaN(score)) return 'UNKNOWN';
  if (score === 0) return 'NONE';
  if (score < 4) return 'LOW';
  if (score < 7) return 'MEDIUM';
  if (score < 9) return 'HIGH';
  return 'CRITICAL';
}

function cvssScore(vector) {
  const { version, metrics } = parseVector(vector);
  let score = null;
  let approximate = false;
  if (version === '3.1' || version === '3.0') score = scoreV3(metrics, version);
  else if (version === '2.0' || version === '2') score = scoreV2(metrics);
  else if (version === '4.0') { score = scoreV4(metrics); approximate = true; }
  return { version, score, severity: severityOf(score), approximate, vector: String(vector || '') };
}

// Best severity for an OSV record: CVSS vectors first, then the
// database_specific.severity label used by GitHub advisories.
function osvSeverity(osv) {
  let best = null;
  const entries = [...(osv.severity || [])];
  for (const aff of osv.affected || []) for (const s of aff.severity || []) entries.push(s);
  for (const s of entries) {
    if (!s || !s.score) continue;
    let r;
    if (/^CVSS:|AV:/.test(s.score)) r = cvssScore(s.score);
    else if (!Number.isNaN(Number(s.score))) { const n = Number(s.score); r = { version: null, score: n, severity: severityOf(n), approximate: false, vector: '' }; }
    if (!r || r.score == null) continue;
    const rank = r.version === '3.1' ? 4 : r.version === '4.0' ? 3 : r.version === '3.0' ? 2 : 1;
    if (!best || rank > best.rank) best = { ...r, rank };
  }
  if (best) { delete best.rank; return best; }
  const label = String((osv.database_specific && osv.database_specific.severity) || '').toUpperCase();
  const map = { CRITICAL: 9.5, HIGH: 7.5, MODERATE: 5.5, MEDIUM: 5.5, LOW: 2.5 };
  if (map[label]) return { version: null, score: null, severity: label === 'MODERATE' ? 'MEDIUM' : label, approximate: true, vector: '' };
  return { version: null, score: null, severity: 'UNKNOWN', approximate: true, vector: '' };
}

// Contract severity for a CVSS severity label.
function toIssueSeverity(label) {
  return { CRITICAL: 'BLOCKER', HIGH: 'CRITICAL', MEDIUM: 'MAJOR', LOW: 'MINOR', NONE: 'INFO' }[label] || 'MAJOR';
}

module.exports = { parseVector, cvssScore, severityOf, osvSeverity, toIssueSeverity, roundup31 };
