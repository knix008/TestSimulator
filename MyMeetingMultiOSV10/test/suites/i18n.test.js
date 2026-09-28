import i18n from '../../src/i18n.js';
import { THEMES } from '../../src/lib/themes.js';
import { eq, ok } from '../assert.js';

export const title = '언어';

function leaves(node, prefix = '') {
  const out = [];
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object') out.push(...leaves(value, path));
    else out.push(path);
  }
  return out;
}

const REQUIRED = [
  'toolbar.file', 'toolbar.print', 'toolbar.export', 'toolbar.media',
  'tip.theme', 'tip.themeCycle', 'tip.print', 'tip.settings',
  'theme.auto', 'theme.autoHint', 'theme.groupDark', 'theme.groupLight',
  'tab.details', 'tab.structure', 'tab.preview', 'tab.edit', 'tab.markdown',
  'print.title', 'print.all', 'print.current', 'print.range',
  'print.preview', 'print.previewLoading', 'print.previewFail', 'print.previewPage',
  'print.previewPrev', 'print.previewNext', 'print.previewSkip', 'print.previewSheet',
  'fields.title', 'fields.timeInvalid', 'fields.timeOrder',
  'doc.agenda', 'doc.notes', 'doc.decisions', 'doc.actions',
];

export default async function suite(test) {
  await test('한국어와 영어는 같은 문구 키를 가진다', () => {
    const ko = i18n.getResourceBundle('ko', 'translation');
    const en = i18n.getResourceBundle('en', 'translation');
    const koKeys = leaves(ko).sort();
    const enKeys = leaves(en).sort();
    eq(koKeys.join('\n'), enKeys.join('\n'));
    for (const key of koKeys) {
      ok(String(i18n.t(key, { lng: 'ko' })).trim(), key);
      ok(String(i18n.t(key, { lng: 'en' })).trim(), key);
    }
  });

  await test('테마 40개의 이름이 두 언어에 있다', async () => {
    for (const lng of ['ko', 'en']) {
      await i18n.changeLanguage(lng);
      for (const th of THEMES) {
        const name = i18n.t(`theme.${th.id}`);
        ok(name && name !== `theme.${th.id}`, `${lng} ${th.id}`);
      }
      ok(i18n.t('theme.auto') !== 'theme.auto');
      ok(i18n.t('theme.groupDark') !== 'theme.groupDark');
      ok(i18n.t('theme.groupLight') !== 'theme.groupLight');
    }
  });

  await test('툴바, 인쇄 미리보기, 회의록 문구가 두 언어로 나온다', async () => {
    for (const key of REQUIRED) {
      for (const lng of ['ko', 'en']) {
        const text = i18n.t(key, { lng, count: 3, page: 2, total: 5 });
        ok(text && text !== key, `${lng} ${key}`);
      }
    }
    await i18n.changeLanguage('ko');
    eq(i18n.t('theme.auto'), '자동');
    eq(i18n.t('print.preview'), '미리보기');
    await i18n.changeLanguage('en');
    eq(i18n.t('theme.auto'), 'Auto');
    eq(i18n.t('print.preview'), 'Preview');
  });
}
