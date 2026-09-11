// Theme catalogue, localisation tables, undo/redo and the cover page model.
import { suite, test, expect } from '../helpers/runner.mjs';
import { coverPage, i18n, sampleSchema, schema, theme, undoRedo } from '../helpers/core.mjs';

suite('themes', () => {
  test('the catalogue holds 16 themes, 8 light and 8 dark', () => {
    expect(theme.THEMES).toHaveLength(16);
    expect(theme.THEMES.filter((x) => x.kind === 'light')).toHaveLength(8);
    expect(theme.THEMES.filter((x) => x.kind === 'dark')).toHaveLength(8);
  });

  test('theme ids are unique', () => {
    expect(new Set(theme.THEMES.map((x) => x.id)).size).toBe(16);
  });

  test('every theme defines every palette key with a real colour', () => {
    const keys = Object.keys(theme.getPalette('light'));
    expect(keys.length).toBeGreaterThan(40);
    for (const t of theme.THEMES) {
      const palette = t.palette;
      for (const key of keys) {
        const value = palette[key];
        expect(typeof value === 'string' && /^rgba?\(/.test(value)).toBeTruthy(`${t.id}.${key} = ${value}`);
      }
    }
  });

  test('light and dark remain the values ported from ModernTheme', () => {
    expect(theme.getPalette('light').accent).toBe('rgb(37, 99, 235)');
    expect(theme.getPalette('light').canvasBackground).toBe('rgb(255, 255, 255)');
    expect(theme.getPalette('dark').accent).toBe('rgb(96, 165, 250)');
    expect(theme.getPalette('dark').panelBackground).toBe('rgb(28, 28, 40)');
  });

  test('isThemeId accepts catalogue ids only', () => {
    expect(theme.isThemeId('dracula')).toBeTruthy();
    expect(theme.isThemeId('light')).toBeTruthy();
    expect(theme.isThemeId('nope')).toBeFalsy();
    expect(theme.isThemeId(undefined)).toBeFalsy();
    expect(theme.isThemeId(7)).toBeFalsy();
  });

  test('an unknown id falls back to the default theme', () => {
    expect(theme.getTheme('nope').id).toBe(theme.DEFAULT_THEME_ID);
    expect(theme.getPalette('nope')).toEqual(theme.getPalette('light'));
  });

  test('isDarkTheme matches the declared kind', () => {
    for (const t of theme.THEMES) expect(theme.isDarkTheme(t.id)).toBe(t.kind === 'dark', t.id);
  });

  test('every theme has a Korean and an English name', () => {
    for (const t of theme.THEMES) {
      expect(theme.getThemeName(t.id, 'ko').length).toBeGreaterThan(0);
      expect(theme.getThemeName(t.id, 'en').length).toBeGreaterThan(0);
    }
  });

  test('accentContrast is readable on the accent', () => {
    // Either near-black or white — never something in between.
    for (const t of theme.THEMES) {
      const c = t.palette.accentContrast;
      expect(c === 'rgb(17, 24, 39)' || c === 'rgb(255, 255, 255)').toBeTruthy(`${t.id}: ${c}`);
    }
  });

  test('DB header colours are distinct per dialect', () => {
    const dbs = ['PostgreSQL', 'MySQL', 'MariaDB', 'SQLite', 'SqlServer', 'VectorDb'];
    expect(new Set(dbs.map(theme.getHeaderColor)).size).toBe(6);
  });

  test('grid lines are visible enough to notice when toggled on', () => {
    for (const t of theme.THEMES) {
      const alpha = Number(/rgba?\([^)]*,\s*([\d.]+)\)$/.exec(t.palette.canvasGridMinor)?.[1] ?? 0);
      expect(alpha).toBeGreaterThan(0.05, `${t.id} grid too faint`);
    }
  });
});

