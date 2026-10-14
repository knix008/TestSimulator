// Which files the manager shows and how each kind is decoded.
//
//   native   decoded by the browser engine (<img>, createImageBitmap)
//   tiff     UTIF
//   heif     libheif (WebAssembly)
//   psd      our own reader of the merged (composite) image
//   raw      the JPEG preview every camera RAW file carries
//   svg      <img> only (no createImageBitmap in workers)
//   video    <video> (thumbnail = a frame from the first second)
//   dicom    medical images (dicomDecoder.js: every transfer syntax, windows, frames)

export const NATIVE = ['jpg', 'jpeg', 'jpe', 'jfif', 'png', 'apng', 'gif', 'webp', 'avif', 'bmp', 'dib', 'ico', 'cur'];
export const TIFF = ['tif', 'tiff'];
export const HEIF = ['heic', 'heif', 'hif'];
export const PSD = ['psd', 'psb'];
export const RAW = ['dng', 'cr2', 'cr3', 'crw', 'nef', 'nrw', 'arw', 'srf', 'sr2', 'orf', 'rw2', 'raf', 'pef', 'srw', 'x3f', '3fr', 'erf', 'kdc', 'dcr', 'mrw', 'mos', 'iiq', 'rwl'];
export const SVG = ['svg'];
export const VIDEO = ['mp4', 'm4v', 'webm', 'mov', 'ogv', 'mkv'];
// Our own decoders (extra.js) and WebAssembly codecs (codecs.js).
export const EXTRA = ['tga', 'icb', 'vda', 'vst', 'pcx', 'pcc', 'pbm', 'pgm', 'ppm', 'pnm', 'pam', 'qoi', 'hdr', 'rgbe', 'dds', 'sgi', 'rgb', 'bw', 'ras', 'sun', 'xbm'];
export const JP2 = ['jp2', 'j2k', 'j2c', 'jpf', 'jpx', 'jpc'];
export const JXL = ['jxl'];
export const PDF = ['pdf'];
export const DICOM = ['dcm', 'dicom', 'dic'];
// Archives open as (read-only) folders.
export const ARCHIVES = ['zip', 'cbz'];

export const IMAGE_EXTENSIONS = [...NATIVE, ...TIFF, ...HEIF, ...PSD, ...RAW, ...SVG, ...EXTRA, ...JP2, ...JXL, ...PDF, ...DICOM];
export const MEDIA_EXTENSIONS = [...IMAGE_EXTENSIONS, ...VIDEO];

const KIND = new Map();
for (const ext of NATIVE) KIND.set(ext, 'native');
for (const ext of TIFF) KIND.set(ext, 'tiff');
for (const ext of HEIF) KIND.set(ext, 'heif');
for (const ext of PSD) KIND.set(ext, 'psd');
for (const ext of RAW) KIND.set(ext, 'raw');
for (const ext of SVG) KIND.set(ext, 'svg');
for (const ext of VIDEO) KIND.set(ext, 'video');
for (const ext of EXTRA) KIND.set(ext, 'extra');
for (const ext of JP2) KIND.set(ext, 'jp2');
for (const ext of JXL) KIND.set(ext, 'jxl');
for (const ext of PDF) KIND.set(ext, 'pdf');
for (const ext of DICOM) KIND.set(ext, 'dicom');

export const isArchive = (name) => ARCHIVES.includes(extensionOf(name));

/** "Photo.JPG" → "jpg" ("" when there is none). */
export function extensionOf(name) {
  const base = String(name).split(/[\\/]/).pop();
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : '';
}

/** "Photo.JPG" → "Photo". */
export function stemOf(name) {
  const base = String(name).split(/[\\/]/).pop();
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(0, dot) : base;
}

export const kindOf = (name) => KIND.get(extensionOf(name)) ?? null;
export const isMedia = (name) => KIND.has(extensionOf(name));
export const isImage = (name) => { const kind = kindOf(name); return kind != null && kind !== 'video'; };
export const isVideo = (name) => kindOf(name) === 'video';
export const isRaw = (name) => kindOf(name) === 'raw';

/** Formats the editor can write back in place (others are saved as a new file). */
export const WRITABLE = ['jpg', 'jpeg', 'jpe', 'jfif', 'png', 'webp', 'bmp', 'tif', 'tiff'];
export const canWriteBack = (name) => WRITABLE.includes(extensionOf(name));

