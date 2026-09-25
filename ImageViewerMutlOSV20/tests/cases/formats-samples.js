'use strict';

/** Format classification, sample files, app icon. */
module.exports = {
  name: 'Formats & samples',
  run({ test, each, src, h }) {
    const { html, formatSupport } = src;
    const { assert, assertIncludes, exists, read, formatExt, IMAGE_EXTS, VIDEO_EXTS, AUDIO_EXTS } = h;

    each([...IMAGE_EXTS], (ext) => `Image ext .${ext} is classified`, (ext) => {
      assertIncludes(formatSupport, `'${ext}'`, ext);
      assert(IMAGE_EXTS.has(formatExt(`file.${ext}`)), ext);
    });

    each([...VIDEO_EXTS], (ext) => `Video ext .${ext} is classified`, (ext) => {
      assertIncludes(formatSupport, `'${ext}'`, ext);
      assert(VIDEO_EXTS.has(formatExt(`clip.${ext}`)), ext);
    });

    each([...AUDIO_EXTS], (ext) => `Audio ext .${ext} is classified`, (ext) => {
      assertIncludes(formatSupport, `'${ext}'`, ext);
      assert(AUDIO_EXTS.has(formatExt(`song.${ext}`)), ext);
    });

    test('Unknown .txt is not an image', () => {
      assert(!IMAGE_EXTS.has(formatExt('notes.txt')));
    });

    test('FormatSupport exposes animated / TIFF / HEIC / DICOM helpers', () => {
      assertIncludes(formatSupport, 'function isAnimatedImage', 'gif/webp');
      assertIncludes(formatSupport, 'function isTiff', 'tiff');
      assertIncludes(formatSupport, 'function isHeic', 'heic');
      assertIncludes(formatSupport, 'function isDcm', 'dicom');
    });

    test('Sample SVG exists and is readable', () => {
      assert(exists('samples/sample.svg'), 'samples/sample.svg');
      assert(read('samples/sample.svg').includes('<svg'), 'sample.svg is SVG');
    });

    test('App icons exist as svg / png / ico', () => {
      assert(exists('src/assets/icon.svg') && exists('src/assets/icon.png') && exists('src/assets/icon.ico'), 'app icons');
    });

    test('App icon SVG includes a pencil', () => {
      const svg = read('src/assets/icon.svg');
      assertIncludes(svg, 'pencil', 'pencil artwork');
      assertIncludes(svg, 'pencilBody', 'pencil fill');
    });
  },
};
