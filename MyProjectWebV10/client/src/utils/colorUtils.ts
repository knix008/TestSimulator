/** Convert Win/C# ARGB integer to an opaque CSS rgb() string (alpha is ignored). */
export function argbToCss(argb: number | null | undefined): string | undefined {
  if (argb == null) return undefined;
  const r = (argb >>> 16) & 0xff;
  const g = (argb >>> 8) & 0xff;
  const b = argb & 0xff;
  return `rgb(${r}, ${g}, ${b})`;
}

/** Convert Win/C# ARGB integer to #rrggbb for HTML color inputs. */
export function argbToHex(argb: number | null | undefined, fallback = '#000000'): string {
  if (argb == null) return fallback;
  const r = (argb >>> 16) & 0xff;
  const g = (argb >>> 8) & 0xff;
  const b = argb & 0xff;
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/** Convert #rrggbb from an HTML color input to Win/C# ARGB (alpha 0xFF). */
export function hexToArgb(hex: string): number {
  const normalized = hex.replace('#', '');
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  return (0xff << 24) | (r << 16) | (g << 8) | b;
}
