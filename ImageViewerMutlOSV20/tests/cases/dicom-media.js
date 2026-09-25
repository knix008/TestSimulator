'use strict';

/** DICOM controls, media player, decoder module. */
module.exports = {
  name: 'DICOM & media',
  run({ test, each, src, h }) {
    const { html, app } = src;
    const { assert, assertIncludes, exists } = h;

    test('DICOM decoder module is present', () => {
      assert(exists('src/js/dicomDecoder.js'));
      assertIncludes(html, 'dicomDecoder', 'script include or comment');
    });

    const dicomIds = [
      'dicom-controls', 'dcm-prev-frame', 'dcm-next-frame', 'dcm-frame',
      'dcm-play', 'dcm-fps', 'dcm-preset', 'dcm-wc', 'dcm-ww',
      'dcm-invert', 'dcm-reset', 'dcm-colormap', 'dcm-overlays', 'dcm-annot',
      'dcm-tool-ruler', 'dcm-tool-angle', 'dcm-tool-ellipse', 'dcm-tool-rect',
      'dcm-meas-clear', 'dcm-overlay',
    ];
    each(dicomIds, (id) => `DICOM UI #${id}`, (id) => {
      assertIncludes(html, `id="${id}"`, id);
    });

    const mediaIds = [
      'video-player', 'audio-player', 'mc-play', 'mc-pause', 'mc-stop',
      'mc-seek', 'mc-time', 'mc-mute', 'mc-volume', 'mc-subtitle',
    ];
    each(mediaIds, (id) => `Media UI #${id}`, (id) => {
      assertIncludes(html, `id="${id}"`, id);
    });

    const dicomFns = [
      '_dicomApply', '_dicomFrame', '_dicomWindow', '_dicomSyncBar', '_setDicomSession',
    ];
    each(dicomFns, (fn) => `DICOM function ${fn}`, (fn) => {
      assertIncludes(app, `function ${fn}`, fn);
    });
  },
};
