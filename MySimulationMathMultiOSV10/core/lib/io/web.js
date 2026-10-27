// Web access through the GUI host: webread webwrite websave weboptions
// urlread urlwrite, and base64encode / base64decode.
//
// Requests go to ctx.host.request({ type: 'http', method, url, headers, body,
// bodyBase64, responseType: 'text' | 'binary', timeout }) and expect a reply
// { status, statusText, headers: {name: value}, contentType, text?, bodyBase64?, bytes? }
// or { error: 'message' }. Without a host the request fails with an error.
import {
  E, S, N, str, num, tensor, isTextArg, isText, isStruct, isCell, isChar, toTensor, absPath, writeFileBytes, nameValues,
  structScalar, utf8Encode, utf8Decode, extName, bytesToText,
} from './util.js';
import { valueToJson, jsonToValue, parseJsonText } from './json.js';
import { builtins as imageIO } from '../image/imio.js';

// ---------------------------------------------------------------- base64

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
export function toBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = bytes[i + 1], c = bytes[i + 2];
    s += B64[a >> 2] + B64[((a & 3) << 4) | ((b ?? 0) >> 4)] + (b === undefined ? '=' : B64[((b & 15) << 2) | ((c ?? 0) >> 6)]) + (c === undefined ? '=' : B64[c & 63]);
  }
  return s;
}
export function fromBase64(s) {
  const clean = String(s).replace(/[^A-Za-z0-9+/\-_]/g, '').replace(/-/g, '+').replace(/_/g, '/');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0, buf = 0, bits = 0;
  for (const ch of clean) {
    buf = (buf << 6) | B64.indexOf(ch); bits += 6;
    if (bits >= 8) { bits -= 8; out[o++] = (buf >> bits) & 255; }
  }
  return out.slice(0, o);
}

function bytesOfValue(v) {
  if (isChar(v)) return utf8Encode(S(v));
  if (isText(v)) return utf8Encode(S(v));
  return Uint8Array.from(toTensor(v).re, (x) => x & 255);
}

// ---------------------------------------------------------------- options

const OPT_DEFAULTS = {
  CharacterEncoding: 'auto', UserAgent: 'MySimulationMath', Timeout: 5, Username: '', Password: '', KeyName: '', KeyValue: '',
  ContentType: 'auto', ContentReader: null, MediaType: 'auto', RequestMethod: 'auto', ArrayFormat: 'csv', HeaderFields: null, CertificateFilename: 'default',
};

function weboptions(args) {
  const o = nameValues(args, 0);
  const fields = {};
  for (const k of Object.keys(OPT_DEFAULTS)) {
    const key = Object.keys(o).find((x) => x === k.toLowerCase());
    let v = key ? o[key] : undefined;
    if (v === undefined) { const d = OPT_DEFAULTS[k]; v = d === null ? tensor('double', [0, 0]) : typeof d === 'number' ? num(d) : str(d); }
    fields[k] = v;
  }
  for (const k of Object.keys(o)) if (!Object.keys(OPT_DEFAULTS).some((x) => x.toLowerCase() === k)) throw E('io:weboptions:unknownOption', `Unknown option '${k}'.`);
  return structScalar(fields);
}

function optsOf(v) {
  const r = { timeout: 5, contentType: 'auto', mediaType: 'auto', method: 'auto', headers: {}, username: '', password: '', encoding: 'auto' };
  if (!v || !isStruct(v)) return r;
  const g = (k) => v.data[0][k];
  const t = (k) => { const x = g(k); return x && isText(x) ? S(x) : ''; };
  if (g('Timeout')) r.timeout = N(g('Timeout'));
  r.contentType = t('ContentType') || 'auto';
  r.mediaType = t('MediaType') || 'auto';
  r.method = (t('RequestMethod') || 'auto').toUpperCase();
  r.username = t('Username'); r.password = t('Password');
  r.encoding = t('CharacterEncoding') || 'auto';
  if (t('KeyName')) r.headers[t('KeyName')] = t('KeyValue');
  if (t('UserAgent')) r.headers['User-Agent'] = t('UserAgent');
  const hf = g('HeaderFields');
  if (hf && isCell(hf) && hf.dims[1] === 2) { const m = hf.dims[0]; for (let i = 0; i < m; i++) r.headers[S(hf.data[i])] = S(hf.data[i + m]); }
  if (r.username) r.headers.Authorization = 'Basic ' + toBase64(utf8Encode(`${r.username}:${r.password}`));
  return r;
}

