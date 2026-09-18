// Which files open as a picture that fills the pane (PNG · JPEG · GIF · WebP ·
// AVIF · BMP · ICO · HEIC · HEIF · DICOM) versus SVG, which stays a text
// document with a live preview. Shared by the editor (App / ImagePreview)
// and the tests, so a new extension is classified in one place.
export const RASTER_EXT = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'avif', 'heic', 'heif', 'dcm', 'dicom',
]);

export const isSvgName = (name) => /\.svg$/i.test(String(name || ''));
export const isHeicName = (name) => /\.(heic|heif)$/i.test(String(name || ''));
export const isDicomName = (name) => /\.(dcm|dicom)$/i.test(String(name || ''));
export const isBinaryImageName = (name) => {
  const m = /\.([a-z0-9]+)$/i.exec(String(name || ''));
  return !!(m && RASTER_EXT.has(m[1].toLowerCase()));
};
export const isImageName = (name) => isSvgName(name) || isBinaryImageName(name);

// A session tab that was a picture / hex dump (or a raster by name). file.read
// with a saved encoding would skip the binary sniff and show the bytes as text.
export function restoreAsPicture(tab) {
  if (!tab || tab.draft) return false;
  if (tab.kind === 'hex') return true;
  const name = tab.name || (tab.path && String(tab.path).split(/[\\/]/).pop()) || '';
  return isBinaryImageName(name);
}

// How the editor opens a path from its name alone (before sniffing unknown binaries).
export function openKind(name, { force = false } = {}) {
  if (force) return 'text';
  if (isSvgName(name)) return 'svg';
  if (isBinaryImageName(name)) return 'picture';
  return 'unknown';
}

// What one editor pane should show for a document (fill picture, Hexa beside it, hex dump, minimap).
export function paneView(doc, settings = {}) {
  const picture = !!(doc && doc.kind === 'hex' && isBinaryImageName(doc.name));
  const hexOnly = !!(doc && doc.kind === 'hex' && !isBinaryImageName(doc.name));
  const svg = !!(doc && isSvgName(doc.name));
  return {
    fillPicture: picture,
    hexaBeside: picture && !!doc.imageHex,
    hexDump: hexOnly,
    minimap: !!(settings.minimap && doc && !picture && doc.langName !== 'Markdown'),
    svgPreview: svg && settings.imagePreview !== false,
    canStructure: !picture,
  };
}
