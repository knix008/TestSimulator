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
  bg_bright_red: '\x1b[101m',
  bg_bright_green: '\x1b[102m',
  bg_bright_magenta: '\x1b[105m',
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
    // Blue / yellow / git segments; right-edge  via applyPowerlineEnds().
    // Trailing {reset} closes the last open bg (cwd or git) with a tip.
    template:
      '{bg_blue}{white} {user}@{host} {bg_yellow}{black} {cwd:short} {git:segment}{reset} ',
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
  // Agnoster: empty means no git segment (caller closes with {reset}).
  'git:segment': '',
});

/** @type {Map<string, { at: number, root: string, branch: string }>} */
const gitRootCache = new Map();
/** @type {Map<string, { at: number, dirty: boolean }>} */
const gitDirtyCache = new Map();
/** @type {Map<string, { at: number, ahead: number }>} */
const gitAheadCache = new Map();

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

/** Commits on HEAD not yet on upstream (0 if no upstream / synced). */
function gitAheadCount(repoRoot) {
  if (!repoRoot) return 0;
  const cached = gitAheadCache.get(repoRoot);
  if (cached && Date.now() - cached.at < 1500) return cached.ahead;
  let ahead = 0;
  try {
    const out = execFileSync('git', ['rev-list', '--count', '@{upstream}..HEAD'], {
      cwd: repoRoot,
      encoding: 'utf8',
      timeout: 700,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    ahead = Math.max(0, Number.parseInt(String(out || '').trim(), 10) || 0);
  } catch (_) {
    // No upstream configured — treat as nothing left to push.
    ahead = 0;
  }
  gitAheadCache.set(repoRoot, { at: Date.now(), ahead });
  return ahead;
}

function gitTokens(cwd, mode = DEFAULT_PROMPT_GIT_MODE) {
  const gitMode = normalizePromptGitMode(mode);
  if (gitMode === 'off') return { ...emptyGitTokens };

  const repo = findGitRepo(cwd);
  if (!repo?.branch) return { ...emptyGitTokens };

  const dirty = gitMode === 'status' ? isGitDirty(repo.root) : false;
  const ahead = gitMode === 'status' ? gitAheadCount(repo.root) : 0;
  const dirtyMark =
    gitMode === 'status' && dirty ? ` ${COLORS.yellow}x${COLORS.reset}` : '';
  const info = ` ${COLORS.bold}${COLORS.blue}git:(${COLORS.red}${repo.branch}${COLORS.blue})${COLORS.reset}${dirtyMark}`;
  // Agnoster segment colors (status mode):
  //   dirty  → bright red (same black-on-color path as green — dark red + white
  //            tip AA used to read as a short bottom edge)
  //   clean but unpushed (ahead) → bright magenta
  //   clean and pushed / in sync → green
  let segmentBase;
  if (dirty) {
    segmentBase = `${COLORS.bg_bright_red}${COLORS.black} ${repo.branch} x `;
  } else if (ahead > 0) {
    segmentBase = `${COLORS.bg_bright_magenta}${COLORS.black} ${repo.branch} `;
  } else {
    segmentBase = `${COLORS.bg_green}${COLORS.black} ${repo.branch} `;
  }

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

/**
 * Powerline right tip (U+E0B0). Drawn by xterm customGlyphs.
 * Do not use ASCII ">" or ▶.
 */
const SEGMENT_TIP = '\uE0B0';

/** Parse #RRGGBB into `R;G;B` for truecolor SGR, or null if invalid. */
function parseHexRgb(hex) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || '').trim());
  if (!m) return null;
  return `${parseInt(m[1], 16)};${parseInt(m[2], 16)};${parseInt(m[3], 16)}`;
}

/**
 * After any painted (background) segment, append a powerline tip cell.
 *
 * Mid tips: next segment ANSI bg + previous-color glyph (wedges = next color).
 * End tips: prefer opaque truecolor theme bg + segment-colored  (same full-cell
 * height path as mid tips). When no endTipBg is available (wallpaper /
 * transparency), keep the segment ANSI bg and segment fg so the bar stays full
 * height — a white/black contrast tip AA-fringes darker red/magenta bars.
 */
function applyPowerlineEnds(text, endTipBg) {
  const src = String(text ?? '');
  if (!/\x1b\[[0-9;]*m/.test(src)) return src;

  const endTipRgb = parseHexRgb(endTipBg);
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

  const isTipChar = (ch) => ch === SEGMENT_TIP || ch === '\u25B6';

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

  const writeTip = (fromBg, toBg) => {
    const prevFg = BG_TO_FG[fromBg];
    if (prevFg == null) return;
    if (toBg != null) {
      // Join: next segment paints the full cell; tip is previous color.
      out += `\x1b[${toBg};${prevFg}m${SEGMENT_TIP}`;
    } else if (endTipRgb) {
      // Opaque theme bg fills the cell (full height);  is the segment color.
      out += `\x1b[48;2;${endTipRgb}m\x1b[${prevFg}m${SEGMENT_TIP}\x1b[0m`;
    } else {
      // Wallpaper / no endTipBg: keep segment bg+fg so red/magenta stay full
      // height (contrast tips AA into a short-looking bottom edge).
      out += `\x1b[${fromBg};${prevFg}m${SEGMENT_TIP}\x1b[0m`;
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
      // Skip emitting a bare reset that only existed to close a bg segment;
      // writeTip already reset when ending the prompt.
      if (sawReset && nextBg == null && sgr.params.every((p) => p === 0)) {
        currentBg = null;
        i = sgr.end + 1;
        continue;
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
  return applyPowerlineEnds(out, ctx.endTipBg);
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
