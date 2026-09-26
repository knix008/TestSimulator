import {
  THEMES, THEME_CSS, themeById, themeMode, themesByMode,
  nextThemeId, rememberThemePref, preferredThemeForMode, systemThemeMode,
} from '../../src/lib/themes.js';
import { eq, ok, includes } from '../assert.js';

export const title = '테마';

const REQUIRED_VARS = [
  'bg', 'bg-2', 'bg-3', 'panel', 'border', 'text', 'text-dim', 'muted',
  'accent', 'accent-2', 'accent-fg', 'danger', 'shadow',
];

export default async function suite(test) {
  await test('다크 20개, 라이트 20개, 모두 40개', () => {
    eq(THEMES.length, 40);
    eq(themesByMode('dark').length, 20);
    eq(themesByMode('light').length, 20);
  });

  await test('테마 id는 서로 겹치지 않는다', () => {
    const ids = THEMES.map((th) => th.id);
    eq(new Set(ids).size, ids.length);
  });

  await test('각 테마는 스와치와 CSS 변수를 모두 가진다', () => {
    for (const th of THEMES) {
      ok(th.mode === 'dark' || th.mode === 'light', th.id);
      eq(th.bars.length, 3, th.id);
      for (const key of REQUIRED_VARS) ok(th.vars[key], `${th.id} ${key}`);
      ok(th.vars.text !== th.vars.bg, `${th.id} text and background differ`);
    }
  });

  await test('다크 CSS는 :root 기본값이고 나머지는 data-theme 선택자다', () => {
    includes(THEME_CSS, ':root,:root[data-theme="dark"]');
    includes(THEME_CSS, ':root[data-theme="snow"]');
    includes(THEME_CSS, ':root[data-theme="midnight"]');
    ok(document.getElementById('mtg-themes'), 'theme stylesheet is injected');
    includes(document.getElementById('mtg-themes').textContent, '--accent:');
  });

  await test('id로 테마를 찾고, 없는 id는 다크로 본다', () => {
    eq(themeById('nord').id, 'nord');
    eq(themeById('missing'), null);
    eq(themeMode('mint'), 'light');
    eq(themeMode('missing'), 'dark');
  });

  await test('다음 테마는 같은 계열 안에서만 돌고 마지막은 처음으로 돌아간다', () => {
    const dark = themesByMode('dark').map((th) => th.id);
    const light = themesByMode('light').map((th) => th.id);
    eq(nextThemeId('dark'), dark[1]);
    eq(nextThemeId(dark[dark.length - 1]), dark[0]);
    eq(nextThemeId('light'), light[1]);
    eq(nextThemeId(light[light.length - 1]), light[0]);
    for (const id of dark) ok(themeMode(nextThemeId(id)) === 'dark', id);
    for (const id of light) ok(themeMode(nextThemeId(id)) === 'light', id);
  });

  await test('모드별 마지막 선택 테마를 기억했다가 자동 테마에 쓴다', () => {
    localStorage.removeItem('mtg-theme-dark');
    localStorage.removeItem('mtg-theme-light');
    eq(preferredThemeForMode('dark'), 'dark');
    eq(preferredThemeForMode('light'), 'light');
    rememberThemePref('nord');
    rememberThemePref('mint');
    eq(preferredThemeForMode('dark'), 'nord');
    eq(preferredThemeForMode('light'), 'mint');
    rememberThemePref('not-a-theme');
    eq(preferredThemeForMode('dark'), 'nord');
  });

  await test('시스템 색 구성표가 라이트면 자동 모드도 라이트다', () => {
    const prev = window.matchMedia;
    window.matchMedia = (query) => ({
      matches: String(query).includes('light'),
      addEventListener() {},
      removeEventListener() {},
    });
    eq(systemThemeMode(), 'light');
    window.matchMedia = () => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    });
    eq(systemThemeMode(), 'dark');
    window.matchMedia = prev;
  });
}
