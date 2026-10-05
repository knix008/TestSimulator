'use strict';

const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const themes = require('./themes');
const rules = require('../shared/rules');
const snaps = require('../shared/snaps');
const i18n = require('../shared/i18n');

const VERSION = 2;

// 첫 페이지. 예전 저장본의 박스는 모두 이 페이지에 있다고 본다.
const HOME_PAGE = 'main';

function defaults() {
  return {
    version: VERSION,
    didWelcome: false,
    hidden: false,
    // 바탕화면 페이지. 한 페이지에 속한 박스만 화면에 보인다.
    pages: [{ id: HOME_PAGE, name: '' }],
    page: HOME_PAGE,
    // 배치 스냅샷. 박스의 자리와 모습만 적는다. 담긴 파일은 적지 않는다.
    snaps: [],
    settings: {
      lang: i18n.guessLang(safeLocale()),
      // 설치하고 시스템을 다시 켤 때 스스로 돌아와 있어야 한다. 끄고 싶으면 설정에서 끈다.
      openAtLogin: true,
      theme: themes.DEFAULT_THEME,
      opacity: themes.DEFAULT_OPACITY,
      corner: themes.DEFAULT_CORNER,
      shadow: false,
      // 박스 뒤로 바탕화면을 흐려 비춘다. Palisades 의 흐림과 같다.
      blur: true,
      // 박스 안의 아이콘을 한 번 눌러 열지, 두 번 눌러 열지.
      openWith: 'double',
      // 박스에 담을 때 파일을 어떻게 할지.
      //
      //  keep — 있는 자리에 그대로 두고, 박스는 그것을 가리켜 보여 주기만 한다.
      //         바탕화면에서 사라지지 않으므로 같은 항목이 두 곳에 함께 보인다.
      //  move — 파일을 박스 폴더로 옮긴다. 바탕화면에서는 사라진다.
      //
      // 기본은 keep 이다. 담는 것만으로 사람의 파일이 움직이지 않는 쪽이 놀랄 일이 적다.
      takeWith: 'keep',
      // 바탕화면에 새로 생긴 항목을 규칙대로 박스에 담을지.
      // 파일이 저절로 옮겨 가는 일이므로 사람이 켜 주기 전에는 하지 않는다.
      autoSort: false,
      // 자동 분류 규칙. 무엇을 어느 박스로 보낼지 적어 둔 것이다.
      rules: [],
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
      data.settings.takeWith = data.settings.takeWith === 'move' ? 'move' : 'keep';
      data.settings.openAtLogin = !!data.settings.openAtLogin;
      data.settings.blur = !!data.settings.blur;
      data.settings.autoSort = !!data.settings.autoSort;
      data.settings.rules = rules.normalizeRules(data.settings.rules);
      data.settings.root = typeof data.settings.root === 'string' ? data.settings.root : '';
      data.pages = normalizePages(parsed.pages);
      if (parsed.page) data.page = String(parsed.page);
      data.snaps = snaps.normalizeSnaps(parsed.snaps);
      if (Array.isArray(parsed.fences)) data.fences = parsed.fences.map(normalizeFence);
      // 없어진 페이지를 가리키는 박스는 첫 페이지로 데려온다. 보이지 않는 박스를 남기지 않는다.
      settlePages(data);
    }
  } catch (_err) {
    /* 처음 실행이거나 파일이 깨진 경우 기본값으로 시작한다. */
  }
  return data;
}

// 페이지 목록. 하나도 없으면 첫 페이지를 둔다. 페이지 없는 판에서 올라온 저장본이 이 길로 온다.
function normalizePages(raw) {
  const made = [];
  const seen = new Set();
  for (const page of Array.isArray(raw) ? raw : []) {
    if (!page || !page.id) continue;
    const id = String(page.id);
    if (seen.has(id)) continue;
    seen.add(id);
    made.push({ id, name: String(page.name || '') });
  }
  if (!made.length) made.push({ id: HOME_PAGE, name: '' });
  return made;
}

// 박스가 가리키는 페이지와 지금 보고 있는 페이지를 목록과 맞춘다.
function settlePages(data) {
  const known = new Set(data.pages.map((page) => page.id));
  const first = data.pages[0].id;
  for (const fence of data.fences) {
    if (!known.has(fence.page)) fence.page = first;
  }
  if (!known.has(data.page)) data.page = first;
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
    opacity: clamp(Number(raw.opacity) || themes.DEFAULT_OPACITY, themes.MIN_OPACITY, themes.MAX_OPACITY),
    corner: themes.cornerRadius(raw.corner),
    custom: normalizeCustom(raw.custom),
    // 이 박스만의 글자 색과 그림 크기. 적지 않은 값은 테마가 정한 대로 쓴다.
    look: themes.normalizeLook(raw.look),
    collapsed: !!raw.collapsed,
    // 이 박스가 선 바탕화면 페이지.
    page: raw.page ? String(raw.page) : HOME_PAGE,
    // 폴더 포털이면 비춰 보여 줄 폴더의 자리. 그 폴더의 파일은 옮기지 않는다.
    portal: typeof raw.portal === 'string' ? raw.portal : '',
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
      // 옮기지 않고 가리키기만 한 항목. 꺼내거나 끝낼 때 이 파일을 건드리지 않는다.
      //
      // 담을 때의 방식을 항목에 새겨 둔다. 설정만 보고 판단하면, 그대로 두기로 담은 뒤
      // 설정을 옮기기로 바꾸고 끝냈을 때 남의 폴더에 있던 파일이 바탕화면으로 쏟아진다.
      if (item.keep) kept.keep = true;
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

module.exports = { load, save, defaults, normalizeFence, normalizePages, settlePages, HOME_PAGE };
