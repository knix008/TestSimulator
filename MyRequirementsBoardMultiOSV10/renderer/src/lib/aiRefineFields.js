export function getChangedFieldKeys(before, after, keys) {
  return keys.filter((key) => String(before?.[key] ?? '').trim() !== String(after?.[key] ?? '').trim());
}
