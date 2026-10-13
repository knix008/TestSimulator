const fs = require('fs');
const path = require('path');
const { getDataPath } = require('./connection');

const FORMAT = 'mykanban-settings';
const VERSION = 1;

function settingsPath() {
  return path.join(getDataPath(), 'app-settings.json');
}

const COLOR_KEYS = ['primary', 'bg', 'bgCard', 'bgHeader', 'text', 'border', 'danger', 'success', 'warning'];
const THEME_ID = /^(?:light|dark)-(?:0[1-9]|1\d|20)$|^custom-[a-z0-9]{4,24}$/;

function sanitizeCustom(item) {
  if (!item || typeof item !== 'object') return null;
  const id = String(item.id || '');
  if (!/^custom-[a-z0-9]{4,24}$/.test(id)) return null;
  const name = String(item.name || '').trim().slice(0, 40);
  if (!name) return null;
  const next = { id, name, mode: item.mode === 'dark' ? 'dark' : 'light' };
  for (const key of COLOR_KEYS) {
    if (!/^#[0-9A-Fa-f]{6}$/.test(item[key] || '')) return null;
    next[key] = String(item[key]).toUpperCase();
  }
  return next;
}

function normalize(data) {
  const theme = data?.theme === 'dark' ? 'dark' : data?.theme === 'light' ? 'light' : null;
  const lang = data?.lang === 'en' ? 'en' : data?.lang === 'ko' ? 'ko' : null;
  const themeId = typeof data?.themeId === 'string' && THEME_ID.test(data.themeId)
    ? data.themeId
    : (theme === 'dark' ? 'dark-01' : 'light-01');
  const customThemes = Array.isArray(data?.customThemes)
    ? data.customThemes.map(sanitizeCustom).filter(Boolean).slice(0, 40)
    : [];
  return { theme, lang, themeId, customThemes };
}

function readAppSettings() {
  const file = settingsPath();
  if (!fs.existsSync(file)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (data.format !== FORMAT) return null;
    const next = normalize(data);
    if (!next.theme || !next.lang) return null;
    if (!(typeof data.themeId === 'string' && THEME_ID.test(data.themeId))) next.themeId = null;
    return next;
  } catch {
    return null;
  }
}

function writeAppSettings(partial) {
  const current = readAppSettings() || { theme: 'light', lang: 'ko', themeId: 'light-01', customThemes: [] };
  const theme = partial?.theme === 'dark' || partial?.theme === 'light' ? partial.theme : current.theme;
  const lang = partial?.lang === 'en' || partial?.lang === 'ko' ? partial.lang : current.lang;
  const themeId = typeof partial?.themeId === 'string' && THEME_ID.test(partial.themeId)
    ? partial.themeId
    : (THEME_ID.test(current.themeId || '') ? current.themeId : (theme === 'dark' ? 'dark-01' : 'light-01'));
  const customThemes = Array.isArray(partial?.customThemes)
    ? partial.customThemes.map(sanitizeCustom).filter(Boolean).slice(0, 40)
    : (current.customThemes || []);
  const next = { theme, lang, themeId, customThemes };
  const file = settingsPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const body = { format: FORMAT, version: VERSION, ...next };
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(body, null, 2), 'utf8');
  try { if (fs.existsSync(file)) fs.unlinkSync(file); } catch {}
  fs.renameSync(tmp, file);
  return { ...next, saved: true };
}

module.exports = { readAppSettings, writeAppSettings, settingsPath };
