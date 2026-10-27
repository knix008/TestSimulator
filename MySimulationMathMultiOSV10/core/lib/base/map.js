// containers.Map: a handle class mapping char or numeric keys to values.
import { tensor, isTensor, isString, isCell, isChar, toTensor, num, bool, str, cell, object } from '../../value.js';
import { E, textArg, optArg, textList } from './util.js';
import { dotName } from './objarr.js';

const KEY_TYPES = ['char', 'double', 'single', 'int32', 'uint32', 'int64', 'uint64'];
const VALUE_TYPES = ['any', 'char', 'double', 'single', 'int32', 'uint32', 'int64', 'uint64', 'logical'];
const isMap = (v) => v && v.isObject && v.cls === 'containers.Map';

function newMap(keyType = 'char', valueType = 'any') {
  return object('containers.Map', { map: new Map(), KeyType: keyType, ValueType: valueType }, { handle: true });
}

function keyOf(m, v) {
  if (m.props.KeyType === 'char') {
    const t = textArg(v);
    if (t === null) throw E('base:Map:specifiedKeyTypeMismatch', 'Specified key type does not match the type expected for this container.');
    return t;
  }
  if (!isTensor(v) || isChar(v) || toTensor(v).re.length !== 1) throw E('base:Map:specifiedKeyTypeMismatch', 'Specified key type does not match the type expected for this container.');
  return toTensor(v).re[0];
}
function keyList(m, v) {
  if (isCell(v)) return v.data.map((x) => keyOf(m, x));
  if (m.props.KeyType === 'char') { if (isString(v)) return v.data.slice(); return [keyOf(m, v)]; }
  return Array.from(toTensor(v).re);
}
function checkValue(m, v) {
  const vt = m.props.ValueType;
  if (vt === 'any') return v;
  if (vt === 'char') { if (!isChar(v)) throw E('base:Map:specifiedValueTypeMismatch', 'Specified value type does not match the type expected for this container.'); return v; }
  if (!isTensor(v) || toTensor(v).re.length !== 1) throw E('base:Map:specifiedValueTypeMismatch', 'Specified value type does not match the type expected for this container.');
  return v.cls === vt ? v : { ...toTensor(v), cls: vt };
}
const keyValue = (m, k) => (m.props.KeyType === 'char' ? str(k) : tensor(m.props.KeyType, [1, 1], [k]));
function sortedKeys(m) {
  const ks = [...m.props.map.keys()];
  if (m.props.KeyType === 'char') return ks.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return ks.sort((a, b) => a - b);
}
function get(m, k) {
  if (!m.props.map.has(k)) throw E('base:Map:noKey', `The specified key is not present in this container.`);
  return m.props.map.get(k);
}

function construct(args) {
  if (args.length === 0) return newMap();
  const first = optArg(args[0]);
  if (first === 'keytype' || first === 'valuetype' || first === 'uniformvalues') {
    let kt = 'char', vt = 'any';
    for (let i = 0; i + 1 < args.length; i += 2) {
      const n = optArg(args[i]), v = textArg(args[i + 1]);
      if (n === 'keytype') { if (!KEY_TYPES.includes(v)) throw E('base:Map:unsupportedKeyType', `Unsupported key type '${v}'.`); kt = v; } else if (n === 'valuetype') { if (!VALUE_TYPES.includes(v)) throw E('base:Map:unsupportedValueType', `Unsupported value type '${v}'.`); vt = v; }
    }
    return newMap(kt, vt);
  }
  const ks = args[0], vs = args[1];
  if (vs === undefined) throw E('base:Map:notEnoughInputs', 'Values must be given with keys.');
  let uniform = true;
  for (let i = 2; i + 1 < args.length; i += 2) if (optArg(args[i]) === 'uniformvalues') { const v = args[i + 1]; uniform = isTensor(v) ? v.re[0] !== 0 : optArg(v) === 'true'; }
  let kt = 'char';
  if (isCell(ks)) { if (ks.data.length && !isChar(ks.data[0]) && !isString(ks.data[0])) kt = 'double'; } else if (isTensor(ks) && !isChar(ks)) kt = ks.cls === 'double' || KEY_TYPES.includes(ks.cls) ? (KEY_TYPES.includes(ks.cls) ? ks.cls : 'double') : 'double';
  const m = newMap(kt, 'any');
  const keys = keyList(m, ks);
  let values;
  if (isCell(vs) && (keys.length !== 1 || vs.data.length === 1)) values = vs.data;
  else if (keys.length === 1) values = [vs];
  else if (isTensor(vs)) { const t = toTensor(vs); values = Array.from(t.re, (x) => tensor(t.cls, [1, 1], [x])); } else values = [vs];
  if (values.length !== keys.length) throw E('base:Map:numKeysValuesMismatch', 'The number of keys and values must be the same.');
  keys.forEach((k, i) => m.props.map.set(k, values[i]));
  // uniform numeric / char values give a typed ValueType
  if (uniform && values.length) {
    if (values.every((v) => isChar(v))) m.props.ValueType = 'char';
    else if (values.every((v) => isTensor(v) && !isChar(v) && toTensor(v).re.length === 1 && v.cls === values[0].cls)) m.props.ValueType = values[0].cls;
  }
  return m;
}

