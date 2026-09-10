// Per-function complexity and quality signals.
//
// All measurements run on the *masked* body (comments and string contents
// blanked), so a `while` inside a comment or an `&&` inside a SQL literal never
// inflates a score. The formulas match the Windows build's
// FunctionComplexityMetrics / FunctionQualitySignals.

import { indentWidth } from './text.js';

const DECISION_RE =
  /\b(if|else\s+if|elseif|elif|select\s+case|case|when|for|foreach|while|do|loop|catch|except|rescue|guard)\b|&&|\|\||\?\?|(?<![<>=!])\?(?![.:])/gi;

const RETURN_RE = /\b(return|yield)\b/gi;
const STATEMENT_RE = /;/g;
const SWITCH_CASE_RE = /\b(case|when|default)\b\s*[^;\n]*:/gi;
const MAGIC_NUMBER_RE = /(?<![\w.$])(-?\d+(?:\.\d+)?)(?![\w.])/g;

// `catch (Exception …)`, `except:` (bare), `catch (...)` — the too-broad kind.
const BROAD_CATCH_RE =
  /catch\s*\(\s*(?:Exception|System\.Exception|Throwable|std::exception|\.\.\.)\s*[\w$]*\s*\)|except\s*:|rescue\s*(?:=>|$)/gim;

// A catch/except whose body holds nothing but whitespace.
const EMPTY_CATCH_RE = /\b(?:catch|rescue)\s*(?:\([^)\n]*\))?\s*\{\s*\}|except[^\n:]*:\s*\n\s*pass\b/gim;

const ASYNC_VOID_RE = /\basync\s+void\s+/;

/** Counts non-overlapping matches without keeping them. */
function countMatches(text, re) {
  re.lastIndex = 0;
  let count = 0;
  let guard = -1;
  while (re.exec(text) !== null) {
    count++;
    // A zero-width match leaves lastIndex where it was — step past it.
    if (re.lastIndex === guard) re.lastIndex++;
    guard = re.lastIndex;
    if (re.lastIndex > text.length) break;
  }
  return count;
}

/**
 * McCabe cyclomatic complexity: 1 + one per decision point.
 */
export function cyclomaticComplexity(maskedBody) {
  return 1 + countMatches(maskedBody, DECISION_RE);
}

/**
 * Cognitive complexity (approximate): cyclomatic plus a penalty for how deeply
 * the decisions are nested — the deeper a branch, the harder it is to hold in
 * your head.
 */
export function cognitiveComplexity(maskedBody, family) {
  const cyclomatic = cyclomaticComplexity(maskedBody);
  const penalty = family === 'indent' ? indentNestingPenalty(maskedBody) : braceNestingPenalty(maskedBody);
  return Math.max(1, cyclomatic + penalty);
}

/** Sum of (depth − 1) over every nested block opener. */
function braceNestingPenalty(body) {
  let depth = 0;
  let penalty = 0;
  for (const ch of body) {
    if (ch === '{') {
      depth++;
      if (depth > 1) penalty += depth - 1;
    } else if (ch === '}') {
      depth = Math.max(0, depth - 1);
    }
  }
  return penalty;
}

function indentNestingPenalty(body) {
  let penalty = 0;
  let base = -1;
  for (const line of body.split('\n')) {
    if (!line.trim()) continue;
    const width = indentWidth(line);
    if (base < 0) {
      base = width;
      continue;
    }
    const level = Math.max(0, Math.floor((width - base) / 4));
    if (level > 0 && /\b(if|for|while|try|with|elif|else|except)\b/.test(line)) penalty += level;
  }
  return penalty;
}

/** Deepest block nesting inside the body. */
export function maxNestingDepth(maskedBody, family) {
  if (family === 'indent') {
    let base = -1;
    let max = 0;
    for (const line of maskedBody.split('\n')) {
      if (!line.trim()) continue;
      const width = indentWidth(line);
      if (base < 0) {
        base = width;
        continue;
      }
      max = Math.max(max, Math.floor((width - base) / 4));
    }
    return max;
  }

  if (family === 'keyword') {
    let depth = 0;
    let max = 0;
    for (const line of maskedBody.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (/^(if|unless|case|while|until|for|begin|do|def|class|module|While|For|If|Select|Try|Do)\b/.test(trimmed)) {
        depth++;
        max = Math.max(max, depth);
      } else if (/^(end|End)\b/.test(trimmed)) {
        depth = Math.max(0, depth - 1);
      }
    }
    return max;
  }

  let depth = 0;
  let max = 0;
  for (const ch of maskedBody) {
    if (ch === '{') {
      depth++;
      max = Math.max(max, depth);
    } else if (ch === '}') {
      depth = Math.max(0, depth - 1);
    }
  }
  return max;
}

