'use strict';

// Quick fixes for the IDE.
//
// Fix model (what an analyzer may return on a Finding, next to `rule`/`line`):
//
//   fix:   { title: { en, ko }, edits: Edit[] }          // one fix
//   fixes: [{ title: { en, ko }, edits: Edit[] }, ...]   // or several
//   Edit = {
//     file?: 'src/a.c',          // root-relative; defaults to the finding's file
//     line, column,              // 1-based start
//     endLine, endColumn,        // 1-based, exclusive end (same as findings)
//     text: 'replacement',       // '' deletes the range
//   }
//
// To delete whole lines use column 1 on `line` and column 1 on `endLine + 1`.
// The LSP server turns these into WorkspaceEdits. Until core/analyze.js copies
// `fix`/`fixes` from engine findings onto issues, the built-in providers below
// cover the common line rules, and every issue gets the two generic actions:
// suppress with NOSONAR, and deactivate the rule.

const { commentKind, detectLanguage } = require('../languages');

// Splits a line into code segments outside string literals and line comments,
// for slash-comment languages. Returns [{ start, end }] of code.
function codeSegments(line, opts = {}) {
  const segs = [];
  let start = 0;
  let i = 0;
  while (i < line.length) {
    const ch = line[i];
    if (ch === '"' || ch === "'" || (ch === '`' && opts.backtick !== false)) {
      if (i > start) segs.push({ start, end: i });
      let j = i + 1;
      while (j < line.length && line[j] !== ch) j += line[j] === '\\' ? 2 : 1;
      i = j + 1;
      start = i;
      continue;
    }
    if (ch === '/' && line[i + 1] === '/' && opts.slash !== false) break;
    if (ch === '#' && opts.hash) break;
    i++;
  }
  const end = Math.min(i, line.length);
  if (end > start) segs.push({ start, end });
  return segs;
}

function wholeLineDelete(line) {
  return { line, column: 1, endLine: line + 1, endColumn: 1, text: '' };
}

const T = (en, ko) => ({ en, ko });

const PROVIDERS = {
  'common:trailing-space': (issue, lines) => {
    const t = lines[issue.line - 1];
    if (t == null) return null;
    const trimmed = t.replace(/[ \t]+$/, '');
    if (trimmed.length === t.length) return null;
    return { title: T('Remove trailing whitespace', '줄 끝 공백 지우기'), edits: [{ line: issue.line, column: trimmed.length + 1, endLine: issue.line, endColumn: t.length + 1, text: '' }] };
  },
  'js:var': (issue, lines) => {
    const t = lines[issue.line - 1] || '';
    for (const seg of codeSegments(t)) {
      const m = /\bvar(\s+)(?=[A-Za-z_$])/.exec(t.slice(seg.start, seg.end));
      if (m) {
        const col = seg.start + m.index + 1;
        return { title: T("Replace 'var' with 'let'", "'var'를 'let'으로 바꾸기"), edits: [{ line: issue.line, column: col, endLine: issue.line, endColumn: col + 3, text: 'let' }] };
      }
    }
    return null;
  },
  'js:eqeq': (issue, lines) => {
    const t = lines[issue.line - 1] || '';
    const edits = [];
    for (const seg of codeSegments(t)) {
      const part = t.slice(seg.start, seg.end);
      const re = /(^|[^=!<>])(==|!=)(?!=)/g;
      let m;
      while ((m = re.exec(part))) {
        const col = seg.start + m.index + m[1].length + 1;
        edits.push({ line: issue.line, column: col, endLine: issue.line, endColumn: col + 2, text: m[2] === '==' ? '===' : '!==' });
      }
    }
    if (!edits.length) return null;
    return { title: T('Use strict equality (=== / !==)', '엄격한 비교(=== / !==) 쓰기'), edits };
  },
  'js:debugger': (issue, lines) => {
    const t = lines[issue.line - 1] || '';
    if (/^\s*debugger\s*;?\s*$/.test(t)) return { title: T("Remove 'debugger'", "'debugger' 지우기"), edits: [wholeLineDelete(issue.line)] };
    for (const seg of codeSegments(t)) {
      const m = /\bdebugger\s*;?\s*/.exec(t.slice(seg.start, seg.end));
      if (m) {
        const col = seg.start + m.index + 1;
        return { title: T("Remove 'debugger'", "'debugger' 지우기"), edits: [{ line: issue.line, column: col, endLine: issue.line, endColumn: col + m[0].length, text: '' }] };
      }
    }
    return null;
  },
  'js:console-log': (issue, lines) => {
    const t = lines[issue.line - 1] || '';
    const m = /^\s*console\.(?:log|debug|info)\s*\((.*)\)\s*;?\s*$/.exec(t);
    if (!m) return null;
    let depth = 0;
    for (const ch of m[1]) {
      if (ch === '(') depth++;
      else if (ch === ')' && --depth < 0) return null;
    }
    if (depth !== 0) return null;
    return { title: T('Remove the console call', 'console 호출 지우기'), edits: [wholeLineDelete(issue.line)] };
  },
  'py:bare-except': (issue, lines) => {
    const t = lines[issue.line - 1] || '';
    const m = /^(\s*except)(\s*):/.exec(t);
    if (!m) return null;
    return { title: T("Catch 'Exception' instead", "'Exception'을 잡도록 바꾸기"), edits: [{ line: issue.line, column: m[1].length + 1, endLine: issue.line, endColumn: m[1].length + m[2].length + 1, text: ' Exception' }] };
  },
};

