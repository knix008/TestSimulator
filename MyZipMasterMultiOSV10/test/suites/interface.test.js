// Things that are easy to get quietly wrong: missing translations, uncoloured icons, themes.
import fs from 'node:fs';
import path from 'node:path';
import { eq, ok } from '../assert.js';
import { resources } from '../../src/i18n.js';
import { ALL_THEME_IDS, customThemeOf, CUSTOM_ID, DEFAULT_CUSTOM, loadCustomTheme, luminance, nextThemeId, preferredThemeForMode, saveCustomTheme, themeById, THEMES, themesByMode } from '../../src/lib/themes.js';
import { DEFAULT_SETTINGS, loadSettings, pushRecent, saveSettings } from '../../src/lib/settings.js';
import { FORMATS, LEVELS } from '../../src/lib/format.js';
import { decodeText, hexDump } from '../../src/components/dialogs/Dialogs.jsx';
import { renderGuide } from '../../src/components/GuidePage.jsx';
import { AnimatedBackground, ANIMATIONS } from '../../src/lib/background.js';

export const title = 'Interface: translations, icons, themes, settings';

const root = process.cwd();

function flatten(obj, prefix = '') {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object') Object.assign(out, flatten(v, `${prefix}${k}.`));
    else out[`${prefix}${k}`] = v;
  }
  return out;
}

function sourceFiles(dir) {
  const out = [];
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    if (item.name === 'engine' || item.name === 'themeNames.js') continue;
    const p = path.join(dir, item.name);
    if (item.isDirectory()) out.push(...sourceFiles(p));
    else if (/\.jsx?$/.test(item.name)) out.push(p);
  }
  return out;
}

