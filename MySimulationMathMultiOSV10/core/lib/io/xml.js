// XML: a small non-validating parser and serializer, xmlread/xmlwrite (a
// struct-tree document model) and readstruct/writestruct (XML or JSON).
//
// xmlread result ("struct tree"): every node is a scalar struct with fields
//   Name        '#document', the element tag, '#text', '#comment', '#cdata-section'
//   Attributes  1xN struct array with fields Name and Value (1x0 when none)
//   Data        text of text/comment/CDATA nodes ('' for elements)
//   Children    1xN struct array of child nodes with the same four fields
// Whitespace-only text between elements is dropped.
import {
  E, S, str, num, bool, tensor, struct, empty, stringArray, isText, isStruct, isString, isChar, isCell,
  isTensor, isLogical, toTensor, absPath, readFileBytes, writeFileBytes, bytesToText, utf8Encode,
  nameValues, isTextArg, cellCol, extName,
} from './util.js';
import { jsonToValue, valueToJson, parseJsonText } from './json.js';

// ---------------------------------------------------------------- parser

const ENT = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
export function decodeEntities(s) {
  if (s.indexOf('&') < 0) return s;
  return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[A-Za-z_][\w.-]*);/g, (m, e) => {
    if (e[0] === '#') { const c = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return String.fromCodePoint(c); }
    return e in ENT ? ENT[e] : m;
  });
}
export const escapeText = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const escapeAttr = (s) => escapeText(s).replace(/"/g, '&quot;');

const xerr = (msg, pos) => E('io:xml:parseError', `XML parse error at offset ${pos}: ${msg}`);

/**
 * Parses XML text. Returns a document node
 *   { type:'document', children: Node[] }
 * where Node is { type:'element', name, attrs: [[name, value]...], children }
 * | { type:'text', value } | { type:'cdata', value } | { type:'comment', value } | { type:'pi', target, value }.
 * opts.keepWhitespace keeps whitespace-only text nodes.
 */
export function parseXml(text, opts = {}) {
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  let p = 0;
  const doc = { type: 'document', children: [] };
  const stack = [doc];
  const top = () => stack[stack.length - 1];
  const nameRe = /[^\s/>=]+/y;
  const addText = (t) => {
    if (!opts.keepWhitespace && !/\S/.test(t)) return;
    if (stack.length === 1) { if (/\S/.test(t)) throw xerr('text outside the root element', p); return; }
    top().children.push({ type: 'text', value: decodeEntities(t) });
  };
  while (p < s.length) {
    const lt = s.indexOf('<', p);
    if (lt < 0) { addText(s.slice(p)); break; }
    if (lt > p) addText(s.slice(p, lt));
    p = lt;
    if (s.startsWith('<!--', p)) {
      const e = s.indexOf('-->', p + 4); if (e < 0) throw xerr('unterminated comment', p);
      top().children.push({ type: 'comment', value: s.slice(p + 4, e) }); p = e + 3;
    } else if (s.startsWith('<![CDATA[', p)) {
      const e = s.indexOf(']]>', p + 9); if (e < 0) throw xerr('unterminated CDATA section', p);
      top().children.push({ type: 'cdata', value: s.slice(p + 9, e) }); p = e + 3;
    } else if (s.startsWith('<?', p)) {
      const e = s.indexOf('?>', p + 2); if (e < 0) throw xerr('unterminated processing instruction', p);
      const body = s.slice(p + 2, e); const m = /^(\S+)\s*([\s\S]*)$/.exec(body) || [0, body, ''];
      if (m[1].toLowerCase() !== 'xml') top().children.push({ type: 'pi', target: m[1], value: m[2] });
      p = e + 2;
    } else if (s.startsWith('<!', p)) {
      // DOCTYPE (with an optional internal subset)
      let depth = 0, q = p + 2;
      for (; q < s.length; q++) { const c = s[q]; if (c === '[') depth++; else if (c === ']') depth--; else if (c === '>' && depth <= 0) break; }
      p = q + 1;
    } else if (s[p + 1] === '/') {
      const e = s.indexOf('>', p); if (e < 0) throw xerr('unterminated end tag', p);
      const name = s.slice(p + 2, e).trim();
      const el = top();
      if (stack.length === 1 || el.name !== name) throw xerr(`unexpected end tag </${name}>`, p);
      stack.pop(); p = e + 1;
    } else {
      p++;
      nameRe.lastIndex = p; const nm = nameRe.exec(s); if (!nm) throw xerr('missing element name', p);
      const el = { type: 'element', name: nm[0], attrs: [], children: [] };
      p = nameRe.lastIndex;
      for (;;) {
        while (p < s.length && /\s/.test(s[p])) p++;
        if (p >= s.length) throw xerr('unterminated start tag', p);
        if (s[p] === '>') { p++; top().children.push(el); stack.push(el); break; }
        if (s[p] === '/' && s[p + 1] === '>') { p += 2; top().children.push(el); break; }
        nameRe.lastIndex = p; const an = nameRe.exec(s); if (!an) throw xerr('bad attribute', p);
        p = nameRe.lastIndex;
        while (/\s/.test(s[p])) p++;
        if (s[p] !== '=') throw xerr(`attribute '${an[0]}' has no value`, p);
        p++; while (/\s/.test(s[p])) p++;
        const q = s[p]; if (q !== '"' && q !== "'") throw xerr('attribute value must be quoted', p);
        const e = s.indexOf(q, p + 1); if (e < 0) throw xerr('unterminated attribute value', p);
        el.attrs.push([an[0], decodeEntities(s.slice(p + 1, e))]); p = e + 1;
      }
    }
  }
  if (stack.length > 1) throw xerr(`element <${top().name}> is not closed`, p);
  if (!doc.children.some((c) => c.type === 'element')) throw xerr('no root element', 0);
  return doc;
}

/** Text content of an element (text + CDATA, recursively). */
export function nodeText(n) {
  if (n.type === 'text' || n.type === 'cdata') return n.value;
  if (!n.children) return '';
  return n.children.map(nodeText).join('');
}
export const rootElement = (doc) => doc.children.find((c) => c.type === 'element');

/**
 * Serializes a node tree (as returned by parseXml) to text. Elements that
 * hold only elements are indented; elements with text are written inline.
 * opts: { indent = '   ', declaration = true, encoding = 'utf-8', standalone }
 */
export function serializeXml(node, opts = {}) {
  const ind = opts.indent ?? '   ';
  const out = [];
  const nl = (depth) => (ind ? '\n' + ind.repeat(depth) : '');
  const attrs = (n) => n.attrs.map(([k, v]) => ` ${k}="${escapeAttr(v)}"`).join('');
  const inline = (n) => {
    if (n.type === 'element') {
      if (!n.children.length) { out.push(`<${n.name}${attrs(n)}/>`); return; }
      out.push(`<${n.name}${attrs(n)}>`); for (const c of n.children) inline(c); out.push(`</${n.name}>`);
    } else if (n.type === 'text') out.push(escapeText(n.value));
    else if (n.type === 'cdata') out.push(`<![CDATA[${n.value}]]>`);
    else if (n.type === 'comment') out.push(`<!--${n.value}-->`);
    else if (n.type === 'pi') out.push(`<?${n.target}${n.value ? ' ' + n.value : ''}?>`);
  };
  const block = (n, depth) => {
    if (n.type !== 'element' || !n.children.length || n.children.some((x) => x.type === 'text' || x.type === 'cdata')) { inline(n); return; }
    out.push(`<${n.name}${attrs(n)}>`);
    for (const x of n.children) { out.push(nl(depth + 1)); block(x, depth + 1); }
    out.push(nl(depth) + `</${n.name}>`);
  };
  if (opts.declaration !== false) out.push(`<?xml version="1.0" encoding="${opts.encoding || 'utf-8'}"${opts.standalone === false ? ' standalone="no"' : ''}?>`);
  const kids = node.type === 'document' ? node.children : [node];
  for (const c of kids) { if (out.length) out.push('\n'); block(c, 0); }
  return out.join('');
}

// ---------------------------------------------------------------- struct tree <-> nodes

const TREE_FIELDS = ['Name', 'Attributes', 'Data', 'Children'];
const attrStruct = (attrs) => struct([1, attrs.length], ['Name', 'Value'], attrs.map(([k, v]) => { const r = Object.create(null); r.Name = str(k); r.Value = str(v); return r; }));
function treeRecord(n) {
  const r = Object.create(null);
  const name = n.type === 'document' ? '#document' : n.type === 'element' ? n.name : n.type === 'text' ? '#text' : n.type === 'cdata' ? '#cdata-section' : n.type === 'comment' ? '#comment' : n.target;
  r.Name = str(name);
  r.Attributes = attrStruct(n.attrs || []);
  r.Data = str(n.type === 'element' || n.type === 'document' ? '' : n.value || '');
  const kids = (n.children || []).map(treeRecord);
  r.Children = struct([1, kids.length], TREE_FIELDS, kids);
  return r;
}
export const nodeToTree = (n) => struct([1, 1], TREE_FIELDS, [treeRecord(n)]);

function treeToNode(rec) {
  const name = rec.Name ? S(rec.Name) : '';
  const data = rec.Data && isText(rec.Data) ? S(rec.Data) : '';
  const kidsV = rec.Children;
  const kids = kidsV && isStruct(kidsV) ? kidsV.data.map(treeToNode) : [];
  if (name === '#document') return { type: 'document', children: kids };
  if (name === '#text') return { type: 'text', value: data };
  if (name === '#cdata-section') return { type: 'cdata', value: data };
  if (name === '#comment') return { type: 'comment', value: data };
  const at = rec.Attributes && isStruct(rec.Attributes) ? rec.Attributes.data.map((a) => [S(a.Name), String(scalarText(a.Value))]) : [];
  return { type: 'element', name, attrs: at, children: kids };
}

// ---------------------------------------------------------------- readstruct / writestruct (XML)

const NUM_RE = /^\s*[-+]?(\d+\.?\d*([eE][-+]?\d+)?|\.\d+([eE][-+]?\d+)?|Inf|NaN)\s*$/;
const parseNumText = (t) => { const x = t.trim(); return x === 'Inf' || x === '+Inf' ? Infinity : x === '-Inf' ? -Infinity : x === 'NaN' ? NaN : Number(x); };
const makeField = (name) => {
  let f = name.replace(/^[^:]*:/, '').replace(/[^A-Za-z0-9_]/g, '_');
  if (!/^[A-Za-z]/.test(f)) f = 'x' + f;
  return f.slice(0, 63);
};

function simpleValue(text) {
  if (NUM_RE.test(text)) return num(parseNumText(text));
  return stringArray([1, 1], [text]);
}

function elementToValue(el, suffix) {
  const elems = el.children.filter((c) => c.type === 'element');
  const text = el.children.filter((c) => c.type === 'text' || c.type === 'cdata').map((c) => c.value).join('').trim();
  if (!elems.length && !el.attrs.length) return text === '' ? stringArray([1, 1], ['']) : simpleValue(text);
  const r = Object.create(null); const fields = [];
  const set = (k, v) => { if (!(k in r)) fields.push(k); r[k] = v; };
  for (const [k, v] of el.attrs) set(makeField(k) + suffix, simpleValue(v));
  if (text !== '') set('Text', simpleValue(text));
  const groups = new Map();
  for (const c of elems) { const k = makeField(c.name); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(c); }
  for (const [k, list] of groups) {
    const vals = list.map((c) => elementToValue(c, suffix));
    set(k, vals.length === 1 ? vals[0] : combine(vals));
  }
  return struct([1, 1], fields, [r]);
}
/** Repeated elements: numbers → row vector, text → string row, structs → struct row (fields unioned). */
function combine(vals) {
  if (vals.every((v) => isTensor(v) && v.re.length === 1 && v.cls === 'double')) return tensor('double', [1, vals.length], vals.map((v) => v.re[0]));
  if (vals.every((v) => isString(v) && v.data.length === 1)) return stringArray([1, vals.length], vals.map((v) => v.data[0]));
  const sv = vals.map((v) => (isStruct(v) ? v : (() => { const r = Object.create(null); r.Text = v; return struct([1, 1], ['Text'], [r]); })()));
  const fields = [];
  for (const v of sv) for (const f of v.fields) if (!fields.includes(f)) fields.push(f);
  const data = sv.map((v) => { const r = Object.create(null); for (const f of fields) r[f] = f in v.data[0] ? v.data[0][f] : empty(); return r; });
  return struct([1, sv.length], fields, data);
}

function scalarText(v) {
  if (isString(v)) return v.data.map((x) => (x == null ? '' : x)).join(' ');
  if (isChar(v)) return S(v);
  if (isLogical(v)) return Array.from(v.re, (x) => (x ? 'true' : 'false')).join(' ');
  if (isTensor(v) || v.sparse) return Array.from(toTensor(v).re, fmtNum).join(' ');
  if (isCell(v)) return v.data.map(scalarText).join(' ');
  throw E('io:writestruct:badValue', `Values of class ${v.cls} cannot be written as XML text.`);
}
const fmtNum = (x) => (Number.isNaN(x) ? 'NaN' : x === Infinity ? 'Inf' : x === -Infinity ? '-Inf' : String(Number(x.toPrecision(15))));

function valueToElements(name, v, suffix) {
  if (isStruct(v)) {
    return v.data.map((rec) => {
      const el = { type: 'element', name, attrs: [], children: [] };
      for (const f of v.fields) {
        const x = rec[f];
        if (suffix && f.endsWith(suffix) && f.length > suffix.length && !isStruct(x)) el.attrs.push([f.slice(0, -suffix.length), scalarText(x)]);
        else if (f === 'Text' && !isStruct(x)) el.children.unshift({ type: 'text', value: scalarText(x) });
        else el.children.push(...valueToElements(f, x, suffix));
      }
      return el;
    });
  }
  // vectors: one element per value
  if ((isString(v) || (isTensor(v) && !isChar(v))) && (isString(v) ? v.data.length : v.re.length) > 1) {
    const n = isString(v) ? v.data.length : v.re.length;
    const out = [];
    for (let i = 0; i < n; i++) out.push({ type: 'element', name, attrs: [], children: [{ type: 'text', value: isString(v) ? (v.data[i] ?? '') : isLogical(v) ? (v.re[i] ? 'true' : 'false') : fmtNum(v.re[i]) }] });
    return out;
  }
  if (isCell(v)) return v.data.flatMap((x) => valueToElements(name, x, suffix));
  const t = scalarText(v);
  return [{ type: 'element', name, attrs: [], children: t === '' ? [] : [{ type: 'text', value: t }] }];
}

// ---------------------------------------------------------------- builtins

function fileTypeOf(file, opts) {
  if (opts.filetype) return S(opts.filetype).toLowerCase();
  return extName(file) === '.json' ? 'json' : 'xml';
}

export const builtins = {
  xmlread(args, nargout, ctx) {
    if (!args.length) throw E('io:xmlread:nargin', 'xmlread requires a file name.');
    const file = S(args[0], 'File name');
    const text = bytesToText(readFileBytes(ctx, file));
    return nodeToTree(parseXml(text));
  },
  xmlwrite(args, nargout, ctx) {
    if (!args.length) throw E('io:xmlwrite:nargin', 'xmlwrite requires a document struct.');
    const fileFirst = args.length >= 2 && isTextArg(args[0]);
    const tree = fileFirst ? args[1] : args[0];
    if (!isStruct(tree) || tree.data.length !== 1 || !tree.fields.includes('Name')) throw E('io:xmlwrite:badNode', 'The document must be a struct with fields Name, Attributes, Data and Children (as returned by xmlread).');
    const node = treeToNode(tree.data[0]);
    const text = serializeXml(node, { standalone: false });
    if (fileFirst) { writeFileBytes(ctx, S(args[0]), utf8Encode(text + '\n')); return nargout > 0 ? str(absPath(ctx, S(args[0]))) : undefined; }
    return str(text);
  },
  readstruct(args, nargout, ctx) {
    if (!args.length) throw E('io:readstruct:nargin', 'readstruct requires a file name.');
    const file = S(args[0], 'File name');
    const opts = nameValues(args, 1);
    const text = bytesToText(readFileBytes(ctx, file));
    if (fileTypeOf(file, opts) === 'json') {
      const v = jsonToValue(parseJsonText(text));
      if (!isStruct(v)) throw E('io:readstruct:notStruct', 'The JSON file does not contain an object.');
      return v;
    }
    const suffix = opts.attributesuffix ? S(opts.attributesuffix) : 'Attribute';
    const doc = parseXml(text);
    let root = rootElement(doc);
    if (opts.structselector) {
      const path = S(opts.structselector).replace(/^\/+/, '').split('/').filter(Boolean);
      let cur = { children: [root] };
      for (const seg of path) { const nx = cur.children.find((c) => c.type === 'element' && c.name === seg); if (!nx) throw E('io:readstruct:selector', `No element '${seg}' for StructSelector.`); cur = nx; }
      root = cur;
    }
    const v = elementToValue(root, suffix);
    if (isStruct(v)) return v;
    const r = Object.create(null); r.Text = v; return struct([1, 1], ['Text'], [r]);
  },
  writestruct(args, nargout, ctx) {
    if (args.length < 2) throw E('io:writestruct:nargin', 'writestruct requires a struct and a file name.');
    const s = args[0];
    if (!isStruct(s)) throw E('io:writestruct:notStruct', 'The first input must be a struct.');
    const file = S(args[1], 'File name');
    const opts = nameValues(args, 2);
    if (fileTypeOf(file, opts) === 'json') {
      const pretty = opts.prettyprint === undefined ? true : !!toTensor(opts.prettyprint).re[0];
      writeFileBytes(ctx, file, utf8Encode(valueToJson(s, { pretty })));
      return undefined;
    }
    const suffix = opts.attributesuffix ? S(opts.attributesuffix) : 'Attribute';
    const rootName = opts.structnodename ? S(opts.structnodename) : 'struct';
    const els = valueToElements(rootName, s, suffix);
    const root = els.length === 1 ? els[0] : { type: 'element', name: rootName + 's', attrs: [], children: els };
    writeFileBytes(ctx, file, utf8Encode(serializeXml({ type: 'document', children: [root] }, { indent: '    ' }) + '\n'));
    return undefined;
  },
};

export const help = {
  xmlread: {
    en: 'Read an XML document into a struct tree. Each node has fields Name, Attributes (struct array of Name/Value), Data (text of text/comment nodes) and Children (struct array of child nodes). The top node is named #document.',
    ko: 'XML 문서를 구조체 트리로 읽습니다. 각 노드는 Name, Attributes(Name/Value 구조체 배열), Data(텍스트·주석 노드의 내용), Children(자식 노드 구조체 배열) 필드를 가집니다. 최상위 노드 이름은 #document 입니다.',
    syntax: ['DOM = xmlread(filename)'],
  },
  xmlwrite: {
    en: 'Write a struct tree (as returned by xmlread) to an XML file, or return it as text.',
    ko: 'xmlread 형식의 구조체 트리를 XML 파일로 쓰거나 텍스트로 반환합니다.',
    syntax: ['xmlwrite(filename, DOM)', 'str = xmlwrite(DOM)'],
  },
  readstruct: {
    en: "Read an XML or JSON file into a struct. XML attributes become fields named <attr>Attribute, element text with attributes or children goes to the field Text, repeated elements become arrays and numeric text becomes numbers. Options: 'FileType' ('xml'|'json'), 'AttributeSuffix', 'StructSelector'.",
    ko: "XML 또는 JSON 파일을 구조체로 읽습니다. XML 속성은 <속성>Attribute 필드가 되고, 속성이나 자식이 있는 요소의 텍스트는 Text 필드로, 반복 요소는 배열로, 숫자 텍스트는 숫자로 바뀝니다. 옵션: 'FileType'('xml'|'json'), 'AttributeSuffix', 'StructSelector'.",
    syntax: ['S = readstruct(filename)', "S = readstruct(filename, 'FileType', 'json')", "S = readstruct(filename, 'AttributeSuffix', '_att')"],
  },
  writestruct: {
    en: "Write a struct to an XML or JSON file. Options: 'FileType' ('xml'|'json'), 'StructNodeName' (root element, default 'struct'), 'AttributeSuffix' (fields with this suffix become attributes), 'PrettyPrint' (JSON).",
    ko: "구조체를 XML 또는 JSON 파일로 씁니다. 옵션: 'FileType'('xml'|'json'), 'StructNodeName'(루트 요소 이름, 기본 'struct'), 'AttributeSuffix'(이 접미사로 끝나는 필드는 속성으로), 'PrettyPrint'(JSON).",
    syntax: ['writestruct(S, filename)', "writestruct(S, filename, 'StructNodeName', 'root')", "writestruct(S, filename, 'FileType', 'json')"],
  },
};

void cellCol; void bool;
