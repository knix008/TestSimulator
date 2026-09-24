'use strict';

const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const themes = require('./themes');
const i18n = require('../shared/i18n');

const VERSION = 1;

function defaults() {
  return {
    version: VERSION,
    didWelcome: false,
    hidden: false,
    settings: {
      lang: i18n.guessLang(safeLocale()),
      openAtLogin: false,
      theme: themes.DEFAULT_THEME,
      opacity: themes.DEFAULT_OPACITY,
      corner: themes.DEFAULT_CORNER,
    },
    fences: [],
  };
}

function safeLocale() {
  try {
    return app.getLocale();
  } catch (_err) {
    return '';
  }
}

function filePath() {
  return path.join(app.getPath('userData'), 'layout.json');
}

function load() {
  const data = defaults();
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath(), 'utf8'));
    if (parsed && typeof parsed === 'object') {
      data.didWelcome = !!parsed.didWelcome;
      data.hidden = !!parsed.hidden;
      Object.assign(data.settings, parsed.settings || {});
      data.settings.lang = i18n.langOf(data.settings.lang);
      if (Array.isArray(parsed.fences)) data.fences = parsed.fences.map(normalizeFence);
    }
  } catch (_err) {
    /* 처음 실행이거나 파일이 깨진 경우 기본값으로 시작한다. */
  }
  return data;
}

function normalizeFence(raw) {
  const fence = {
    id: String(raw.id || ''),
    title: String(raw.title || '새 박스'),
    x: Number(raw.x) || 80,
    y: Number(raw.y) || 80,
    w: Math.max(180, Number(raw.w) || 280),
    h: Math.max(160, Number(raw.h) || 320),
    // 예전 저장본은 색 하나만 갖고 있다. 가장 가까운 테마로 옮겨 준다.
    theme: themes.themeOf(raw.theme || themes.themeForColor(raw.color)).id,
    opacity: clamp(Number(raw.opacity) || themes.DEFAULT_OPACITY, 0.15, 0.9),
    corner: themes.cornerRadius(raw.corner),
    custom: normalizeCustom(raw.custom),
    collapsed: !!raw.collapsed,
    items: [],
  };
  if (Array.isArray(raw.items)) {
    for (const item of raw.items) {
      if (!item || !item.path) continue;
      fence.items.push({ name: String(item.name || path.basename(item.path)), path: String(item.path) });
    }
  }
  return fence;
}

// 직접 고른 색. 잘못된 값은 버린다.
function normalizeCustom(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const bg = themes.parseHex(raw.bg) ? String(raw.bg) : null;
  if (!bg) return null;
  const bar = themes.parseHex(raw.bar) ? String(raw.bar) : themes.darken(bg, 0.55);
  return { bg, bar };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function save(data) {
  const file = filePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

module.exports = { load, save, defaults, normalizeFence };
