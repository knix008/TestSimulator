// C-style stream helpers of the GNU Octave function set: stdin / stdout /
// stderr, SEEK_SET / SEEK_CUR / SEEK_END, printf / puts / fputs / fdisp /
// fflush / fclear / fskipl / freport / is_valid_file_id / native_float_format,
// scanf (reads one line through the Command Window input request), textread
// (legacy column reader on top of the textscan engine) and web (opens a URL
// through the application host).
import {
  E, S, N, str, num, bool, tensor, cell, isTextArg, isText, isTensor, toTensor, readFileBytes, bytesToText, nameValues,
} from './util.js';
import { fileTable, getFile, tryGetFile, writeTextFid } from './files.js';
import { textscanCore, textscanOptions, tsCell } from './textio.js';

const fidOf = (v) => { try { return N(v); } catch { return NaN; } };

/** Text of a char/string argument, without format processing. */
function rawText(v) {
  if (isTensor(v) && v.cls === 'char') {
    let s = '';
    const [m, n] = v.dims;
    // character matrices are written column-major like fwrite does
    for (let k = 0; k < m * n; k++) s += String.fromCharCode(v.re[k]);
    return s;
  }
  return S(v);
}

// ---------------------------------------------------------------- constants

function stdin() { return num(0); }
function stdout() { return num(1); }
function stderr() { return num(2); }
// Octave uses the numeric origins -1 / 0 / 1 (also accepted by fseek).
function SEEK_SET() { return num(-1); }
function SEEK_CUR() { return num(0); }
function SEEK_END() { return num(1); }
function native_float_format() { return str('ieee-le'); }

// ---------------------------------------------------------------- output

function printf(args, nargout, ctx) {
  if (!args.length) throw E('io:printf:notEnoughInputs', 'Not enough input arguments.');
  if (!isText(args[0])) throw E('io:printf:invalidFormat', 'The format must be a character vector or string scalar.');
  ctx.call('fprintf', [num(1), ...args], 0);
  return undefined;
}

function puts(args, nargout, ctx) {
  if (args.length !== 1) throw E('io:puts:wrongInputs', 'puts needs exactly one argument: puts(string).');
  ctx.out(rawText(args[0]));
  return nargout > 0 ? num(0) : undefined;
}

function fputs(args, nargout, ctx) {
  if (args.length !== 2) throw E('io:fputs:wrongInputs', 'fputs needs two arguments: fputs(fid, string).');
  const fid = fidOf(args[0]);
  if (fid === 0) throw E('io:fputs:readOnly', 'The standard input cannot be written to.');
  if (fid !== 1 && fid !== 2) {
    const f = getFile(ctx, args[0], 'fputs');
    if (!f.canWrite) throw E('io:fputs:readOnly', 'The file was opened for reading only.');
  }
  writeTextFid(ctx, fid, rawText(args[1]));
  return nargout > 0 ? num(0) : undefined;
}

function fdisp(args, nargout, ctx) {
  if (args.length !== 2) throw E('io:fdisp:wrongInputs', 'fdisp needs two arguments: fdisp(fid, x).');
  const fid = fidOf(args[0]);
  if (fid !== 1 && fid !== 2) getFile(ctx, args[0], 'fdisp');
  const r = ctx.call('formattedDisplayText', [args[1]], 1)[0];
  writeTextFid(ctx, fid, S(r));
  return undefined;
}

function fflush(args, nargout, ctx) {
  if (args.length !== 1) throw E('io:fflush:wrongInputs', 'fflush needs one argument: fflush(fid).');
  const fid = fidOf(args[0]);
  if (fid === 0 || fid === 1 || fid === 2) return nargout > 0 ? num(0) : undefined;
  const f = tryGetFile(ctx, fid);
  if (!f) { if (nargout > 0) return num(-1); throw E('io:fflush:invalidFid', 'Invalid file identifier. Use fopen to generate a valid file identifier.'); }
  f.flush(ctx);
  return nargout > 0 ? num(0) : undefined;
}

function fclear(args, nargout, ctx) {
  if (args.length !== 1) throw E('io:fclear:wrongInputs', 'fclear needs one argument: fclear(fid).');
  const fid = fidOf(args[0]);
  if (fid === 0 || fid === 1 || fid === 2) return undefined;
  const f = getFile(ctx, args[0], 'fclear');
  f.eofHit = false; f.err = '';
  return undefined;
}

function fskipl(args, nargout, ctx) {
  if (!args.length) throw E('io:fskipl:notEnoughInputs', 'Not enough input arguments.');
  const f = getFile(ctx, args[0], 'fskipl');
  f.checkRead();
  let want = args[1] !== undefined ? N(args[1]) : 1;
  if (!(want >= 0)) throw E('io:fskipl:badCount', 'The number of lines must be a nonnegative integer or Inf.');
  if (want !== Infinity) want = Math.floor(want);
  const b = f.bytes();
  let n = 0, p = f.pos;
  while (n < want && p < f.len) {
    const c = b[p++];
    if (c === 10) n++;
    else if (c === 13) { if (p < f.len && b[p] === 10) p++; n++; }
  }
  f.pos = p;
  if (p >= f.len) f.eofHit = true;
  return num(n);
}

