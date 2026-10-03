'use strict';

/** 테마 — 색 묶음이 빠짐없이 들어 있는지, 사용자 정의 색이 테마가 되는지. */

const test = require('node:test');
const assert = require('node:assert/strict');
const { installDom } = require('./helpers/fakes');
const {
  THEMES,
  THEME_NAMES,
  THEME_FAMILIES,
  DARK_THEME_NAMES,
  LIGHT_THEME_NAMES,
  XAML_THEME_NAMES,
  PALETTE_THEME_NAMES,
  CUSTOM_THEME,
  DEFAULT_CUSTOM_COLOR,
  applyTheme,
  themeFamilyOf,
  isLightTheme,
  themeVariant,
  buildTheme,
  customThemeFrom,
  setCustomTheme,
  mix,
  luminance,
  hueShift,
  readableOn
} = require('../src/js/data/themes');

const VAR_KEYS = Object.keys(THEMES.DarkTheme.vars);

test('테마가 넉넉히 있고 이름이 겹치지 않는다', () => {
  assert.ok(THEME_FAMILIES.length >= 25, `색 가짓수: ${THEME_FAMILIES.length}`);
  assert.equal(new Set(THEME_NAMES).size, THEME_NAMES.length);
  assert.equal(XAML_THEME_NAMES.length, 18, 'WPF 판에서 가져온 18가지는 그대로 있다');
  assert.ok(PALETTE_THEME_NAMES.length >= 12, '팔레트로 더한 테마');
  assert.equal(THEME_NAMES.at(-1), CUSTOM_THEME, '사용자 정의는 목록 끝에 둔다');
});

test('어두운 판과 밝은 판의 수가 같다', () => {
  assert.equal(DARK_THEME_NAMES.length, LIGHT_THEME_NAMES.length, '두 쪽 수가 다르다');
  assert.equal(DARK_THEME_NAMES.length, THEME_FAMILIES.length);
  assert.equal(THEME_NAMES.length, THEME_FAMILIES.length * 2 + 1, '어두운 판 + 밝은 판 + 사용자 색');

  // 이름만 그런 것이 아니라 실제 바탕 밝기도 그래야 한다.
  for (const name of DARK_THEME_NAMES) {
    const L = luminance(THEMES[name].vars['--window-background']);
    assert.ok(L < 0.5, `${name} 은 어두운 판인데 바탕이 밝다 (${L.toFixed(2)})`);
  }
  for (const name of LIGHT_THEME_NAMES) {
    const L = luminance(THEMES[name].vars['--window-background']);
    assert.ok(L > 0.5, `${name} 은 밝은 판인데 바탕이 어둡다 (${L.toFixed(2)})`);
  }
});

test('색마다 어두운 판과 밝은 판이 짝으로 있다', () => {
  for (const family of THEME_FAMILIES) {
    assert.ok(THEMES[family.dark], `${family.label}: 어두운 판이 없다`);
    assert.ok(THEMES[family.light], `${family.label}: 밝은 판이 없다`);
    assert.equal(isLightTheme(family.dark), false);
    assert.equal(isLightTheme(family.light), true);

    // 두 판은 같은 색이다 — 강조색의 색상이 크게 달라지면 안 된다.
    assert.equal(themeVariant(family.dark, true), family.light);
    assert.equal(themeVariant(family.light, false), family.dark);
    assert.equal(themeFamilyOf(family.dark), family);
    assert.equal(themeFamilyOf(family.light), family);
  }
  assert.equal(themeFamilyOf('없는테마'), null);
  assert.equal(themeVariant('없는테마', true), '없는테마', '짝이 없으면 그대로 둔다');
});

test('어떤 테마에서도 디지털 숫자와 바늘이 바탕에 묻히지 않는다', () => {
  for (const name of THEME_NAMES) {
    const v = THEMES[name].vars;
    const digits = Math.abs(luminance(v['--digital-text']) - luminance(v['--window-background']));
    const minute = Math.abs(luminance(v['--minute-hand']) - luminance(v['--clock-face']));
    const second = Math.abs(luminance(v['--second-hand']) - luminance(v['--clock-face']));
    assert.ok(digits > 0.2, `${name}: 숫자가 바탕에 묻힌다 (${digits.toFixed(2)})`);
    assert.ok(minute > 0.2, `${name}: 분침이 문자판에 묻힌다 (${minute.toFixed(2)})`);
    assert.ok(second > 0.2, `${name}: 초침이 문자판에 묻힌다 (${second.toFixed(2)})`);
  }
});

