/** Defaults match typical ls blue dirs + light terminal foreground files. */
export const DEFAULT_LS_DIRECTORY_COLOR = '#569CD6';
export const DEFAULT_LS_FILE_COLOR = '#D4D4D4';

export function normalizeHexColor(value, fallback) {
  const raw = String(value || '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return `#${raw.slice(1).toUpperCase()}`;
  if (/^#[0-9a-fA-F]{3}$/.test(raw)) {
    const r = raw[1];
    const g = raw[2];
    const b = raw[3];
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  return fallback;
}

export function normalizeLsColors(input = {}) {
  return {
    directory: normalizeHexColor(
      input.directory ?? input.lsDirectoryColor,
      DEFAULT_LS_DIRECTORY_COLOR
    ),
    file: normalizeHexColor(input.file ?? input.lsFileColor, DEFAULT_LS_FILE_COLOR),
  };
}

/** Truecolor foreground SGR from #RRGGBB. */
export function hexToAnsiFg(hex, fallback = DEFAULT_LS_FILE_COLOR) {
  const normalized = normalizeHexColor(hex, fallback).slice(1);
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  return `\x1b[38;2;${r};${g};${b}m`;
}

export function colorizeLsName(name, isDirectory, colors) {
  const c = normalizeLsColors(colors);
  const fg = hexToAnsiFg(
    isDirectory ? c.directory : c.file,
    isDirectory ? DEFAULT_LS_DIRECTORY_COLOR : DEFAULT_LS_FILE_COLOR
  );
  return `${fg}${name}\x1b[0m`;
}
