function mix(a, b, amountB) {
  const t = Math.max(0, Math.min(1, amountB));
  const amountA = 1 - t;
  return {
    r: Math.round(a.r * amountA + b.r * t),
    g: Math.round(a.g * amountA + b.g * t),
    b: Math.round(a.b * amountA + b.b * t)
  };
}

function rgbToHsl({ r, g, b }) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;

  if (Math.abs(max - min) < 0.0001) {
    return { h: 0, s: 0, l };
  }

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (Math.abs(max - rn) < 0.0001) {
    h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  } else if (Math.abs(max - gn) < 0.0001) {
    h = ((bn - rn) / d + 2) / 6;
  } else {
    h = ((rn - gn) / d + 4) / 6;
  }
  return { h, s, l };
}

function hslToRgb(h, s, l) {
  if (s <= 0.0001) {
    const gray = Math.round(l * 255);
    return { r: gray, g: gray, b: gray };
  }

  const hueToRgb = (p, q, t) => {
    let value = t;
    if (value < 0) {
      value += 1;
    }
    if (value > 1) {
      value -= 1;
    }
    if (value < 1 / 6) {
      return p + (q - p) * 6 * value;
    }
    if (value < 1 / 2) {
      return q;
    }
    if (value < 2 / 3) {
      return p + (q - p) * (2 / 3 - value) * 6;
    }
    return p;
  };

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: Math.round(hueToRgb(p, q, h + 1 / 3) * 255),
    g: Math.round(hueToRgb(p, q, h) * 255),
    b: Math.round(hueToRgb(p, q, h - 1 / 3) * 255)
  };
}

const WHITE = { r: 255, g: 255, b: 255 };
const BLACK = { r: 0, g: 0, b: 0 };

