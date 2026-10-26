'use strict';

// Migration of saved data written by older versions, whose field names,
// rule-key prefixes and ids still spelled out compatible-tool names.
// Runs on every workspace load and project-file read; a current workspace
// passes through unchanged, so running it twice is harmless.

const { currentRuleKey, LEGACY_GATE_ID, LEGACY_GATE_NAME } = require('./index');

const DEFAULT_GATE_ID = 'checker-way';
const DEFAULT_GATE_NAME = 'Checker way';

// Object keys renamed anywhere in saved data.
const KEY_MAP = {
  coverity: 'defectAnalysis',
  coverityStatus: 'defectStatus',
  sonar: 'ref',
  ktSonar: 'ktRef',
  sonarKey: 'refKey',
};

// String values renamed anywhere (report kinds, events, history sections).
const VALUE_MAP = {
  'coverity-security': 'defect-security',
  sparrow: 'weakness',
  'coverity-high-impact': 'defect-high-impact',
  coverity: 'defectAnalysis',
  sonar: 'generic-issues',
  'sonar-tests': 'generic-tests',
};
// Inside `tags` arrays the old tag becomes our tag.
const TAG_MAP = { coverity: 'defect-analysis' };

const RULE_KEY_RE = /^(?:cov|external_coverity):[\w.:*-]+$/;

function migrateValue(v, parentKey) {
  if (typeof v === 'string') {
    if (parentKey === 'tags' && TAG_MAP[v]) return TAG_MAP[v];
    if (Object.prototype.hasOwnProperty.call(VALUE_MAP, v)) return VALUE_MAP[v];
    if (RULE_KEY_RE.test(v)) return currentRuleKey(v);
    return v;
  }
  if (Array.isArray(v)) {
    let changed = false;
    const out = v.map((x) => { const y = migrateValue(x, parentKey); if (y !== x) changed = true; return y; });
    return changed ? out : v;
  }
  if (v && typeof v === 'object') {
    let changed = false;
    const out = {};
    for (const [k, x] of Object.entries(v)) {
      let nk = Object.prototype.hasOwnProperty.call(KEY_MAP, k) ? KEY_MAP[k] : k;
      if (RULE_KEY_RE.test(nk)) nk = currentRuleKey(nk);
      const y = migrateValue(x, nk);
      if (nk !== k || y !== x) changed = true;
      if (nk !== k && nk in v) {
        // Both spellings present: keep the current one, fill gaps from the old.
        const cur = out[nk] !== undefined ? out[nk] : v[nk];
        out[nk] = cur && typeof cur === 'object' && y && typeof y === 'object' && !Array.isArray(cur) ? { ...y, ...cur } : cur;
        continue;
      }
      if (nk in out && nk === k) out[nk] = y && typeof y === 'object' && !Array.isArray(y) && out[nk] && typeof out[nk] === 'object' ? { ...out[nk], ...y } : y;
      else out[nk] = y;
    }
    return changed ? out : v;
  }
  return v;
}

function migrateGates(ws) {
  if (!Array.isArray(ws.gates)) return ws;
  const hasDefault = ws.gates.some((g) => g && g.id === DEFAULT_GATE_ID);
  let renamed = false;
  let changed = false;
  const gates = ws.gates.map((g) => {
    if (!g) return g;
    let n = g;
    if (g.id === LEGACY_GATE_ID && !hasDefault) { n = { ...n, id: DEFAULT_GATE_ID }; renamed = true; }
    if (n.name === LEGACY_GATE_NAME) n = { ...n, name: DEFAULT_GATE_NAME };
    if (n !== g) changed = true;
    return n;
  });
  if (!changed) return ws;
  const out = { ...ws, gates };
  if (renamed && Array.isArray(ws.projects)) {
    out.projects = ws.projects.map((p) => (p && p.gateId === LEGACY_GATE_ID ? { ...p, gateId: DEFAULT_GATE_ID } : p));
  }
  return out;
}

/** Migrate a whole saved workspace (workspace.json). */
function migrateWorkspace(ws) {
  if (!ws || typeof ws !== 'object') return ws;
  return migrateGates(migrateValue(ws));
}

/** Migrate the settings block of a project file (*.mccp). */
function migrateProjectSettings(settings) {
  if (!settings || typeof settings !== 'object') return settings;
  const out = migrateValue(settings);
  return out.gateId === LEGACY_GATE_ID ? { ...out, gateId: DEFAULT_GATE_ID } : out;
}

const LEGACY_KEYS = Object.keys(KEY_MAP);
const LEGACY_VALUES = Object.keys(VALUE_MAP).filter((v) => !Object.values(VALUE_MAP).includes(v));

module.exports = { migrateWorkspace, migrateProjectSettings, migrateValue, LEGACY_KEYS, LEGACY_VALUES };
