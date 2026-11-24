// The 20 examples, custom themes, the canvas backdrop setting and the documents.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { suite, test, expect } from '../helpers/runner.mjs';
import { dataTypes, normalization, samples, serializer, settings, sqlExporter, theme, types } from '../helpers/core.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

suite('examples', () => {
  test('there are exactly 20 examples with unique ids and both names', () => {
    expect(samples.SAMPLES).toHaveLength(20);
    expect(new Set(samples.SAMPLES.map((s) => s.id)).size).toBe(20);
    for (const s of samples.SAMPLES) {
      expect(s.nameKo.length > 0 && s.nameEn.length > 0).toBeTruthy(s.id);
      expect(s.descKo.length > 0 && s.descEn.length > 0).toBeTruthy(s.id);
    }
  });

  test('every database type has at least one example', () => {
    const used = new Set(samples.SAMPLES.map((s) => s.db));
    for (const db of types.DB_TARGET_TYPES) expect(used.has(db)).toBeTruthy(db);
  });

  test('every example builds, with tables, keys and relationships that resolve', () => {
    for (const info of samples.SAMPLES) {
      const s = samples.createSample(info.id);
      expect(s.TargetDb).toBe(info.db);
      expect(s.Tables.length >= 4).toBeTruthy(`${info.id} tables`);
      expect(s.Relationships.length >= 3).toBeTruthy(`${info.id} relationships`);
      for (const t of s.Tables) {
        expect(t.Columns.filter((c) => c.IsPrimaryKey)).toHaveLength(1);
      }
      for (const r of s.Relationships) {
        const source = s.Tables.find((t) => t.Id === r.SourceTableId);
        const target = s.Tables.find((t) => t.Id === r.TargetTableId);
        expect(Boolean(source && target)).toBeTruthy(`${info.id} ${r.Name}`);
        expect(source.Columns.find((c) => c.Id === r.SourceColumnId).IsPrimaryKey).toBeTruthy(r.Name);
        // OnlineShop is the long-standing port and stays byte-for-byte as it was
        // (its template files are compared against it); the rest flag every FK.
        if (info.id !== 'online-shop') {
          expect(target.Columns.find((c) => c.Id === r.TargetColumnId).IsForeignKey).toBeTruthy(r.Name);
        }
      }
    }
  });

  test('every column type is one its database offers', () => {
    for (const info of samples.SAMPLES) {
      const s = samples.createSample(info.id);
      const offered = new Set(dataTypes.getTypes(s.TargetDb));
      for (const t of s.Tables) {
        for (const c of t.Columns) {
          expect(offered.has(c.DataType)).toBeTruthy(`${info.id} ${t.Name}.${c.Name} ${c.DataType}`);
        }
      }
    }
  });

  test('tables are laid out without overlapping', () => {
    for (const info of samples.SAMPLES) {
      const s = samples.createSample(info.id);
      const boxes = s.Tables.map((t) => ({ x: t.X, y: t.Y, w: t.Width, h: 30 + t.Columns.length * 20 }));
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i];
          const b = boxes[j];
          const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
          expect(overlap).toBeFalsy(`${info.id}: ${s.Tables[i].Name} / ${s.Tables[j].Name}`);
        }
      }
    }
  });

  test('an example is the same document every time it opens', () => {
    for (const info of samples.SAMPLES) {
      expect(serializer.serializeToString(samples.createSample(info.id))).toBe(
        serializer.serializeToString(samples.createSample(info.id)),
      );
    }
  });

  test('every example exports SQL and survives the analysis', () => {
    for (const info of samples.SAMPLES) {
      const s = samples.createSample(info.id);
      expect(sqlExporter.exportSql(s)).toContain('CREATE');
      normalization.analyzeLevels(s, ['NF1', 'NF2', 'NF3']);
    }
  });
});

