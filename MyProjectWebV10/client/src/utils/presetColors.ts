/** Preset palette for quick color selection in task properties and settings. */
export const PRESET_COLORS = [
  '#a8d0f5',
  '#34d399',
  '#fbbf24',
  '#f87171',
  '#a78bfa',
  '#fb923c',
  '#94a3b8',
] as const;

export type PresetColor = (typeof PRESET_COLORS)[number];

export function normalizeHexColor(hex: string): string {
  return hex.replace('#', '').toLowerCase();
}

export function hexColorsEqual(a: string, b: string): boolean {
  return normalizeHexColor(a) === normalizeHexColor(b);
}

export function isPresetColor(hex: string): boolean {
  return PRESET_COLORS.some((preset) => hexColorsEqual(preset, hex));
}
