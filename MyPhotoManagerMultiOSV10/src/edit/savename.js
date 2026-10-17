/** Filename prefix from edit labels, in order. Duplicates and blank labels are skipped. */
export function saveNamePrefix(labels, fallback = 'edit') {
  const seen = new Set();
  const parts = [];
  for (const raw of labels ?? []) {
    const label = String(raw ?? '')
      .replace(/[\\/:*?"<>|]/g, '')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
    if (!label || seen.has(label)) continue;
    seen.add(label);
    parts.push(label);
    if (parts.join('_').length > 60) { parts.pop(); break; }
  }
  return parts.join('_') || fallback;
}
