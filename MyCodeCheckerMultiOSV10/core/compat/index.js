'use strict';

// Compatible formats ("호환 형식").
//
// MyCodeChecker reads a few formats that other code-analysis tools also use,
// so existing projects, CI jobs and source comments keep working. This folder
// is the ONLY place that spells out their names: every other module imports
// the constants and helpers below. Our own names are the defaults everywhere
// (mcc-project.properties, mcc.* keys, MCC_TOKEN, NOMCC / mcc[...] /
// mcc-ignore comments, __mcc_*__ model primitives); the legacy spellings are
// accepted on input only.

// ---- project properties ---------------------------------------------------

const PROPERTY_FILE = 'mcc-project.properties';
const LEGACY_PROPERTY_FILE = 'sonar-project.properties';
/** Property files looked up in a project root, ours first. */
const PROPERTY_FILES = [PROPERTY_FILE, LEGACY_PROPERTY_FILE];
const PROPERTY_PREFIX = 'mcc.';
const LEGACY_PROPERTY_PREFIX = 'sonar.';

/**
 * Map legacy property keys onto ours: `sonar.x` -> `mcc.x` and module keys
 * `web.sonar.x` -> `web.mcc.x`. Our own keys win when both are present.
 */
function normalizeProperties(props) {
  const out = {};
  const legacy = {};
  for (const [k, v] of Object.entries(props || {})) {
    const m = /^((?:[^.]+\.)?)sonar\.(.+)$/.exec(k);
    if (m) legacy[`${m[1]}${PROPERTY_PREFIX}${m[2]}`] = v;
    else out[k] = v;
  }
  for (const [k, v] of Object.entries(legacy)) if (!(k in out)) out[k] = v;
  return out;
}

// ---- tokens -----------------------------------------------------------------

const TOKEN_ENV = 'MCC_TOKEN';
const LEGACY_TOKEN_ENV = 'SONAR_TOKEN';
/** The analysis token from the environment (ours first). */
function tokenFromEnv(env = process.env) {
  return env[TOKEN_ENV] || env[LEGACY_TOKEN_ENV] || '';
}

// ---- suppression comments ----------------------------------------------------

/** The marker our quick fix writes. */
const SUPPRESS_MARKER = 'NOMCC';
/** A line with any of these markers has its issues suppressed. */
const SUPPRESSION_RE = /\bNOMCC\b|NOSONAR|\bnoqa\b|\bnolint\b|checker\s*:\s*ignore|mcc-ignore|cov-ignore|parasoft-suppress|sparrow-ignore/i;
/** Already suppressed by a whole-line marker (ours or a compatible one). */
const MARKER_RE = /\bNOMCC\b|NOSONAR/i;
/** Checker annotations: `// mcc[CHECKER]` and the compatible `// coverity[CHECKER]`. */
const ANNOTATION_TEST_RE = /\b(?:mcc|coverity)\[/i;
function annotationRe() { return /\b(?:mcc|coverity)\[([^\]]+)\]/gi; }

// ---- model library primitives --------------------------------------------------

const MODEL_PREFIX = '__mcc_';
const LEGACY_MODEL_PREFIX = '__coverity_';
/** Rewrite compatible model primitives (`__coverity_x__`) to ours (`__mcc_x__`). */
function normalizeModelSource(text) {
  return String(text).split(LEGACY_MODEL_PREFIX).join(MODEL_PREFIX);
}

// ---- coverage and test reports -------------------------------------------------

/** Generic coverage XML file names probed in a project. */
const COVERAGE_FILES = ['coverage/generic-coverage.xml', 'generic-coverage.xml', 'coverage/sonar-coverage.xml', 'sonar-coverage.xml'];

// ---- importer formats ------------------------------------------------------------

const FORMATS = Object.freeze({ GENERIC_ISSUES: 'generic-issues', DEFECT_JSON: 'defect-json', GENERIC_TESTS: 'generic-tests' });
/** Legacy format ids accepted by the importers. */
const FORMAT_ALIASES = Object.freeze({ sonar: FORMATS.GENERIC_ISSUES, coverity: FORMATS.DEFECT_JSON, 'sonar-tests': FORMATS.GENERIC_TESTS });
function normalizeFormat(format) {
  if (!format) return format;
  return FORMAT_ALIASES[format] || format;
}
/** The `type` field of a defect JSON export. */
const DEFECT_JSON_TYPE = 'Coverity issues';
/** Engine id of imported defect JSON findings (rule keys `external_defect:<checker>`). */
const DEFECT_ENGINE = 'defect';

// ---- web API ---------------------------------------------------------------------

/** Signature header of outgoing webhooks. */
const WEBHOOK_SIGNATURE_HEADER = 'X-MCC-Webhook-HMAC-SHA256';
/** Gate id used by older workspaces and the compatible web API. */
const LEGACY_GATE_ID = 'sonar-way';
const LEGACY_GATE_NAME = 'Sonar way';

// ---- stable issue keys -------------------------------------------------------------

// Issue keys hash the rule key. Renamed rule-key prefixes hash with their old
// spelling, so existing issue keys (and the triage stored under them) stay.
const LEGACY_RULE_PREFIXES = [
  ['defect:', 'cov:'],
  [`external_${DEFECT_ENGINE}:`, 'external_coverity:'],
];
function hashRuleKey(key) {
  const k = String(key);
  for (const [now, old] of LEGACY_RULE_PREFIXES) if (k.startsWith(now)) return old + k.slice(now.length);
  return k;
}
/** Current spelling of a (possibly legacy) rule key. */
function currentRuleKey(key) {
  const k = String(key);
  for (const [now, old] of LEGACY_RULE_PREFIXES) if (k.startsWith(old)) return now + k.slice(old.length);
  return k;
}

module.exports = {
  PROPERTY_FILE, LEGACY_PROPERTY_FILE, PROPERTY_FILES, PROPERTY_PREFIX, LEGACY_PROPERTY_PREFIX, normalizeProperties,
  TOKEN_ENV, LEGACY_TOKEN_ENV, tokenFromEnv,
  SUPPRESS_MARKER, SUPPRESSION_RE, MARKER_RE, ANNOTATION_TEST_RE, annotationRe,
  MODEL_PREFIX, LEGACY_MODEL_PREFIX, normalizeModelSource,
  COVERAGE_FILES,
  FORMATS, FORMAT_ALIASES, normalizeFormat, DEFECT_JSON_TYPE, DEFECT_ENGINE,
  WEBHOOK_SIGNATURE_HEADER, LEGACY_GATE_ID, LEGACY_GATE_NAME,
  LEGACY_RULE_PREFIXES, hashRuleKey, currentRuleKey,
};
