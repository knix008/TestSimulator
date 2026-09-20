// Error → a structured popup: a short explanation, labelled facts (code /
// path / server reply), and a stack kept for copy / "technical details".
import { t } from './i18n.js';

const CODE_HINT = {
  ECONNREFUSED: 'err_refused',
  ETIMEDOUT: 'err_timeout',
  ETIME: 'err_timeout',
  ENOTFOUND: 'err_notfound',
  EAI_AGAIN: 'err_notfound',
  ECONNRESET: 'err_reset',
  EPIPE: 'err_reset',
  EHOSTUNREACH: 'err_unreachable',
  ENETUNREACH: 'err_unreachable',
  EACCES: 'err_denied',
  EPERM: 'err_denied',
  ENOENT: 'err_enoent',
  EEXIST: 'err_eexist',
  EISDIR: 'err_eisdir',
  ENOTDIR: 'err_enotdir',
  ENOSPC: 'err_enospc',
  NOT_CONNECTED: 'err_not_connected',
  EINVAL: 'err_invalid',
  ECONNABORTED: 'err_reset',
};

const MSG_HINTS = [
  [/login incorrect|530\s+\S*login/i, 'err_login'],
  [/authentication methods failed|authentication failed/i, 'err_auth'],
  [/timed out|ETIMEDOUT|Timeout/i, 'err_timeout'],
  [/ECONNREFUSED|connection refused/i, 'err_refused'],
  [/ENOTFOUND|getaddrinfo|unknown host/i, 'err_notfound'],
  [/ECONNRESET|connection reset|socket hang up/i, 'err_reset'],
  [/TLS not supported|AUTH TLS|only AUTH TLS/i, 'err_tls'],
  [/not connected/i, 'err_not_connected'],
  [/no such file or directory|ENOENT/i, 'err_enoent'],
  [/permission denied/i, 'err_denied'],
  [/already exists|EEXIST/i, 'err_eexist'],
  [/connection lost|connection closed/i, 'err_closed'],
];

const REPLY_HINT = {
  530: 'err_login',
  550: 'err_ftp_550',
  553: 'err_invalid',
  421: 'err_ftp_421',
  425: 'err_ftp_425',
  426: 'err_ftp_425',
  452: 'err_enospc',
};

function firstLine(s) {
  return String(s || '').split(/\r?\n/).map((l) => l.trim()).find(Boolean) || '';
}

function stripErrorPrefix(s) {
  return String(s || '').replace(/^(?:Error|TypeError|RangeError):\s*/i, '').trim();
}

function parseLabeled(text, into) {
  if (!text) return;
  for (const raw of String(text).split(/\r?\n/)) {
    const m = /^(code|path|syscall|errno)\s*:\s*(.+)$/i.exec(raw.trim());
    if (!m) continue;
    const key = m[1].toLowerCase() === 'errno' ? 'code' : m[1].toLowerCase();
    if (!into[key]) into[key] = m[2].trim();
  }
}

function extractFromText(text, into) {
  if (!text) return;
  const s = String(text);
  const code = /\b(ECONNREFUSED|ENOTFOUND|ETIMEDOUT|ECONNRESET|EHOSTUNREACH|ENETUNREACH|EACCES|EPERM|ENOENT|EEXIST|EISDIR|ENOTDIR|ENOSPC|EPIPE|EAI_AGAIN|NOT_CONNECTED|EINVAL|ECONNABORTED)\b/.exec(s);
  if (code && !into.code) into.code = code[1];
  const ftp = /(?:^|\s)([1-5]\d\d)\s+([A-Za-z].+?)(?:\s*$|\n)/m.exec(s);
  if (ftp && !into.reply) into.reply = `${ftp[1]} ${ftp[2].trim()}`;
  const p = /,\s*(?:open|stat|lstat|mkdir|rmdir|unlink|rename|scandir|read|write)\s+'([^']+)'/.exec(s);
  if (p && !into.path) into.path = p[1];
  const addr = /\b((?:\d{1,3}\.){3}\d{1,3}:\d+)\b/.exec(s) || /\b((?:\[[^\]]+\]|[A-Za-z0-9.-]+):\d{2,5})\b/.exec(s);
  if (addr && !into.target) into.target = addr[1];
}

