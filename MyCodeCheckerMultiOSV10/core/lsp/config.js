'use strict';

// Language server settings. Clients send them as initializationOptions and in
// workspace/didChangeConfiguration ({ settings: { mycodechecker: {...} } } or
// the bare object). Unknown keys are ignored.

const DEFAULTS = {
  language: 'en',                 // 'en' | 'ko' — diagnostics, hover, code action titles
  inactiveRules: [],              // rule keys switched off locally
  activeRules: [],                // rule keys switched back on over the profile
  severityOverrides: {},          // { ruleKey: 'BLOCKER' | ... }
  exclusions: [],                 // globs, root-relative ('**/generated/**')
  qualityProfile: '',             // profile id or name (connected mode)
  showHotspots: true,             // publish SECURITY_HOTSPOT findings
  analyzeOnChange: true,          // re-analyze while typing (debounced)
  analyzeWorkspaceOnStart: false, // full analysis at startup (cross-file engines)
  debounceMs: 600,
  maxWorkspaceFiles: 8000,
  ruleLinkTemplate: '',           // e.g. 'vscode://shkwon.mycodechecker/rule?key={key}'
  includeDirs: [],                // C/C++ include folders (root-relative or absolute)
  defines: {},                    // C/C++ macro definitions
  connected: {
    enabled: false,
    serverUrl: '',                // e.g. http://127.0.0.1:5211
    token: '',
    projectKey: '',               // project key/id/name on the server (default: matched by path)
    refreshMinutes: 5,            // 0 = only on startup / command
  },
};

function asArray(v) {
  if (Array.isArray(v)) return v.map(String).filter(Boolean);
  if (typeof v === 'string' && v.trim()) return v.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
  return [];
}

function normalize(raw, base = DEFAULTS) {
  let src = raw || {};
  if (src.settings) src = src.settings;
  if (src.mycodechecker) src = src.mycodechecker;
  const out = JSON.parse(JSON.stringify(base));
  if (src.language === 'ko' || src.language === 'en') out.language = src.language;
  for (const k of ['inactiveRules', 'activeRules', 'exclusions', 'includeDirs']) if (src[k] !== undefined) out[k] = asArray(src[k]);
  if (src.severityOverrides && typeof src.severityOverrides === 'object') out.severityOverrides = { ...src.severityOverrides };
  if (src.defines && typeof src.defines === 'object') out.defines = { ...src.defines };
  if (typeof src.qualityProfile === 'string') out.qualityProfile = src.qualityProfile;
  for (const k of ['showHotspots', 'analyzeOnChange', 'analyzeWorkspaceOnStart']) if (typeof src[k] === 'boolean') out[k] = src[k];
  for (const k of ['debounceMs', 'maxWorkspaceFiles']) if (Number.isFinite(Number(src[k])) && src[k] !== '' && src[k] !== null && src[k] !== undefined) out[k] = Math.max(0, Number(src[k]));
  if (typeof src.ruleLinkTemplate === 'string') out.ruleLinkTemplate = src.ruleLinkTemplate;
  const c = src.connected || src.connectedMode;
  if (c && typeof c === 'object') {
    if (typeof c.enabled === 'boolean') out.connected.enabled = c.enabled;
    for (const k of ['serverUrl', 'token', 'projectKey']) if (typeof c[k] === 'string') out.connected[k] = c[k].trim();
    if (Number.isFinite(Number(c.refreshMinutes)) && c.refreshMinutes !== '') out.connected.refreshMinutes = Math.max(0, Number(c.refreshMinutes));
    if (c.enabled === undefined && out.connected.serverUrl) out.connected.enabled = true;
  }
  return out;
}

// Settings that change analysis results (as opposed to presentation only).
function analysisKey(cfg) {
  return JSON.stringify([cfg.inactiveRules, cfg.activeRules, cfg.severityOverrides, cfg.exclusions, cfg.includeDirs, cfg.defines]);
}

function connectionKey(cfg) {
  const c = cfg.connected;
  return JSON.stringify([c.enabled, c.serverUrl, c.token, c.projectKey, cfg.qualityProfile]);
}

module.exports = { DEFAULTS, normalize, analysisKey, connectionKey };
