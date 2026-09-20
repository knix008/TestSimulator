// Incremental console decoder: UTF-8 first, CP949/EUC-KR if the bytes are
// not valid UTF-8. Windows shells often speak the OEM Korean code page until
// we switch them to UTF-8; a split multi-byte character must not be decoded
// across chunk boundaries.
'use strict';

function utf8IncompleteTail(buf) {
  if (!buf.length) return 0;
  let i = buf.length - 1;
  let cont = 0;
  while (i >= 0 && (buf[i] & 0xC0) === 0x80 && cont < 3) {
    cont += 1;
    i -= 1;
  }
  if (i < 0) return buf.length;
  const lead = buf[i];
  const need = lead >= 0xF0 ? 3 : lead >= 0xE0 ? 2 : lead >= 0xC0 ? 1 : 0;
  if (need && cont < need) return cont + 1;
  return 0;
}

function validUtf8(buf) {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buf);
    return true;
  } catch {
    return false;
  }
}

function decodeKorean(buf) {
  try {
    return new TextDecoder('euc-kr').decode(buf);
  } catch {
    try {
      return new TextDecoder('windows-949').decode(buf);
    } catch {
      return buf.toString('utf8');
    }
  }
}

class ConsoleDecoder {
  constructor() {
    this.pending = Buffer.alloc(0);
    this.enc = null;
  }

  push(chunk) {
    if (chunk == null) return '';
    const raw = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), 'utf8');
    if (!raw.length) return '';
    const data = this.pending.length ? Buffer.concat([this.pending, raw], this.pending.length + raw.length) : raw;
    this.pending = Buffer.alloc(0);

    if (this.enc === 'euc-kr') return decodeKorean(data);

    const tail = utf8IncompleteTail(data);
    const head = tail ? data.subarray(0, data.length - tail) : data;
    this.pending = tail ? Buffer.from(data.subarray(data.length - tail)) : Buffer.alloc(0);
    if (!head.length) return '';
    if (this.enc === 'utf8' || validUtf8(head)) {
      if (!this.enc && head.some((b) => b >= 0x80)) this.enc = 'utf8';
      return head.toString('utf8');
    }
    this.enc = 'euc-kr';
    const all = this.pending.length ? Buffer.concat([head, this.pending]) : head;
    this.pending = Buffer.alloc(0);
    return decodeKorean(all);
  }
}

function utf8LocaleEnv() {
  const env = { PYTHONIOENCODING: 'utf-8' };
  if (process.platform === 'win32') return env;
  if (!/utf-?8/i.test(process.env.LANG || '') || !/utf-?8/i.test(process.env.LC_ALL || '')) {
    env.LANG = process.env.LANG && /utf-?8/i.test(process.env.LANG) ? process.env.LANG : 'C.UTF-8';
    env.LC_ALL = env.LANG;
    env.LC_CTYPE = env.LANG;
  }
  return env;
}

function unescapeClixml(s) {
  return String(s).replace(/_x([0-9A-Fa-f]{4})_/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function extractClixmlText(xml) {
  const parts = [];
  const re = /<S S="(Error|Warning)">(.*?)<\/S>/gs;
  let m;
  while ((m = re.exec(xml))) parts.push(unescapeClixml(m[2]));
  return parts.join('');
}

// PowerShell writes "#< CLIXML" plus a serialized document to stderr whenever
// stdin/stdout/stderr are pipes. Progress records are noise; keep Error/Warning.
class ClixmlFilter {
  constructor() {
    this.pending = '';
  }

  push(text) {
    if (!text) return '';
    let s = this.pending + text;
    this.pending = '';
    let out = '';
    for (;;) {
      const i = s.search(/#<\s*CLIXML/i);
      if (i < 0) {
        out += s;
        return out;
      }
      out += s.slice(0, i);
      const rest = s.slice(i);
      const nl = rest.search(/\r?\n/);
      if (nl < 0) {
        this.pending = rest;
        return out;
      }
      const afterNl = rest[nl] === '\r' && rest[nl + 1] === '\n' ? 2 : 1;
      const after = rest.slice(nl + afterNl);
      if (!after) {
        this.pending = rest;
        return out;
      }
      if (!after.startsWith('<')) {
        s = after;
        continue;
      }
      const close = after.search(/<\/Objs>/i);
      if (close < 0) {
        this.pending = rest;
        return out;
      }
      out += extractClixmlText(after.slice(0, close + 7));
      s = after.slice(close + 7).replace(/^\r?\n/, '');
    }
  }
}

module.exports = { ConsoleDecoder, utf8LocaleEnv, ClixmlFilter };