/** Formats offered by "Save as" / batch convert. */
export const OUTPUT_FORMATS = [
  { id: 'jpeg', ext: 'jpg', mime: 'image/jpeg', label: 'JPEG', quality: true, aliases: ['jpeg', 'jpe', 'jfif'] },
  { id: 'png', ext: 'png', mime: 'image/png', label: 'PNG', quality: false },
  { id: 'webp', ext: 'webp', mime: 'image/webp', label: 'WebP', quality: true },
  { id: 'bmp', ext: 'bmp', mime: 'image/bmp', label: 'BMP', quality: false, aliases: ['dib'] },
  { id: 'tiff', ext: 'tif', mime: 'image/tiff', label: 'TIFF', quality: false, aliases: ['tiff'] },
  { id: 'gif', ext: 'gif', mime: 'image/gif', label: 'GIF', quality: false },
  { id: 'jp2', ext: 'jp2', mime: 'image/jp2', label: 'JPEG 2000', quality: false },
  { id: 'jxl', ext: 'jxl', mime: 'image/jxl', label: 'JPEG XL', quality: true },
  { id: 'psd', ext: 'psd', mime: 'image/vnd.adobe.photoshop', label: 'Photoshop (PSD)', quality: false },
  { id: 'pdf', ext: 'pdf', mime: 'application/pdf', label: 'PDF', quality: true },
  { id: 'dicom', ext: 'dcm', mime: 'application/dicom', label: 'DICOM', quality: false, aliases: ['dicom', 'dic'] },
  { id: 'ico', ext: 'ico', mime: 'image/x-icon', label: 'ICO', quality: false },
  { id: 'tga', ext: 'tga', mime: 'image/x-tga', label: 'TGA', quality: false },
  { id: 'qoi', ext: 'qoi', mime: 'image/qoi', label: 'QOI', quality: false },
  { id: 'ppm', ext: 'ppm', mime: 'image/x-portable-pixmap', label: 'PPM (Netpbm)', quality: false, aliases: ['pnm'] },
  { id: 'pcx', ext: 'pcx', mime: 'image/x-pcx', label: 'PCX', quality: false },
  { id: 'sgi', ext: 'sgi', mime: 'image/sgi', label: 'SGI', quality: false, aliases: ['rgb'] },
  { id: 'ras', ext: 'ras', mime: 'image/x-sun-raster', label: 'Sun raster', quality: false, aliases: ['sun'] },
  { id: 'dds', ext: 'dds', mime: 'image/vnd-ms.dds', label: 'DDS', quality: false },
  { id: 'hdr', ext: 'hdr', mime: 'image/vnd.radiance', label: 'Radiance HDR', quality: false },
  { id: 'xbm', ext: 'xbm', mime: 'image/x-xbitmap', label: 'XBM (1-bit)', quality: false },
  { id: 'tiff16', ext: 'tif', mime: 'image/tiff', label: 'TIFF 16-bit', quality: false, deep: true },
  { id: 'png16', ext: 'png', mime: 'image/png', label: 'PNG 16-bit', quality: false, deep: true },
];

export function outputFormatFor(name) {
  const ext = extensionOf(name);
  return OUTPUT_FORMATS.find((format) => format.ext === ext || format.id === ext || format.aliases?.includes(ext)) ?? null;
}

const MIME = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', jpe: 'image/jpeg', jfif: 'image/jpeg', png: 'image/png', apng: 'image/apng', gif: 'image/gif', webp: 'image/webp',
  avif: 'image/avif', bmp: 'image/bmp', dib: 'image/bmp', ico: 'image/x-icon', cur: 'image/x-icon', svg: 'image/svg+xml', tif: 'image/tiff', tiff: 'image/tiff',
  heic: 'image/heic', heif: 'image/heif', hif: 'image/heif', psd: 'image/vnd.adobe.photoshop', mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm',
  mov: 'video/quicktime', ogv: 'video/ogg', mkv: 'video/x-matroska',
};
export const mimeOf = (name) => MIME[extensionOf(name)] ?? 'application/octet-stream';

/** Short badge text for a thumbnail ("JPG", "RAW·NEF", …). */
export function badgeOf(name) {
  const ext = extensionOf(name).toUpperCase();
  return isRaw(name) ? `RAW·${ext}` : ext;
}
