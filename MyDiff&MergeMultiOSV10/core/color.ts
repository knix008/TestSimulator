/** Minimal color maths shared by the theme table, the icon generator and the UI. */

export type Rgb = [number, number, number];

export function parseHex(hex: string): Rgb {
  const value = hex.replace("#", "").trim();
  const full = value.length === 3 ? value.split("").map((c) => c + c).join("") : value;
  return [
    parseInt(full.slice(0, 2), 16) || 0,
    parseInt(full.slice(2, 4), 16) || 0,
    parseInt(full.slice(4, 6), 16) || 0,
  ];
}

export function toHex([r, g, b]: Rgb): string {
  const part = (channel: number) => Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, "0");
  return `#${part(r)}${part(g)}${part(b)}`;
}

/** `amount` of 0 keeps `from`, 1 returns `to`. */
export function mix(from: string, to: string, amount: number): string {
  const a = parseHex(from);
  const b = parseHex(to);
  return toHex([
    a[0] + (b[0] - a[0]) * amount,
    a[1] + (b[1] - a[1]) * amount,
    a[2] + (b[2] - a[2]) * amount,
  ]);
}

export const lighten = (hex: string, amount: number): string => mix(hex, "#ffffff", amount);
export const darken = (hex: string, amount: number): string => mix(hex, "#000000", amount);

export function alpha(hex: string, value: number): string {
  const [r, g, b] = parseHex(hex);
  return `rgba(${r}, ${g}, ${b}, ${value})`;
}

/** Relative luminance per WCAG 2.1. */
export function luminance(hex: string): number {
  const channel = (raw: number) => {
    const v = raw / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = parseHex(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** WCAG AA for normal text. */
export const AA_CONTRAST = 4.5;

/**
 * Foreground text for `background`: the softest of four candidates that still clears
 * AA, or the highest-contrast one if none of them does.
 *
 * Measured rather than guessed from a luminance threshold. A mid-tone accent — the
 * Mint theme's teal, the Sky theme's blue — falls either side of any fixed cut-off
 * depending on where it is put, and the wrong choice there is a 3:1 button label. The
 * soft tones are preferred because pure black on a saturated colour is harsh; pure
 * black and white are there for the accents that need the extra half-step.
 */
const CANDIDATES = ["#10151c", "#f8fafc", "#000000", "#ffffff"];

export function readableOn(background: string): string {
  let best = CANDIDATES[0];
  let bestRatio = 0;
  for (const candidate of CANDIDATES) {
    const ratio = contrastRatio(background, candidate);
    if (ratio >= AA_CONTRAST) return candidate;
    if (ratio > bestRatio) {
      bestRatio = ratio;
      best = candidate;
    }
  }
  return best;
}