/** Splits trailing weboptions struct and name/value query pairs. */
function splitArgs(args, start) {
  let opts = null;
  let rest = args.slice(start);
  if (rest.length && isStruct(rest[rest.length - 1]) && rest[rest.length - 1].fields.includes('Timeout')) { opts = rest[rest.length - 1]; rest = rest.slice(0, -1); }
  return { rest, opts: optsOf(opts) };
}

const enc = (s) => encodeURIComponent(s).replace(/%20/g, '+');
function valueText(v) {
  if (isText(v)) return S(v);
  const a = Array.from(toTensor(v).re);
  return a.map((x) => String(x)).join(',');
}
function queryOf(pairs) {
  const q = [];
  for (let i = 0; i + 1 < pairs.length; i += 2) q.push(`${enc(S(pairs[i]))}=${enc(valueText(pairs[i + 1]))}`);
  return q.join('&');
}

// ---------------------------------------------------------------- transport

export function httpRequest(ctx, msg) {
  let reply = null;
  try { reply = ctx.host && typeof ctx.host.request === 'function' ? ctx.host.request({ type: 'http', ...msg }) : null; } catch (e) {
    throw E('io:web:requestFailed', `The web request failed: ${e.message}`);
  }
  if (reply == null) throw E('io:web:noHost', 'Web access is not available here (no application host to send the request).');
  if (reply.error) throw E('io:web:requestFailed', `The web request to '${msg.url}' failed: ${reply.error}`);
  const status = reply.status ?? 200;
  if (status >= 400) throw E(`io:web:http${status}`, `The server returned the status ${status} with message "${reply.statusText || ''}" in response to the request to URL ${msg.url}.`);
  return reply;
}

function replyBytes(r) {
  if (r.bytes) return r.bytes instanceof Uint8Array ? r.bytes : Uint8Array.from(r.bytes);
  if (r.bodyBase64 != null) return fromBase64(r.bodyBase64);
  if (r.text != null) return utf8Encode(r.text);
  if (r.body != null) return typeof r.body === 'string' ? utf8Encode(r.body) : Uint8Array.from(r.body);
  return new Uint8Array(0);
}
function contentTypeOf(r) {
  if (r.contentType) return String(r.contentType).toLowerCase();
  const h = r.headers || {};
  for (const k of Object.keys(h)) if (k.toLowerCase() === 'content-type') return String(h[k]).toLowerCase();
  return '';
}

