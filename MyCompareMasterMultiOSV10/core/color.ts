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

/* ------------------------------------------------------------------ *
 * Perceptual distance
 * ------------------------------------------------------------------ *
 *
 * Contrast answers "can this be read"; it does not answer "can these two be told
 * apart". A row tinted green and a row tinted amber can sit at the same contrast
 * against the same text and still be one colour to the eye — and in a comparison
 * tool, where the colour of a row *is* the message, that is the more important
 * question. CIE Lab and CIEDE2000 answer it: a distance of about 1 is the smallest
 * difference anyone can see, and the theme tests ask for several times that between
 * any two colours the same view puts side by side.
 */

type Lab = [number, number, number];

export function toLab(hex: string): Lab {
  const linear = parseHex(hex).map((value) => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  }) as Rgb;
  const [r, g, b] = linear;
  // sRGB to XYZ under D65, then XYZ to Lab.
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (value: number) => (value > 0.008856 ? Math.cbrt(value) : 7.787 * value + 16 / 116);
  const [fx, fy, fz] = [f(x), f(y), f(z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

const degrees = (radians: number) => (radians * 180) / Math.PI;
const radians = (deg: number) => (deg * Math.PI) / 180;

/** CIEDE2000: how different two colours look, in just-noticeable differences. */
export function deltaE(a: string, b: string): number {
  const [l1, a1, b1] = toLab(a);
  const [l2, a2, b2] = toLab(b);

  const meanL = (l1 + l2) / 2;
  const chroma1 = Math.hypot(a1, b1);
  const chroma2 = Math.hypot(a2, b2);
  const meanChroma = (chroma1 + chroma2) / 2;
  // The grey-axis correction: a shift of hue matters less as a colour nears grey.
  const grey = 0.5 * (1 - Math.sqrt(meanChroma ** 7 / (meanChroma ** 7 + 25 ** 7)));
  const ap1 = a1 * (1 + grey);
  const ap2 = a2 * (1 + grey);
  const cp1 = Math.hypot(ap1, b1);
  const cp2 = Math.hypot(ap2, b2);
  const meanCp = (cp1 + cp2) / 2;

  const hue = (x: number, y: number) => {
    if (x === 0 && y === 0) return 0;
    const angle = degrees(Math.atan2(y, x));
    return angle >= 0 ? angle : angle + 360;
  };
  const hp1 = hue(ap1, b1);
  const hp2 = hue(ap2, b2);

  let deltaHue = 0;
  if (cp1 * cp2 !== 0) {
    deltaHue = hp2 - hp1;
    if (deltaHue > 180) deltaHue -= 360;
    else if (deltaHue < -180) deltaHue += 360;
  }
  let meanHp = hp1 + hp2;
  if (cp1 * cp2 !== 0) {
    if (Math.abs(hp1 - hp2) > 180) meanHp += hp1 + hp2 < 360 ? 360 : -360;
    meanHp /= 2;
  }

  const t = 1
    - 0.17 * Math.cos(radians(meanHp - 30))
    + 0.24 * Math.cos(radians(2 * meanHp))
    + 0.32 * Math.cos(radians(3 * meanHp + 6))
    - 0.2 * Math.cos(radians(4 * meanHp - 63));

  const dL = l2 - l1;
  const dC = cp2 - cp1;
  const dH = 2 * Math.sqrt(cp1 * cp2) * Math.sin(radians(deltaHue) / 2);

  const sl = 1 + (0.015 * (meanL - 50) ** 2) / Math.sqrt(20 + (meanL - 50) ** 2);
  const sc = 1 + 0.045 * meanCp;
  const sh = 1 + 0.015 * meanCp * t;
  const rotation = -2
    * Math.sqrt(meanCp ** 7 / (meanCp ** 7 + 25 ** 7))
    * Math.sin(radians(60 * Math.exp(-(((meanHp - 275) / 25) ** 2))));

  return Math.sqrt((dL / sl) ** 2 + (dC / sc) ** 2 + (dH / sh) ** 2 + rotation * (dC / sc) * (dH / sh));
}

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