function relativeLuminance({ r, g, b }) {
  const linearize = (channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };

  const red = linearize(r);
  const green = linearize(g);
  const blue = linearize(b);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(a, b) {
  const luminanceA = relativeLuminance(a);
  const luminanceB = relativeLuminance(b);
  const lighter = Math.max(luminanceA, luminanceB);
  const darker = Math.min(luminanceA, luminanceB);
  return (lighter + 0.05) / (darker + 0.05);
}

export function getContrastTextColor(
  background,
  { dark = { r: 31, g: 35, b: 40 }, light = WHITE } = {}
) {
  const darkContrast = contrastRatio(background, dark);
  const lightContrast = contrastRatio(background, light);
  return darkContrast >= lightContrast ? dark : light;
}

const PASTEL_SAVE_BUTTON = { r: 232, g: 149, b: 159 };

function deriveAccent(pastel, dark) {
  const { h, s } = rgbToHsl(pastel);
  const targetLightness = dark ? 0.68 : 0.42;
  const targetSaturation = Math.max(0.35, Math.min(0.82, s + 0.18));
  return hslToRgb(h, targetSaturation, targetLightness);
}

function darken(color, amount) {
  return mix(color, { r: 0, g: 0, b: 0 }, amount);
}

function lighten(color, amount) {
  return mix(color, { r: 255, g: 255, b: 255 }, amount);
}

function buildLight(pastel) {
  const accent = deriveAccent(pastel, false);
  const accentHover = mix(pastel, WHITE, 0.35);
  const accentPressed = mix(accent, BLACK, 0.12);
  const sidebar = mix(pastel, WHITE, 0.72);

  return {
    bg: mix(pastel, WHITE, 0.9),
    surface: WHITE,
    sidebar,
    border: mix(pastel, { r: 154, g: 163, b: 176 }, 0.48),
    borderLight: mix(pastel, { r: 186, g: 193, b: 203 }, 0.38),
    text: { r: 31, g: 35, b: 40 },
    textSecondary: { r: 87, g: 96, b: 106 },
    textMuted: { r: 140, g: 149, b: 159 },
    accent,
    accentHover,
    accentPressed,
    accentButtonText: getContrastTextColor(accent),
    accentButtonHover: darken(accent, 0.08),
    accentButtonPressed: darken(accent, 0.16),
    pastelSaveButtonText: getContrastTextColor(PASTEL_SAVE_BUTTON),
    success: { r: 26, g: 127, b: 55 },
    warning: { r: 191, g: 87, b: 0 },
    danger: { r: 207, g: 34, b: 46 },
    editorBg: sidebar,
    editorText: BLACK,
    editorCaret: accent,
    editorPlaceholder: { r: 140, g: 149, b: 159 },
    editorFocusRing: accent,
    editorCodeBg: mix(pastel, { r: 231, g: 235, b: 241 }, 0.42),
    panelHeaderWorkspace: mix(pastel, WHITE, 0.45),
    panelHeaderOutline: mix(pastel, { r: 209, g: 250, b: 229 }, 0.35),
    panelHeaderEditor: mix(pastel, { r: 237, g: 233, b: 254 }, 0.35),
    panelHeaderPageTitle: mix(pastel, { r: 254, g: 243, b: 199 }, 0.35)
  };
}

function buildDark(pastel) {
  const accent = deriveAccent(pastel, true);
  const accentHover = mix(pastel, { r: 22, g: 27, b: 34 }, 0.72);
  const accentPressed = mix(accent, BLACK, 0.18);
  const background = mix(pastel, { r: 13, g: 17, b: 23 }, 0.88);
  const surface = mix(pastel, { r: 22, g: 27, b: 34 }, 0.82);
  const sidebar = mix(pastel, { r: 13, g: 17, b: 23 }, 0.9);

  return {
    bg: background,
    surface,
    sidebar,
    border: mix(pastel, { r: 48, g: 54, b: 61 }, 0.55),
    borderLight: mix(pastel, { r: 33, g: 38, b: 45 }, 0.65),
    text: { r: 230, g: 237, b: 243 },
    textSecondary: { r: 139, g: 148, b: 158 },
    textMuted: { r: 110, g: 118, b: 129 },
    accent,
    accentHover,
    accentPressed,
    accentButtonText: getContrastTextColor(accent),
    accentButtonHover: lighten(accent, 0.1),
    accentButtonPressed: lighten(accent, 0.18),
    pastelSaveButtonText: getContrastTextColor(PASTEL_SAVE_BUTTON),
    success: { r: 63, g: 185, b: 80 },
    warning: { r: 210, g: 153, b: 34 },
    danger: { r: 248, g: 81, b: 73 },
    editorBg: sidebar,
    editorText: { r: 230, g: 237, b: 243 },
    editorCaret: { r: 230, g: 237, b: 243 },
    editorPlaceholder: { r: 110, g: 118, b: 129 },
    editorFocusRing: accent,
    editorCodeBg: mix(pastel, { r: 33, g: 38, b: 45 }, 0.7),
    panelHeaderWorkspace: mix(pastel, { r: 37, g: 52, b: 73 }, 0.55),
    panelHeaderOutline: mix(pastel, { r: 26, g: 60, b: 52 }, 0.55),
    panelHeaderEditor: mix(pastel, { r: 52, g: 44, b: 82 }, 0.55),
    panelHeaderPageTitle: mix(pastel, { r: 72, g: 56, b: 32 }, 0.55)
  };
}

export function buildThemePalette(pastelAccent, dark) {
  return dark ? buildDark(pastelAccent) : buildLight(pastelAccent);
}

export function getPastelSwatchPreviewColor(accent, dark) {
  const palette = buildThemePalette(accent, dark);
  return dark ? palette.accent : accent;
}

export function getPastelSwatchPreviewStyle(accent, dark) {
  const palette = buildThemePalette(accent, dark);
  if (!dark) {
    return {
      backgroundColor: rgbToHex(accent),
      borderColor: '',
      boxShadow: ''
    };
  }
  const accentHex = rgbToHex(palette.accent);
  return {
    backgroundColor: rgbToHex(palette.bg),
    borderColor: accentHex,
    boxShadow: `inset 0 0 0 2px ${accentHex}`
  };
}

export function rgbToHex({ r, g, b }) {
  const toPart = (value) => value.toString(16).padStart(2, '0');
  return `#${toPart(r)}${toPart(g)}${toPart(b)}`;
}

export function rgbToHexAlpha({ r, g, b }, alpha = 0.2) {
  const toPart = (value) => value.toString(16).padStart(2, '0');
  const alphaPart = Math.round(alpha * 255)
    .toString(16)
    .padStart(2, '0');
  return `#${toPart(r)}${toPart(g)}${toPart(b)}${alphaPart}`;
}