const STD_ROWS = [[0, 'r', 'stdin'], [1, 'w', 'stdout'], [2, 'w', 'stderr']];

function freport(args, nargout, ctx) {
  const rows = STD_ROWS.map(([fid, mode, name]) => [fid, mode, 'ieee-le', name]);
  for (const f of fileTable(ctx).open.values()) rows.push([f.fid, f.perm.canon.replace('t', ''), f.mfmt === 'b' ? 'ieee-be' : 'ieee-le', f.name]);
  let t = '\n  number  mode  arch       name\n  ------  ----  ----       ----\n';
  for (const [fid, mode, arch, name] of rows) t += `  ${String(fid).padStart(4)}     ${mode.padEnd(4)}  ${arch.padEnd(9)}  ${name}\n`;
  ctx.out(t + '\n');
  return undefined;
}

function is_valid_file_id(args, nargout, ctx) {
  if (args.length !== 1) throw E('io:is_valid_file_id:wrongInputs', 'is_valid_file_id needs one argument.');
  const v = args[0];
  if (!isTensor(v) || v.cls === 'char' || v.re.length !== 1) return bool(false);
  const fid = v.re[0];
  return bool(fid === 0 || fid === 1 || fid === 2 || !!tryGetFile(ctx, fid));
}

// ---------------------------------------------------------------- input

function scanf(args, nargout, ctx) {
  if (!args.length) throw E('io:scanf:notEnoughInputs', 'Not enough input arguments.');
  let reply = null;
  try { reply = ctx.host && typeof ctx.host.request === 'function' ? ctx.host.request({ type: 'input', prompt: '', text: true }) : null; } catch { reply = null; }
  if (reply == null) throw E('io:scanf:noInput', 'Reading the standard input is not available (no interactive Command Window).');
  const text = typeof reply === 'string' ? reply : String(reply.text ?? reply.value ?? '');
  return ctx.call('sscanf', [str(text), ...args.slice(0, 2)], Math.max(1, nargout));
}

// ---------------------------------------------------------------- textread

const TEXTREAD_OPTS = ['delimiter', 'headerlines', 'endofline', 'whitespace', 'multipledelimsasone', 'commentstyle', 'emptyvalue', 'treatasempty', 'returnonerror', 'bufsize'];

function textread(args, nargout, ctx) {
  if (!args.length) throw E('io:textread:notEnoughInputs', 'Not enough input arguments.');
  const file = S(args[0], 'File name');
  let k = 1;
  let fmt = '%f';
  if (args[k] !== undefined && isTextArg(args[k]) && !TEXTREAD_OPTS.includes(S(args[k]).toLowerCase())) fmt = S(args[k++]);
  let repeat = Infinity;
  if (args[k] !== undefined && !isTextArg(args[k])) { const r = Array.from(toTensor(args[k++]).re); repeat = r.length && r[0] >= 0 ? r[0] : Infinity; }
  const o = nameValues(args, k);
  for (const key of Object.keys(o)) if (!TEXTREAD_OPTS.includes(key)) throw E('io:textread:unknownOption', `Unknown option '${key}'.`);
  delete o.bufsize;
  const opts = textscanOptions(o);
  opts.repeat = repeat;
  if (o.commentstyle !== undefined) {
    // textread's comment styles are names: shell (#), c (/* */), c++ (//); other
    // texts are used as the comment marker itself (for example '%')
    const map = { shell: ['#'], c: ['/*', '*/'], 'c++': ['//'] };
    const name = S(o.commentstyle).toLowerCase();
    if (map[name]) opts.comment = map[name];
  }
  const text = bytesToText(readFileBytes(ctx, file, 'io:textread:fileNotFound'));
  const r = textscanCore(text, fmt, opts);
  const outs = tsCell(r.cols, false).data;
  if (nargout > outs.length) throw E('io:textread:tooManyOutputs', `The format has ${outs.length} conversion(s) but ${nargout} outputs were requested.`);
  return outs.length ? outs : tensor('double', [0, 0]);
}

// ---------------------------------------------------------------- web