// Fixes for an issue: analyzer-provided first, then built-in providers.
function fixesFor(issue, lines) {
  const out = [];
  if (issue.fix && Array.isArray(issue.fix.edits)) out.push(issue.fix);
  if (Array.isArray(issue.fixes)) for (const f of issue.fixes) if (f && Array.isArray(f.edits)) out.push(f);
  const provider = PROVIDERS[issue.rule];
  if (provider && lines) {
    try {
      const f = provider(issue, lines);
      if (f) out.push(f);
    } catch { /* a provider never breaks code actions */ }
  }
  return out;
}

const COMMENT = { slash: '//', hash: '#', dash: '--' };

// Edit that appends a NOSONAR marker to the issue line, or null when the
// language has no line comment.
function suppressionEdit(issue, lines, filePath) {
  const lang = issue.language || detectLanguage(filePath || issue.file) || '';
  const kind = commentKind(lang);
  const t = lines[issue.line - 1];
  if (t == null) return null;
  if (/NOSONAR/.test(t)) return null;
  const trimmedLen = t.replace(/\s+$/, '').length;
  let marker;
  if (COMMENT[kind]) {
    const prefix = COMMENT[kind];
    // Already ends in a line comment: append inside it.
    const segs = kind === 'slash' ? codeSegments(t) : kind === 'hash' ? codeSegments(t, { slash: false, hash: true, backtick: false }) : null;
    const codeEnd = segs && segs.length ? segs[segs.length - 1].end : trimmedLen;
    const hasComment = segs ? t.slice(codeEnd).trimStart().startsWith(prefix) : false;
    marker = hasComment ? ' NOSONAR' : ` ${prefix} NOSONAR`;
  } else if (kind === 'xml') {
    marker = ' <!-- NOSONAR -->';
  } else {
    return null;
  }
  return { line: issue.line, column: trimmedLen + 1, endLine: issue.line, endColumn: t.length + 1, text: marker };
}

// Converts a fix-model edit into an LSP TextEdit.
function toTextEdit(edit) {
  return {
    range: {
      start: { line: Math.max(0, edit.line - 1), character: Math.max(0, (edit.column || 1) - 1) },
      end: { line: Math.max(0, (edit.endLine || edit.line) - 1), character: Math.max(0, (edit.endColumn || edit.column || 1) - 1) },
    },
    newText: edit.text == null ? (edit.newText || '') : String(edit.text),
  };
}

module.exports = { fixesFor, suppressionEdit, toTextEdit, codeSegments, PROVIDERS };