const methods = {
  keys(args) { const m = args[0]; const ks = sortedKeys(m); return cell([1, ks.length], ks.map((k) => keyValue(m, k))); },
  values(args) {
    const m = args[0];
    if (args.length > 1) { const ks = keyList(m, args[1]); return cell([1, ks.length], ks.map((k) => get(m, k))); }
    const ks = sortedKeys(m);
    return cell([1, ks.length], ks.map((k) => m.props.map.get(k)));
  },
  isKey(args) {
    const m = args[0], v = args[1];
    if (isCell(v)) return { cls: 'logical', dims: v.dims, re: Float64Array.from(v.data, (x) => { try { return m.props.map.has(keyOf(m, x)) ? 1 : 0; } catch (e) { return 0; } }), im: null };
    try { return bool(m.props.map.has(keyOf(m, v))); } catch (e) { return bool(false); }
  },
  remove(args) {
    const m = args[0];
    for (const k of keyList(m, args[1])) { if (!m.props.map.has(k)) throw E('base:Map:noKey', 'The specified key is not present in this container.'); m.props.map.delete(k); }
    return m;
  },
  length(args) { return num(args[0].props.map.size); },
  numel() { return num(1); },
  isempty(args) { return bool(args[0].props.map.size === 0); },
  disp(args, nargout, ctx) { ctx.out(mapText(args[0])); return undefined; },
};

function mapText(m) {
  return `  Map with properties:\n\n        Count: ${m.props.map.size}\n      KeyType: ${m.props.KeyType}\n    ValueType: ${m.props.ValueType}\n`;
}

const mapClass = {
  handle: true,
  props: ['Count', 'KeyType', 'ValueType'],
  construct,
  methods,
  subsref(m, subs, nargout, ctx) {
    const s0 = subs[0];
    let v;
    if (s0.type === '()') {
      if (s0.subs.length !== 1) throw E('base:Map:onlyOneKey', 'Only one level of indexing is supported by a containers.Map.');
      v = get(m, keyOf(m, s0.subs[0]));
    } else if (s0.type === '.') {
      const name = dotName(s0);
      if (name === 'Count') v = tensor('uint64', [1, 1], [m.props.map.size]);
      else if (name === 'KeyType') v = str(m.props.KeyType);
      else if (name === 'ValueType') v = str(m.props.ValueType);
      else if (methods[name]) { const callArgs = subs[1] && subs[1].type === '()' ? subs[1].subs : []; const r = methods[name]([m, ...callArgs], nargout, ctx); return r === undefined ? [] : [r]; } else throw E('base:Map:noProperty', `No appropriate method, property, or field '${name}' for class 'containers.Map'.`);
    } else throw E('base:Map:braceIndex', "Only '()' indexing is supported by a containers.Map.");
    if (subs.length > 1) {
      const def = ctx && ctx.registry && ctx.registry.classes && v && v.isObject ? ctx.registry.classes[v.cls] : null;
      if (def && def.subsref) return def.subsref(v, subs.slice(1), nargout, ctx);
      if (ctx && typeof ctx.subsref === 'function') return [ctx.subsref(v, subs.slice(1))];
      // simple field / index access into the stored value
      let cur = v;
      for (const s of subs.slice(1)) {
        if (s.type === '.' && cur.cls === 'struct') cur = cur.data[0][dotName(s)];
        else if (s.type === '{}' && cur.cls === 'cell') cur = cur.data[toTensor(s.subs[0]).re[0] - 1];
        else if (s.type === '()' && isTensor(cur)) cur = tensor(cur.cls, [1, 1], [cur.re[toTensor(s.subs[0]).re[0] - 1]]);
        else throw E('base:Map:badIndex', 'Unsupported indexing into a containers.Map value.');
      }
      return [cur];
    }
    return [v];
  },
  subsasgn(m, subs, rhs) {
    const s0 = subs[0];
    if (s0.type !== '()' || subs.length !== 1) throw E('base:Map:badAssign', "Only '()' assignment with a single key is supported by a containers.Map.");
    m.props.map.set(keyOf(m, s0.subs[0]), checkValue(m, rhs));
    return m;
  },
  display(m, name, ctx, opts) {
    const loose = !(opts && opts.compact);
    if (!name) return mapText(m);
    return loose ? `${name} = \n\n${mapText(m)}\n` : `${name} = \n${mapText(m)}`;
  },
  inlineText() { return null; },
};

export const classes = { 'containers.Map': mapClass };
export const builtins = {
  'containers.Map': (args) => construct(args),
  keys: (args) => { if (!isMap(args[0])) throw E('base:keys:notMap', 'Input must be a containers.Map.'); return methods.keys(args); },
  values: (args) => { if (!isMap(args[0])) throw E('base:values:notMap', 'Input must be a containers.Map.'); return methods.values(args); },
  isKey: (args) => { if (!isMap(args[0])) throw E('base:isKey:notMap', 'Input must be a containers.Map.'); return methods.isKey(args); },
  remove: (args) => { if (!isMap(args[0])) throw E('base:remove:notMap', 'Input must be a containers.Map.'); return methods.remove(args); },
};

const H = (en, ko, syntax) => ({ en, ko, syntax });
export const help = {
  'containers.Map': H('Map container: key-value pairs with char or numeric keys (handle object).', '맵 컨테이너: 문자 또는 숫자 키의 키-값 쌍 (핸들 객체).', ['M = containers.Map', 'M = containers.Map(keySet, valueSet)', "M = containers.Map('KeyType', kType, 'ValueType', vType)"]),
  keys: H('Keys of a containers.Map (sorted).', 'containers.Map의 키 (정렬됨).', ['k = keys(M)']),
  values: H('Values of a containers.Map.', 'containers.Map의 값.', ['v = values(M)', 'v = values(M, keySet)']),
  isKey: H('True if a containers.Map contains the key.', 'containers.Map에 키가 있으면 참.', ['tf = isKey(M, keySet)']),
  remove: H('Remove key-value pairs from a containers.Map.', 'containers.Map에서 키-값 쌍 제거.', ['remove(M, keySet)']),
};
void textList;
