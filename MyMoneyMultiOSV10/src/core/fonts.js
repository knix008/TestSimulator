export const FALLBACK_FONTS = [
  "Segoe UI",
  "Malgun Gothic",
  "Arial",
  "Calibri",
  "Consolas",
  "Courier New",
  "Georgia",
  "Tahoma",
  "Times New Roman",
  "Verdana",
];

export const FONT_STYLES = ["normal", "bold", "italic", "bolditalic"];

/** The four switches of the Font page. Each is on or off on its own. */
export const FONT_FLAGS = ["fontBold", "fontItalic", "fontUnderline", "fontStrike"];

/** The older single style choice, kept in step so files from 1.0 still read it. */
export function fontStyleOf(bold, italic) {
  if (bold && italic) return "bolditalic";
  if (bold) return "bold";
  if (italic) return "italic";
  return "normal";
}

/**
 * The CSS for the quote text. `weight` and `style` go on the stock display as a
 * whole; `decoration` is drawn on each piece of text so a strike line runs through
 * the middle of a 44px price as well as a 12px exchange name.
 */
export function fontFace(settings = {}) {
  const lines = [];
  if (settings.fontUnderline) lines.push("underline");
  if (settings.fontStrike) lines.push("line-through");
  return {
    family: `"${String(settings.fontFamily || FALLBACK_FONTS[0])}", sans-serif`,
    size: `${Number(settings.fontSize) || 14}px`,
    bold: Boolean(settings.fontBold),
    italic: Boolean(settings.fontItalic),
    decoration: lines.length ? lines.join(" ") : "none",
  };
}

/** Put the face on one element that holds stock text. */
export function applyFontFace(node, settings) {
  if (!node) return;
  const face = fontFace(settings);
  node.dataset.fontScope = "stocks";
  node.dataset.fontBold = String(face.bold);
  node.dataset.fontItalic = String(face.italic);
  node.style.fontFamily = face.family;
  node.style.setProperty("--font-decoration", face.decoration);
}

/**
 * The pieces of a quote that can each keep a font. Sizes match the quote scene
 * so a new file looks the same as before the choice existed.
 */
export const FONT_ROLES = ["name", "price", "change", "note"];

/** The windows that draw quotes. Each one keeps its own set of piece fonts. */
export const FONT_SURFACES = ["scene", "stocks", "rates", "news"];

/**
 * The pieces each window actually draws. A rate has no rise and fall, and a
 * headline has no price, so those windows do not offer the missing pieces.
 */
export const FONT_SURFACE_ROLES = {
  scene: ["name", "price", "change", "note"],
  stocks: ["name", "price", "change", "note"],
  rates: ["name", "price", "note"],
  news: ["name", "note"],
};

export const FONT_ROLE_DEFAULTS = {
  name: { fontSize: 22, fontBold: false },
  price: { fontSize: 44, fontBold: false },
  change: { fontSize: 16, fontBold: false },
  note: { fontSize: 16, fontBold: false },
};

function clampFontSize(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(72, Math.max(8, Math.round(number)));
}

/** One role, filled from what was stored and otherwise from that piece's own default. */
export function fontRecord(raw, defaults, base = {}) {
  const source = raw && typeof raw === "object" ? raw : {};
  return {
    fontFamily: String(source.fontFamily || base.fontFamily || FALLBACK_FONTS[0]),
    fontSize: clampFontSize(source.fontSize, defaults.fontSize),
    fontBold: source.fontBold == null ? Boolean(defaults.fontBold) : Boolean(source.fontBold),
    fontItalic: source.fontItalic == null ? Boolean(base.fontItalic) : Boolean(source.fontItalic),
    fontUnderline: source.fontUnderline == null ? Boolean(base.fontUnderline) : Boolean(source.fontUnderline),
    fontStrike: source.fontStrike == null ? Boolean(base.fontStrike) : Boolean(source.fontStrike),
  };
}

function roleMap(raw, base = {}) {
  const stored = raw && typeof raw === "object" ? raw : null;
  const fonts = {};
  for (const role of FONT_ROLES) {
    const seeded = stored
      ? stored[role]
      : {
          fontFamily: base.fontFamily,
          fontBold: base.fontBold,
          fontItalic: base.fontItalic,
          fontUnderline: base.fontUnderline,
          fontStrike: base.fontStrike,
        };
    fonts[role] = fontRecord(seeded, FONT_ROLE_DEFAULTS[role], base);
  }
  return fonts;
}

function isSurfaceMap(raw) {
  return Boolean(raw && FONT_SURFACES.some((surface) => raw[surface] && typeof raw[surface] === "object"));
}

/**
 * A font for every piece of every window. A file that stored one set for the
 * whole app is copied onto each window, so nothing changes until a window is edited.
 */
export function normalizeFonts(raw, base = {}) {
  const stored = raw && typeof raw === "object" ? raw : null;
  const surfaces = isSurfaceMap(stored);
  const fonts = {};
  for (const surface of FONT_SURFACES) {
    const source = !stored ? null : surfaces ? stored[surface] : stored;
    fonts[surface] = roleMap(source, base);
  }
  return fonts;
}

