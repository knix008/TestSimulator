/** Convert Win/C# ARGB integer to an opaque CSS rgb() string (alpha is ignored). */
export function argbToCss(argb: number | null | undefined): string | undefined {
  if (argb == null) return undefined;
  const value = argb >>> 0;
  const r = (value >>> 16) & 0xff;
  const g = (value >>> 8) & 0xff;
  const b = value & 0xff;
  return `rgb(${r}, ${g}, ${b})`;
}
