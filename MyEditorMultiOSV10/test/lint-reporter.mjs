// node --test reporter: lint "Language / tool" cases as a table, other
// tests as a short list. Replaces TAP so `npm test` is readable.
import { formatGrandTotal, formatLintReport, formatOtherTests } from './lint-report.mjs';

const LINT_NAME = /^(.+?) \/ (\S+)$/;

export default async function* reporter(source) {
  const finished = [];
  const notes = [];
  for await (const ev of source) {
    if (ev.type === 'test:diagnostic') {
      const msg = ev.data && ev.data.message;
      if (msg) notes.push(String(msg));
      continue;
    }
    if (ev.type !== 'test:pass' && ev.type !== 'test:fail') continue;
    const d = ev.data || {};
    if (isFileSuite(d)) continue;
    finished.push({ ev, d });
  }
  const lint = [];
  const other = [];
  for (const { ev, d } of finished) {
    const name = String(d.name || '');
    const skip = d.skip || (d.details && d.details.skip);
    const status = ev.type === 'test:fail' ? 'fail' : skip ? 'skip' : 'ok';
    const err = ev.type === 'test:fail' ? failMessage(d) : '';
    const note = takeNote(notes, name);
    const skipReason = typeof skip === 'string' && skip !== 'true' ? skip : '';
    const detail = status === 'skip' ? (skipReason || note || '건너뜀') : (note || err);
    const m = LINT_NAME.exec(name);
    if (m) lint.push({ language: m[1], tool: m[2], status, detail });
    else other.push({ name, status, detail });
  }
  let out = '';
  if (lint.length) out += formatLintReport(lint);
  if (other.length) out += formatOtherTests(other);
  out += formatGrandTotal(lint, other);
  if (!out.trim()) out = '\n(테스트 없음)\n';
  yield out;
}

function isFileSuite(d) {
  return /\.(mjs|js|cjs)$/i.test(String(d.name || ''));
}

function failMessage(d) {
  const e = d.details && d.details.error;
  if (!e) return '';
  return String(e.message || e.cause || '').split('\n')[0];
}

function takeNote(notes, name) {
  const prefix = 'lint-row\t';
  for (let i = notes.length - 1; i >= 0; i--) {
    if (!notes[i].startsWith(prefix)) continue;
    const parts = notes[i].slice(prefix.length).split('\t');
    if (parts.length >= 3 && `${parts[0]} / ${parts[1]}` === name) {
      notes.splice(i, 1);
      return parts.slice(3).join('\t');
    }
  }
  return '';
}
