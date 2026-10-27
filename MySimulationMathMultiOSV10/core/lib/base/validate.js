// Argument validation: validateattributes, validatestring, the mustBe*
// validator functions and the inputParser handle class.
import {
  INT_RANGE, tensor, prod, isTensor, isSparse, isString, isCell, isStruct, isChar, isObject, isFuncHandle,
  toTensor, num, bool, str, cell, struct, stringArray, object, MError,
} from '../../value.js';
import { E, textArg, optArg, textList, dense, isCellstr, classDef } from './util.js';

const isIntC = (c) => c in INT_RANGE;
const isNumLike = (v) => isTensor(v) || isSparse(v);
const vals = (v) => (isNumLike(v) ? toTensor(v) : null);
const dimsOf = (v) => (v && v.dims ? v.dims : [1, 1]);

// ------------------------------------------------------------- class groups

function classMatches(v, name) {
  switch (name) {
    case 'numeric': return isNumLike(v) && v.cls !== 'logical' && v.cls !== 'char';
    case 'float': return isNumLike(v) && (v.cls === 'double' || v.cls === 'single');
    case 'integer': return isTensor(v) && isIntC(v.cls);
    case 'cell': return isCell(v);
    case 'struct': return isStruct(v);
    case 'function_handle': return isFuncHandle(v);
    case 'string': return isString(v);
    default: return v.cls === name;
  }
}

// ------------------------------------------------------------- validateattributes

function attrCheck(v, attr, arg) {
  const d = dimsOf(v);
  const t = vals(v);
  const all = (f) => { if (!t) return false; for (let i = 0; i < t.re.length; i++) if (!f(t.re[i], t.im ? t.im[i] : 0)) return false; return true; };
  const vec = d.length === 2 && (d[0] === 1 || d[1] === 1);
  switch (attr) {
    case '2d': return d.length === 2;
    case '3d': return d.length <= 3;
    case 'column': return d.length === 2 && d[1] === 1;
    case 'row': return d.length === 2 && d[0] === 1;
    case 'scalar': return prod(d) === 1;
    case 'scalartext': return (isChar(v) && d[0] <= 1) || (isString(v) && prod(d) === 1);
    case 'vector': return vec;
    case 'square': return d.length === 2 && d[0] === d[1];
    case 'nonempty': return prod(d) > 0;
    case 'nonsparse': return !isSparse(v);
    case 'binary': return all((x) => x === 0 || x === 1);
    case 'even': return all((x) => Number.isInteger(x / 2));
    case 'odd': return all((x) => Number.isInteger(x) && Math.abs(x % 2) === 1);
    case 'integer': return all((x) => Number.isInteger(x));
    case 'real': return !!t && !t.im;
    case 'finite': return all((x, y) => Number.isFinite(x) && Number.isFinite(y));
    case 'nonnan': return all((x, y) => x === x && y === y);
    case 'nonnegative': return all((x) => x >= 0);
    case 'nonzero': return all((x, y) => x !== 0 || y !== 0);
    case 'positive': return all((x) => x > 0);
    case 'decreasing': return !!t && t.re.every((x, i) => i === 0 || x < t.re[i - 1]);
    case 'increasing': return !!t && t.re.every((x, i) => i === 0 || x > t.re[i - 1]);
    case 'nondecreasing': return !!t && t.re.every((x, i) => i === 0 || x >= t.re[i - 1]);
    case 'nonincreasing': return !!t && t.re.every((x, i) => i === 0 || x <= t.re[i - 1]);
    case 'size': { const want = Array.from(toTensor(arg).re); const dd = d.slice(); while (dd.length < want.length) dd.push(1); return want.length === dd.length && want.every((w, i) => w !== w || w === dd[i]); }
    case 'numel': return prod(d) === toTensor(arg).re[0];
    case 'ncols': return (d[1] || 1) === toTensor(arg).re[0];
    case 'nrows': return d[0] === toTensor(arg).re[0];
    case 'ndims': return d.length === toTensor(arg).re[0];
    case '>': return all((x) => x > toTensor(arg).re[0]);
    case '>=': return all((x) => x >= toTensor(arg).re[0]);
    case '<': return all((x) => x < toTensor(arg).re[0]);
    case '<=': return all((x) => x <= toTensor(arg).re[0]);
    default: throw E('base:validateattributes:badAttribute', `Unknown attribute '${attr}'.`);
  }
}
const ATTR_TEXT = {
  '2d': 'two-dimensional', '3d': 'three-dimensional', column: 'a column vector', row: 'a row vector', scalar: 'a scalar', scalartext: 'a scalar text',
  vector: 'a vector', square: 'a square matrix', nonempty: 'nonempty', nonsparse: 'nonsparse', binary: 'binary', even: 'even', odd: 'odd', integer: 'integer-valued',
  real: 'real', finite: 'finite', nonnan: 'non-NaN', nonnegative: 'nonnegative', nonzero: 'nonzero', positive: 'positive', decreasing: 'decreasing',
  increasing: 'increasing', nondecreasing: 'nondecreasing', nonincreasing: 'nonincreasing',
};
const WITH_ARG = new Set(['size', 'numel', 'ncols', 'nrows', 'ndims', '>', '>=', '<', '<=']);

