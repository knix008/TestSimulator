import test from 'node:test';
import assert from 'node:assert/strict';
import i18n from '../src/i18n.js';

function leaves(value, prefix = '') {
  if (!value || typeof value !== 'object') return [prefix];
  return Object.entries(value).flatMap(([key, child]) => leaves(child, prefix ? `${prefix}.${key}` : key));
}

test('Korean and English expose the same phrases', () => {
  const korean = leaves(i18n.getResourceBundle('ko', 'translation')).sort();
  const english = leaves(i18n.getResourceBundle('en', 'translation')).sort();
  assert.deepEqual(korean, english);
  for (const key of english) {
    const phrase = i18n.t(key, { lng: 'en' });
    assert.equal(typeof phrase, 'string', key);
    assert.ok(phrase.length > 0, key);
  }
  assert.equal(i18n.t('app.name', { lng: 'en' }), 'CaptureMaster');
  assert.equal(i18n.t('toolbar.undo', { lng: 'en' }), 'Undo');
  assert.equal(i18n.t('toolPanel.properties', { lng: 'en' }), 'Properties');
});
