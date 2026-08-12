const WEB_BUILTINS = [
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
  'whoami',
  'date',
  'uname',
  'sysinfo',
  'about',
  'history',
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

/**
 * Browser-side built-in shell (virtual FS), mirroring MyShell branding/commands.
 */
export class WebShell {
  constructor({ onData, onExit, promptTemplate }) {
    this.onData = onData;
    this.onExit = onExit;
    this.cwd = '/home/user';
    this.buffer = '';
    this.alive = true;
    this.history = [];
    this.historyIndex = -1;
    this.escape = '';
    this.completionKey = '';
    this.promptTemplate =
      promptTemplate || '{cyan}myterm{reset}:{yellow}{cwd:short}{reset}> ';
    this.fs = {
      '/home/user': { type: 'dir' },
      '/home/user/Documents': { type: 'dir' },
      '/home/user/Downloads': { type: 'dir' },
      '/home/user/Projects': { type: 'dir' },
      '/home/user/README.txt': {
        type: 'file',
        content: 'Welcome to MyTerminal Web Shell\nAuthor: SHKWON <knix008@naver.com>\n',
      },
    };
  }

  start(welcomeLines = []) {
    welcomeLines.forEach((line) => this.writeLine(line));
    this.prompt();
  }

  toTerminalText(text) {
    return String(text ?? '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\n/g, '\r\n');
  }

  unescape(text) {
    return String(text ?? '')
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .replace(/\\\\/g, '\\');
  }

  writeLine(text = '') {
    const body = this.toTerminalText(this.unescape(text)).replace(/(?:\r\n)+$/g, '');
    if (body) this.onData(body);
    this.onData('\r\n');
  }

  prompt() {
    const colors = {
      reset: '\x1b[0m',
      bold: '\x1b[1m',
      dim: '\x1b[2m',
      red: '\x1b[31m',
      green: '\x1b[32m',
      yellow: '\x1b[33m',
      blue: '\x1b[34m',
      magenta: '\x1b[35m',
      cyan: '\x1b[36m',
      white: '\x1b[37m',
      black: '\x1b[30m',
      bg_blue: '\x1b[44m',
      bg_yellow: '\x1b[43m',
      bg_magenta: '\x1b[45m',
    };
    const short = this.cwd.replace(/^\/home\/user/, '~');
    const tail = this.cwd === '/home/user' ? '~' : this.cwd.split('/').filter(Boolean).pop() || short;
    const values = {
      user: 'webuser',
      host: 'web',
      cwd: this.cwd,
      'cwd:short': short,
      'cwd:tail': tail,
      'git:branch': '',
      'git:info': '',
      'git:segment': '',
      time: new Date().toLocaleTimeString(),
      date: new Date().toLocaleDateString(),
      shell: 'MyShell',
      remote: 'local',
      ...colors,
    };
    const text = String(this.promptTemplate).replace(/\{([a-zA-Z0-9:_-]+)\}/g, (m, key) =>
      Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : m
    );
    this.onData(this.toTerminalText(text));
  }

  write(data) {
    if (!this.alive) return;

    for (const ch of data) {
      if (this.escape) {
        this.escape += ch;
        if (this.escape === '\x1b[') continue;
        if (this.escape === '\x1b[A') {
          this.escape = '';
          this.historyNav(-1);
          continue;
        }
        if (this.escape === '\x1b[B') {
          this.escape = '';
          this.historyNav(1);
          continue;
        }
        if (this.escape.length >= 3) this.escape = '';
        continue;
      }

      if (ch === '\x1b') {
        this.escape = '\x1b';
        continue;
      }

      if (ch === '\r' || ch === '\n') {
        this.onData('\r\n');
        this.run(this.buffer);
        this.buffer = '';
        this.historyIndex = -1;
        this.completionKey = '';
      } else if (ch === '\u007f' || ch === '\b') {
        if (this.buffer.length) {
          this.buffer = this.buffer.slice(0, -1);
          this.onData('\b \b');
        }
      } else if (ch === '\u0003') {
        this.onData('^C\r\n');
        this.buffer = '';
        this.prompt();
      } else if (ch === '\u000c') {
        this.onData('\x1b[3J\x1b[2J\x1b[H');
        this.buffer = '';
        this.prompt();
      } else if (ch === '\t') {
        this.autocomplete();
      } else if (ch >= ' ') {
        this.buffer += ch;
        this.onData(ch);
        this.completionKey = '';
      }
    }
  }

  getCompletionContext(line) {
    let i = line.length - 1;
    while (i >= 0 && line[i] !== ' ' && line[i] !== '\t') i -= 1;
    const tokenStart = i + 1;
    const token = line.slice(tokenStart);
    const before = line.slice(0, tokenStart).trim();
    return { token, tokenStart, isCommand: before.length === 0 };
  }

  completeCommands(token) {
    const needle = String(token || '').toLowerCase();
    return WEB_BUILTINS.filter((name) => name.startsWith(needle));
  }

  completePaths(token) {
    const raw = String(token || '');
    const slash = raw.lastIndexOf('/');
    const dirPart = slash >= 0 ? raw.slice(0, slash + 1) : '';
    const basePart = slash >= 0 ? raw.slice(slash + 1) : raw;
    const searchDir = dirPart
      ? this.resolve(dirPart === '~/' ? '~' : dirPart.replace(/\/+$/, '') || '.')
      : this.cwd;
    const names = this.listDir(searchDir);
    const needle = basePart.toLowerCase();
    return names
      .filter((name) => name.toLowerCase().startsWith(needle))
      .map((name) => {
        const full = `${searchDir}/${name}`.replace(/\/+/g, '/');
        const isDir = this.fs[full]?.type === 'dir' || this.listDir(full).length > 0;
        return `${dirPart}${name}${isDir ? '/' : ''}`;
      });
  }

  applyCompletion(tokenStart, completion) {
    const oldToken = this.buffer.slice(tokenStart);
    for (let i = 0; i < oldToken.length; i += 1) this.onData('\b \b');
    this.buffer = this.buffer.slice(0, tokenStart) + completion;
    this.onData(completion);
  }

  autocomplete() {
    const line = this.buffer;
    const { token, tokenStart, isCommand } = this.getCompletionContext(line);
    const matches = isCommand ? this.completeCommands(token) : this.completePaths(token);
    if (!matches.length) {
      this.onData('\x07');
      this.completionKey = '';
      return;
    }
    if (matches.length === 1) {
      let next = matches[0];
      if (!next.endsWith('/')) next += ' ';
      this.applyCompletion(tokenStart, next);
      this.completionKey = '';
      return;
    }
    const common = longestCommonPrefix(matches);
    if (common.length > token.length) {
      this.applyCompletion(tokenStart, common);
      this.completionKey = this.buffer;
      return;
    }
    if (this.completionKey === line) {
      this.writeLine('');
      this.writeLine(matches.join('  '));
      this.prompt();
      if (this.buffer) this.onData(this.buffer);
      this.completionKey = '';
      return;
    }
    this.completionKey = line;
    this.onData('\x07');
  }

  historyNav(dir) {
    if (!this.history.length) return;
    if (this.historyIndex < 0) this.historyIndex = this.history.length;
    this.historyIndex += dir;
    if (this.historyIndex < 0) this.historyIndex = 0;
    if (this.historyIndex >= this.history.length) {
      this.historyIndex = -1;
      this.replaceLine('');
      return;
    }
    this.replaceLine(this.history[this.historyIndex]);
  }

  replaceLine(next) {
    while (this.buffer.length) {
      this.buffer = this.buffer.slice(0, -1);
      this.onData('\b \b');
    }
    this.buffer = next;
    this.onData(next);
  }

  resize() {}

  kill() {
    this.alive = false;
    this.onExit(0);
  }

  listDir(dir) {
    const prefix = dir.endsWith('/') ? dir : `${dir}/`;
    const names = new Set();
    Object.keys(this.fs).forEach((p) => {
      if (p === dir) return;
      if (!p.startsWith(prefix)) return;
      const rest = p.slice(prefix.length);
      const name = rest.split('/')[0];
      if (name) names.add(name);
    });
    return [...names].sort();
  }

  resolve(p) {
    if (!p || p === '~') return '/home/user';
    if (p.startsWith('~/')) return `/home/user/${p.slice(2)}`;
    if (p.startsWith('/')) return pathNormalize(p);
    return pathNormalize(`${this.cwd}/${p}`);
  }

  run(line) {
    const trimmed = line.trim();
    if (!trimmed) {
      this.prompt();
      return;
    }
    if (!this.history.length || this.history[this.history.length - 1] !== trimmed) {
      this.history.push(trimmed);
    }

    const [cmd, ...args] = trimmed.split(/\s+/);
    const rest = trimmed.slice(cmd.length).trim();

    switch (cmd.toLowerCase()) {
      case 'help':
      case '?':
        this.writeLine('Built-in: help, clear, echo, pwd, cd, ls, cat, mkdir, whoami, date, uname, about, history, exit');
        this.writeLine('Tips: Tab autocomplete, ↑/↓ history, Ctrl+C cancel, Ctrl+L clear');
        this.writeLine('Web mode uses a virtual filesystem (desktop app uses real FS + MyShell).');
        break;
      case 'clear':
      case 'cls':
        // Clear scrollback (3J) and viewport (2J), then home cursor.
        this.onData('\x1b[3J\x1b[2J\x1b[H');
        this.buffer = '';
        this.prompt();
        return;
      case 'echo':
        this.writeLine(rest);
        break;
      case 'pwd':
        this.writeLine(this.cwd);
        break;
      case 'cd': {
        const next = this.resolve(args[0] || '/home/user');
        if (this.fs[next]?.type === 'dir' || this.listDir(next).length || next === '/home/user') {
          this.cwd = next;
          if (!this.fs[next]) this.fs[next] = { type: 'dir' };
        } else {
          this.writeLine(`no such directory: ${args[0]}`);
        }
        break;
      }
      case 'ls':
      case 'dir': {
        const target = this.resolve(args[0] || '.');
        const names = this.listDir(target);
        this.writeLine(names.length ? names.map((n) => {
          const full = `${target}/${n}`.replace(/\/+/g, '/');
          return this.fs[full]?.type === 'dir' ? `\x1b[34m${n}/\x1b[0m` : n;
        }).join('  ') : '(empty)');
        break;
      }
      case 'cat':
      case 'type': {
        const file = this.resolve(args[0] || '');
        const node = this.fs[file];
        if (!node || node.type !== 'file') this.writeLine(`no such file: ${args[0]}`);
        else node.content.split('\n').forEach((l) => this.writeLine(l));
        break;
      }
      case 'mkdir':
      case 'md': {
        const dir = this.resolve(args[0] || '');
        this.fs[dir] = { type: 'dir' };
        this.writeLine(`created: ${dir}`);
        break;
      }
      case 'whoami':
        this.writeLine('webuser');
        break;
      case 'date':
        this.writeLine(new Date().toString());
        break;
      case 'uname':
      case 'sysinfo':
        this.writeLine('MyTerminal Web Shell');
        this.writeLine(`Platform: ${navigator.platform}`);
        this.writeLine('Shell: MyShell (built-in, virtual FS)');
        break;
      case 'about':
        this.writeLine('MyTerminal Shell — Author: SHKWON <knix008@naver.com>');
        break;
      case 'history':
        this.history.forEach((h, i) => this.writeLine(`${String(i + 1).padStart(4)}  ${h}`));
        break;
      case 'exit':
      case 'quit':
        this.writeLine('Bye.');
        this.kill();
        return;
      case 'run':
      case 'exec':
        this.writeLine('run/exec is available in the desktop app only.');
        break;
      default:
        this.writeLine(`unknown command: ${cmd}`);
        this.writeLine('Type help for built-in commands.');
    }

    if (this.alive) this.prompt();
  }
}

function pathNormalize(p) {
  const parts = [];
  p.split('/').forEach((part) => {
    if (!part || part === '.') return;
    if (part === '..') parts.pop();
    else parts.push(part);
  });
  return '/' + parts.join('/');
}