function argLabel(args, k0) {
  const fn = args.length > k0 ? textArg(args[k0]) : null;
  const vn = args.length > k0 + 1 ? textArg(args[k0 + 1]) : null;
  const idx = args.length > k0 + 2 ? toTensor(args[k0 + 2]).re[0] : null;
  return { fn: fn || null, vn: vn || null, idx };
}
function expectText(lbl, what) {
  const subject = lbl.vn || 'input';
  if (lbl.fn && lbl.idx) return `${lbl.fn} expects input number ${lbl.idx}, ${subject}, to be ${what}.`;
  if (lbl.fn) return `Expected ${subject} to be ${what}. (${lbl.fn})`;
  return `Expected ${subject} to be ${what}.`;
}

function validateattributesFn(args) {
  if (args.length < 3) throw E('base:validateattributes:notEnoughInputs', 'Not enough input arguments.');
  const A = args[0];
  const classes = isCell(args[1]) ? textList(args[1]).list : [];
  const lbl = argLabel(args, 3);
  if (classes.length && !classes.some((c) => classMatches(A, c))) {
    throw E('base:validateattributes:invalidType', expectText(lbl, `one of these types:\n\n${classes.join(', ')}\n\nInstead its type was ${A.cls}`).replace(/\.$/, '.'));
  }
  if (!isCell(args[2])) throw E('base:validateattributes:badAttributeList', 'Attributes must be a cell array.');
  const at = args[2].data;
  for (let i = 0; i < at.length; i++) {
    const name = optArg(at[i]);
    if (name === null) throw E('base:validateattributes:badAttribute', 'Attribute names must be character vectors.');
    const arg = WITH_ARG.has(name) ? at[++i] : null;
    if (!attrCheck(A, name, arg)) {
      let what = ATTR_TEXT[name];
      if (!what) {
        const a = arg ? Array.from(toTensor(arg).re) : [];
        what = name === 'size' ? `of size ${a.map((x) => (x !== x ? 'N' : x)).join('x')}` : name === 'numel' ? `an array with ${a[0]} elements` : name === 'ncols' ? `an array with ${a[0]} columns` : name === 'nrows' ? `an array with ${a[0]} rows` : name === 'ndims' ? `an array with ${a[0]} dimensions` : `an array with all of the values ${name} ${a[0]}`;
      }
      const id = 'base:validateattributes:expected' + (ATTR_TEXT[name] ? name.charAt(0).toUpperCase() + name.slice(1) : 'Attribute');
      throw E(id, expectText(lbl, what));
    }
  }
  return undefined;
}

function validatestringFn(args) {
  if (args.length < 2) throw E('base:validatestring:notEnoughInputs', 'Not enough input arguments.');
  const s = textArg(args[0]);
  const valid = textList(args[1]).list;
  const lbl = argLabel(args, 2);
  if (s === null) throw E('base:validatestring:invalidStringInput', `Expected ${lbl.vn || 'input'} to be a character vector or string scalar.`);
  const low = s.toLowerCase();
  const exact = valid.filter((v) => v.toLowerCase() === low);
  if (exact.length >= 1) return isString(args[0]) ? stringArray([1, 1], [exact[0]]) : str(exact[0]);
  const hits = valid.filter((v) => v.toLowerCase().startsWith(low) && low.length > 0);
  if (hits.length) {
    // one match, or matches that all extend the shortest one
    const shortest = hits.slice().sort((a, b) => a.length - b.length)[0];
    if (hits.every((h) => h.toLowerCase().startsWith(shortest.toLowerCase()))) return isString(args[0]) ? stringArray([1, 1], [shortest]) : str(shortest);
  }
  const list = valid.map((v) => `'${v}'`).join(', ');
  if (hits.length > 1) throw E('base:validatestring:ambiguousStringChoice', `Expected ${lbl.vn || 'input'} to match one of these values:\n\n${list}\n\nThe input, '${s}', matched more than one valid value.`);
  throw E('base:validatestring:unrecognizedStringChoice', `Expected ${lbl.vn || 'input'} to match one of these values:\n\n${list}\n\nThe input, '${s}', did not match any of the valid values.`);
}

