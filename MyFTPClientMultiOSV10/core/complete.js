// Tab completion for the in-app local terminal (MyTerminal-style):
// command names on the first token, file/directory paths afterwards.
// First Tab fills the longest common prefix; a second Tab on the same
// incomplete token lists the candidates. No cycling through matches.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { fromPosixLike } = require('./prompts');

const SHARED = [
  'cd', 'chdir', 'cls', 'clear', 'echo', 'dir', 'ls', 'pwd', 'exit', 'quit', 'logout', 'help',
  'mkdir', 'md', 'rmdir', 'rd', 'rm', 'del', 'copy', 'cp', 'move', 'mv', 'ren',
  'type', 'cat', 'touch', 'whoami', 'date', 'history',
];

const COMMANDS = {
  cmd: SHARED.concat(['erase', 'set', 'ver', 'where', 'start', 'more', 'attrib', 'tree']),
  powershell: SHARED.concat([
    'Get-ChildItem', 'gci', 'Set-Location', 'sl', 'Copy-Item', 'Move-Item',
    'Remove-Item', 'ri', 'New-Item', 'ni', 'Get-Content', 'gc', 'Clear-Host',
    'Get-Location', 'gl', 'Write-Output', 'Get-Process', 'Get-Date', 'Select-Object',
  ]),
  posix: SHARED.concat([
    'll', 'uname', 'which', 'chmod', 'chown', 'grep', 'find', 'head', 'tail',
    'less', 'more', 'export', 'source', 'bash', 'sh',
  ]),
};

function commandsFor(shell) {
  const kind = (shell && shell.kind) || '';
  if (kind === 'cmd') return COMMANDS.cmd;
  if (kind === 'powershell') return COMMANDS.powershell;
  return COMMANDS.posix;
}

function longestCommonPrefix(items, ignoreCase = false) {
  if (!items.length) return '';
  let prefix = items[0];
  for (let i = 1; i < items.length; i += 1) {
    const s = items[i];
    let j = 0;
    while (j < prefix.length && j < s.length) {
      const a = prefix[j];
      const b = s[j];
      if (ignoreCase ? a.toLowerCase() !== b.toLowerCase() : a !== b) break;
      j += 1;
    }
    prefix = prefix.slice(0, j);
    if (!prefix) break;
  }
  return prefix;
}

function getCompletionContext(line) {
  let quote = null;
  let tokenStart = 0;
  let raw = '';
  let inToken = false;
  const text = String(line || '');

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      raw += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      if (!inToken) {
        tokenStart = i;
        inToken = true;
        raw = '';
      }
      quote = ch;
      raw += ch;
      continue;
    }
    if (/\s/.test(ch)) {
      inToken = false;
      raw = '';
      tokenStart = i + 1;
      continue;
    }
    if (!inToken) {
      tokenStart = i;
      inToken = true;
      raw = '';
    }
    raw += ch;
  }

  let token = raw;
  let quoteChar = null;
  if (token.startsWith('"') || token.startsWith("'")) {
    quoteChar = token[0];
    const closed = !quote && token.length >= 2 && token.endsWith(quoteChar);
    token = closed ? token.slice(1, -1) : token.slice(1);
  }

  const before = text.slice(0, tokenStart).trim();
  return {
    token,
    tokenStart,
    quoteChar,
    isCommand: before.length === 0,
  };
}

function looksLikePath(token) {
  const s = String(token || '');
  return /[/\\]/.test(s) || s.startsWith('.') || s.startsWith('~');
}

function completeCommands(token, shell) {
  const needle = String(token || '').toLowerCase();
  return commandsFor(shell).filter((name) => name.toLowerCase().startsWith(needle));
}

function pathSep(dirPart, shell) {
  if (dirPart.includes('\\') && !dirPart.includes('/')) return '\\';
  if (dirPart.includes('/')) return '/';
  const kind = (shell && shell.kind) || '';
  if (kind === 'cmd' || kind === 'powershell') return '\\';
  return '/';
}

function resolveSearchDir(cwd, dirPart, kind) {
  const raw = String(dirPart || '');
  if (!raw) return path.resolve(cwd || '.');
  if (raw === '~' || raw === '~/' || raw === '~\\') return path.resolve(os.homedir());
  if (raw.startsWith('~/') || raw.startsWith('~\\')) return path.join(os.homedir(), raw.slice(2));
  if (raw.startsWith('/')) return fromPosixLike(raw, kind);
  if (path.isAbsolute(raw)) return path.normalize(raw);
  return path.resolve(cwd || '.', raw);
}