/** Converts a response to a value like webread does (JSON → struct, text → char, image → array, else uint8). */
function decodeResponse(r, o, ctx) {
  const ct = contentTypeOf(r);
  const bytes = replyBytes(r);
  const want = o.contentType;
  const text = () => (r.text != null && !r.bytes && r.bodyBase64 == null ? r.text : bytesToText(bytes, o.encoding !== 'auto' ? o.encoding : undefined));
  if (want === 'json' || (want === 'auto' && /json/.test(ct))) {
    const t = text().trim();
    return t ? jsonToValue(parseJsonText(t)) : tensor('double', [0, 0]);
  }
  if (want === 'image' || (want === 'auto' && /^image\//.test(ct))) {
    const ext = /png/.test(ct) ? '.png' : /gif/.test(ct) ? '.gif' : /bmp/.test(ct) ? '.bmp' : /tiff?/.test(ct) ? '.tif' : '.jpg';
    const tmp = ctx.fs.tempDir().replace(/\/$/, '') + '/webread' + Date.now().toString(36) + ext;
    ctx.fs.writeBytes(tmp, bytes);
    try { return imageIO.imread([str(tmp)], 2, ctx); } finally { try { ctx.fs.remove(tmp); } catch { /* ignore */ } }
  }
  if (want === 'text' || (want === 'auto' && (/^text\//.test(ct) || /xml|javascript|csv|html/.test(ct) || !ct))) return str(text());
  if (want === 'binary' || want === 'raw') return tensor('uint8', [bytes.length, 1], bytes);
  return tensor('uint8', [bytes.length, 1], bytes);
}

function bodyOf(data, o) {
  if (isStruct(data) || isCell(data) || (!isText(data) && o.mediaType && /json/.test(o.mediaType))) {
    return { body: valueToJson(data, {}), type: 'application/json' };
  }
  if (isText(data)) return { body: S(data), type: o.mediaType !== 'auto' ? o.mediaType : 'application/x-www-form-urlencoded' };
  const bytes = bytesOfValue(data);
  return { bodyBase64: toBase64(bytes), type: o.mediaType !== 'auto' ? o.mediaType : 'application/octet-stream' };
}

// ---------------------------------------------------------------- builtins

function webread(args, nargout, ctx) {
  if (!args.length) throw E('io:webread:notEnoughInputs', 'Not enough input arguments.');
  let url = S(args[0], 'URL');
  const { rest, opts } = splitArgs(args, 1);
  const q = queryOf(rest);
  if (q) url += (url.includes('?') ? '&' : '?') + q;
  const binary = opts.contentType !== 'text' && opts.contentType !== 'json';
  const r = httpRequest(ctx, { method: opts.method === 'AUTO' ? 'GET' : opts.method, url, headers: opts.headers, responseType: binary ? 'binary' : 'text', timeout: opts.timeout });
  return decodeResponse(r, opts, ctx);
}

function webwrite(args, nargout, ctx) {
  if (args.length < 2) throw E('io:webwrite:notEnoughInputs', 'Not enough input arguments.');
  const url = S(args[0], 'URL');
  const { rest, opts } = splitArgs(args, 1);
  let body;
  if (rest.length === 1) body = bodyOf(rest[0], opts);
  else body = { body: queryOf(rest), type: 'application/x-www-form-urlencoded' };
  const headers = { ...opts.headers, 'Content-Type': body.type };
  const r = httpRequest(ctx, { method: opts.method === 'AUTO' ? 'POST' : opts.method, url, headers, body: body.body, bodyBase64: body.bodyBase64, responseType: 'binary', timeout: opts.timeout });
  return decodeResponse(r, opts, ctx);
}

function websave(args, nargout, ctx) {
  if (args.length < 2) throw E('io:websave:notEnoughInputs', 'Not enough input arguments.');
  const file = S(args[0], 'File name');
  let url = S(args[1], 'URL');
  const { rest, opts } = splitArgs(args, 2);
  const q = queryOf(rest);
  if (q) url += (url.includes('?') ? '&' : '?') + q;
  const r = httpRequest(ctx, { method: opts.method === 'AUTO' ? 'GET' : opts.method, url, headers: opts.headers, responseType: 'binary', timeout: opts.timeout });
  let p = absPath(ctx, file);
  if (!extName(p)) {
    const ct = contentTypeOf(r);
    const ext = /html/.test(ct) ? '.html' : /json/.test(ct) ? '.json' : /png/.test(ct) ? '.png' : /jpe?g/.test(ct) ? '.jpg' : '';
    p += ext;
  }
  writeFileBytes(ctx, p, replyBytes(r));
  return str(p);
}

function urlread(args, nargout, ctx) {
  if (!args.length) throw E('io:urlread:notEnoughInputs', 'Not enough input arguments.');
  let url = S(args[0], 'URL');
  let method = 'GET';
  let params = [];
  let timeout = 5;
  let k = 1;
  if (args[k] && isTextArg(args[k]) && /^(get|post)$/i.test(S(args[k]))) {
    method = S(args[k]).toUpperCase();
    if (args[k + 1] && isCell(args[k + 1])) params = args[k + 1].data;
    k += 2;
  }
  for (; k + 1 < args.length; k += 2) if (/^timeout$/i.test(S(args[k]))) timeout = N(args[k + 1]);
  const q = queryOf(params);
  let body;
  if (q && method === 'GET') url += (url.includes('?') ? '&' : '?') + q; else if (q) body = q;
  try {
    const r = httpRequest(ctx, { method, url, headers: body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}, body, responseType: 'text', timeout });
    const text = r.text != null ? r.text : utf8Decode(replyBytes(r));
    return [str(text), num(1)];
  } catch (e) {
    if (nargout >= 2) return [str(''), num(0)];
    throw e;
  }
}

function urlwrite(args, nargout, ctx) {
  if (args.length < 2) throw E('io:urlwrite:notEnoughInputs', 'Not enough input arguments.');
  const url = S(args[0]); const file = S(args[1]);
  try {
    const r = httpRequest(ctx, { method: 'GET', url, headers: {}, responseType: 'binary', timeout: 5 });
    const p = absPath(ctx, file);
    writeFileBytes(ctx, p, replyBytes(r));
    return [str(p), num(1)];
  } catch (e) {
    if (nargout >= 2) return [str(''), num(0)];
    throw e;
  }
}

function base64encode(args) {
  if (!args.length) throw E('io:base64encode:notEnoughInputs', 'Not enough input arguments.');
  return str(toBase64(bytesOfValue(args[0])));
}
function base64decode(args) {
  if (!args.length) throw E('io:base64decode:notEnoughInputs', 'Not enough input arguments.');
  const b = fromBase64(S(args[0]));
  return tensor('uint8', [1, b.length], b);
}

export const builtins = { webread, webwrite, websave, weboptions, urlread, urlwrite, base64encode, base64decode };

const H = (en, ko, syntax) => ({ en, ko, syntax });
export const help = {
  webread: H('Read content from a web service (GET).', '웹 서비스에서 내용을 읽습니다 (GET).', ['data = webread(url)', 'data = webread(url, QueryName1, QueryValue1, ...)', 'data = webread(___, options)']),
  webwrite: H('Write data to a web service (POST).', '웹 서비스에 데이터를 씁니다 (POST).', ['response = webwrite(url, PostName1, PostValue1, ...)', 'response = webwrite(url, data)', 'response = webwrite(___, options)']),
  websave: H('Save content from a web service to a file.', '웹 서비스의 내용을 파일로 저장합니다.', ['outfilename = websave(filename, url)', 'outfilename = websave(filename, url, QueryName1, QueryValue1, ...)', 'outfilename = websave(___, options)']),
  weboptions: H('Options for web requests.', '웹 요청 옵션.', ['options = weboptions', 'options = weboptions(Name, Value)']),
  urlread: H('Read the content at a URL as text.', 'URL의 내용을 텍스트로 읽습니다.', ['str = urlread(URL)', "str = urlread(URL, 'get', params)", "str = urlread(URL, 'post', params)", '[str, status] = urlread(___)']),
  urlwrite: H('Save the content at a URL to a file.', 'URL의 내용을 파일로 저장합니다.', ['urlwrite(URL, filename)', '[filename, status] = urlwrite(___)']),
  base64encode: H('Encode bytes or text as Base64 text.', '바이트나 텍스트를 Base64 텍스트로 인코딩합니다.', ['b64 = base64encode(V)']),
  base64decode: H('Decode Base64 text into bytes (uint8).', 'Base64 텍스트를 바이트(uint8)로 디코딩합니다.', ['V = base64decode(b64)']),
};