function extractStack(text) {
  if (!text) return '';
  const lines = String(text).split(/\r?\n/);
  const start = lines.findIndex((l) => /^\s*at\s+/.test(l));
  if (start < 0) return '';
  const from = start > 0 && /Error\b/.test(lines[start - 1]) ? start - 1 : start;
  return lines.slice(from).join('\n').trim();
}

function hintKey(code, message, reply) {
  if (code && CODE_HINT[code]) return CODE_HINT[code];
  const replyCode = reply && /^(\d{3})\b/.exec(reply);
  if (replyCode) {
    const n = replyCode[1];
    if (n === '502' || n === '504') {
      if (/TLS|AUTH/i.test(reply)) return 'err_tls';
    }
    if (REPLY_HINT[n]) return REPLY_HINT[n];
  }
  const blob = `${code || ''} ${message || ''}`;
  for (const [re, key] of MSG_HINTS) {
    if (re.test(blob)) return key;
  }
  return '';
}

function addField(fields, key, label, value) {
  const v = String(value || '').trim();
  if (!v) return;
  if (fields.some((f) => f.key === key || f.value === v)) return;
  fields.push({ key, label, value: v });
}

// Splits an Error (or a plain message + optional detail blob) into what the
// error dialog shows.
export function describeError(err, extra) {
  if (!err && !extra) return { message: t('error_unexpected'), fields: [], detail: '' };

  const obj = err && typeof err === 'object' ? err : null;
  const message = obj ? (obj.message || String(err)) : (typeof err === 'string' ? err : '');
  const extraText = extra ? String(extra) : '';
  const info = {
    code: obj && obj.code && obj.code !== 'ERROR' ? String(obj.code) : '',
    path: obj && obj.path ? String(obj.path) : '',
    syscall: obj && obj.syscall ? String(obj.syscall) : '',
    reply: '',
    target: '',
  };
  parseLabeled(message, info);
  parseLabeled(extraText, info);
  extractFromText(message, info);
  extractFromText(extraText, info);

  const stack = extractStack(obj && obj.stack ? obj.stack : '') || extractStack(extraText);
  const key = hintKey(info.code, `${message}\n${extraText}`, info.reply);
  const friendly = key ? t(key) : (stripErrorPrefix(firstLine(message)) || t('error_unexpected'));

  const fields = [];
  addField(fields, 'code', t('error_code'), info.code);
  addField(fields, 'path', t('error_path'), info.path);
  addField(fields, 'target', t('error_target'), info.target);
  addField(fields, 'reply', t('error_reply'), info.reply);
  addField(fields, 'syscall', t('error_syscall'), info.syscall);

  const original = stripErrorPrefix(firstLine(message));
  if (original && original !== friendly && !fields.some((f) => f.value === original)) {
    addField(fields, 'original', t('error_original'), original);
  }

  // A short, already-localised string (host required, not connected, …) with
  // no extra blob stays a one-line dialog.
  if (typeof err === 'string' && !extraText && !info.code && !info.path && !key) {
    return { message: err, fields: [], detail: '' };
  }

  return { message: friendly, fields, detail: stack };
}

export function formatErrorCopy(spec) {
  const lines = [spec.title || t('dlg_error'), '', spec.message || ''];
  for (const f of spec.fields || []) lines.push(`${f.label}: ${f.value}`);
  if (spec.detail) lines.push('', `${t('error_tech')}:`, spec.detail);
  return lines.filter((l, i) => !(l === '' && i > 2 && lines[i - 1] === '')).join('\n').trim();
}
