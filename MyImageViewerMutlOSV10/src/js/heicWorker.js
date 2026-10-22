/**
 * HEIC / HEIF → JPEG off the UI thread (desktop, tauriAPI.js convertToPng).
 * libheif's wasm build (the decoder heic-convert used in the Node host), copied to
 * vendor/ by scripts/vendor.js; the picture decoded is the first top-level image, as
 * heic-decode picks it.
 *
 *   in:  { id, bytes: ArrayBuffer, quality }
 *   out: { id, jpeg: ArrayBuffer, width, height }  or  { id, error }
 */
let libheifModule = null;

async function getLibheif() {
  if (!libheifModule) {
    importScripts('../vendor/node_modules/libheif-js/libheif-wasm/libheif-bundle.js');
    // The bundle defines a factory (module.exports = libheif())
    libheifModule = self.libheif();
    if (libheifModule && libheifModule.ready) await libheifModule.ready;
  }
  return libheifModule;
}

// Brands of a HEIF file (heic-decode's check): anything else is not ours to decode
function isHeif(u8) {
  const brand = String.fromCharCode(...u8.subarray(8, 12)).replace('\0', ' ').trim();
  return ['mif1', 'msf1', 'heic', 'heix', 'hevc', 'hevx'].includes(brand);
}

function display(image, width, height) {
  return new Promise((resolve, reject) => {
    image.display({ data: new Uint8ClampedArray(width * height * 4), width, height }, (out) => {
      if (!out) reject(new Error('HEIF processing error'));
      else resolve(out);
    });
  });
}

self.onmessage = async (e) => {
  const { id, bytes, quality } = e.data || {};
  try {
    const u8 = new Uint8Array(bytes);
    if (!isHeif(u8)) throw new TypeError('input buffer is not a HEIC image');
    const libheif = await getLibheif();
    const decoder = new libheif.HeifDecoder();
    const images = decoder.decode(u8);
    try {
      if (!images.length) throw new Error('HEIF image not found');
      const image = images[0];
      const width = image.get_width();
      const height = image.get_height();
      const { data } = await display(image, width, height);
      const canvas = new OffscreenCanvas(width, height);
      canvas.getContext('2d').putImageData(new ImageData(data, width, height), 0, 0);
      const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: quality || 0.88 });
      const jpeg = await blob.arrayBuffer();
      self.postMessage({ id, jpeg, width, height }, [jpeg]);
    } finally {
      for (const image of images) image.free();
      decoder.decoder.delete();
    }
  } catch (err) {
    self.postMessage({ id, error: (err && err.message) || String(err) });
  }
};
