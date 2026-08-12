const os = require('os');

const COLORS = {
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
};

const DEFAULT_PROMPT =
  '{cyan}myterm{reset}:{yellow}{cwd:short}{reset}> ';

const PROMPT_PRESETS = {
  default: {
    id: 'default',
    template: DEFAULT_PROMPT,
  },
  classic: {
    id: 'classic',
    template: '{green}{user}{reset}@{host}:{blue}{cwd:short}{reset}$ ',
  },
  power: {
    id: 'power',
    template: '{bold}{magenta}{user}{reset}@{cyan}{host}{reset} {yellow}{cwd:short}{reset}> ',
  },
  path: {
    id: 'path',
    template: '{cwd}> ',
  },
  minimal: {
    id: 'minimal',
    template: '> ',
  },
  remote: {
    id: 'remote',
    template: '{red}{user}{reset}@{yellow}{host}{reset}:{cyan}{cwd:short}{reset}# ',
  },
};

function shortCwd(cwd) {
  const home = os.homedir();
  let display = cwd;
  if (cwd.toLowerCase().startsWith(home.toLowerCase())) {
    display = '~' + cwd.slice(home.length);
  }
  if (process.platform === 'win32') {
    display = display.replace(/\//g, '\\');
  } else {
    display = display.replace(/\\/g, '/');
  }
  return display;
}

function renderPrompt(template, ctx = {}) {
  const now = new Date();
  const cwd = ctx.cwd || process.cwd();
  const values = {
    user: ctx.user || os.userInfo().username || 'user',
    host: ctx.host || os.hostname(),
    cwd,
    'cwd:short': shortCwd(cwd),
    time: now.toLocaleTimeString(),
    date: now.toLocaleDateString(),
    shell: ctx.shell || 'MyShell',
    remote: ctx.remote ? 'remote' : 'local',
    ...COLORS,
  };

  let out = String(template || DEFAULT_PROMPT);
  out = out.replace(/\{([a-zA-Z0-9:_-]+)\}/g, (match, key) => {
    if (Object.prototype.hasOwnProperty.call(values, key)) {
      return String(values[key]);
    }
    return match;
  });
  // Allow literal escape sequences in custom templates: \n \r \e[
  out = out
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\e/g, '\x1b')
    .replace(/\\033/g, '\x1b');
  return out;
}

module.exports = {
  COLORS,
  DEFAULT_PROMPT,
  PROMPT_PRESETS,
  renderPrompt,
  shortCwd,
};
