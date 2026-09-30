import { describe, it, expect, beforeEach } from 'vitest';
import i18n, { resources, LANGUAGES, otherLang, setLanguage, translate } from '../src/i18n.js';
import { COMMANDS } from '../src/lib/menus.js';

function flatten(object, prefix = '', out = new Set()) {
  for (const [key, value] of Object.entries(object || {})) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object') flatten(value, path, out);
    else out.add(path);
  }
  return out;
}

const ko = flatten(resources.ko.translation);
const en = flatten(resources.en.translation);

describe('languages', () => {
  it('ships Korean and English', () => {
    expect(LANGUAGES.map((l) => l.id)).toEqual(['ko', 'en']);
  });

  it('starts in Korean', () => {
    expect(['ko', 'en']).toContain(i18n.language);
  });

  it('names the other language for the toggle', () => {
    expect(otherLang('ko')).toBe('en');
    expect(otherLang('en')).toBe('ko');
    expect(otherLang('')).toBe('ko');
  });
});

describe('the two dictionaries', () => {
  it('have exactly the same keys', () => {
    const missingInEn = [...ko].filter((key) => !en.has(key));
    const missingInKo = [...en].filter((key) => !ko.has(key));
    expect(missingInEn).toEqual([]);
    expect(missingInKo).toEqual([]);
  });

  it('leave no value empty', () => {
    const check = (object, prefix = '') => {
      for (const [key, value] of Object.entries(object)) {
        const path = prefix ? `${prefix}.${key}` : key;
        if (value && typeof value === 'object') check(value, path);
        else expect(String(value).trim(), path).not.toBe('');
      }
    };
    check(resources.ko.translation);
    check(resources.en.translation);
  });

  it('use the same interpolation placeholders in both languages', () => {
    const placeholders = (text) => (String(text).match(/\{\{(\w+)\}\}/g) || []).sort().join(',');
    const walk = (a, b, prefix = '') => {
      for (const [key, value] of Object.entries(a)) {
        const path = prefix ? `${prefix}.${key}` : key;
        if (value && typeof value === 'object') walk(value, b[key] || {}, path);
        else expect(placeholders(value), path).toBe(placeholders(b[key]));
      }
    };
    walk(resources.ko.translation, resources.en.translation);
  });
});

describe('coverage of the user interface', () => {
  it('has a label for every command', () => {
    for (const command of COMMANDS) {
      expect(ko.has(command.label), `ko ${command.label}`).toBe(true);
      expect(en.has(command.label), `en ${command.label}`).toBe(true);
    }
  });

  it('has a tooltip for every toolbar control', () => {
    for (const key of [
      'tip.open', 'tip.openFolder', 'tip.save', 'tip.print', 'tip.prev', 'tip.next', 'tip.bookmark',
      'tip.highlight', 'tip.note', 'tip.find', 'tip.undo', 'tip.redo', 'tip.leftPanel',
      'tip.rightPanel', 'tip.theme', 'tip.lang', 'tip.settings', 'tip.about',
      'tip.fileMenu', 'tip.readingMenu', 'tip.viewMenu', 'tip.marksMenu', 'tip.appMenu',
      'tip.textBigger', 'tip.textSmaller', 'tip.textReset', 'tip.readerFont', 'tip.zoomIn', 'tip.zoomOut',
      'tip.zoomReset', 'tip.spread', 'tip.bookmarkList', 'tip.pageMode',
      'tip.section', 'tip.minimize', 'tip.maximize', 'tip.closeWin', 'tip.closeTab',
      'tip.viewSingle', 'tip.viewDouble', 'tip.viewContinuous', 'tip.fitSingle',
      'tip.columns1', 'tip.columns2', 'tip.columnsFixed', 'tip.columnsFacing', 'tip.columnsFlow',
    ]) {
      expect(ko.has(key), key).toBe(true);
    }
  });

  it('names every error context the app reports', () => {
    for (const context of ['open', 'read', 'save', 'library', 'download', 'print', 'copy', 'paste', 'search', 'export', 'background', 'render']) {
      expect(ko.has(`error.ctx.${context}`), context).toBe(true);
    }
  });

  it('names every progress kind the app shows', () => {
    for (const kind of ['opening', 'reading', 'parsing', 'saving', 'downloading', 'printing', 'searching', 'exporting']) {
      expect(ko.has(`progress.${kind}`), kind).toBe(true);
    }
  });

  it('has a title for every dialog', () => {
    for (const name of ['settings', 'about', 'error', 'unsaved', 'print', 'note', 'shortcuts', 'props', 'url', 'password']) {
      expect(ko.has(`${name}.title`), name).toBe(true);
    }
  });
});

describe('switching language', () => {
  beforeEach(async () => { await setLanguage('ko'); });

  it('changes what the app says', async () => {
    expect(i18n.t('cmd.open')).toBe('책 열기');
    await setLanguage('en');
    expect(i18n.t('cmd.open')).toBe('Open book');
  });

  it('falls back to Korean for an unknown language', async () => {
    await setLanguage('fr');
    expect(i18n.language).toBe('ko');
  });

  it('translates without React, for the popup windows', () => {
    expect(translate('en', 'cmd.print')).toBe('Print');
    expect(translate('ko', 'cmd.print')).toBe('인쇄');
    expect(translate('en', 'status.chars', { n: 5 })).toBe('5 characters');
  });
});
