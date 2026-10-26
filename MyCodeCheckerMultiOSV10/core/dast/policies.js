'use strict';

// Named scan policies, Security Weakness/ZAP style. A policy picks which rules run in the
// passive and active phases, how aggressive the active payloads are
// (`strength`) and a severity `threshold` the caller may gate a build on.
//
// Rules are referenced by their 'dast:*' keys. `passive`/`active` as `null`
// (or '*') means "every rule of that phase". Built-ins cover the common
// commercial presets.

const { RULES } = require('./rules');

// Active probes (send crafted requests). Everything else in the catalog is a
// passive/observational check. Keeping this list explicit lets a policy turn
// the loud phase off entirely (Light) or focus it (API).
const ACTIVE_KEYS = [
  'dast:xss-reflected',
  'dast:sqli-error',
  'dast:sqli-boolean',
  'dast:path-traversal',
  'dast:open-redirect',
  'dast:ssti',
  'dast:command-injection',
  'dast:crlf-injection',
  'dast:ssrf',
  'dast:http-trace',
  'dast:http-options',
  'dast:http-dangerous-method',
  'dast:rate-limit-missing',
  'dast:graphql-introspection',
  'dast:graphql-batching',
  'dast:graphql-deep-query',
  'dast:soap-injection',
  'dast:soap-xxe',
];

const ACTIVE_SET = new Set(ACTIVE_KEYS);

function allKeys() {
  return RULES.map((r) => r.key);
}

function passiveKeys() {
  return allKeys().filter((k) => !ACTIVE_SET.has(k));
}

function keysByOwasp() {
  // Rules carrying any OWASP 2021 mapping (for the "OWASP Top 10" policy).
  return RULES.filter((r) => (r.standards && r.standards.owasp2021 && r.standards.owasp2021.length)).map((r) => r.key);
}

// API-focused active + passive subset.
const API_ACTIVE = [
  'dast:sqli-error', 'dast:sqli-boolean', 'dast:xss-reflected', 'dast:ssrf',
  'dast:command-injection', 'dast:ssti', 'dast:crlf-injection',
  'dast:http-options', 'dast:http-dangerous-method', 'dast:rate-limit-missing',
  'dast:graphql-introspection', 'dast:graphql-batching', 'dast:graphql-deep-query',
  'dast:soap-injection', 'dast:soap-xxe',
];
const API_PASSIVE = [
  'dast:cors-reflected-origin', 'dast:cors-wildcard-credentials', 'dast:cors-null-origin',
  'dast:jwt-none-alg', 'dast:jwt-weak-alg', 'dast:jwt-in-url', 'dast:sensitive-data-in-url',
  'dast:server-version', 'dast:stack-trace', 'dast:missing-hsts', 'dast:sensitive-file',
  'dast:cookie-no-secure', 'dast:cookie-no-httponly', 'dast:cookie-no-samesite',
  'dast:tls-cert-expired', 'dast:tls-self-signed', 'dast:tls-hostname-mismatch', 'dast:tls-weak-protocol',
];

const BUILTINS = [
  {
    id: 'Light',
    name: { en: 'Light (passive only)', ko: 'Light(수동 전용)' },
    passive: null,
    active: [],
    strength: 'low',
    threshold: 'CRITICAL',
  },
  {
    id: 'Default',
    name: { en: 'Default', ko: '기본' },
    passive: null,
    active: [
      'dast:xss-reflected', 'dast:sqli-error', 'dast:sqli-boolean', 'dast:path-traversal',
      'dast:open-redirect', 'dast:ssti', 'dast:command-injection', 'dast:crlf-injection',
      'dast:ssrf', 'dast:http-trace', 'dast:http-options', 'dast:http-dangerous-method',
    ],
    strength: 'medium',
    threshold: 'MAJOR',
  },
  {
    id: 'OWASP Top 10',
    name: { en: 'OWASP Top 10', ko: 'OWASP Top 10' },
    passive: keysByOwasp(),
    active: ACTIVE_KEYS.filter((k) => {
      const r = RULES.find((x) => x.key === k);
      return r && r.standards && r.standards.owasp2021 && r.standards.owasp2021.length;
    }),
    strength: 'medium',
    threshold: 'MAJOR',
  },
  {
    id: 'API',
    name: { en: 'API scan', ko: 'API 스캔' },
    passive: API_PASSIVE,
    active: API_ACTIVE,
    strength: 'medium',
    threshold: 'MAJOR',
  },
  {
    id: 'Full',
    name: { en: 'Full (all rules, high strength)', ko: 'Full(전체 규칙, 고강도)' },
    passive: null,
    active: null,
    strength: 'high',
    threshold: 'MINOR',
  },
];

const BY_ID = new Map(BUILTINS.map((p) => [p.id.toLowerCase(), p]));

// Public listing of the available policies (for a `policies()` API / UI).
function policies() {
  return BUILTINS.map((p) => ({
    id: p.id,
    name: { ...p.name },
    strength: p.strength,
    threshold: p.threshold,
    passive: p.passive === null ? '*' : [...p.passive],
    active: p.active === null ? '*' : [...p.active],
  }));
}

function strengthToCount(strength) {
  if (strength === 'low') return 1;
  if (strength === 'high') return 99;
  return 2; // medium
}

// Resolve a policy selection into concrete enabled sets. `select` may be a
// policy id (string), a full policy object, or null (→ Default). Unknown ids
// fall back to Default.
function resolvePolicy(select) {
  let p;
  if (select && typeof select === 'object') {
    p = select;
  } else if (typeof select === 'string') {
    p = BY_ID.get(select.toLowerCase()) || BY_ID.get('default');
  } else {
    p = BY_ID.get('default');
  }
  const toSet = (v) => (v === null || v === '*' || v === undefined) ? null : new Set(v);
  const passive = toSet(p.passive);
  const active = toSet(p.active);
  const strength = p.strength || 'medium';
  return {
    id: p.id || 'Custom',
    name: p.name || { en: p.id || 'Custom', ko: p.id || 'Custom' },
    passive,                              // null = all passive rules enabled
    active,                               // null = all active rules enabled; empty Set = none
    strength,
    threshold: p.threshold || 'MAJOR',
    payloadCount: strengthToCount(strength),
    passiveEnabled(key) { return passive === null ? true : passive.has(key); },
    activeEnabled(key) { return active === null ? true : active.has(key); },
    // Is the active phase worth running at all?
    get activeOn() { return active === null || active.size > 0; },
  };
}

const SEV_ORDER = { INFO: 0, MINOR: 1, MAJOR: 2, CRITICAL: 3, BLOCKER: 4 };

// Does `findings` breach the policy threshold? (any finding >= threshold sev)
function thresholdBreached(findings, threshold) {
  const want = SEV_ORDER[threshold] != null ? SEV_ORDER[threshold] : SEV_ORDER.MAJOR;
  for (const f of findings || []) {
    if ((SEV_ORDER[f.severity] != null ? SEV_ORDER[f.severity] : 0) >= want) return true;
  }
  return false;
}

module.exports = {
  policies,
  resolvePolicy,
  thresholdBreached,
  strengthToCount,
  ACTIVE_KEYS,
  passiveKeys,
  BUILTINS,
};