function web(args, nargout, ctx) {
  let url = '';
  const flags = [];
  for (const a of args) {
    const s = S(a);
    if (/^-(new|notoolbar|noaddressbox|browser)$/i.test(s)) flags.push(s.toLowerCase());
    else if (!url) url = s;
    else throw E('io:web:badOption', `Unknown option '${s}'.`);
  }
  if (url && !/^[a-z][a-z0-9+.-]*:/i.test(url)) {
    // a local file name: open it as a file URL
    try { const p = url.startsWith('/') || /^[A-Za-z]:/.test(url) ? url : `${ctx.fs.cwd().replace(/\/$/, '')}/${url}`; if (ctx.fs.exists(p)) url = 'file:///' + p.replace(/^\//, ''); else url = 'https://' + url; } catch { url = 'https://' + url; }
  }
  let reply = null;
  try {
    reply = ctx.host && typeof ctx.host.request === 'function'
      ? ctx.host.request({ type: 'web.open', url, browser: flags.includes('-browser'), newWindow: flags.includes('-new'), toolbar: !flags.includes('-notoolbar'), addressBox: !flags.includes('-noaddressbox') })
      : null;
  } catch { reply = null; }
  // status: 0 = opened, 1 = could not open the page, 2 = no browser available
  let status = 2;
  if (reply != null) status = reply === true || reply.ok || reply.status === 0 ? 0 : (reply.status ?? 1);
  if (nargout === 0) {
    if (status !== 0) ctx.warning('io:web:notOpened', status === 2 ? 'No web browser is available here (no application host).' : `The page '${url}' could not be opened.`);
    return undefined;
  }
  return [num(status), tensor('double', [0, 0]), str(url)];
}

export const builtins = {
  stdin, stdout, stderr, SEEK_SET, SEEK_CUR, SEEK_END, native_float_format,
  printf, puts, fputs, fdisp, fflush, fclear, fskipl, freport, is_valid_file_id, scanf, textread, web,
};
void cell;

const H = (en, ko, syntax) => ({ en, ko, syntax });
export const help = {
  stdin: H('File identifier of the standard input (0).', '표준 입력의 파일 식별자(0).', ['fid = stdin']),
  stdout: H('File identifier of the standard output (1), the Command Window.', '표준 출력(명령 창)의 파일 식별자(1).', ['fid = stdout']),
  stderr: H('File identifier of the standard error output (2).', '표준 오류 출력의 파일 식별자(2).', ['fid = stderr']),
  SEEK_SET: H('fseek origin: the beginning of the file (-1).', 'fseek 기준점: 파일의 처음(-1).', ['origin = SEEK_SET', 'fseek(fid, offset, SEEK_SET)']),
  SEEK_CUR: H('fseek origin: the current position (0).', 'fseek 기준점: 현재 위치(0).', ['origin = SEEK_CUR', 'fseek(fid, offset, SEEK_CUR)']),
  SEEK_END: H('fseek origin: the end of the file (1).', 'fseek 기준점: 파일의 끝(1).', ['origin = SEEK_END', 'fseek(fid, offset, SEEK_END)']),
  native_float_format: H("Native floating-point format of the machine ('ieee-le').", "이 컴퓨터의 기본 부동소수점 형식('ieee-le').", ['fmt = native_float_format()']),
  printf: H('Print formatted text to the Command Window (fprintf to stdout).', '서식화된 텍스트를 명령 창에 출력합니다 (stdout으로 fprintf).', ['printf(template, ...)']),
  puts: H('Write a string to the Command Window without formatting.', '문자열을 서식 처리 없이 명령 창에 씁니다.', ['puts(string)', 'status = puts(string)']),
  fputs: H('Write a string to a file without formatting.', '문자열을 서식 처리 없이 파일에 씁니다.', ['fputs(fid, string)', 'status = fputs(fid, string)']),
  fdisp: H('Display a value (like disp) into a file.', '값을 disp처럼 파일에 표시합니다.', ['fdisp(fid, x)']),
  fflush: H('Flush the buffered output of a file to disk.', '파일의 버퍼에 있는 출력을 디스크에 씁니다.', ['fflush(fid)', 'status = fflush(fid)']),
  fclear: H('Clear the end-of-file and error state of a file.', '파일의 파일 끝/오류 상태를 지웁니다.', ['fclear(fid)']),
  fskipl: H('Skip lines in a file and return how many were skipped.', '파일에서 줄을 건너뛰고 건너뛴 줄 수를 돌려줍니다.', ['nlines = fskipl(fid)', 'nlines = fskipl(fid, count)', 'nlines = fskipl(fid, Inf)']),
  freport: H('List the open files with their mode and format.', '열린 파일 목록을 모드·형식과 함께 표시합니다.', ['freport()']),
  is_valid_file_id: H('True when the argument is an open file identifier.', '인수가 열린 파일 식별자이면 참입니다.', ['tf = is_valid_file_id(fid)']),
  scanf: H('Read formatted data from the standard input (one line typed in the Command Window).', '표준 입력(명령 창에 입력한 한 줄)에서 서식화된 데이터를 읽습니다.', ['[val, count, errmsg] = scanf(template, size)', 'val = scanf(template)']),
  textread: H('Read columns of formatted data from a text file into separate outputs.', '텍스트 파일의 서식화된 열들을 각각의 출력으로 읽습니다.', ['[a, ...] = textread(filename)', '[a, ...] = textread(filename, format)', '[a, ...] = textread(filename, format, n)', '[a, ...] = textread(___, prop, value)']),
  web: H('Open a URL or a file in the web browser.', 'URL이나 파일을 웹 브라우저에서 엽니다.', ['web(url)', 'web(url, option)', '[status, h, url] = web(___)']),
};
