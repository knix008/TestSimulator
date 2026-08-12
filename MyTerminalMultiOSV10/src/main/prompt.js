const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

/** @typedef {'off'|'branch'|'status'} PromptGitMode */

const PROMPT_GIT_MODES = ['off', 'branch', 'status'];
const DEFAULT_PROMPT_GIT_MODE = 'status';

function normalizePromptGitMode(mode) {
  const value = String(mode || '').toLowerCase();
  return PROMPT_GIT_MODES.includes(value) ? value : DEFAULT_PROMPT_GIT_MODE;
}

const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bright_red: '\x1b[91m',
  bright_green: '\x1b[92m',
  bright_yellow: '\x1b[93m',
  bright_blue: '\x1b[94m',
  bright_magenta: '\x1b[95m',
  bright_cyan: '\x1b[96m',
  bright_white: '\x1b[97m',
  bg_black: '\x1b[40m',
  bg_red: '\x1b[41m',
  bg_green: '\x1b[42m',
  bg_yellow: '\x1b[43m',
  bg_blue: '\x1b[44m',
  bg_magenta: '\x1b[45m',
  bg_cyan: '\x1b[46m',
  bg_white: '\x1b[47m',
};

const DEFAULT_PROMPT =
  '{cyan}myterm{reset}:{yellow}{cwd:short}{reset}> ';