test('모든 테마가 같은 색 변수를 빠짐없이 갖는다', () => {
  for (const name of THEME_NAMES) {
    const theme = THEMES[name];
    assert.ok(theme, `${name} 테마가 없다`);
    assert.ok(theme.label && theme.label.length <= 6, `${name} 이름표가 너무 길다: ${theme.label}`);

    const keys = Object.keys(theme.vars);
    for (const key of VAR_KEYS) assert.ok(keys.includes(key), `${name} 에 ${key} 가 없다`);
    assert.equal(keys.length, VAR_KEYS.length, `${name} 에 쓰이지 않는 색이 있다`);

    for (const [key, value] of Object.entries(theme.vars)) {
      assert.match(value, /^#[0-9A-F]{6}$/, `${name} ${key} = ${value}`);
    }
  }
});

test('한쪽 판 안에서 이름표가 서로 다르다', () => {
  // 같은 색의 어두운 판과 밝은 판은 같은 이름을 쓴다 (목록에는 한 번만 나온다).
  for (const list of [DARK_THEME_NAMES, LIGHT_THEME_NAMES]) {
    const labels = list.map((name) => THEMES[name].label);
    assert.equal(new Set(labels).size, labels.length, labels.join(', '));
  }
  const families = THEME_FAMILIES.map((family) => family.label);
  assert.equal(new Set(families).size, families.length, families.join(', '));
});

test('글자색과 바탕색이 충분히 구분된다', () => {
  for (const name of THEME_NAMES) {
    const vars = THEMES[name].vars;
    const gap = Math.abs(luminance(vars['--foreground']) - luminance(vars['--window-background']));
    assert.ok(gap > 0.35, `${name}: 글자와 바탕의 밝기 차이가 ${gap.toFixed(2)} 뿐이다`);
  }
});

test('문자판 위의 시침·분침·초침이 문자판과 구분된다', () => {
  for (const name of THEME_NAMES) {
    const vars = THEMES[name].vars;
    for (const hand of ['--hour-hand', '--minute-hand', '--second-hand']) {
      assert.notEqual(vars[hand], vars['--clock-face'], `${name} ${hand} 이 문자판 색과 같다`);
    }
  }
});

test('applyTheme 이 문서 루트에 색을 꽂고 테마 이름을 적어 둔다', () => {
  const restore = installDom();
  try {
    const root = restore.documentElement;
    applyTheme('OceanTheme', root);
    assert.equal(root.dataset.theme, 'OceanTheme');
    assert.equal(root.style.getPropertyValue('--accent'), THEMES.OceanTheme.vars['--accent']);

    // 없는 테마를 주면 다크로 되돌린다 — 설정 파일이 손상돼도 창이 보여야 한다.
    applyTheme('없는테마', root);
    assert.equal(root.dataset.theme, 'DarkTheme');
    assert.equal(root.style.getPropertyValue('--accent'), THEMES.DarkTheme.vars['--accent']);
  } finally {
    restore();
  }
});

test('색 섞기 — mix 는 양 끝과 가운데를 맞게 낸다', () => {
  assert.equal(mix('#000000', '#FFFFFF', 0), '#000000');
  assert.equal(mix('#000000', '#FFFFFF', 1), '#FFFFFF');
  assert.equal(mix('#000000', '#FFFFFF', 0.5), '#808080');
  assert.equal(mix('#FF0000', '#00FF00', 0.5), '#808000');
});

test('readableOn 은 밝은 색 위에 어두운 글자를 올린다', () => {
  assert.equal(readableOn('#FFFFFF'), '#14161C');
  assert.equal(readableOn('#FFE066'), '#14161C');
  assert.equal(readableOn('#1E1E2E'), '#FFFFFF');
});

test('hueShift 는 강조색과 다른 색을 낸다 (초침용)', () => {
  for (const color of ['#FF0000', '#00FF00', '#2DD4BF', '#808080', '#FFFFFF']) {
    const shifted = hueShift(color, 150);
    assert.match(shifted, /^#[0-9A-F]{6}$/);
    assert.notEqual(shifted, color.toUpperCase());
    // 무채색을 넣어도 눈에 보이는 색이 나와야 한다.
    assert.ok(luminance(shifted) > 0.2, `${color} → ${shifted}`);
  }
});

test('buildTheme 은 팔레트 몇 색으로 한 벌을 다 만든다', () => {
  const theme = buildTheme('검사', { base: '#101020', accent: '#44AAFF' });
  assert.equal(theme.label, '검사');
  assert.deepEqual(Object.keys(theme.vars).sort(), VAR_KEYS.slice().sort());
  assert.equal(theme.vars['--window-background'], '#101020');
  assert.equal(theme.vars['--accent'], '#44AAFF');
  assert.equal(theme.vars['--minute-hand'], '#44AAFF');
  assert.equal(theme.vars['--digital-text'], '#44AAFF');
});

test('밝은 바탕 테마는 문자판이 바탕보다 밝고, 어두운 테마는 더 어둡다', () => {
  const light = buildTheme('밝은', { base: '#F0F0F4', accent: '#2563EB', light: true });
  const dark = buildTheme('어두운', { base: '#14141C', accent: '#2563EB' });
  assert.ok(luminance(light.vars['--clock-face']) > luminance(light.vars['--window-background']));
  assert.ok(luminance(dark.vars['--clock-face']) < luminance(dark.vars['--window-background']));
  assert.ok(luminance(light.vars['--foreground']) < 0.5, '밝은 바탕에는 어두운 글자');
  assert.ok(luminance(dark.vars['--foreground']) > 0.5, '어두운 바탕에는 밝은 글자');
});

test('사용자 정의 테마 — 고른 색이 강조·분침·디지털 색이 된다', () => {
  const theme = customThemeFrom('#ff8800', false);
  assert.equal(theme.vars['--accent'], '#FF8800');
  assert.equal(theme.vars['--clock-border'], '#FF8800');
  assert.equal(theme.vars['--digital-text'], '#FF8800');
  // 바탕은 고른 색이 살짝 섞인 어두운 색
  assert.ok(luminance(theme.vars['--window-background']) < 0.3);
});

test('사용자 정의 테마 — 어두운 바탕에서는 고른 색을 그대로 쓴다', () => {
  for (const color of ['#FF8800', '#2DD4BF', '#89B4FA', '#A3E635']) {
    assert.equal(customThemeFrom(color, false).vars['--accent'], color);
  }
  // 너무 어두운 색은 어두운 바탕에서 보이지 않으므로 끌어올린다.
  const navy = customThemeFrom('#001F5B', false).vars;
  assert.ok(luminance(navy['--accent']) > luminance('#001F5B'), '어두운 색은 밝게 당긴다');
  // 밝은 바탕에서는 반대로 눌러 준다.
  const neon = customThemeFrom('#2DD4BF', true).vars;
  assert.ok(luminance(neon['--digital-text']) < luminance(neon['--window-background']) - 0.3);
});

test('사용자 정의 테마 — 색이 이상하면 기본 색으로 되돌린다', () => {
  for (const bad of [null, undefined, '', 'red', '#12345', 123]) {
    const theme = customThemeFrom(bad, false);
    assert.equal(theme.vars['--accent'], DEFAULT_CUSTOM_COLOR, `입력: ${String(bad)}`);
  }
});

test('사용자 정의 테마 — 밝은 바탕을 고르면 바탕이 밝아진다', () => {
  const dark = customThemeFrom('#89B4FA', false);
  const light = customThemeFrom('#89B4FA', true);
  assert.ok(
    luminance(light.vars['--window-background']) > luminance(dark.vars['--window-background']) + 0.4
  );
});

test('setCustomTheme 은 등록표를 갈아 끼우고, 쓰고 있으면 바로 적용한다', () => {
  const restore = installDom();
  try {
    const root = restore.documentElement;
    setCustomTheme('#00FF88', false, root);
    assert.equal(THEMES[CUSTOM_THEME].vars['--accent'], '#00FF88');

    // 아직 다른 테마를 쓰는 중이면 화면은 건드리지 않는다.
    applyTheme('DarkTheme', root);
    setCustomTheme('#FF66AA', false, root);
    assert.equal(root.style.getPropertyValue('--accent'), THEMES.DarkTheme.vars['--accent']);

    // 사용자 정의 테마를 쓰는 중이면 색을 고치는 즉시 반영된다.
    applyTheme(CUSTOM_THEME, root);
    assert.equal(root.style.getPropertyValue('--accent'), '#FF66AA');
    setCustomTheme('#44AAFF', false, root);
    assert.equal(root.style.getPropertyValue('--accent'), '#44AAFF');
  } finally {
    // 다른 검사에 번지지 않도록 기본값으로 돌려 둔다.
    setCustomTheme(DEFAULT_CUSTOM_COLOR, false, restore.documentElement);
    restore();
  }
});