suite('i18n', () => {
  test('Korean and English tables cover the same keys', async () => {
    const ko = (await import('../../src/i18n/locales/ko.json', { with: { type: 'json' } })).default;
    const en = (await import('../../src/i18n/locales/en.json', { with: { type: 'json' } })).default;
    const missingInEn = Object.keys(ko).filter((k) => !(k in en));
    const missingInKo = Object.keys(en).filter((k) => !(k in ko));
    expect(missingInEn).toHaveLength(0);
    expect(missingInKo).toHaveLength(0);
    expect(Object.keys(ko).length).toBeGreaterThan(380);
  });

  test('no key is left with an empty string', async () => {
    for (const lang of ['ko', 'en']) {
      const table = (await import(`../../src/i18n/locales/${lang}.json`, { with: { type: 'json' } })).default;
      const empty = Object.entries(table).filter(([, v]) => typeof v !== 'string' || v.trim() === '');
      expect(empty.map(([k]) => k)).toHaveLength(0);
    }
  });

  test('t() substitutes positional arguments', () => {
    i18n.setLanguage('ko');
    expect(i18n.t('StatusTheme', '다크')).toContain('다크');
    expect(i18n.t('StatusSchema', 'S', 'SQLite', 1, 2)).toContain('SQLite');
  });

  test('t() returns the key when it is unknown', () => {
    expect(i18n.t('ThisKeyDoesNotExist')).toBe('ThisKeyDoesNotExist');
  });

  test('switching language changes the text', () => {
    i18n.setLanguage('ko');
    const ko = i18n.t('MenuFile');
    i18n.setLanguage('en');
    const en = i18n.t('MenuFile');
    expect(ko !== en).toBeTruthy();
    expect(en).toBe('File');
    i18n.setLanguage('ko');
    expect(i18n.getLanguage()).toBe('ko');
  });

  test('WinForms mnemonics were stripped during the port', async () => {
    const ko = (await import('../../src/i18n/locales/ko.json', { with: { type: 'json' } })).default;
    const withMnemonic = Object.entries(ko).filter(([, v]) => /\(&[A-Za-z]\)/.test(v));
    expect(withMnemonic.map(([k]) => k)).toHaveLength(0);
  });
});

suite('undo / redo', () => {
  test('starts empty', () => {
    const m = new undoRedo.UndoRedoManager();
    expect(m.canUndo).toBeFalsy();
    expect(m.canRedo).toBeFalsy();
  });

  test('undo restores the pushed snapshot', () => {
    const m = new undoRedo.UndoRedoManager();
    const first = schema.newSchema('one');
    const second = schema.newSchema('two');
    m.push(first);
    expect(m.canUndo).toBeTruthy();
    expect(m.undo(second).Name).toBe('one');
    expect(m.canRedo).toBeTruthy();
    expect(m.redo(first).Name).toBe('two');
  });

  test('a new push clears the redo stack', () => {
    const m = new undoRedo.UndoRedoManager();
    m.push(schema.newSchema('a'));
    m.undo(schema.newSchema('b'));
    expect(m.canRedo).toBeTruthy();
    m.push(schema.newSchema('c'));
    expect(m.canRedo).toBeFalsy();
  });

  test('history is capped at 50 entries', () => {
    const m = new undoRedo.UndoRedoManager();
    for (let i = 0; i < 60; i++) m.push(schema.newSchema(`s${i}`));
    let current = schema.newSchema('current');
    let steps = 0;
    while (m.canUndo && steps < 100) {
      current = m.undo(current);
      steps++;
    }
    expect(steps).toBe(50);
    // The oldest ten were dropped, so the deepest snapshot is s10.
    expect(current.Name).toBe('s10');
  });

  test('undo on an empty stack returns the input unchanged', () => {
    const m = new undoRedo.UndoRedoManager();
    const s = schema.newSchema('same');
    expect(m.undo(s).Name).toBe('same');
    expect(m.redo(s).Name).toBe('same');
  });

  test('clear empties both stacks', () => {
    const m = new undoRedo.UndoRedoManager();
    m.push(schema.newSchema('a'));
    m.clear();
    expect(m.canUndo).toBeFalsy();
    expect(m.canRedo).toBeFalsy();
  });
});

suite('cover page', () => {
  const sample = sampleSchema.createOnlineShopSchema();
  const now = new Date('2026-01-02T03:04:05');

  test('carries the schema name and counts', () => {
    const cover = coverPage.buildCover(sample, { now });
    expect(cover.subject).toBe('OnlineShop');
    expect(cover.heading).toContain('보고서');
    expect(cover.producer).toBe('DBTools');
    const rows = Object.fromEntries(cover.rows.map((r) => [r.label, r.value]));
    expect(rows['대상 데이터베이스']).toBe('PostgreSQL');
    expect(rows['테이블 수']).toBe('5');
    expect(rows['관계 수']).toBe('4');
  });

  test('the project path row appears only when a path is given', () => {
    expect(coverPage.buildCover(sample, { now }).rows.some((r) => r.label === '프로젝트 파일')).toBeFalsy();
    const withPath = coverPage.buildCover(sample, { now, projectPath: 'C:/x/y.mdprj' });
    expect(withPath.rows.find((r) => r.label === '프로젝트 파일').value).toBe('C:/x/y.mdprj');
  });

  test('an unnamed schema still has a subject', () => {
    const blank = schema.newSchema('');
    expect(coverPage.buildCover(blank, { now }).subject).toBe('(이름 없음)');
  });

  test('timestamps are zero-padded', () => {
    expect(coverPage.formatTimestamp(new Date('2026-01-02T03:04:05'))).toBe('2026-01-02 03:04:05');
  });
});
