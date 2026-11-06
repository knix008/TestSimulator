// The picture formats MyDiagram takes in (Insert › Picture, drag & drop, background).
// Pure data, no DOM. "Native" formats go into the drawing as they are, because every
// web view shows them. The others are decoded on the way in (src/export/image-decode.js)
// and stored as PNG, so a drawing opens anywhere.
const NATIVE = {
  png: 'image/png', apng: 'image/apng',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', jpe: 'image/jpeg', jfif: 'image/jpeg', pjpeg: 'image/jpeg', pjp: 'image/jpeg',
  gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', bmp: 'image/bmp', dib: 'image/bmp',
  ico: 'image/x-icon', cur: 'image/x-icon', svg: 'image/svg+xml',
};

/** Extension → decoder family. */
const DECODED = {
  tif: 'tiff', tiff: 'tiff',
  heic: 'heif', heif: 'heif', hif: 'heif', heics: 'heif', heifs: 'heif', avci: 'heif',
  jxl: 'jxl',
  jp2: 'j2k', j2k: 'j2k', j2c: 'j2k', jpf: 'j2k', jpx: 'j2k', jpm: 'j2k',
  qoi: 'qoi',
  tga: 'tga', icb: 'tga', vda: 'tga', vst: 'tga',
  pcx: 'pcx',
  pbm: 'netpbm', pgm: 'netpbm', ppm: 'netpbm', pnm: 'netpbm', pam: 'netpbm',
};

export const IMAGE_EXTENSIONS = [...Object.keys(NATIVE), ...Object.keys(DECODED)];

const extensionOf = (name) => {
  const match = /\.([^./\\]+)$/.exec(String(name ?? ''));
  return match ? match[1].toLowerCase() : '';
};

export const isImageExtension = (ext) => Object.hasOwn(NATIVE, ext) || Object.hasOwn(DECODED, ext);

/** The MIME type of a format the web view shows itself, or null. */
export const nativeImageMime = (name) => NATIVE[extensionOf(name)] ?? null;

/**
 * The family of decoder a file needs, or '' when the web view shows it itself. The first
 * bytes decide over the file name, so a picture with the wrong extension still opens.
 */
export function imageDecoderFor(name, bytes = null) {
  const sniffed = bytes ? sniffImage(bytes) : '';
  if (sniffed) return sniffed === 'native' ? '' : sniffed;
  return DECODED[extensionOf(name)] ?? '';
}

const ascii = (bytes, at, length) => String.fromCharCode(...bytes.subarray(at, at + length));

/** 'native', a decoder family, or '' when the first bytes say nothing. */
export function sniffImage(bytes) {
  if (!bytes || bytes.length < 12) return '';
  const [a, b, c, d] = bytes;
  if (a === 0x89 && b === 0x50 && c === 0x4e && d === 0x47) return 'native'; // PNG
  if (a === 0xff && b === 0xd8 && c === 0xff) return 'native'; // JPEG
  if (ascii(bytes, 0, 4) === 'GIF8' || (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP')) return 'native';
  if ((a === 0x49 && b === 0x49 && c === 0x2a && d === 0) || (a === 0x4d && b === 0x4d && c === 0 && d === 0x2a)) return 'tiff';
  if (a === 0xff && b === 0x0a) return 'jxl';
  if (ascii(bytes, 4, 8) === 'JXL \r\n\x87\n') return 'jxl';
  if (a === 0xff && b === 0x4f && c === 0xff && d === 0x51) return 'j2k';
  if (ascii(bytes, 4, 8) === 'jP  \r\n\x87\n') return 'j2k';
  if (ascii(bytes, 0, 4) === 'qoif') return 'qoi';
  if (ascii(bytes, 4, 4) === 'ftyp') {
    const brand = ascii(bytes, 8, 4);
    if (brand === 'avif' || brand === 'avis') return 'native';
    if (/^(heic|heix|heim|heis|hevc|hevx|hevm|hevs|mif1|msf1|avci)$/.test(brand)) return 'heif';
  }
  return '';
}
