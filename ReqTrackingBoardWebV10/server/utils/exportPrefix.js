export function sanitizeExportPrefix(value) {
  const cleaned = String(value ?? '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .trim();
  return cleaned.slice(0, 80);
}

export function buildExportFilename(prefix, baseName, ext) {
  const safe = sanitizeExportPrefix(prefix);
  return safe ? `${safe}_${baseName}.${ext}` : `${baseName}.${ext}`;
}
