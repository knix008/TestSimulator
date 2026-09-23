'use strict';

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const BUILTIN_DIR = path.join(__dirname, '..', '..', 'themes');

function userDir() {
  return path.join(app.getPath('userData'), 'themes');
}

/**
 * A theme is a folder holding `theme.json` plus any images it references.
 * `variables` become CSS custom properties on the dock root; `css` is an
 * optional extra stylesheet loaded after the base styles.
 */
function readTheme(dir, builtin) {
  const manifest = path.join(dir, 'theme.json');
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(manifest, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') console.error(`[themes] bad manifest in ${dir}:`, err.message);
    return null;
  }

  const id = raw.id || path.basename(dir);
  let css = '';
  if (raw.css) {
    try {
      css = fs.readFileSync(path.join(dir, raw.css), 'utf8');
    } catch (err) {
      console.error(`[themes] ${id}: cannot read ${raw.css}:`, err.message);
    }
  }

  // Rewrite url(...) so theme images resolve against the theme folder no matter
  // where the renderer page itself lives.
  const base = fileUrl(dir);
  css = css.replace(/url\(\s*(['"]?)(?!data:|https?:|file:)([^'")]+)\1\s*\)/g, (_m, q, rel) =>
    `url(${q}${base}/${rel.replace(/^\.\//, '')}${q})`);

  const variables = { ...(raw.variables || {}) };
  for (const key of Object.keys(variables)) {
    const val = variables[key];
    if (typeof val === 'string') {
      variables[key] = val.replace(/url\(\s*(['"]?)(?!data:|https?:|file:)([^'")]+)\1\s*\)/g,
        (_m, q, rel) => `url(${q}${base}/${rel.replace(/^\.\//, '')}${q})`);
    }
  }

  return {
    id,
    name: raw.name || id,
    author: raw.author || '',
    description: raw.description || '',
    dark: raw.dark !== false,
    builtin: !!builtin,
    dir,
    variables,
    // Optional palette for the settings window, so picking a dock theme
    // re-skins the whole application. Themes without one fall back to the
    // stylesheet's light/dark defaults.
    ui: raw.ui && typeof raw.ui === 'object' ? raw.ui : null,
    css,
  };
}

function fileUrl(p) {
  let resolved = path.resolve(p).replace(/\\/g, '/');
  if (!resolved.startsWith('/')) resolved = `/${resolved}`;
  return `file://${encodeURI(resolved).replace(/[?#]/g, encodeURIComponent)}`;
}

function scan(dir, builtin) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => readTheme(path.join(dir, e.name), builtin))
    .filter(Boolean);
}

function list() {
  const builtin = scan(BUILTIN_DIR, true);
  const custom = scan(userDir(), false);
  const seen = new Map();
  for (const theme of [...builtin, ...custom]) seen.set(theme.id, theme); // user themes win
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function get(id) {
  const all = list();
  return all.find((t) => t.id === id) || all.find((t) => t.id === 'aqua') || all[0] || null;
}

function ensureUserDir() {
  const dir = userDir();
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

module.exports = { list, get, ensureUserDir, userDir, BUILTIN_DIR, fileUrl };