export function countReturns(maskedBody) {
  return countMatches(maskedBody, RETURN_RE);
}

/**
 * Magic numbers: numeric literals other than 0, 1 and −1.
 * Array indices and version-like decimals are still counted, matching the
 * Windows build — the metric is a smell indicator, not a proof.
 */
export function countMagicNumbers(maskedBody) {
  MAGIC_NUMBER_RE.lastIndex = 0;
  let count = 0;
  let m;
  while ((m = MAGIC_NUMBER_RE.exec(maskedBody)) !== null) {
    const value = m[1];
    if (value === '0' || value === '1' || value === '-1') continue;
    count++;
  }
  return count;
}

/**
 * Halstead volume, approximated from distinct operators and operands.
 * V = N · log2(n), with N = total tokens and n = distinct tokens.
 */
export function halsteadVolume(maskedBody) {
  const operators = maskedBody.match(/[+\-*/%=<>!&|^~?:]+|\b(new|delete|sizeof|typeof)\b/g) || [];
  const operands = maskedBody.match(/\b[A-Za-z_$][\w$]*\b|\b\d+(?:\.\d+)?\b/g) || [];
  const distinct = new Set([...operators, ...operands]).size;
  const total = operators.length + operands.length;
  if (distinct < 2 || total === 0) return 0;
  return Math.round(total * Math.log2(distinct));
}

/**
 * Maintainability Index, clamped to 0…171 (the classic un-normalized scale the
 * Windows build reports). Higher is better; below ~65 is the default warning.
 */
export function maintenanceIndex(lineCount, cyclomatic, cognitive, parameterCount) {
  if (lineCount <= 0) return 100;
  const loc = Math.max(1, lineCount);
  const volume = loc * Math.log2(Math.max(2, loc));
  const mi =
    171 -
    5.2 * Math.log(Math.max(1, volume)) -
    0.23 * cyclomatic -
    0.21 * cognitive -
    0.5 * parameterCount -
    16.2 * Math.log(loc);
  return Math.min(171, Math.max(0, Number(mi.toFixed(1))));
}

/**
 * Assorted per-function quality signals used by the metrics and bug-risk views.
 */
export function qualitySignals(maskedBody, family, signature) {
  const statementCount =
    family === 'brace'
      ? countMatches(maskedBody, STATEMENT_RE)
      : maskedBody.split('\n').filter((l) => l.trim().length > 0).length;

  return {
    statementCount,
    switchCaseCount: countMatches(maskedBody, SWITCH_CASE_RE),
    emptyCatchCount: countMatches(maskedBody, EMPTY_CATCH_RE),
    broadCatchCount: countMatches(maskedBody, BROAD_CATCH_RE),
    isAsyncVoid: ASYNC_VOID_RE.test(signature || ''),
    halsteadVolume: halsteadVolume(maskedBody),
  };
}

/**
 * Full metric set for a single extracted function.
 * @param {object} fn function record from core/functions.js
 * @param {string} family language family ('brace' | 'indent' | 'keyword')
 */
export function measureFunction(fn, family) {
  const cyclomatic = cyclomaticComplexity(fn.maskedBody);
  const cognitive = cognitiveComplexity(fn.maskedBody, family);
  const nesting = maxNestingDepth(fn.maskedBody, family);
  const returns = countReturns(fn.maskedBody);
  const magic = countMagicNumbers(fn.maskedBody);
  const signals = qualitySignals(fn.maskedBody, family, fn.signature);

  return {
    cyclomaticComplexity: cyclomatic,
    cognitiveComplexity: cognitive,
    maxNestingDepth: nesting,
    returnCount: returns,
    magicNumberCount: magic,
    maintenanceIndex: maintenanceIndex(fn.lineCount, cyclomatic, cognitive, fn.parameterCount),
    ...signals,
    // Weighted method complexity: the classic WMC contribution of one method.
    weightedMethodComplexity: cyclomatic,
  };
}