function completePaths(token, cwd, shell) {
  const raw = String(token || '');
  const slash = Math.max(raw.lastIndexOf('/'), raw.lastIndexOf('\\'));
  const dirPart = slash >= 0 ? raw.slice(0, slash + 1) : '';
  const basePart = slash >= 0 ? raw.slice(slash + 1) : raw;
  const sep = pathSep(dirPart, shell);
  let searchDir;
  try {
    searchDir = resolveSearchDir(cwd, dirPart, (shell && shell.kind) || '');
  } catch {
    return [];
  }
  let entries = [];
  try {
    entries = fs.readdirSync(searchDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const needle = basePart.toLowerCase();
  return entries
    .filter((entry) => {
      if (!entry.name.toLowerCase().startsWith(needle)) return false;
      if (entry.name.startsWith('.') && !basePart.startsWith('.')) return false;
      return true;
    })
    .map((entry) => {
      const name = `${dirPart}${entry.name}`;
      return entry.isDirectory() ? `${name}${sep}` : name;
    })
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

function needsQuotes(value) {
  return /[\s"']/.test(String(value ?? ''));
}

function formatCompletionToken(value, { trailingSpace = false, quoteChar = null } = {}) {
  let body = String(value ?? '');
  if (quoteChar) {
    body = `${quoteChar}${body}${quoteChar}`;
  } else if (needsQuotes(body)) {
    body = `"${body.replace(/"/g, '')}"`;
  }
  return trailingSpace ? `${body} ` : body;
}

function printCompletionColumns(items, cols) {
  if (!items.length) return [];
  const width = Math.max(1, Number(cols) || 80);
  const maxLen = items.reduce((m, s) => Math.max(m, String(s).length), 0) + 2;
  const numCols = Math.max(1, Math.floor(width / Math.max(maxLen, 8)));
  const numRows = Math.ceil(items.length / numCols);
  const lines = [];
  for (let r = 0; r < numRows; r += 1) {
    let line = '';
    for (let c = 0; c < numCols; c += 1) {
      const idx = c * numRows + r;
      if (idx >= items.length) break;
      const name = String(items[idx]);
      line += name + (c < numCols - 1 ? ' '.repeat(Math.max(1, maxLen - name.length)) : '');
    }
    lines.push(line.replace(/\s+$/, ''));
  }
  return lines;
}

function matchesFor(line, cwd, shell) {
  const ctx = getCompletionContext(line);
  if (!ctx.isCommand || looksLikePath(ctx.token)) {
    return { ...ctx, matches: completePaths(ctx.token, cwd, shell), usePaths: true };
  }
  const cmds = completeCommands(ctx.token, shell);
  if (cmds.length) return { ...ctx, matches: cmds, usePaths: false };
  const paths = completePaths(ctx.token, cwd, shell);
  return { ...ctx, matches: paths, usePaths: true };
}

/**
 * Pure Tab step. Returns one of:
 *   { type: 'none' }
 *   { type: 'bell', key }
 *   { type: 'apply', tokenStart, completion, key }
 *   { type: 'list', items }
 */
function suggestCompletion({ line, cwd, shell, completionKey, cols }) {
  const { token, tokenStart, quoteChar, isCommand, matches, usePaths } = matchesFor(line, cwd, shell);
  if (!matches.length) return { type: 'none' };

  const wrap = (value, trailingSpace) => {
    if (!usePaths && isCommand) return trailingSpace ? `${value} ` : value;
    return formatCompletionToken(value, { trailingSpace, quoteChar });
  };

  if (matches.length === 1) {
    const only = matches[0];
    const isDir = /[\\/]$/.test(only);
    return {
      type: 'apply',
      tokenStart,
      completion: wrap(only, !isDir),
      key: '',
    };
  }

  const ignoreCase = process.platform === 'win32';
  const common = longestCommonPrefix(matches, ignoreCase);
  if (common.length > token.length) {
    return {
      type: 'apply',
      tokenStart,
      completion: wrap(common, false),
      key: '',
      pending: true,
    };
  }

  if (completionKey === line) {
    return { type: 'list', items: matches, cols };
  }
  return { type: 'bell', key: line };
}

module.exports = {
  COMMANDS,
  commandsFor,
  longestCommonPrefix,
  getCompletionContext,
  completeCommands,
  completePaths,
  formatCompletionToken,
  printCompletionColumns,
  suggestCompletion,
};