/** The role map one window draws with. */
export function surfaceFonts(fonts, surface) {
  const key = FONT_SURFACES.includes(surface) ? surface : "scene";
  if (fonts?.[key]?.name) return fonts[key];
  if (fonts?.name) return fonts;
  return roleMap(null, {});
}

/** The form edits one piece of one window at a time; the hidden map keeps the rest. */
export function fontsFromForm(values = {}, base = {}) {
  let raw = values.fonts;
  if (typeof raw === "string" && raw) {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = null;
    }
  }
  const fonts = normalizeFonts(raw && typeof raw === "object" ? raw : null, base);
  const surface = FONT_SURFACES.includes(values.fontSurface) ? values.fontSurface : "scene";
  const role = FONT_ROLES.includes(values.fontRole) ? values.fontRole : "name";
  const current = fonts[surface][role];
  const flags = {};
  for (const flag of FONT_FLAGS) {
    if (values[flag] == null) flags[flag] = current[flag];
    else flags[flag] = values[flag] === true || values[flag] === "true";
  }
  fonts[surface][role] = fontRecord(
    {
      fontFamily: values.fontFamily || current.fontFamily,
      fontSize: values.fontSize == null || values.fontSize === "" ? current.fontSize : values.fontSize,
      ...flags,
    },
    FONT_ROLE_DEFAULTS[role],
    base,
  );
  return fonts;
}

/** The quote window's name is what older files stored as the single font. */
export function legacyFontFrom(fonts) {
  const name = fonts?.scene?.name || fonts?.name || roleMap(null, {}).name;
  return {
    fontFamily: name.fontFamily,
    fontSize: name.fontSize,
    fontBold: name.fontBold,
    fontItalic: name.fontItalic,
    fontUnderline: name.fontUnderline,
    fontStrike: name.fontStrike,
    fontStyle: fontStyleOf(name.fontBold, name.fontItalic),
  };
}

function roleWeight(role, bold) {
  if (bold) return "800";
  if (role === "price") return "720";
  if (role === "name") return "700";
  return "650";
}

/**
 * Largest type that still sits on one list row. Every piece is multiplied by
 * the same ratio, so a 44px price and a 22px name stay twice as large.
 */
export const LIST_FONT_CAP = 18;

/** The shared ratio that keeps a list row's pieces in proportion. */
export function listFontScale(fonts, cap = LIST_FONT_CAP) {
  let max = 1;
  for (const role of FONT_ROLES) {
    const size = Number(fonts?.[role]?.fontSize) || FONT_ROLE_DEFAULTS[role].fontSize;
    if (size > max) max = size;
  }
  const limit = Math.max(1, Number(cap) || LIST_FONT_CAP);
  return Math.round(Math.min(1, limit / max) * 1000) / 1000;
}

/** CSS variables for every piece, so a list and the large quote can share one choice. */
export function fontRoleVars(fonts) {
  const vars = {};
  for (const role of FONT_ROLES) {
    const face = fontFace(fonts?.[role] || FONT_ROLE_DEFAULTS[role]);
    vars[`--font-${role}-family`] = face.family;
    vars[`--font-${role}-size`] = face.size;
    vars[`--font-${role}-weight`] = roleWeight(role, face.bold);
    vars[`--font-${role}-style`] = face.italic ? "italic" : "normal";
    vars[`--font-${role}-decoration`] = face.decoration;
  }
  vars["--list-font-scale"] = String(listFontScale(fonts));
  return vars;
}

export function applyFontRoles(node, fonts) {
  if (!node) return;
  for (const [key, value] of Object.entries(fontRoleVars(fonts))) node.style.setProperty(key, value);
}

export function fontRoleStyle(fonts) {
  return Object.entries(fontRoleVars(fonts))
    .map(([key, value]) => `${key}:${value}`)
    .join(";");
}

export function parseWindowsFonts(stdout) {
  return uniqueLines(stdout);
}

export function parseFcList(stdout) {
  const names = new Set();
  for (const line of String(stdout || "").split(/\r?\n/)) {
    const parts = line.split(":");
    if (parts.length < 2) continue;
    const family = parts[1].split(",")[0].trim();
    if (family) names.add(family);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

export function parseMacFonts(stdout) {
  const names = new Set();
  for (const line of String(stdout || "").split(/\r?\n/)) {
    const match = line.match(/Full Name:\s+(.+)$/) || line.match(/Family:\s+(.+)$/);
    if (match) names.add(match[1].trim());
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

export function resolveFontList(systemFonts) {
  const list = Array.isArray(systemFonts) ? systemFonts.map((name) => String(name).trim()).filter(Boolean) : [];
  if (list.length) return [...new Set(list)].sort((a, b) => a.localeCompare(b));
  return [...FALLBACK_FONTS];
}

function uniqueLines(stdout) {
  const names = new Set();
  for (const line of String(stdout || "").split(/\r?\n/)) {
    const name = line.trim();
    if (name) names.add(name);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}
