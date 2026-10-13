export const INPUT_FORMATS = [
  { label: 'PNG', extensions: ['png'] },
  { label: 'JPEG', extensions: ['jpg', 'jpeg', 'jpe', 'jfif'] },
  { label: 'GIF', extensions: ['gif'] },
  { label: 'BMP', extensions: ['bmp'] },
  { label: 'WebP', extensions: ['webp'] },
  { label: 'ICO', extensions: ['ico'] },
  { label: 'SVG', extensions: ['svg'] },
  { label: 'AVIF', extensions: ['avif'] },
  { label: 'HEIC', extensions: ['heic'] },
  { label: 'HEIF', extensions: ['heif', 'hif'] },
  { label: 'JPEG XL', extensions: ['jxl'] },
  { label: 'TIFF', extensions: ['tif', 'tiff'] },
  { label: 'QOI', extensions: ['qoi'] },
  { label: 'TGA', extensions: ['tga'] },
  { label: 'HDR', extensions: ['hdr', 'pic'] },
  { label: 'PNM', extensions: ['pbm', 'pgm', 'ppm', 'pnm'] },
];

export const MAX_IMAGE_BYTES = 80 * 1024 * 1024;

export function inputExtensions() {
  return INPUT_FORMATS.flatMap((format) => format.extensions);
}

export function formatList() {
  return INPUT_FORMATS.map((format) => format.label).join(', ');
}

export function acceptAttribute() {
  const mimes = [
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/bmp',
    'image/webp',
    'image/avif',
    'image/heic',
    'image/heif',
    'image/jxl',
    'image/tiff',
    'image/svg+xml',
    'image/x-icon',
    'image/vnd.radiance',
    'image/x-tga',
    'image/x-portable-anymap',
  ];
  return [...mimes, ...inputExtensions().map((extension) => `.${extension}`)].join(',');
}