const PROMPT_PRESETS = {
  default: {
    id: 'default',
    group: 'basic',
    template: DEFAULT_PROMPT,
  },
  classic: {
    id: 'classic',
    group: 'basic',
    template: '{green}{user}{reset}@{host}:{blue}{cwd:short}{reset}$ ',
  },
  power: {
    id: 'power',
    group: 'basic',
    template: '{bold}{magenta}{user}{reset}@{cyan}{host}{reset} {yellow}{cwd:short}{reset}> ',
  },
  path: {
    id: 'path',
    group: 'basic',
    template: '{cwd}> ',
  },
  minimal: {
    id: 'minimal',
    group: 'basic',
    template: '> ',
  },
  remote: {
    id: 'remote',
    group: 'basic',
    template: '{red}{user}{reset}@{yellow}{host}{reset}:{cyan}{cwd:short}{reset}# ',
  },
  // Oh My Zsh-inspired themes (MyShell approximations; ASCII-safe glyphs).
  // See https://ohmyz.sh/
  ohmyzsh_robbyrussell: {
    id: 'ohmyzsh_robbyrussell',
    group: 'ohmyzsh',
    template: '{bold}{green}>{reset}  {cyan}{cwd:tail}{reset}{git:info} ',
  },
  ohmyzsh_cloud: {
    id: 'ohmyzsh_cloud',
    group: 'ohmyzsh',
    template:
      '{cyan}{user}{reset}@{green}{host}{reset} {yellow}{cwd:short}{reset}{git:info} {magenta}~{reset} ',
  },
  ohmyzsh_arrow: {
    id: 'ohmyzsh_arrow',
    group: 'ohmyzsh',
    template: '{bold}{yellow}>{reset} {cyan}{cwd:tail}{reset}{git:info} ',
  },
  ohmyzsh_half_life: {
    id: 'ohmyzsh_half_life',
    group: 'ohmyzsh',
    template: '{green}>{reset} {cyan}{cwd:short}{reset}{git:info} ',
  },
  ohmyzsh_candy: {
    id: 'ohmyzsh_candy',
    group: 'ohmyzsh',
    template:
      '{green}{user}{reset}@{magenta}{host}{reset} {blue}{cwd:short}{reset} {yellow}[{time}]{reset}{git:info}\n{bold}{cyan}${reset} ',
  },
  ohmyzsh_af_magic: {
    id: 'ohmyzsh_af_magic',
    group: 'ohmyzsh',
    template:
      '{blue}------------------{reset}\n{blue}{cwd:short}{reset}{git:info}\n{bold}{magenta}>{reset} ',
  },
  ohmyzsh_fino: {
    id: 'ohmyzsh_fino',
    group: 'ohmyzsh',
    template:
      '{blue}+--{reset}{green}{user}{reset} {cyan}at{reset} {yellow}{host}{reset} {cyan}in{reset} {bold}{blue}{cwd:short}{reset}{git:info}\n{blue}+--{reset}{green}>{reset} ',
  },
  ohmyzsh_agnoster: {
    id: 'ohmyzsh_agnoster',
    group: 'ohmyzsh',
    // Blue / yellow (and git) segments; right-edge  triangles via applyPowerlineEnds().
    // Requires xterm canvas renderer + customGlyphs (see terminal.js).
    template:
      '{bg_blue}{white} {user}@{host} {bg_yellow}{black} {cwd:short} {git:segment}',
  },
  ohmyzsh_dallas: {
    id: 'ohmyzsh_dallas',
    group: 'ohmyzsh',
    template:
      '{bold}{magenta}[{time}]{reset} {cyan}{user}{reset}@{green}{host}{reset} {yellow}{cwd:short}{reset}{git:info}\n{red}${reset} ',
  },
  ohmyzsh_ys: {
    id: 'ohmyzsh_ys',
    group: 'ohmyzsh',
    template:
      '{blue}#{reset} {cyan}{user}{reset} {blue}in{reset} {yellow}{cwd:short}{reset}{git:info} {blue}[{time}]{reset}\n{red}${reset} ',
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

function cwdTail(cwd) {
  const home = os.homedir();
  try {
    if (path.resolve(cwd) === path.resolve(home)) return '~';
  } catch (_) {
    /* ignore */
  }
  const base = path.basename(cwd || '');
  return base || cwd || '~';
}

const emptyGitTokens = Object.freeze({
  'git:branch': '',
  'git:dirty': '',
  'git:clean': '',
  'git:info': '',
  'git:status': '',
  // Close open bg segment (powerline tip added by applyPowerlineEnds).
  'git:segment': `${COLORS.reset} `,
});

/** @type {Map<string, { at: number, root: string, branch: string }>} */
const gitRootCache = new Map();
/** @type {Map<string, { at: number, dirty: boolean }>} */
const gitDirtyCache = new Map();

function findGitRepo(cwd) {
  const start = path.resolve(cwd || process.cwd());
  const cached = gitRootCache.get(start);
  if (cached && Date.now() - cached.at < 3000) {
    return cached.root ? { root: cached.root, branch: cached.branch } : null;
  }
  try {
    let dir = start;
    for (let i = 0; i < 48; i += 1) {
      const gitPath = path.join(dir, '.git');
      if (fs.existsSync(gitPath)) {
        let headFile = path.join(gitPath, 'HEAD');
        const stat = fs.statSync(gitPath);
        if (stat.isFile()) {
          const content = fs.readFileSync(gitPath, 'utf8');
          const match = content.match(/gitdir:\s*(.+)\s*$/m);
          if (!match) {
            gitRootCache.set(start, { at: Date.now(), root: '', branch: '' });
            return null;
          }
          headFile = path.resolve(dir, match[1].trim(), 'HEAD');
        }
        if (!fs.existsSync(headFile)) {
          gitRootCache.set(start, { at: Date.now(), root: '', branch: '' });
          return null;
        }
        const head = fs.readFileSync(headFile, 'utf8').trim();
        let branch = '';
        if (head.startsWith('ref:')) {
          const parts = head.split('/');
          branch = parts[parts.length - 1] || '';
        } else {
          branch = head.slice(0, 7);
        }
        gitRootCache.set(start, { at: Date.now(), root: dir, branch });
        return { root: dir, branch };
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  } catch (_) {
    /* ignore */
  }
  gitRootCache.set(start, { at: Date.now(), root: '', branch: '' });
  return null;
}

function readGitBranch(cwd) {
  return findGitRepo(cwd)?.branch || '';
}

function isGitDirty(repoRoot) {
  if (!repoRoot) return false;
  const cached = gitDirtyCache.get(repoRoot);
  if (cached && Date.now() - cached.at < 1500) return cached.dirty;
  let dirty = false;
  try {
    const out = execFileSync('git', ['status', '--porcelain', '--ignore-submodules', '-uno'], {
      cwd: repoRoot,
      encoding: 'utf8',
      timeout: 700,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    dirty = String(out || '').trim().length > 0;
  } catch (_) {
    dirty = false;
  }
  gitDirtyCache.set(repoRoot, { at: Date.now(), dirty });
  return dirty;
}

function gitTokens(cwd, mode = DEFAULT_PROMPT_GIT_MODE) {
  const gitMode = normalizePromptGitMode(mode);
  if (gitMode === 'off') return { ...emptyGitTokens };

  const repo = findGitRepo(cwd);
  if (!repo?.branch) return { ...emptyGitTokens };

  const dirty = gitMode === 'status' ? isGitDirty(repo.root) : false;
  const dirtyMark =
    gitMode === 'status' && dirty ? ` ${COLORS.yellow}x${COLORS.reset}` : '';
  const info = ` ${COLORS.bold}${COLORS.blue}git:(${COLORS.red}${repo.branch}${COLORS.blue})${COLORS.reset}${dirtyMark}`;
  const segmentBase = dirty
    ? `${COLORS.bg_red}${COLORS.white} ${repo.branch} x ${COLORS.reset} `
    : `${COLORS.bg_magenta}${COLORS.white} ${repo.branch} ${COLORS.reset} `;

  return {
    'git:branch': repo.branch,
    'git:dirty': dirty ? 'x' : '',
    'git:clean': dirty ? '' : '*',
    'git:info': info,
    'git:status': info,
    'git:segment': segmentBase,
  };
}

/** Map ANSI background color code → matching foreground code. */
const BG_TO_FG = {
  40: 30,
  41: 31,
  42: 32,
  43: 33,
  44: 34,
  45: 35,
  46: 36,
  47: 37,
  100: 90,
  101: 91,
  102: 92,
  103: 93,
  104: 94,
  105: 95,
  106: 96,
  107: 97,
};

function isBgCode(code) {
  return (code >= 40 && code <= 47) || (code >= 100 && code <= 107);
}

/** Powerline right hard divider (xterm draws this as a filled triangle). */
const POWERLINE_RIGHT = '\uE0B0';

/**
 * After any painted (background) segment, append a powerline divider so the
 * colored block itself ends in a ">" shape (not a literal ASCII ">").
 * Applies to every prompt that uses {bg_*} — each segment color gets a tip.
 */
function applyPowerlineEnds(text) {
  const src = String(text ?? '');
  if (!/\x1b\[[0-9;]*m/.test(src)) return src;

  let out = '';
  let i = 0;
  let currentBg = null;

  const readSgr = (from) => {
    if (src[from] !== '\x1b' || src[from + 1] !== '[') return null;
    const end = src.indexOf('m', from + 2);
    if (end === -1) return null;
    const params = src
      .slice(from + 2, end)
      .split(';')
      .filter((p) => p !== '')
      .map((p) => Number(p));
    return { end, params, seq: src.slice(from, end + 1) };
  };

  const isTipChar = (ch) => ch === POWERLINE_RIGHT || ch === '>';

  /** True if upcoming codes are only fg/style then an existing tip glyph. */
  const tipAhead = (from) => {
    let j = from;
    while (j < src.length) {
      const sgr = readSgr(j);
      if (sgr) {
        if (sgr.params.some((p) => p === 0 || isBgCode(p))) return false;
        j = sgr.end + 1;
        continue;
      }
      return isTipChar(src[j]);
    }
    return false;
  };

  /**
   * Divider cell: triangle filled with previous segment color.
   * Next segment color is the cell background (classic agnoster/powerline).
   */
  const writeTip = (fromBg, toBg) => {
    const fg = BG_TO_FG[fromBg];
    if (fg == null) return;
    if (toBg != null) {
      // e.g. blue block → yellow block: yellow bg + blue-filled 
      out += `\x1b[0m\x1b[${toBg}m\x1b[${fg}m${POWERLINE_RIGHT}`;
    } else {
      // Last segment → default:  in previous color, then reset.
      out += `\x1b[0m\x1b[${fg}m${POWERLINE_RIGHT}\x1b[0m`;
    }
  };

  while (i < src.length) {
    const sgr = readSgr(i);
    if (!sgr) {
      out += src[i];
      i += 1;
      continue;
    }

    let nextBg = currentBg;
    let sawReset = false;
    let sawBg = false;
    for (const p of sgr.params) {
      if (p === 0) {
        sawReset = true;
        nextBg = null;
      } else if (isBgCode(p)) {
        sawBg = true;
        nextBg = p;
      }
    }

    if (currentBg != null && nextBg !== currentBg && (sawReset || sawBg)) {
      if (!tipAhead(sgr.end + 1)) {
        writeTip(currentBg, nextBg);
      }
    }

    out += sgr.seq;
    currentBg = nextBg;
    i = sgr.end + 1;
  }

  if (currentBg != null) {
    writeTip(currentBg, null);
  }

  return out;
}

/** Map fancy OMZ glyphs to ASCII so common terminal fonts render them. */
function asciiSafePromptGlyphs(text) {
  return String(text ?? '')
    .replace(/➜/g, '>')
    .replace(/➤/g, '>')
    .replace(/→/g, '>')
    .replace(/»/g, '>')
    .replace(/λ/g, '>')
    .replace(/✗/g, 'x')
    .replace(/✓/g, '*')
    .replace(/☁/g, '~')
    .replace(/╭─/g, '+--')
    .replace(/╰─/g, '+--')
    .replace(/╭/g, '+')
    .replace(/╰/g, '+');
}

function renderPrompt(template, ctx = {}) {
  const now = new Date();
  const cwd = ctx.cwd || process.cwd();
  const gitMode = normalizePromptGitMode(ctx.gitMode);
  const git = gitTokens(cwd, gitMode);
  const values = {
    user: ctx.user || os.userInfo().username || 'user',
    host: ctx.host || os.hostname(),
    cwd,
    'cwd:short': shortCwd(cwd),
    'cwd:tail': cwdTail(cwd),
    time: now.toLocaleTimeString(),
    date: now.toLocaleDateString(),
    shell: ctx.shell || 'MyShell',
    remote: ctx.remote ? 'remote' : 'local',
    ...COLORS,
    ...git,
  };

  let source = asciiSafePromptGlyphs(template || DEFAULT_PROMPT);
  const hasGitToken = /\{git(?::[a-zA-Z0-9_-]+)?\}/.test(source);
  let out = source.replace(/\{([a-zA-Z0-9:_-]+)\}/g, (match, key) => {
    if (Object.prototype.hasOwnProperty.call(values, key)) {
      return String(values[key]);
    }
    return match;
  });

  // If git display is enabled but the template has no git token, append status.
  if (gitMode !== 'off' && !hasGitToken && values['git:info']) {
    out = out.replace(/(\s*)$/, `${values['git:info']}$1`);
  }

  // Allow literal escape sequences in custom templates: \n \r \e[
  out = out
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\e/g, '\x1b')
    .replace(/\\033/g, '\x1b');

  // Any background-painted segment ends with a powerline triangle tip.
  return applyPowerlineEnds(out);
}

/** Resolve a preset id from a template string (exact match after ASCII normalize). */
function findPromptPresetId(template, presets = PROMPT_PRESETS) {
  const normalized = asciiSafePromptGlyphs(template || '');
  for (const [id, preset] of Object.entries(presets || {})) {
    if (asciiSafePromptGlyphs(preset?.template) === normalized) return id;
  }
  return '';
}

/** Built-in preset template, or '' if id is unknown/custom. */
function builtinPresetTemplate(presetId) {
  const preset = PROMPT_PRESETS[presetId];
  return preset?.template ? String(preset.template) : '';
}

/**
 * When a known built-in preset is selected, always use the current built-in
 * template so theme fixes ship on upgrade without stale settings.json text.
 */
function syncBuiltinPromptTemplate(presetId, currentTemplate) {
  const builtin = builtinPresetTemplate(presetId);
  return builtin || currentTemplate;
}

module.exports = {
  COLORS,
  DEFAULT_PROMPT,
  DEFAULT_PROMPT_GIT_MODE,
  PROMPT_GIT_MODES,
  PROMPT_PRESETS,
  normalizePromptGitMode,
  asciiSafePromptGlyphs,
  findPromptPresetId,
  builtinPresetTemplate,
  syncBuiltinPromptTemplate,
  renderPrompt,
  shortCwd,
  cwdTail,
  readGitBranch,
  gitTokens,
};