suite('custom themes', () => {
  const draft = {
    id: '',
    name: '  My theme ',
    kind: 'dark',
    background: '#101828',
    panel: '#1d2939',
    canvas: '#0c111d',
    accent: '#f79009',
    text: '#f2f4f7',
  };

  test('saving gives a new theme a custom- id and a trimmed name', () => {
    const { list, theme: saved } = theme.saveCustomTheme([], draft, () => 'abc');
    expect(saved.id).toBe('custom-abc');
    expect(saved.name).toBe('My theme');
    expect(list).toHaveLength(1);
  });

  test('saving again with the same id replaces it', () => {
    const first = theme.saveCustomTheme([], draft, () => 'abc');
    const second = theme.saveCustomTheme(first.list, { ...first.theme, accent: '#00ff00' });
    expect(second.list).toHaveLength(1);
    expect(second.list[0].accent).toBe('#00ff00');
  });

  test('a registered custom theme resolves to a full palette of its own', () => {
    const { list } = theme.saveCustomTheme([], draft, () => 'pal');
    theme.registerCustomThemes(list);
    const def = theme.getTheme('custom-pal');
    expect(def.id).toBe('custom-pal');
    expect(def.kind).toBe('dark');
    expect(def.palette.canvasBackground).toBe('rgb(12, 17, 29)');
    expect(def.palette.accent).toBe('rgb(247, 144, 9)');
    for (const [key, value] of Object.entries(def.palette)) {
      expect(/^rgba?\(/.test(value)).toBeTruthy(`${key} = ${value}`);
    }
    expect(theme.getThemeName('custom-pal', 'en')).toBe('My theme');
    theme.registerCustomThemes([]);
    expect(theme.getTheme('custom-pal').id).toBe(theme.DEFAULT_THEME_ID);
  });

  test('broken entries in the settings are dropped', () => {
    const kept = theme.normalizeCustomThemes([
      { ...draft, id: 'custom-1', name: 'ok' },
      { ...draft, id: 'nope' },
      { ...draft, id: 'custom-2', accent: 'red' },
      { ...draft, id: 'custom-1', name: 'duplicate' },
      null,
      7,
    ]);
    expect(kept.map((t) => t.id)).toEqual(['custom-1']);
    expect(theme.normalizeCustomThemes('x')).toEqual([]);
  });

  test('a new draft starts from the theme on screen', () => {
    const d = theme.draftFromTheme('dracula', 'x');
    expect(d.kind).toBe('dark');
    expect(d.accent).toBe('#bd93f9');
    expect(/^#[0-9a-f]{6}$/.test(d.background)).toBeTruthy(d.background);
  });

  test('allThemes lists the built-ins, then the custom ones', () => {
    const { list } = theme.saveCustomTheme([], draft, () => 'all');
    theme.registerCustomThemes(list);
    const all = theme.allThemes();
    expect(all).toHaveLength(41);
    expect(all[40].id).toBe('custom-all');
    theme.registerCustomThemes([]);
  });
});

suite('settings', () => {
  test('defaults show the start screen and a dotted canvas, with no custom themes', () => {
    expect(settings.DEFAULT_PREFERENCES.ShowStartScreen).toBe(true);
    expect(settings.DEFAULT_PREFERENCES.CanvasBackdrop).toBe('dots');
    expect(settings.DEFAULT_PREFERENCES.CustomThemes).toEqual([]);
  });

  test('every canvas backdrop is known, and nothing else is', () => {
    expect(theme.CANVAS_BACKDROPS).toHaveLength(5);
    for (const b of theme.CANVAS_BACKDROPS) expect(theme.isCanvasBackdrop(b)).toBeTruthy(b);
    expect(theme.isCanvasBackdrop('stripes')).toBeFalsy();
  });

  test('every backdrop and colour has Korean and English labels', () => {
    for (const file of ['ko', 'en']) {
      const table = JSON.parse(readFileSync(path.join(root, `src/i18n/locales/${file}.json`), 'utf8'));
      for (const b of theme.CANVAS_BACKDROPS) expect(Boolean(table[`CanvasBackdrop_${b}`])).toBeTruthy(`${file} ${b}`);
      for (const c of ['background', 'panel', 'canvas', 'accent', 'text']) {
        expect(Boolean(table[`CustomThemeColor_${c}`])).toBeTruthy(`${file} ${c}`);
      }
    }
  });
});

suite('start screen settings', () => {
  test('the moving background defaults and clamps its numbers', () => {
    const d = settings.normalizeStartBackground(undefined);
    expect(d).toEqual(settings.DEFAULT_START_BACKGROUND);
    const v = settings.normalizeStartBackground({ On: false, Kind: 'snow', Speed: 999, CardOpacity: 5, RandomOnStart: false, Interval: 7 });
    expect(v.On).toBe(false);
    expect(v.Kind).toBe('snow');
    expect(v.Speed).toBe(300);
    expect(v.CardOpacity).toBe(20);
    expect(v.RandomOnStart).toBe(false);
    expect(v.Interval).toBe(settings.DEFAULT_START_BACKGROUND.Interval);
    expect(settings.normalizeStartBackground({ Kind: 'nope' }).Kind).toBe('aurora');
  });

  test('a random animation is never the current one and always a known one', () => {
    for (let i = 0; i < 50; i++) {
      const next = settings.randomAnimation('aurora');
      expect(next === 'aurora').toBeFalsy();
      expect(settings.normalizeStartBackground({ Kind: next }).Kind).toBe(next);
    }
  });

  test('the card layout keeps every card once, drops unknown ones and bounds the sizes', () => {
    const l = settings.normalizeStartLayout({ Order: ['samples', 'nope', 'samples', 'help'], Span: { samples: 9, help: 2 }, Height: { help: 50, recent: 300 } });
    expect(l.Order).toEqual(['samples', 'help', 'create', 'recent', 'background']);
    expect(l.Span.samples).toBe(settings.DEFAULT_START_LAYOUT.Span.samples);
    expect(l.Span.help).toBe(2);
    expect(l.Height.help).toBe(undefined);
    expect(l.Height.recent).toBe(300);
  });

  test('the title card is not one of the movable cards', () => {
    expect(settings.START_CARDS.includes('hero')).toBeFalsy();
    const src = readFileSync(path.join(root, 'src/components/StartScreen.tsx'), 'utf8');
    expect(src).toContain('data-card="hero"');
    expect(src).toContain('The title card stays where it is');
  });

  test('there are twenty moving backgrounds with Korean and English names', () => {
    const js = readFileSync(path.join(root, 'src/components/startBackground.js'), 'utf8');
    const list = /export const ANIMATIONS = \[([\s\S]*?)\];/.exec(js)[1].match(/'[a-z]+'/g);
    expect(list).toHaveLength(20);
    const tsx = readFileSync(path.join(root, 'src/components/StartScreen.tsx'), 'utf8');
    for (const name of list) expect(tsx).toContain(`${name.slice(1, -1)}: [`);
  });
});

suite('documents', () => {
  test('the user guide and the tutorial exist in Korean and English', () => {
    for (const name of ['UsersGuide.md', 'UsersGuide.en.md', 'Tutorial.md', 'Tutorial.en.md']) {
      const text = readFileSync(path.join(root, 'doc', name), 'utf8');
      expect(text.length > 3000).toBeTruthy(name);
      expect(text).toContain('1.0.1');
    }
  });

  test('the guides list all 20 examples and all 40 themes', () => {
    const ko = readFileSync(path.join(root, 'doc/UsersGuide.md'), 'utf8');
    const en = readFileSync(path.join(root, 'doc/UsersGuide.en.md'), 'utf8');
    for (const s of samples.SAMPLES) {
      expect(ko).toContain(s.nameKo);
      expect(en).toContain(s.nameEn);
    }
    for (const t of theme.THEMES) {
      expect(ko).toContain(t.nameKo);
      expect(en).toContain(t.nameEn);
    }
  });
});
