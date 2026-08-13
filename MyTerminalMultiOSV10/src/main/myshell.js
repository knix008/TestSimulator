const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const { TextDecoder } = require('util');
const {
  DEFAULT_PROMPT,
  DEFAULT_PROMPT_GIT_MODE,
  normalizePromptGitMode,
  asciiSafePromptGlyphs,
  renderPrompt,
} = require('./prompt');
const {
  rememberWorkingDirectory,
  rememberPath,
  rememberCommand,
  getRecentPaths,
} = require('./shell-memory');
const {
  DEFAULT_LS_DIRECTORY_COLOR,
  DEFAULT_LS_FILE_COLOR,
  normalizeLsColors,
  colorizeLsName,
} = require('./ls-colors');

const VERSION = '1.0.0';
const AUTHOR = 'SHKWON <knix008@naver.com>';

/** Cached Windows OEM / console output encoding label for TextDecoder. */
let cachedWindowsConsoleEncoding = null;

function getWindowsConsoleEncoding() {
  if (cachedWindowsConsoleEncoding) return cachedWindowsConsoleEncoding;
  if (process.platform !== 'win32') {
    cachedWindowsConsoleEncoding = 'utf-8';
    return cachedWindowsConsoleEncoding;
  }
  try {
    const out = execFileSync('cmd.exe', ['/d', '/s', '/c', 'chcp'], {
      encoding: 'ascii',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const match = String(out).match(/:\s*(\d+)/);
    const cp = match ? match[1] : '';
    if (cp === '65001') cachedWindowsConsoleEncoding = 'utf-8';
    else if (cp) cachedWindowsConsoleEncoding = `windows-${cp}`;
    else cachedWindowsConsoleEncoding = 'windows-949';
  } catch (_) {
    cachedWindowsConsoleEncoding = 'windows-949';
  }
  // Verify the label is supported; fall back to common East-Asian OEM pages.
  try {
    // eslint-disable-next-line no-new
    new TextDecoder(cachedWindowsConsoleEncoding);
  } catch (_) {
    cachedWindowsConsoleEncoding = 'windows-949';
    try {
      // eslint-disable-next-line no-new
      new TextDecoder(cachedWindowsConsoleEncoding);
    } catch (_) {
      cachedWindowsConsoleEncoding = 'utf-8';
    }
  }
  return cachedWindowsConsoleEncoding;
}

function bufferIsValidUtf8(buf) {
  try {
    // eslint-disable-next-line no-new
    new TextDecoder('utf-8', { fatal: true }).decode(buf);
    return true;
  } catch (_) {
    return false;
  }
}

function bufferHasHighBit(buf) {
  for (let i = 0; i < buf.length; i += 1) {
    if (buf[i] >= 0x80) return true;
  }
  return false;
}

/**
 * Decode child-process stdout/stderr for the terminal.
 * GUI language must not affect this — use the OS console code page on Windows
 * when the bytes are not valid UTF-8 (e.g. ipconfig → CP949).
 */
function createChildOutputDecoder() {
  const oem = getWindowsConsoleEncoding();
  let decoder = null;
  let pending = Buffer.alloc(0);

  const pickEncoding = (buf) => {
    if (process.platform !== 'win32' || oem === 'utf-8') return 'utf-8';
    if (!bufferHasHighBit(buf)) return 'utf-8';
    if (bufferIsValidUtf8(buf)) return 'utf-8';
    return oem;
  };

  const ensureDecoder = (buf) => {
    if (decoder) return;
    let encoding = pickEncoding(buf);
    try {
      decoder = new TextDecoder(encoding);
    } catch (_) {
      decoder = new TextDecoder('utf-8');
    }
  };

  return {
    push(chunk) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      if (!decoder) {
        pending = Buffer.concat([pending, buf]);
        // Incomplete leading multibyte: wait a few bytes before classifying.
        if (
          pending.length < 4 &&
          bufferHasHighBit(pending) &&
          !bufferIsValidUtf8(pending)
        ) {
          // Already invalid as UTF-8 → OEM (typical for CP949 ipconfig).
          ensureDecoder(pending);
        } else if (pending.length < 4 && bufferHasHighBit(pending)) {
          return '';
        } else {
          ensureDecoder(pending);
        }
        const text = decoder.decode(pending, { stream: true });
        pending = Buffer.alloc(0);
        return text;
      }
      return decoder.decode(buf, { stream: true });
    },
    end() {
      if (!decoder) {
        if (!pending.length) return '';
        ensureDecoder(pending);
        const text = decoder.decode(pending);
        pending = Buffer.alloc(0);
        return text;
      }
      if (pending.length) {
        const text = decoder.decode(pending, { stream: true });
        pending = Buffer.alloc(0);
        return text + decoder.decode(Buffer.alloc(0));
      }
      return decoder.decode(Buffer.alloc(0));
    },
  };
}

/** Env for external programs: OS locale only — never GUI i18n language. */
function childProcessEnv(baseEnv) {
  const env = { ...(baseEnv || process.env) };
  // Strip Chromium/Electron UI locale hints so `ipconfig` etc. keep OS language.
  delete env.ELECTRON_FORCE_LOCALE;
  delete env.LANGUAGE;
  // Keep LANG/LC_* from the real process environment (user/OS), not app UI.
  return env;
}

const BUILTIN_COMMANDS = [
  'help',
  'clear',
  'cls',
  'echo',
  'pwd',
  'cd',
  'ls',
  'dir',
  'cat',
  'type',
  'mkdir',
  'md',
  'rm',
  'del',
  'remove',
  'touch',
  'cp',
  'copy',
  'mv',
  'move',
  'ren',
  'whoami',
  'date',
  'uname',
  'sysinfo',
  'env',
  'printenv',
  'history',
  'recent',
  'which',
  'where',
  'open',
  'start',
  'about',
  'prompt',
  'run',
  'exec',
  'exit',
  'quit',
];

function longestCommonPrefix(items) {
  if (!items.length) return '';
  let prefix = items[0];
  for (let i = 1; i < items.length; i += 1) {
    const s = items[i];
    let j = 0;
    while (j < prefix.length && j < s.length && prefix[j] === s[j]) j += 1;
    prefix = prefix.slice(0, j);
    if (!prefix) break;
  }
  return prefix;
}

function tokenize(line) {
  const tokens = [];
  let cur = '';
  let quote = null;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (cur) {
        tokens.push(cur);
        cur = '';
      }
      continue;
    }
    cur += ch;
  }
  if (cur) tokens.push(cur);
  return tokens;
}