export default async function (test) {
  const ko = flatten(resources.ko.translation);
  const en = flatten(resources.en.translation);
  const files = sourceFiles(path.join(root, 'src'));

  await test('Korean and English have the same keys', () => {
    const onlyKo = Object.keys(ko).filter((k) => !(k in en));
    const onlyEn = Object.keys(en).filter((k) => !(k in ko));
    eq(onlyKo.join(), '', 'missing in English');
    eq(onlyEn.join(), '', 'missing in Korean');
  });
  await test('no empty translations', () => {
    const empty = [...Object.entries(ko), ...Object.entries(en)].filter(([, v]) => !String(v).trim()).map(([k]) => k);
    eq(empty.join(), '');
  });
  await test('every translation key used in code exists', () => {
    const missing = new Set();
    for (const f of files) {
      if (f.endsWith('i18n.js')) continue;
      const text = fs.readFileSync(f, 'utf8');
      for (const m of text.matchAll(/\bt\('([a-zA-Z0-9_.]+)'/g)) {
        // The object form of a plural-free key, or a section used as a prefix.
        if (!(m[1] in ko)) missing.add(`${path.basename(f)}: ${m[1]}`);
      }
    }
    eq([...missing].join(', '), '');
  });
  await test('keys built at run time exist too', () => {
    for (const code of ['password_required', 'wrong_password', 'cancelled', 'not_archive', 'missing_volume', 'exists', 'corrupt', 'unsupported', 'invalid', 'io', 'memory', 'single_file_only', 'rar4_volume_names', 'volumes_read_only', 'format_read_only']) ok(`error.${code}` in ko, code);
    for (const op of ['create', 'extract', 'test', 'list', 'modify', 'convert', 'repair', 'hash', 'split', 'join', 'benchmark', 'conflicts']) ok(`progress.${op}` in ko, op);
    for (const l of LEVELS) ok(`level.${l}` in ko, String(l));
    for (const spec of Object.values(FORMATS)) for (const m of spec.methods) ok(`methodName.${m}` in ko, m);
    for (const c of ['aes256', 'aes128', 'zipcrypto']) ok(`cipher.${c}` in ko, c);
    for (const e of ['auto', 'euc-kr', 'shift_jis', 'gbk', 'big5', 'utf-8', 'windows-1252']) ok(`encoding.${e}` in ko, e);
    for (const th of THEMES) ok(`theme.${th.id}` in ko && `theme.${th.id}` in en, th.id);
    for (const r of ['home', 'desktop', 'documents', 'downloads']) ok(`tree.${r}` in ko, r);
  });
  await test('no Korean hard-coded in interface code', () => {
    const offenders = [];
    for (const f of files) {
      if (f.endsWith('i18n.js')) continue;
      fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
        const code = line.replace(/\/\/.*$/, '');
        // The language names are themselves, in every language.
        if (/[가-힣]/.test(code) && !code.includes('한국어')) offenders.push(`${path.basename(f)}:${i + 1}`);
      });
    }
    eq(offenders.join(', '), '');
  });
  await test('Korean strings are not left in English', () => {
    const same = Object.keys(ko).filter((k) => ko[k] === en[k] && /[a-z]{4}/.test(ko[k]) && !/^(theme|methodName|app\.name|encoding|cipher)/.test(k));
    ok(same.length <= 3, same.join());
  });

  await test('every icon has its own colour', () => {
    const text = fs.readFileSync(path.join(root, 'src/components/Icons.jsx'), 'utf8');
    const all = [...text.matchAll(/export const (Icon\w+) = \(p\) => <S ([^>]*)>/g)];
    ok(all.length >= 60, `${all.length} icons`);
    const plain = all.filter((m) => !m[2].includes('color=')).map((m) => m[1]);
    eq(plain.join(), '', 'icons without a colour');
    const colours = new Set(all.map((m) => m[2].match(/color="([^"]+)"/)[1]));
    ok(colours.size >= 8, `${colours.size} colours`);
    for (const c of colours) ok(/^#[0-9a-f]{6}$/i.test(c), c);
  });
  await test('icon colours read on dark and light themes', () => {
    const lum = (hex) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const contrast = (a, b) => {
      const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
      return (x + 0.05) / (y + 0.05);
    };
    const text = fs.readFileSync(path.join(root, 'src/components/Icons.jsx'), 'utf8');
    const colours = new Set([...text.matchAll(/color="(#[0-9a-f]{6})"/gi)].map((m) => m[1]));
    for (const c of colours) {
      ok(contrast(c, '#12100f') >= 3, `${c} on dark`);
      ok(contrast(c, '#ffffff') >= 2, `${c} on light`);
    }
  });
  await test('on filled buttons icons follow the text colour', () => {
    const css = fs.readFileSync(path.join(root, 'src/App.css'), 'utf8');
    ok(css.includes('.btn.primary .icon-color'));
    ok(css.includes('.winbtn-close:hover .icon-color'));
  });

  await test('40 themes (20 dark, 20 light), unique names', () => {
    eq(THEMES.length, 40);
    eq(themesByMode('dark').length, 20);
    eq(themesByMode('light').length, 20);
    eq(new Set(THEMES.map((t) => t.id)).size, 40);
  });
  await test('theme cycling stays in its family', () => {
    let id = 'dark';
    const seen = new Set();
    for (let i = 0; i < 20; i += 1) {
      seen.add(id);
      id = nextThemeId(id);
      eq(themeById(id).mode, 'dark');
    }
    eq(seen.size, 20);
    eq(id, 'dark', 'comes back round');
    eq(preferredThemeForMode('light'), 'light');
  });

  await test('custom theme: derived from four colours and saved', () => {
    localStorage.clear();
    ok(ALL_THEME_IDS.includes(CUSTOM_ID));
    eq(loadCustomTheme().accent, DEFAULT_CUSTOM.accent);
    const dark = customThemeOf({ bg: '#101010', panel: '#202020', text: '#f0f0f0', accent: '#ff8800' });
    eq(dark.mode, 'dark');
    eq(dark.vars.bg, '#101010');
    eq(dark.vars.accent, '#ff8800');
    for (const v of ['bg-2', 'bg-3', 'panel', 'border', 'text', 'text-dim', 'muted', 'accent-2', 'accent-fg', 'danger', 'shadow']) ok(dark.vars[v], v);
    eq(customThemeOf({ bg: '#fafafa', panel: '#ffffff', text: '#111111', accent: '#0055cc' }).mode, 'light');
    ok(luminance('#ffffff') > 0.99 && luminance('#000000') < 0.01);
    saveCustomTheme({ bg: '#123456', panel: '#234567', text: '#eeeeee', accent: '#00aa00' });
    eq(themeById(CUSTOM_ID).vars.bg, '#123456');
    ok(document.getElementById('zm-custom-theme').textContent.includes('#123456'));
    eq(customThemeOf({ bg: 'nonsense' }).vars.bg, 'nonsense', 'the page only ever stores picker values');
    localStorage.clear();
    saveCustomTheme(DEFAULT_CUSTOM);
    localStorage.clear();
  });
  await test('theme button is a palette; custom and settings top the menu', () => {
    const app = fs.readFileSync(path.join(root, 'src/App.jsx'), 'utf8');
    ok(/btn-theme-cycle[^\n]*<IconPalette size=\{22\} \/>/.test(app), 'the next-theme button is the palette');
    ok(app.includes('data-testid="theme-current"'), 'the dropdown names the current theme');
    ok(fs.readFileSync(path.join(root, 'src/components/ThemeMenuPage.jsx'), 'utf8').includes('ThemeMenuList'), 'its own window on the desktop');
    const menu = fs.readFileSync(path.join(root, 'src/components/ThemeMenu.jsx'), 'utf8');
    ok(menu.indexOf('theme-customize') < menu.indexOf("['dark', 'light']"), 'custom and settings come first');
    ok(menu.indexOf('theme-custom') < menu.indexOf("['dark', 'light']"));
    const dark = menu.indexOf("['dark', 'light']");
    ok(dark > 0, 'dark first, then light');
  });

  await test("user's guide: a contents list from its headings, same sections in both languages", () => {
    const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
    const ko = renderGuide(read('doc/UsersGuide.md'));
    const en = renderGuide(read('doc/UsersGuide.en.md'));
    ok(ko.toc.length >= 10, `${ko.toc.length} sections`);
    eq(ko.toc.length, en.toc.length);
    for (const h of ko.toc) ok(ko.html.includes(`id="${h.id}"`), h.text);
    ok(ko.html.includes('<table>'));
    ok(!/UsersGuide|Tutorial/.test(ko.html), 'no links to other documents');
  });

  await test('moving backgrounds: 20, each drawn, each named in both languages', () => {
    eq(ANIMATIONS.length, 20);
    eq(new Set(ANIMATIONS).size, 20);
    for (const k of ANIMATIONS) {
      ok(typeof AnimatedBackground.prototype[k] === 'function', `no drawing for ${k}`);
      ok(`bg.${k}` in ko && `bg.${k}` in en, k);
    }
    for (const k of ['zipper', 'squeeze', 'files', 'volumes', 'boxes', 'bytes']) ok(ANIMATIONS.includes(k), `archive picture ${k}`);
    eq(DEFAULT_SETTINGS.startBg, 'zipper', 'the default fits the program');
  });
  await test('every number is less, value and unit, more: no bare number inputs', () => {
    const offenders = [];
    for (const f of files) {
      for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
        if (/type="number"|type='number'/.test(line)) offenders.push(`${path.basename(f)}: ${line.trim().slice(0, 70)}`);
      }
    }
    eq(offenders.join(' | '), '');
  });

  await test('windows close through Tauri, never with the page\'s own window.close()', () => {
    for (const f of files) {
      if (path.basename(f) === 'host.js') continue;
      ok(!/window\.close\(\)/.test(fs.readFileSync(f, 'utf8')), `${path.basename(f)} calls window.close()`);
    }
  });

  await test('settings: defaults, save, load, corrupt values', () => {
    localStorage.clear();
    eq(loadSettings().format, DEFAULT_SETTINGS.format);
    saveSettings({ ...DEFAULT_SETTINGS, format: '7z' });
    eq(loadSettings().format, '7z');
    localStorage.setItem('zm-settings', '{broken');
    eq(loadSettings().format, DEFAULT_SETTINGS.format, 'falls back');
    localStorage.setItem('zm-settings', '{"format":"rar"}');
    eq(loadSettings().overwrite, DEFAULT_SETTINGS.overwrite, 'new options get their default');
    eq(loadSettings().format, 'rar');
    localStorage.clear();
  });
  await test('recent files: newest first, no duplicates, 12 at most', () => {
    let list = [];
    for (let i = 0; i < 20; i += 1) list = pushRecent(list, `f${i}`);
    eq(list.length, 12);
    eq(list[0], 'f19');
    list = pushRecent(list, 'f15');
    eq(list[0], 'f15');
    eq(list.filter((x) => x === 'f15').length, 1);
  });

  await test('preview: encoding detection and hex dump', () => {
    eq(decodeText(new TextEncoder().encode('안녕')), '안녕');
    eq(decodeText(new Uint8Array([0xbe, 0xc8, 0xb3, 0xe7])), '안녕', 'EUC-KR');
    eq(decodeText(new Uint8Array([0xff, 0xfe, 0x41, 0x00])), 'A');
    const dump = hexDump(new Uint8Array([0x41, 0x00, 0xff]));
    eq(dump, '00000000  41 00 ff                                         A..');
    eq(hexDump(new Uint8Array(100000)).split('\n').length, 256, 'limited');
  });
}