// ------------------------------------------------------------- mustBe* validators

function mustNum(name, v, fn, msg) {
  const t = vals(v);
  if (!t) throw E(`base:validators:${name}`, msg);
  for (let i = 0; i < t.re.length; i++) if (!fn(t.re[i], t.im ? t.im[i] : 0)) throw E(`base:validators:${name}`, msg);
  return undefined;
}
const numericCheck = (name, msg) => (v) => { if (!isNumLike(v) && !isObject(v)) throw E(`base:validators:${name}`, msg); };

function compareValidator(name, f, txt) {
  return (args) => {
    if (args.length < 2) throw E(`base:${name}:notEnoughInputs`, 'Not enough input arguments.');
    const c = toTensor(args[1]).re[0];
    return mustNum(name, args[0], (x) => f(x, c), `Value must be ${txt} ${formatC(c)}.`);
  };
}
const formatC = (c) => (Number.isInteger(c) ? String(c) : String(c));

const mustBe = {
  mustBePositive: (args) => mustNum('mustBePositive', args[0], (x) => x > 0, 'Value must be positive.'),
  mustBeNonnegative: (args) => mustNum('mustBeNonnegative', args[0], (x) => x >= 0, 'Value must be nonnegative.'),
  mustBeNegative: (args) => mustNum('mustBeNegative', args[0], (x) => x < 0, 'Value must be negative.'),
  mustBeNonpositive: (args) => mustNum('mustBeNonpositive', args[0], (x) => x <= 0, 'Value must be nonpositive.'),
  mustBeNonzero: (args) => mustNum('mustBeNonzero', args[0], (x, y) => x !== 0 || y !== 0, 'Value must not be zero.'),
  mustBeFinite: (args) => mustNum('mustBeFinite', args[0], (x, y) => Number.isFinite(x) && Number.isFinite(y), 'Value must be finite.'),
  mustBeNonNan: (args) => mustNum('mustBeNonNan', args[0], (x, y) => x === x && y === y, 'Value must not be NaN.'),
  mustBeInteger: (args) => mustNum('mustBeInteger', args[0], (x, y) => Number.isInteger(x) && y === 0, 'Value must be integer.'),
  mustBeReal(args) { const t = vals(args[0]); if (!t || t.im) throw E('base:validators:mustBeReal', 'Value must be real.'); return undefined; },
  mustBeNumeric(args) { numericCheck('mustBeNumeric', 'Value must be numeric.')(args[0]); if (args[0].cls === 'logical' || args[0].cls === 'char') throw E('base:validators:mustBeNumeric', 'Value must be numeric.'); return undefined; },
  mustBeNumericOrLogical(args) { const v = args[0]; if (!isNumLike(v) || v.cls === 'char') throw E('base:validators:mustBeNumericOrLogical', 'Value must be numeric or logical.'); return undefined; },
  mustBeNonempty(args) { if (prod(dimsOf(args[0])) === 0) throw E('base:validators:mustBeNonempty', 'Value must not be empty.'); return undefined; },
  mustBeNonsparse(args) { if (isSparse(args[0])) throw E('base:validators:mustBeNonsparse', 'Value must not be sparse.'); return undefined; },
  mustBeText(args) { const v = args[0]; if (!(isChar(v) || isString(v) || isCellstr(v))) throw E('base:validators:mustBeText', 'Value must be a character vector, string array, or cell array of character vectors.'); return undefined; },
  mustBeTextScalar(args) { const v = args[0]; if (!((isChar(v) && (v.dims[0] <= 1)) || (isString(v) && v.data.length === 1))) throw E('base:validators:mustBeTextScalar', 'Value must be a character vector or string scalar.'); return undefined; },
  mustBeNonzeroLengthText(args) {
    const v = args[0];
    const ok = (isChar(v) && v.re.length > 0) || (isString(v) && v.data.every((s) => s && s.length)) || (isCellstr(v) && v.data.every((x) => x.re.length > 0));
    if (!ok) throw E('base:validators:mustBeNonzeroLengthText', 'Value must be text with one or more characters.');
    return undefined;
  },
  mustBeMember(args, nargout, ctx) {
    const A = args[0], S = args[1];
    const r = ctx.call('ismember', [A, S], 1)[0];
    for (const x of r.re) if (!x) {
      const list = isCell(S) || isString(S) ? textList(S).list.map((s) => `'${s}'`).join(', ') : Array.from(toTensor(S).re).join(', ');
      throw E('base:validators:mustBeMember', `Value must be a member of this set:\n${list}`);
    }
    return undefined;
  },
  mustBeInRange(args) {
    const lo = toTensor(args[1]).re[0], hi = toTensor(args[2]).re[0];
    const b = args.length > 3 ? optArg(args[3]) : 'inclusive';
    const incL = b === 'inclusive' || b === 'exclude-upper', incU = b === 'inclusive' || b === 'exclude-lower';
    return mustNum('mustBeInRange', args[0], (x) => (incL ? x >= lo : x > lo) && (incU ? x <= hi : x < hi), `Value must be ${incL ? 'greater than or equal to' : 'greater than'} ${lo}, and ${incU ? 'less than or equal to' : 'less than'} ${hi}.`);
  },
  mustBeGreaterThan: compareValidator('mustBeGreaterThan', (x, c) => x > c, 'greater than'),
  mustBeGreaterThanOrEqual: compareValidator('mustBeGreaterThanOrEqual', (x, c) => x >= c, 'greater than or equal to'),
  mustBeLessThan: compareValidator('mustBeLessThan', (x, c) => x < c, 'less than'),
  mustBeLessThanOrEqual: compareValidator('mustBeLessThanOrEqual', (x, c) => x <= c, 'less than or equal to'),
  mustBeScalarOrEmpty(args) { const n = prod(dimsOf(args[0])); if (n > 1) throw E('base:validators:mustBeScalarOrEmpty', 'Value must be scalar or empty.'); return undefined; },
  mustBeVector(args) { const d = dimsOf(args[0]); const allowAll = args.length > 1 && optArg(args[1]) === 'allow-all-empties'; if (!(d.length === 2 && (d[0] === 1 || d[1] === 1)) && !(allowAll && prod(d) === 0)) throw E('base:validators:mustBeVector', 'Value must be a 1-by-n or n-by-1 vector.'); return undefined; },
  mustBeRow(args) { const d = dimsOf(args[0]); if (!(d.length === 2 && d[0] === 1)) throw E('base:validators:mustBeRow', 'Value must be a row vector.'); return undefined; },
  mustBeColumn(args) { const d = dimsOf(args[0]); if (!(d.length === 2 && d[1] === 1)) throw E('base:validators:mustBeColumn', 'Value must be a column vector.'); return undefined; },
  mustBeMatrix(args) { if (dimsOf(args[0]).length !== 2) throw E('base:validators:mustBeMatrix', 'Value must be a matrix.'); return undefined; },
  mustBeA(args) {
    const names = textList(args[1]).list;
    if (!names.some((c) => classMatches(args[0], c) || (c === 'float' && classMatches(args[0], 'float')))) throw E('base:validators:mustBeA', `Value must be one of the following types: ${names.map((c) => `'${c}'`).join(', ')}.`);
    return undefined;
  },
  mustBeUnderlyingType(args) {
    const names = textList(args[1]).list;
    if (!names.some((c) => classMatches(args[0], c))) throw E('base:validators:mustBeUnderlyingType', `Value must have one of the following underlying types: ${names.map((c) => `'${c}'`).join(', ')}.`);
    return undefined;
  },
  mustBeValidVariableName(args) {
    const list = textList(args[0]).list;
    if (!list.every((s) => /^[A-Za-z][A-Za-z0-9_]{0,62}$/.test(s || ''))) throw E('base:validators:mustBeValidVariableName', 'Value must be valid variable names.');
    return undefined;
  },
  mustBeFile(args, nargout, ctx) {
    for (const p of textList(args[0]).list) { const full = resolvePath(ctx, p); if (!ctx.fs || !ctx.fs.exists(full) || ctx.fs.stat(full).isDir) throw E('base:validators:mustBeFile', 'The following files do not exist: \'' + p + '\'.'); }
    return undefined;
  },
  mustBeFolder(args, nargout, ctx) {
    for (const p of textList(args[0]).list) { const full = resolvePath(ctx, p); if (!ctx.fs || !ctx.fs.exists(full) || !ctx.fs.stat(full).isDir) throw E('base:validators:mustBeFolder', 'The following folders do not exist: \'' + p + '\'.'); }
    return undefined;
  },
};
function resolvePath(ctx, p) {
  if (/^([A-Za-z]:)?\//.test(p)) return p;
  const cwd = ctx.fs && ctx.fs.cwd ? ctx.fs.cwd() : '/';
  return (cwd.endsWith('/') ? cwd : cwd + '/') + p;
}

// ------------------------------------------------------------- inputParser (handle class)

function ipNew() {
  return object('inputParser', {
    FunctionName: '', CaseSensitive: false, KeepUnmatched: false, PartialMatching: true, StructExpand: true,
    required: [], optional: [], params: [],
    Results: struct([1, 1], [], [Object.create(null)]), Unmatched: struct([1, 1], [], [Object.create(null)]), UsingDefaults: [],
  }, { handle: true });
}
function validateWith(ctx, p, name, value, validator) {
  if (!validator) return;
  let ok = true, msg = null;
  try {
    const r = ctx.call(validator, [value], isFuncHandle(validator) && validator.nargoutHint === 0 ? 0 : 1);
    if (r && r.length && isNumLike(r[0])) ok = toTensor(r[0]).re.every((x) => x !== 0) && toTensor(r[0]).re.length > 0;
  } catch (e) {
    if (e && /too many output/i.test(e.message || '')) {
      try { ctx.call(validator, [value], 0); return; } catch (e2) { ok = false; msg = e2.message; }
    } else { ok = false; msg = e.message; }
  }
  if (!ok) {
    const fn = p.props.FunctionName ? `${p.props.FunctionName}: ` : '';
    const vtext = validator.text || validator.name || 'validator';
    throw E('base:inputParser:ArgumentFailedValidation', msg ? `${fn}The value of '${name}' is invalid. ${msg}` : `${fn}The value of '${name}' is invalid. It must satisfy the function: ${vtext}.`);
  }
}
function ipNameMatch(p, key, list) {
  const cs = p.props.CaseSensitive;
  const eq = (a, b) => (cs ? a === b : a.toLowerCase() === b.toLowerCase());
  const exact = list.find((e) => eq(e.name, key));
  if (exact) return exact;
  if (!p.props.PartialMatching) return null;
  const hits = list.filter((e) => (cs ? e.name.startsWith(key) : e.name.toLowerCase().startsWith(key.toLowerCase())));
  if (hits.length > 1) throw E('base:inputParser:AmbiguousParamName', `'${key}' matches multiple parameter names.`);
  return hits[0] || null;
}
function ipParse(p, args, ctx) {
  const P = p.props;
  const res = Object.create(null), order = [];
  const usingDefaults = [];
  const unmatched = Object.create(null), unmatchedOrder = [];
  let i = 0;
  const fn = P.FunctionName ? `${P.FunctionName}: ` : '';
  for (const r of P.required) {
    if (i >= args.length) throw E('base:inputParser:notEnoughInputs', `${fn}Not enough input arguments.`);
    validateWith(ctx, p, r.name, args[i], r.validator);
    res[r.name] = args[i]; order.push(r.name); i++;
  }
  const isParamName = (v) => { const t = textArg(v); return t !== null && P.params.some((e) => (P.CaseSensitive ? e.name === t : e.name.toLowerCase() === t.toLowerCase() || (P.PartialMatching && e.name.toLowerCase().startsWith(t.toLowerCase())))); };
  for (const o of P.optional) {
    if (i < args.length && !(isParamName(args[i]) && textArg(args[i]) !== null) && !(P.StructExpand && isStruct(args[i]) && P.params.length)) {
      let accept = true;
      if (o.validator) { try { validateWith(ctx, p, o.name, args[i], o.validator); } catch (e) { if (textArg(args[i]) !== null && P.params.length) accept = false; else throw e; } }
      if (accept) { res[o.name] = args[i]; order.push(o.name); i++; continue; }
    }
    res[o.name] = o.def; order.push(o.name); usingDefaults.push(o.name);
  }
  const given = new Set();
  // name-value pairs (and struct expansion)
  while (i < args.length) {
    const a = args[i];
    if (P.StructExpand && isStruct(a) && a.data.length === 1) {
      for (const f of a.fields) {
        const e = ipNameMatch(p, f, P.params);
        if (!e) { if (P.KeepUnmatched) { unmatched[f] = a.data[0][f]; unmatchedOrder.push(f); continue; } throw E('base:inputParser:UnmatchedParameter', `${fn}'${f}' is not a recognized parameter.`); }
        validateWith(ctx, p, e.name, a.data[0][f], e.validator);
        res[e.name] = a.data[0][f]; given.add(e.name);
      }
      i++; continue;
    }
    const key = textArg(a);
    if (key === null) throw E('base:inputParser:ParamMissingValue', `${fn}Expected a parameter name, followed by a value.`);
    if (i + 1 >= args.length) throw E('base:inputParser:ParamMissingValue', `${fn}No value was given for '${key}'. Name-value pair arguments require a name followed by a value.`);
    const e = ipNameMatch(p, key, P.params);
    if (!e) {
      if (P.KeepUnmatched) { unmatched[key] = args[i + 1]; unmatchedOrder.push(key); i += 2; continue; }
      if (P.optional.length || P.required.length) throw E('base:inputParser:UnmatchedParameter', `${fn}'${key}' is not a recognized parameter. For a list of valid name-value pair arguments, see the documentation for this function.`);
      throw E('base:inputParser:UnmatchedParameter', `${fn}'${key}' is not a recognized parameter.`);
    }
    validateWith(ctx, p, e.name, args[i + 1], e.validator);
    res[e.name] = args[i + 1]; given.add(e.name);
    i += 2;
  }
  for (const e of P.params) {
    if (!given.has(e.name)) { res[e.name] = e.def; usingDefaults.push(e.name); }
    if (!order.includes(e.name)) order.push(e.name);
  }
  const sorted = order.slice().sort((a, b) => (a.toLowerCase() < b.toLowerCase() ? -1 : a.toLowerCase() > b.toLowerCase() ? 1 : 0));
  P.Results = struct([1, 1], sorted, [res]);
  P.Unmatched = struct([1, 1], unmatchedOrder, [unmatched]);
  P.UsingDefaults = usingDefaults;
}

const ipMethods = {
  addRequired(args) {
    const p = args[0], name = textArg(args[1]);
    if (name === null) throw E('base:inputParser:invalidName', 'Argument name must be a character vector or string scalar.');
    p.props.required.push({ name, validator: args[2] || null });
    return undefined;
  },
  addOptional(args) {
    const p = args[0], name = textArg(args[1]);
    if (args.length < 3) throw E('base:inputParser:notEnoughInputs', 'addOptional requires a default value.');
    p.props.optional.push({ name, def: args[2], validator: args[3] || null });
    return undefined;
  },
  addParameter(args) {
    const p = args[0], name = textArg(args[1]);
    if (args.length < 3) throw E('base:inputParser:notEnoughInputs', 'addParameter requires a default value.');
    let validator = null;
    if (args.length > 3 && !(textArg(args[3]) !== null && optArg(args[3]) === 'partialmatchpriority')) validator = args[3];
    p.props.params.push({ name, def: args[2], validator });
    return undefined;
  },
  parse(args, nargout, ctx) { ipParse(args[0], args.slice(1), ctx); return undefined; },
  disp(args, nargout, ctx) { ctx.out(ipText(args[0])); return undefined; },
};
ipMethods.addParamValue = ipMethods.addParameter;

const ipProps = ['FunctionName', 'CaseSensitive', 'KeepUnmatched', 'PartialMatching', 'StructExpand', 'Parameters', 'Results', 'Unmatched', 'UsingDefaults'];
function ipGet(p, name) {
  const P = p.props;
  switch (name) {
    case 'FunctionName': return str(P.FunctionName);
    case 'CaseSensitive': case 'KeepUnmatched': case 'PartialMatching': case 'StructExpand': return bool(P[name]);
    case 'Parameters': { const names = [...P.required, ...P.optional, ...P.params].map((e) => e.name).sort(); return cell([1, names.length], names.map((s) => str(s))); }
    case 'Results': return P.Results;
    case 'Unmatched': return P.Unmatched;
    case 'UsingDefaults': return cell([1, P.UsingDefaults.length], P.UsingDefaults.map((s) => str(s)));
    default: throw E('base:inputParser:noProperty', `Unrecognized property '${name}' for class 'inputParser'.`);
  }
}
function ipText(p) {
  const lines = ipProps.map((k) => {
    const v = ipGet(p, k);
    let t;
    if (isChar(v)) t = `'${textArg(v)}'`;
    else if (isTensor(v)) t = String(v.re[0]);
    else if (isCell(v)) t = `{${v.data.map((x) => `'${textArg(x)}'`).join('  ')}}`;
    else t = `[1×1 struct]`;
    return `${k.padStart(17)}: ${t}`;
  });
  return `  inputParser with properties:\n\n${lines.join('\n')}\n\n`;
}

const inputParserClass = {
  handle: true,
  props: ipProps,
  construct() { return ipNew(); },
  methods: ipMethods,
  subsref(obj, subs, nargout, ctx) {
    const s0 = subs[0];
    if (s0.type !== '.') throw E('base:inputParser:badIndex', 'inputParser objects support only dot indexing.');
    const name = typeof s0.subs === 'string' ? s0.subs : textArg(s0.subs);
    if (ipMethods[name]) {
      const callArgs = subs[1] && subs[1].type === '()' ? subs[1].subs : [];
      const r = ipMethods[name]([obj, ...callArgs], nargout, ctx);
      return r === undefined ? [] : [r];
    }
    let v = ipGet(obj, name);
    if (subs.length > 1) {
      // nested field access like p.Results.x
      for (const s of subs.slice(1)) {
        if (s.type === '.' && isStruct(v)) { const f = typeof s.subs === 'string' ? s.subs : textArg(s.subs); if (!v.fields.includes(f)) throw E('base:inputParser:noField', `Reference to non-existent field '${f}'.`); v = v.data[0][f]; } else throw E('base:inputParser:badIndex', 'Unsupported indexing into an inputParser property.');
      }
    }
    return [v];
  },
  subsasgn(obj, subs, rhs) {
    const s0 = subs[0];
    const name = typeof s0.subs === 'string' ? s0.subs : textArg(s0.subs);
    if (subs.length !== 1 || s0.type !== '.') throw E('base:inputParser:badAssign', 'Unsupported assignment into an inputParser object.');
    if (name === 'FunctionName') obj.props.FunctionName = textArg(rhs) || '';
    else if (['CaseSensitive', 'KeepUnmatched', 'PartialMatching', 'StructExpand'].includes(name)) obj.props[name] = toTensor(rhs).re[0] !== 0;
    else throw E('base:inputParser:readOnly', `You cannot set the read-only property '${name}' of inputParser.`);
    return obj;
  },
  display(obj, name) { return `${name ? `${name} = \n\n` : ''}${ipText(obj)}`; },
};

export const classes = { inputParser: inputParserClass };

export const builtins = {
  validateattributes: validateattributesFn,
  validatestring: validatestringFn,
  inputParser() { return ipNew(); },
  ...mustBe,
};

const H = (en, ko, syntax) => ({ en, ko, syntax });
const mb = (n, en, ko) => H(en, ko, [`${n}(value)`]);
export const help = {
  validateattributes: H('Check validity of an array (class and attributes).', '배열의 유효성 검사 (클래스와 속성).', ['validateattributes(A, classes, attributes)', 'validateattributes(A, classes, attributes, funcName, varName, argIndex)']),
  validatestring: H('Check validity of text against a list (prefix match).', '텍스트가 목록에 맞는지 검사 (접두사 일치).', ['validStr = validatestring(str, validStrings)', 'validStr = validatestring(str, validStrings, funcName, varName, argIndex)']),
  inputParser: H('Input parser for functions (addRequired, addOptional, addParameter, parse).', '함수 입력 파서 (addRequired, addOptional, addParameter, parse).', ['p = inputParser', "addRequired(p, 'x', @isnumeric)", "addParameter(p, 'Name', default)", 'parse(p, varargin{:})', 'p.Results']),
  mustBePositive: mb('mustBePositive', 'Validate that value is positive.', '값이 양수인지 검사.'),
  mustBeNonnegative: mb('mustBeNonnegative', 'Validate that value is nonnegative.', '값이 음이 아닌지 검사.'),
  mustBeNegative: mb('mustBeNegative', 'Validate that value is negative.', '값이 음수인지 검사.'),
  mustBeNonpositive: mb('mustBeNonpositive', 'Validate that value is nonpositive.', '값이 양이 아닌지 검사.'),
  mustBeNonzero: mb('mustBeNonzero', 'Validate that value is nonzero.', '값이 0이 아닌지 검사.'),
  mustBeFinite: mb('mustBeFinite', 'Validate that value is finite.', '값이 유한한지 검사.'),
  mustBeNonNan: mb('mustBeNonNan', 'Validate that value is not NaN.', '값이 NaN이 아닌지 검사.'),
  mustBeInteger: mb('mustBeInteger', 'Validate that value is integer.', '값이 정수인지 검사.'),
  mustBeReal: mb('mustBeReal', 'Validate that value is real.', '값이 실수인지 검사.'),
  mustBeNumeric: mb('mustBeNumeric', 'Validate that value is numeric.', '값이 숫자형인지 검사.'),
  mustBeNumericOrLogical: mb('mustBeNumericOrLogical', 'Validate that value is numeric or logical.', '값이 숫자형 또는 논리형인지 검사.'),
  mustBeNonempty: mb('mustBeNonempty', 'Validate that value is not empty.', '값이 비어 있지 않은지 검사.'),
  mustBeNonsparse: mb('mustBeNonsparse', 'Validate that value is not sparse.', '값이 희소가 아닌지 검사.'),
  mustBeText: mb('mustBeText', 'Validate that value is text.', '값이 텍스트인지 검사.'),
  mustBeTextScalar: mb('mustBeTextScalar', 'Validate that value is a single piece of text.', '값이 단일 텍스트인지 검사.'),
  mustBeNonzeroLengthText: mb('mustBeNonzeroLengthText', 'Validate that value is text with nonzero length.', '값이 길이가 0이 아닌 텍스트인지 검사.'),
  mustBeMember: H('Validate that value is a member of a set.', '값이 집합의 원소인지 검사.', ['mustBeMember(value, S)']),
  mustBeInRange: H('Validate that value is in a range.', '값이 범위 안에 있는지 검사.', ['mustBeInRange(value, lower, upper)', "mustBeInRange(value, lower, upper, 'exclusive')"]),
  mustBeGreaterThan: H('Validate that value is greater than a number.', '값이 지정 수보다 큰지 검사.', ['mustBeGreaterThan(value, c)']),
  mustBeGreaterThanOrEqual: H('Validate that value is greater than or equal to a number.', '값이 지정 수 이상인지 검사.', ['mustBeGreaterThanOrEqual(value, c)']),
  mustBeLessThan: H('Validate that value is less than a number.', '값이 지정 수보다 작은지 검사.', ['mustBeLessThan(value, c)']),
  mustBeLessThanOrEqual: H('Validate that value is less than or equal to a number.', '값이 지정 수 이하인지 검사.', ['mustBeLessThanOrEqual(value, c)']),
  mustBeScalarOrEmpty: mb('mustBeScalarOrEmpty', 'Validate that value is scalar or empty.', '값이 스칼라이거나 비어 있는지 검사.'),
  mustBeVector: mb('mustBeVector', 'Validate that value is a vector.', '값이 벡터인지 검사.'),
  mustBeRow: mb('mustBeRow', 'Validate that value is a row vector.', '값이 행 벡터인지 검사.'),
  mustBeColumn: mb('mustBeColumn', 'Validate that value is a column vector.', '값이 열 벡터인지 검사.'),
  mustBeMatrix: mb('mustBeMatrix', 'Validate that value is a matrix.', '값이 행렬인지 검사.'),
  mustBeA: H('Validate that value comes from one of the specified classes.', '값이 지정 클래스 중 하나인지 검사.', ['mustBeA(value, classNames)']),
  mustBeUnderlyingType: H('Validate that value has the specified underlying type.', '값의 기본 형식이 지정 형식인지 검사.', ['mustBeUnderlyingType(value, typeName)']),
  mustBeValidVariableName: mb('mustBeValidVariableName', 'Validate that value is a valid variable name.', '값이 유효한 변수 이름인지 검사.'),
  mustBeFile: mb('mustBeFile', 'Validate that path refers to a file.', '경로가 파일인지 검사.'),
  mustBeFolder: mb('mustBeFolder', 'Validate that path refers to a folder.', '경로가 폴더인지 검사.'),
};
void tensor; void num; void MError; void classDef; void dense;