/** Quote an argument for cmd.exe / sh when spawning with shell:true. */
function quoteForShell(arg) {
  const s = String(arg ?? '');
  if (process.platform === 'win32') {
    if (!/[ \t"&<>|^%]/.test(s)) return s;
    return `"${s.replace(/"/g, '""')}"`;
  }
  if (!/[^a-zA-Z0-9_./:@%+=,-]/.test(s)) return s;
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

function needsShellQuotes(value) {
  return /[\s"']/.test(String(value ?? ''));
}

/** Wrap a completion token in quotes when it contains spaces. */
function formatCompletionToken(value, { trailingSpace = false } = {}) {
  let body = String(value ?? '');
  if (needsShellQuotes(body)) {
    body = `"${body.replace(/"/g, '')}"`;
  }
  return trailingSpace ? `${body} ` : body;
}

function formatSize(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function pad(str, len) {
  const s = String(str);
  return s.length >= len ? s : s + ' '.repeat(len - s.length);
}

function padLeft(str, len) {
  const s = String(str);
  return s.length >= len ? s : ' '.repeat(len - s.length) + s;
}

function formatDirDate(date) {
  const d = date instanceof Date ? date : new Date(date);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yyyy = d.getFullYear();
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${yyyy}-${mm}-${dd}  ${String(h).padStart(2, ' ')}:${m} ${ampm}`;
}

function makeEntryFromStat(name, stat, fullPath) {
  return {
    name,
    fullPath,
    stat,
    isDirectory: () => stat.isDirectory(),
  };
}

/** Normalize any newline style to terminal CRLF (\r\n). */
function toTerminalText(text) {
  return String(text ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n/g, '\r\n');
}

/** Expand common escape sequences used in shell arguments (echo, etc.). */
function unescapeShellText(text) {
  return String(text ?? '')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\e/g, '\x1b')
    .replace(/\\\\/g, '\\');
}

/** Terminal cell width for a code point (simplified wcwidth). */
function codePointWidth(code) {
  if (code == null || code < 32) return 0;
  if (code >= 0x7f && code < 0xa0) return 0;
  // Combining marks
  if (code >= 0x0300 && code <= 0x036f) return 0;
  if (code >= 0x1ab0 && code <= 0x1aff) return 0;
  if (code >= 0x1dc0 && code <= 0x1dff) return 0;
  if (code >= 0x20d0 && code <= 0x20ff) return 0;
  if (code >= 0xfe20 && code <= 0xfe2f) return 0;
  // Wide / fullwidth (Hangul, CJK, etc.)
  if (
    (code >= 0x1100 && code <= 0x115f) ||
    code === 0x2329 ||
    code === 0x232a ||
    (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe10 && code <= 0xfe19) ||
    (code >= 0xfe30 && code <= 0xfe6f) ||
    (code >= 0xff01 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x1f300 && code <= 0x1faff) ||
    (code >= 0x20000 && code <= 0x3fffd)
  ) {
    return 2;
  }
  return 1;
}

function displayWidth(text) {
  let width = 0;
  for (const ch of String(text ?? '')) {
    width += codePointWidth(ch.codePointAt(0));
  }
  return width;
}

/** Pop the last grapheme (or code point) from a string. */
function popLastGrapheme(str) {
  const s = String(str ?? '');
  if (!s) return { rest: '', grapheme: '' };
  try {
    if (typeof Intl !== 'undefined' && Intl.Segmenter) {
      const parts = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s)];
      if (!parts.length) return { rest: '', grapheme: '' };
      const last = parts[parts.length - 1].segment;
      return { rest: s.slice(0, s.length - last.length), grapheme: last };
    }
  } catch (_) {
    /* fall through */
  }
  const chars = [...s];
  const last = chars.pop() || '';
  return { rest: chars.join(''), grapheme: last };
}

function eraseDisplayCells(sendRaw, width) {
  const n = Math.max(0, width | 0);
  for (let i = 0; i < n; i += 1) sendRaw('\b \b');
}

function resolveExistingDirectory(dir) {
  const home = os.homedir();
  let next = typeof dir === 'string' ? dir.trim() : '';
  if (!next) return home;
  try {
    next = path.resolve(next);
    if (fs.existsSync(next) && fs.statSync(next).isDirectory()) return next;
  } catch (_) {
    /* fall through */
  }
  return home;
}

class MyShell {
  constructor(win, options = {}) {
    this.win = win;
    this.sessionId = options.sessionId || '1';
    this.cwd = resolveExistingDirectory(options.cwd || os.homedir());
    this.cols = options.cols || 80;
    this.rows = options.rows || 24;
    this.lineBuffer = '';
    this.history = Array.isArray(options.history)
      ? options.history.filter((line) => typeof line === 'string' && line.trim())
      : [];
    this.historyIndex = -1;
    this.busy = false;
    this.child = null;
    this.alive = true;
    this.env = { ...process.env };
    this.escape = '';
    this.atLineStart = true;
    this.completionKey = '';
    this.promptTemplate = asciiSafePromptGlyphs(
      options.promptTemplate || DEFAULT_PROMPT
    );
    this.promptGitMode = normalizePromptGitMode(
      options.promptGitMode || DEFAULT_PROMPT_GIT_MODE
    );
    this.promptContext = {
      user: os.userInfo().username,
      host: os.hostname(),
      shell: 'MyShell',
      remote: false,
      ...(options.promptContext || {}),
    };
    this.lsColors = normalizeLsColors({
      directory: options.lsDirectoryColor || DEFAULT_LS_DIRECTORY_COLOR,
      file: options.lsFileColor || DEFAULT_LS_FILE_COLOR,
    });
    this.endTipBg =
      typeof options.endTipBg === 'string' && options.endTipBg
        ? options.endTipBg
        : '#1E1E1E';
  }

  setPromptTemplate(template) {
    if (typeof template === 'string' && template.length) {
      this.promptTemplate = asciiSafePromptGlyphs(template);
    }
  }

  setPromptGitMode(mode) {
    this.promptGitMode = normalizePromptGitMode(mode);
  }

  setLsColors(colors = {}) {
    this.lsColors = normalizeLsColors({
      directory: colors.directory ?? colors.lsDirectoryColor,
      file: colors.file ?? colors.lsFileColor,
    });
  }

  setStartDirectory(dir) {
    const next = resolveExistingDirectory(dir);
    if (path.resolve(this.cwd) === path.resolve(next)) return this.cwd;
    this.cwd = next;
    rememberWorkingDirectory(this.cwd);
    if (this.busy || this.lineBuffer) return this.cwd;
    this.ensureNewline();
    this.writeln(`\x1b[90m${this.cwd}\x1b[0m`);
    this.prompt();
    return this.cwd;
  }

  setEndTipBg(hex) {
    // Empty string clears the tip bg (wallpaper mode → segment-colored tip cell).
    if (typeof hex === 'string') this.endTipBg = hex.trim();
  }

  formatLsEntry(name, isDirectory, { trailingSlash = false } = {}) {
    const label =
      isDirectory && trailingSlash && !String(name).endsWith('/')
        ? `${name}/`
        : name;
    return colorizeLsName(label, !!isDirectory, this.lsColors);
  }

  emit(channel, payload) {
    if (this.win && !this.win.isDestroyed()) {
      this.win.webContents.send(channel, payload);
    }
  }

  send(text) {
    if (text == null || text === '') return;
    const out = toTerminalText(text);
    this.emit('pty:data', { sessionId: this.sessionId, data: out });
    this.atLineStart = /\r\n$/.test(out) || out.endsWith('\n');
  }

  /** Write raw already-normalized terminal bytes (skip double conversion). */
  sendRaw(text) {
    if (text == null || text === '') return;
    this.emit('pty:data', { sessionId: this.sessionId, data: text });
    this.atLineStart = /\r\n$/.test(text) || text.endsWith('\n');
  }

  writeln(text = '') {
    // Real \n/\r in the string become terminal line breaks; trailing EOL is normalized.
    const body = toTerminalText(text).replace(/(?:\r\n)+$/g, '');
    if (body) this.sendRaw(body);
    this.sendRaw('\r\n');
  }

  ensureNewline() {
    if (!this.atLineStart) this.sendRaw('\r\n');
  }

  prompt() {
    this.ensureNewline();
    const text = renderPrompt(this.promptTemplate, {
      ...this.promptContext,
      cwd: this.cwd,
      gitMode: this.promptGitMode,
      endTipBg: this.endTipBg,
    });
    this.sendRaw(toTerminalText(text));
    this.atLineStart = false;
  }

  start() {
    rememberWorkingDirectory(this.cwd);
    this.writeln(`\x1b[1mMyTerminal Shell\x1b[0m v${VERSION}`);
    this.writeln(`Built-in shell by ${AUTHOR}`);
    this.writeln(`Type \x1b[32mhelp\x1b[0m for commands. Unknown names run as system programs.`);
    this.writeln('');
    this.prompt();
  }

  resize(cols, rows) {
    if (cols > 0) this.cols = cols;
    if (rows > 0) this.rows = rows;
  }

  kill() {
    this.alive = false;
    this.killChild();
  }

  killChild() {
    if (!this.child) return;
    try {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', String(this.child.pid), '/f', '/t'], { windowsHide: true });
      } else {
        this.child.kill('SIGTERM');
      }
    } catch (_) {
      /* ignore */
    }
    this.child = null;
    this.busy = false;
  }

  write(data) {
    if (!this.alive) return;

    // Strip bracketed-paste wrappers from xterm / terminals.
    let input = String(data ?? '')
      .replace(/\x1b\[200~/g, '')
      .replace(/\x1b\[201~/g, '');

    for (const ch of input) {
      if (this.escape) {
        this.escape += ch;
        if (/^[\x1b]$/.test(this.escape)) continue;
        if (this.escape === '\x1b[') continue;
        if (this.escape === '\x1b[A') {
          this.escape = '';
          this.historyUp();
          continue;
        }
        if (this.escape === '\x1b[B') {
          this.escape = '';
          this.historyDown();
          continue;
        }
        // Ignore other CSI sequences (incl. leftover paste/mouse codes).
        if (/^[\x1b]\[[0-9;?]*[A-Za-z~]$/.test(this.escape) || this.escape.length > 16) {
          this.escape = '';
        }
        continue;
      }

      if (ch === '\x1b') {
        this.escape = '\x1b';
        continue;
      }

      if (ch === '\r' || ch === '\n') {
        if (this.busy) continue;
        this.sendRaw('\r\n');
        const line = this.lineBuffer;
        this.lineBuffer = '';
        this.historyIndex = -1;
        this.completionKey = '';
        this.runLine(line);
        continue;
      }

      if (ch === '\u007f' || ch === '\b') {
        if (!this.busy) this.backspaceOnce();
        continue;
      }

      if (ch === '\u0003') {
        this.sendRaw('^C\r\n');
        this.lineBuffer = '';
        this.historyIndex = -1;
        if (this.child) this.killChild();
        this.prompt();
        continue;
      }

      if (ch === '\u000c') {
        // CSI 3J clears scrollback; 2J clears the viewport; H homes the cursor.
        this.clearScreen({ keepPrompt: true });
        continue;
      }

      if (ch === '\t') {
        if (!this.busy) this.autocomplete();
        continue;
      }

      if (!this.busy && ch >= ' ') {
        this.lineBuffer += ch;
        this.sendRaw(ch);
        this.atLineStart = false;
        this.completionKey = '';
      }
    }
  }

  /** Clear viewport + scrollback buffer, optionally redraw the prompt. */
  clearScreen({ keepPrompt = true } = {}) {
    // ESC[3J = erase saved lines (scrollback); ESC[2J = erase display; ESC[H = home.
    this.sendRaw('\x1b[3J\x1b[2J\x1b[H');
    this.atLineStart = true;
    this.lineBuffer = '';
    this.historyIndex = -1;
    this.completionKey = '';
    if (keepPrompt) this.prompt();
  }

  /** Remove one grapheme from the line and erase matching terminal cells. */
  backspaceOnce() {
    if (!this.lineBuffer) return;
    const { rest, grapheme } = popLastGrapheme(this.lineBuffer);
    if (!grapheme) return;
    this.lineBuffer = rest;
    eraseDisplayCells((s) => this.sendRaw(s), displayWidth(grapheme) || 1);
  }

  getCompletionContext(line) {
    let quote = null;
    let tokenStart = 0;
    let raw = '';
    let inToken = false;

    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
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

    const before = line.slice(0, tokenStart).trim();
    return {
      token,
      tokenStart,
      quoteChar,
      isCommand: before.length === 0,
    };
  }

  completeCommands(token) {
    const needle = String(token || '').toLowerCase();
    return BUILTIN_COMMANDS.filter((name) => name.startsWith(needle));
  }

  completePaths(token) {
    const raw = String(token || '');
    const slash = Math.max(raw.lastIndexOf('/'), raw.lastIndexOf('\\'));
    const dirPart = slash >= 0 ? raw.slice(0, slash + 1) : '';
    const basePart = slash >= 0 ? raw.slice(slash + 1) : raw;
    const useBackslash =
      process.platform === 'win32' && (dirPart.includes('\\') || !dirPart.includes('/'));
    const sep = useBackslash ? '\\' : '/';

    let searchDir = this.cwd;
    if (dirPart) {
      if (dirPart === '~/' || dirPart === '~\\') searchDir = os.homedir();
      else searchDir = this.resolve(dirPart);
    }

    let entries = [];
    try {
      entries = fs.readdirSync(searchDir, { withFileTypes: true });
    } catch (_) {
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
      .sort((a, b) => a.localeCompare(b));
  }

  applyCompletion(tokenStart, completion) {
    const oldToken = this.lineBuffer.slice(tokenStart);
    eraseDisplayCells((s) => this.sendRaw(s), displayWidth(oldToken));
    this.lineBuffer = this.lineBuffer.slice(0, tokenStart) + completion;
    this.sendRaw(completion);
    this.atLineStart = false;
  }

  printCompletionColumns(items) {
    if (!items.length) return;
    const width = Math.max(1, this.cols || 80);
    const maxLen = items.reduce((m, s) => Math.max(m, s.length), 0) + 2;
    const cols = Math.max(1, Math.floor(width / Math.max(maxLen, 8)));
    const rows = Math.ceil(items.length / cols);
    for (let r = 0; r < rows; r += 1) {
      let line = '';
      for (let c = 0; c < cols; c += 1) {
        const idx = c * rows + r;
        if (idx >= items.length) break;
        line += pad(items[idx], maxLen);
      }
      this.writeln(line.replace(/\s+$/, ''));
    }
  }

  autocomplete() {
    const line = this.lineBuffer;
    const { token, tokenStart, isCommand, quoteChar } = this.getCompletionContext(line);
    const matches = isCommand ? this.completeCommands(token) : this.completePaths(token);

    if (!matches.length) {
      this.sendRaw('\x07');
      this.completionKey = '';
      return;
    }

    const wrap = (value, trailingSpace) => {
      if (isCommand) return trailingSpace ? `${value} ` : value;
      if (quoteChar) {
        const body = `${quoteChar}${value}${quoteChar}`;
        return trailingSpace ? `${body} ` : body;
      }
      return formatCompletionToken(value, { trailingSpace });
    };

    if (matches.length === 1) {
      const only = matches[0];
      const isDir = /[\\/]$/.test(only);
      this.applyCompletion(tokenStart, wrap(only, !isDir));
      this.completionKey = '';
      return;
    }

    const common = longestCommonPrefix(matches);
    if (common.length > token.length) {
      this.applyCompletion(tokenStart, wrap(common, false));
      this.completionKey = this.lineBuffer;
      return;
    }

    // Second Tab on the same incomplete token: list candidates.
    if (this.completionKey === line) {
      this.writeln('');
      this.printCompletionColumns(matches);
      this.prompt();
      if (this.lineBuffer) this.sendRaw(this.lineBuffer);
      this.completionKey = '';
      return;
    }

    this.completionKey = line;
    this.sendRaw('\x07');
  }

  replaceLine(next) {
    eraseDisplayCells((s) => this.sendRaw(s), displayWidth(this.lineBuffer));
    this.lineBuffer = next || '';
    if (next) {
      this.sendRaw(next);
      this.atLineStart = false;
    }
  }

  historyUp() {
    if (!this.history.length || this.busy) return;
    if (this.historyIndex < 0) this.historyIndex = this.history.length;
    if (this.historyIndex <= 0) return;
    this.historyIndex -= 1;
    this.replaceLine(this.history[this.historyIndex]);
  }

  historyDown() {
    if (this.historyIndex < 0 || this.busy) return;
    this.historyIndex += 1;
    if (this.historyIndex >= this.history.length) {
      this.historyIndex = -1;
      this.replaceLine('');
      return;
    }
    this.replaceLine(this.history[this.historyIndex]);
  }

  resolve(p) {
    if (!p) return this.cwd;
    if (p === '~') return os.homedir();
    if (p.startsWith('~/') || p.startsWith('~\\')) {
      return path.join(os.homedir(), p.slice(2));
    }
    return path.isAbsolute(p) ? path.normalize(p) : path.resolve(this.cwd, p);
  }

  async runLine(line) {
    const trimmed = line.trim();
    if (!trimmed) {
      this.prompt();
      return;
    }

    if (!this.history.length || this.history[this.history.length - 1] !== trimmed) {
      this.history.push(trimmed);
      if (this.history.length > 200) this.history.shift();
    }
    rememberCommand(trimmed);

    const tokens = tokenize(trimmed);
    const cmd = (tokens[0] || '').toLowerCase();
    const args = tokens.slice(1);

    let prompted = false;
    try {
      prompted = (await this.dispatch(cmd, args, trimmed)) === true;
    } catch (err) {
      this.writeln(`\x1b[31merror:\x1b[0m ${err.message || err}`);
    }

    if (this.alive && !this.busy && !prompted) this.prompt();
  }

  async dispatch(cmd, args, raw) {
    switch (cmd) {
      case 'help':
      case '?':
        this.cmdHelp();
        break;
      case 'clear':
      case 'cls':
        this.clearScreen({ keepPrompt: true });
        return true;
      case 'echo':
        // Supports: echo hello\nworld  → real line break
        this.writeln(unescapeShellText(args.join(' ')));
        break;
      case 'pwd':
        this.writeln(this.cwd);
        break;
      case 'cd':
        this.cmdCd(args[0]);
        break;
      case 'ls':
      case 'dir':
        this.cmdLs(args, cmd);
        break;
      case 'cat':
      case 'type':
        this.cmdCat(args[0]);
        break;
      case 'mkdir':
      case 'md':
        this.cmdMkdir(args);
        break;
      case 'rm':
      case 'del':
      case 'remove':
        this.cmdRm(args);
        break;
      case 'touch':
        this.cmdTouch(args[0]);
        break;
      case 'cp':
      case 'copy':
        this.cmdCp(args);
        break;
      case 'mv':
      case 'move':
      case 'ren':
        this.cmdMv(args);
        break;
      case 'whoami':
        this.writeln(os.userInfo().username);
        break;
      case 'date':
        this.writeln(new Date().toString());
        break;
      case 'uname':
      case 'sysinfo':
        this.cmdUname();
        break;
      case 'env':
      case 'printenv':
        this.cmdEnv(args[0]);
        break;
      case 'history':
        this.history.forEach((h, i) => this.writeln(`${String(i + 1).padStart(4)}  ${h}`));
        break;
      case 'recent':
        await this.cmdRecent(args);
        break;
      case 'which':
      case 'where':
        this.cmdWhich(args[0]);
        break;
      case 'open':
      case 'start':
        await this.cmdOpen(args[0]);
        break;
      case 'about':
        this.writeln(`MyTerminal Shell v${VERSION}`);
        this.writeln(`Author: ${AUTHOR}`);
        this.writeln('A built-in cross-platform shell (not a wrapper around cmd/bash).');
        break;
      case 'prompt':
        this.cmdPrompt(args);
        break;
      case 'exit':
      case 'quit':
        this.writeln('Bye.');
        this.alive = false;
        this.emit('pty:exit', { sessionId: this.sessionId, code: 0 });
        break;
      case 'run':
      case 'exec':
        if (!args.length) {
          this.writeln('usage: run "<program with spaces>" [args...]');
          break;
        }
        await this.cmdRun(args);
        break;
      default:
        // Fall through to PATH / local executables (no `run` prefix required).
        await this.cmdRun([cmd, ...args]);
        break;
    }
  }

  cmdHelp() {
    const lines = [
      'Built-in commands:',
      '  help                 Show this help',
      '  clear, cls           Clear screen',
      '  echo <text>          Print text',
      '  pwd                  Print working directory',
      '  cd [path]            Change directory',
      '  ls, dir [path]       List directory',
      '  cat, type <file>     Show file contents',
      '  mkdir, md <dir>      Create directory',
      '  rm, del <path>       Remove file/directory',
      '  touch <file>         Create empty file',
      '  cp, copy <a> <b>     Copy file',
      '  mv, move <a> <b>     Move/rename',
      '  whoami               Current user',
      '  date                 Current date/time',
      '  uname, sysinfo       System information',
      '  env [name]           Environment variables',
      '  history              Command history (persisted across restarts)',
      '  recent [n|open n|cd n]  Recently used files/folders',
      '  which, where <name>  Locate executable',
      '  open, start <path>   Open file/folder',
      '  about                About this shell',
      '  prompt [show|set|reset]  View/change prompt template',
      '  run, exec <cmd...>   Explicit external run (optional; bare names also work)',
      '  exit, quit           End session',
      '',
      'Tips: Type a program name directly (e.g. ipconfig, git status, notepad).',
      '      Last folder, recent paths, and ↑/↓ history are restored on restart.',
      '      Tab autocomplete, Ctrl+C cancel, Ctrl+L clear',
      'Remote SSH: use the toolbar Remote button',
    ];
    lines.forEach((l) => this.writeln(l));
  }

  cmdPrompt(args) {
    const sub = (args[0] || 'show').toLowerCase();
    if (sub === 'show' || sub === 'get') {
      this.writeln(this.promptTemplate);
      return;
    }
    if (sub === 'reset') {
      this.setPromptTemplate(DEFAULT_PROMPT);
      this.writeln('prompt reset to default');
      return;
    }
    if (sub === 'set') {
      const template = args.slice(1).join(' ');
      if (!template) {
        this.writeln('usage: prompt set <template>');
        return;
      }
      this.setPromptTemplate(unescapeShellText(template));
      this.writeln('prompt updated');
      return;
    }
    // Treat whole args as template: prompt {user}@{host}$
    this.setPromptTemplate(unescapeShellText(args.join(' ')));
    this.writeln('prompt updated');
  }

  cmdCd(target) {
    const next = this.resolve(target || os.homedir());
    if (!fs.existsSync(next) || !fs.statSync(next).isDirectory()) {
      throw new Error(`no such directory: ${target || next}`);
    }
    this.cwd = next;
    rememberWorkingDirectory(this.cwd);
    rememberPath(this.cwd, 'dir');
  }

  cmdLs(args, cmdName = 'ls') {
    let longFmt = false;
    let all = false;
    let wide = false;
    let targetArg = null;
    args.forEach((a) => {
      if (a === '-l' || a === '--long') longFmt = true;
      else if (a === '-la' || a === '-al') {
        longFmt = true;
        all = true;
      } else if (a === '-a' || a === '--all' || a === '/a') all = true;
      else if (a === '/w') wide = true;
      else if (!a.startsWith('-') && !a.startsWith('/')) targetArg = a;
    });

    // `dir` defaults to Windows-style detailed list; `ls` defaults to columns.
    const asDir = cmdName === 'dir';
    if (asDir && !wide && !longFmt) {
      longFmt = true;
    }
    if (wide) longFmt = false;

    const target = this.resolve(targetArg || '.');
    const st = fs.statSync(target);

    if (st.isFile()) {
      if (asDir || longFmt) {
        this.printDirLong(
          [makeEntryFromStat(path.basename(target), st, target)],
          path.dirname(target),
          asDir
        );
      } else this.writeln(this.formatLsEntry(path.basename(target), false));
      return;
    }

    let entries = fs.readdirSync(target, { withFileTypes: true });
    if (!all) {
      entries = entries.filter((ent) => !ent.name.startsWith('.'));
    }
    entries.sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });

    if (!entries.length) {
      if (asDir) {
        this.writeln(` Directory of ${target}`);
        this.writeln('');
        this.writeln('               0 File(s)              0 bytes');
        this.writeln('               0 Dir(s)');
      }
      return;
    }

    if (asDir || longFmt) {
      this.printDirLong(entries, target, asDir);
      return;
    }

    // Classic `ls`: multi-column names (dirs with trailing /).
    const names = entries.map((ent) =>
      this.formatLsEntry(ent.name, ent.isDirectory(), { trailingSlash: true })
    );
    this.printColumns(names);
  }

  printColumns(names) {
    const cols = Math.max(40, this.cols || 80);
    // Visible width ignores ANSI color codes.
    const visibleLen = (s) => s.replace(/\x1b\[[0-9;]*m/g, '').length;
    const maxLen = names.reduce((m, n) => Math.max(m, visibleLen(n)), 1);
    const colWidth = maxLen + 2;
    const numCols = Math.max(1, Math.floor(cols / colWidth));
    const numRows = Math.ceil(names.length / numCols);

    for (let r = 0; r < numRows; r += 1) {
      let line = '';
      for (let c = 0; c < numCols; c += 1) {
        const idx = c * numRows + r;
        if (idx >= names.length) break;
        const name = names[idx];
        const padCount = colWidth - visibleLen(name);
        line += name + (c < numCols - 1 ? ' '.repeat(Math.max(1, padCount)) : '');
      }
      this.writeln(line.replace(/\s+$/g, ''));
    }
  }

  printDirLong(entries, target, windowsStyle = true) {
    if (windowsStyle) {
      this.writeln(` Directory of ${target}`);
      this.writeln('');
    }

    let fileCount = 0;
    let dirCount = 0;
    let totalBytes = 0;

    entries.forEach((ent) => {
      const full = ent.fullPath || path.join(target, ent.name);
      let stat;
      try {
        stat = ent.stat || fs.statSync(full);
      } catch {
        this.writeln(`?????? ?? ?? ${ent.name}`);
        return;
      }

      const mtime = stat.mtime || new Date();
      const date = formatDirDate(mtime);
      if (ent.isDirectory ? ent.isDirectory() : stat.isDirectory()) {
        dirCount += 1;
        const name = this.formatLsEntry(ent.name, true);
        if (windowsStyle) {
          this.writeln(`${date}    <DIR>          ${name}`);
        } else {
          this.writeln(
            `drwxr-xr-x  1 ${pad(formatSize(0), 10)} ${date} ${name}`
          );
        }
      } else {
        fileCount += 1;
        totalBytes += stat.size || 0;
        const sizeStr = String(stat.size || 0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        const name = this.formatLsEntry(ent.name, false);
        if (windowsStyle) {
          this.writeln(`${date} ${padLeft(sizeStr, 16)} ${name}`);
        } else {
          this.writeln(
            `-rw-r--r--  1 ${pad(formatSize(stat.size || 0), 10)} ${date} ${name}`
          );
        }
      }
    });

    if (windowsStyle) {
      const bytes = String(totalBytes).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      this.writeln(
        `${padLeft(String(fileCount), 16)} File(s) ${padLeft(bytes, 14)} bytes`
      );
      this.writeln(`${padLeft(String(dirCount), 16)} Dir(s)`);
    }
  }

  cmdCat(file) {
    if (!file) throw new Error('usage: cat <file>');
    const full = this.resolve(file);
    const st = fs.statSync(full);
    if (st.isDirectory()) throw new Error(`is a directory: ${file}`);
    if (st.size > 2 * 1024 * 1024) throw new Error('file too large (>2MB)');
    rememberPath(full, 'file');
    const text = fs.readFileSync(full, 'utf8');
    // Preserve file newlines via toTerminalText; avoid double blank at EOF.
    const normalized = toTerminalText(text).replace(/(?:\r\n)+$/g, '');
    if (normalized) this.sendRaw(normalized);
    this.sendRaw('\r\n');
  }

  cmdMkdir(args) {
    if (!args.length) throw new Error('usage: mkdir <dir>');
    args.forEach((a) => {
      fs.mkdirSync(this.resolve(a), { recursive: true });
      this.writeln(`created: ${this.resolve(a)}`);
    });
  }

  cmdRm(args) {
    const recursive = args.includes('-r') || args.includes('-rf') || args.includes('/s');
    const targets = args.filter((a) => !a.startsWith('-') && a !== '/s');
    if (!targets.length) throw new Error('usage: rm [-r] <path>');
    targets.forEach((t) => {
      const full = this.resolve(t);
      const st = fs.statSync(full);
      if (st.isDirectory()) {
        if (!recursive) throw new Error(`is a directory (use rm -r): ${t}`);
        fs.rmSync(full, { recursive: true, force: true });
      } else {
        fs.unlinkSync(full);
      }
      this.writeln(`removed: ${full}`);
    });
  }

  cmdTouch(file) {
    if (!file) throw new Error('usage: touch <file>');
    const full = this.resolve(file);
    fs.closeSync(fs.openSync(full, 'a'));
    this.writeln(`touched: ${full}`);
  }

  cmdCp(args) {
    if (args.length < 2) throw new Error('usage: cp <src> <dest>');
    const src = this.resolve(args[0]);
    const dest = this.resolve(args[1]);
    fs.copyFileSync(src, dest);
    this.writeln(`copied: ${src} -> ${dest}`);
  }

  cmdMv(args) {
    if (args.length < 2) throw new Error('usage: mv <src> <dest>');
    const src = this.resolve(args[0]);
    const dest = this.resolve(args[1]);
    fs.renameSync(src, dest);
    this.writeln(`moved: ${src} -> ${dest}`);
  }

  cmdUname() {
    this.writeln(`MyTerminal ${VERSION}`);
    this.writeln(`OS: ${os.type()} ${os.release()} (${os.platform()} ${os.arch()})`);
    this.writeln(`Host: ${os.hostname()}`);
    this.writeln(`CPU: ${os.cpus()[0]?.model || 'unknown'} x${os.cpus().length}`);
    this.writeln(`Memory: ${formatSize(os.totalmem())} total, ${formatSize(os.freemem())} free`);
    this.writeln(`Home: ${os.homedir()}`);
    this.writeln(`Shell: MyShell (built-in)`);
  }

  cmdEnv(name) {
    if (name) {
      this.writeln(this.env[name] != null ? `${name}=${this.env[name]}` : '');
      return;
    }
    Object.keys(this.env)
      .sort()
      .forEach((k) => this.writeln(`${k}=${this.env[k]}`));
  }

  cmdWhich(name) {
    if (!name) throw new Error('usage: which <name>');
    const pathKey = process.platform === 'win32' ? 'Path' : 'PATH';
    const pathVal = this.env[pathKey] || this.env.PATH || '';
    const parts = pathVal.split(path.delimiter);
    const exts =
      process.platform === 'win32'
        ? (this.env.PATHEXT || '.EXE;.CMD;.BAT;.COM').split(';')
        : [''];

    for (const dir of parts) {
      for (const ext of exts) {
        const candidate = path.join(dir, name + (process.platform === 'win32' && !path.extname(name) ? ext : ''));
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
          this.writeln(candidate);
          return;
        }
      }
      const direct = path.join(dir, name);
      if (fs.existsSync(direct) && fs.statSync(direct).isFile()) {
        this.writeln(direct);
        return;
      }
    }
    this.writeln(`${name} not found`);
  }

  async cmdOpen(target) {
    if (!target) throw new Error('usage: open <path>');
    const full = this.resolve(target);
    if (!fs.existsSync(full)) throw new Error(`no such path: ${target}`);
    const { shell } = require('electron');
    await shell.openPath(full);
    rememberPath(full);
    try {
      if (fs.statSync(full).isDirectory()) rememberWorkingDirectory(full);
    } catch (_) {
      /* ignore */
    }
    this.writeln(`opened: ${full}`);
  }

  async cmdRecent(args) {
    const items = getRecentPaths();
    if (!items.length) {
      this.writeln('No recent files or folders yet.');
      return;
    }

    const sub = (args[0] || '').toLowerCase();
    const pickIndex = (raw) => {
      const n = Number.parseInt(raw, 10);
      if (!Number.isFinite(n) || n < 1 || n > items.length) {
        throw new Error('usage: recent [n|cd n|open n]');
      }
      return n - 1;
    };

    if (sub === 'cd' || sub === 'open') {
      const item = items[pickIndex(args[1])];
      if (sub === 'cd') {
        if (item.kind !== 'dir') throw new Error(`not a directory: ${item.path}`);
        this.cmdCd(item.path);
        this.writeln(item.path);
        return;
      }
      await this.cmdOpen(item.path);
      return;
    }

    if (sub && /^\d+$/.test(sub)) {
      const item = items[pickIndex(sub)];
      if (item.kind === 'dir') {
        this.cmdCd(item.path);
        this.writeln(item.path);
      } else {
        await this.cmdOpen(item.path);
      }
      return;
    }

    items.forEach((item, i) => {
      const mark = item.kind === 'dir' ? 'dir ' : 'file';
      this.writeln(`${String(i + 1).padStart(3)}  [${mark}]  ${item.path}`);
    });
    this.writeln('Use: recent <n> | recent cd <n> | recent open <n>');
  }

  cmdRun(args) {
    return new Promise((resolve) => {
      this.busy = true;
      // Launch a system program (also used for unknown built-in names).
      // Re-quote each token so paths with spaces survive shell:true.
      let program = args[0];
      const rest = args.slice(1);
      const looksLikePath = /[\\/]/.test(program) || /^[A-Za-z]:/.test(program);
      if (looksLikePath) {
        program = this.resolve(program);
      } else {
        const local = this.resolve(program);
        if (fs.existsSync(local) && fs.statSync(local).isFile()) program = local;
      }
      const cmdline = [program, ...rest].map(quoteForShell).join(' ');
      const child = spawn(cmdline, {
        cwd: this.cwd,
        env: childProcessEnv(this.env),
        shell: true,
        windowsHide: true,
      });
      this.child = child;

      const outDec = createChildOutputDecoder();
      const errDec = createChildOutputDecoder();
      const flush = (dec, chunk) => {
        const text = chunk != null ? dec.push(chunk) : dec.end();
        if (text) this.send(text);
      };

      child.stdout.on('data', (d) => flush(outDec, d));
      child.stderr.on('data', (d) => flush(errDec, d));
      child.on('error', (err) => {
        flush(outDec);
        flush(errDec);
        this.writeln(`\x1b[31mfailed:\x1b[0m ${err.message}`);
        this.busy = false;
        this.child = null;
        resolve();
      });
      child.on('close', (code) => {
        flush(outDec);
        flush(errDec);
        this.ensureNewline();
        if (code) this.writeln(`\x1b[90m[exit ${code}]\x1b[0m`);
        this.busy = false;
        this.child = null;
        resolve();
      });
    });
  }
}

module.exports = { MyShell, toTerminalText, unescapeShellText };
