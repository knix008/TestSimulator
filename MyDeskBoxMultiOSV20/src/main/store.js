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
      // 설치하고 시스템을 다시 켤 때 스스로 돌아와 있어야 한다. 끄고 싶으면 설정에서 끈다.
      openAtLogin: true,
      theme: themes.DEFAULT_THEME,
      opacity: themes.DEFAULT_OPACITY,
      corner: themes.DEFAULT_CORNER,
      shadow: false,
      // 박스 안의 아이콘을 한 번 눌러 열지, 두 번 눌러 열지.
      openWith: 'double',
      // 박스들이 쓰는 보관함 폴더. 비워 두면 사용자 데이터 폴더 아래 'boxes' 를 쓴다.
      // 바탕화면에 두면 '숨긴 항목 표시'를 켜 둔 사람에게 폴더가 하나 더 보인다.
      root: '',
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
      data.settings.openWith = data.settings.openWith === 'single' ? 'single' : 'double';
      data.settings.openAtLogin = !!data.settings.openAtLogin;
      data.settings.root = typeof data.settings.root === 'string' ? data.settings.root : '';
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
    // 이 박스가 쓰는 폴더 이름. 보관함 폴더 아래에 있다.
    folder: typeof raw.folder === 'string' ? raw.folder : '',
    items: [],
  };
  if (Array.isArray(raw.items)) {
    for (const item of raw.items) {
      if (!item || !item.path) continue;
      const kept = { name: String(item.name || path.basename(item.path)), path: String(item.path) };
      // 담기 전에 있던 폴더. 끝낼 때 그 자리로 돌려준다.
      if (typeof item.home === 'string' && item.home) kept.home = item.home;
      fence.items.push(kept);
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
