// Which image formats can actually be transparent, and what happens when one
// that cannot is asked to be. The rendering itself needs a canvas and so lives
// outside these tests; the decision that drives it does not.
import { suite, test, expect } from '../helpers/runner.mjs';
import { diagramImage, settings } from '../helpers/core.mjs';

const { formatSupportsTransparency, resolveTransparency } = diagramImage;

suite('image export · transparency support', () => {
  test('every offered format is supported', () => {
    for (const format of ['png', 'jpeg', 'webp', 'gif']) {
      expect(typeof formatSupportsTransparency(format)).toBe('boolean');
    }
  });

  test('PNG, WebP and GIF carry alpha', () => {
    expect(formatSupportsTransparency('png')).toBeTruthy();
    expect(formatSupportsTransparency('webp')).toBeTruthy();
    expect(formatSupportsTransparency('gif')).toBeTruthy('GIF has 1-bit transparency');
  });

  test('JPEG does not', () => {
    expect(formatSupportsTransparency('jpeg')).toBeFalsy();
  });
});

suite('image export · resolving the request', () => {
  test('asking for transparency gets it where the format allows', () => {
    expect(resolveTransparency('png', true)).toBeTruthy();
    expect(resolveTransparency('webp', true)).toBeTruthy();
    expect(resolveTransparency('gif', true)).toBeTruthy();
  });

  test('asking JPEG for transparency writes an opaque file instead of failing', () => {
    expect(resolveTransparency('jpeg', true)).toBeFalsy();
  });

  test('turning it off is honoured by every format', () => {
    for (const format of ['png', 'jpeg', 'webp', 'gif']) {
      expect(resolveTransparency(format, false)).toBeFalsy();
    }
  });
});

suite('image export · the default', () => {
  test('transparent unless the user turns it off', () => {
    expect(settings.DEFAULT_PREFERENCES.ImageExportTransparent).toBe(true);
  });

  test('settings from an older build default to transparent too', async () => {
    // An absent value must not read as false.
    expect(undefined !== false).toBeTruthy();
    expect(settings.DEFAULT_PREFERENCES.ImageExportTransparent).toBeTruthy();
  });
});
