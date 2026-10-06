/**
 * The theme table.
 *
 * A theme is written as five seed colors; everything else — panel tints, borders,
 * zebra rows, diff and conflict backgrounds, gutters — is derived from them, so a new
 * theme is five values rather than forty, and every theme is guaranteed to carry the
 * full variable set the stylesheet expects.
 *
 * The same table drives the browser (CSS custom properties) and Electron (the window
 * background color, so the first paint matches instead of flashing white).
 */
import { alpha, darken, lighten, mix, readableOn } from "./color.js";
import seeds from "./themeSeeds.json" with { type: "json" };

export type ThemeKind = "light" | "dark";

export type ThemeSeed = {
  id: string;
  /** Light and dark share a family, which is what the one-click toggle switches on. */
  family: string;
  /** Korean and English display names, for the theme menu. */
  ko: string;
  en: string;
  kind: ThemeKind;
  /** Desktop behind the panels. */
  bg: string;
  /** Panel surface. */
  panel: string;
  /** Primary text. */
  text: string;
  /** Selection / focus / primary button. */
  accent: string;
};

export type Theme = ThemeSeed & { background: string; vars: Record<string, string> };

const SEEDS: ThemeSeed[] = seeds as ThemeSeed[];

/** Fixed hues for the diff semantics; blended into each theme's surface. */
const SEMANTIC = {
  added: "#22c55e",
  removed: "#ef4444",
  modified: "#f59e0b",
  conflict: "#e11d48",
  resolved: "#16a34a",
};

function expand(seed: ThemeSeed): Theme {
  const dark = seed.kind === "dark";
  /** Blend toward the surface: how strongly a semantic tint shows through. */
  const tint = (color: string, amount: number) => mix(seed.panel, color, amount);
  const shade = (amount: number) => (dark ? lighten(seed.panel, amount) : darken(seed.panel, amount));

  const vars: Record<string, string> = {
    "--bg": seed.bg,
    "--panel": seed.panel,
    "--panel-2": dark ? darken(seed.panel, 0.18) : darken(seed.panel, 0.03),
    "--panel-3": dark ? lighten(seed.panel, 0.06) : darken(seed.panel, 0.06),
    "--border": shade(0.1),
    "--border-strong": shade(0.22),
    "--text": seed.text,
    "--muted": mix(seed.text, seed.panel, 0.42),
    "--accent": seed.accent,
    "--accent-contrast": readableOn(seed.accent),
    "--accent-soft": tint(seed.accent, dark ? 0.26 : 0.16),
    "--hover": shade(0.06),
    "--active": shade(0.13),
    "--selection": tint(seed.accent, dark ? 0.34 : 0.22),
    "--focus-ring": alpha(seed.accent, 0.55),

    "--toolbar-bg": dark ? lighten(seed.panel, 0.04) : darken(seed.panel, 0.02),
    "--statusbar-bg": dark ? darken(seed.panel, 0.12) : darken(seed.panel, 0.05),
    "--menu-bg": dark ? lighten(seed.panel, 0.08) : seed.panel,
    "--menu-border": shade(0.26),
    "--tooltip-bg": dark ? lighten(seed.panel, 0.22) : darken(seed.text, 0.0),
    "--tooltip-text": dark ? seed.text : readableOn(seed.text),

    "--row-even": seed.panel,
    "--row-zebra": shade(0.045),
    "--row-blank": dark ? darken(seed.panel, 0.1) : darken(seed.panel, 0.045),
    "--row-added": tint(SEMANTIC.added, dark ? 0.22 : 0.18),
    "--row-removed": tint(SEMANTIC.removed, dark ? 0.22 : 0.16),
    "--row-modified": tint(SEMANTIC.modified, dark ? 0.2 : 0.2),
    "--row-conflict": tint(SEMANTIC.conflict, dark ? 0.26 : 0.18),
    "--row-resolved": tint(SEMANTIC.resolved, dark ? 0.22 : 0.18),

    /*
     * Syntax colours. They are derived rather than fixed so that every one of the
     * forty themes gets a readable set: each is a hue mixed far enough toward the
     * theme's own text colour to stay legible on that theme's panel, and comments
     * are deliberately the quietest thing on the line.
     */
    "--tok-comment": mix(seed.panel, seed.text, dark ? 0.45 : 0.42),
    "--tok-string": mix(seed.text, dark ? "#7ee787" : "#0a7a3d", 0.78),
    "--tok-number": mix(seed.text, dark ? "#f0a868" : "#a4530a", 0.78),
    "--tok-keyword": mix(seed.text, dark ? "#9db4ff" : "#1f4fd8", 0.72),
    "--word-added": tint(SEMANTIC.added, dark ? 0.46 : 0.42),
    "--word-removed": tint(SEMANTIC.removed, dark ? 0.46 : 0.4),
    "--word-modified": tint(SEMANTIC.modified, dark ? 0.44 : 0.46),

    "--gutter-bg": dark ? darken(seed.panel, 0.14) : darken(seed.panel, 0.04),
    "--gutter-text": mix(seed.text, seed.panel, 0.5),

    "--added-accent": dark ? lighten(SEMANTIC.added, 0.2) : SEMANTIC.added,
    "--removed-accent": dark ? lighten(SEMANTIC.removed, 0.2) : SEMANTIC.removed,
    "--modified-accent": dark ? lighten(SEMANTIC.modified, 0.15) : SEMANTIC.modified,
    "--conflict-accent": dark ? lighten(SEMANTIC.conflict, 0.2) : SEMANTIC.conflict,
    "--resolved-accent": dark ? lighten(SEMANTIC.resolved, 0.2) : SEMANTIC.resolved,

    "--overview-bg": dark ? darken(seed.panel, 0.14) : darken(seed.panel, 0.04),
    "--overview-viewport": alpha(seed.text, 0.22),
    "--shadow": dark ? "0 18px 44px rgba(0, 0, 0, 0.55)" : "0 14px 36px rgba(15, 23, 42, 0.16)",
    "--scrollbar": alpha(seed.text, dark ? 0.26 : 0.22),
  };

  return { ...seed, background: seed.bg, vars };
}

export const THEMES: Theme[] = SEEDS.map(expand);
const BY_ID = new Map(THEMES.map((item) => [item.id, item]));

export const DEFAULT_THEME = "classic-light";
export const CUSTOM_THEME_ID = "custom";

/** The four colours a user-defined theme is written in. */
export type CustomTheme = {
  kind: ThemeKind;
  bg: string;
  panel: string;
  text: string;
  accent: string;
};

export const DEFAULT_CUSTOM_THEME: CustomTheme = {
  kind: "light",
  bg: "#eef1f6",
  panel: "#ffffff",
  text: "#1d2430",
  accent: "#3b6ea8",
};

export function isThemeId(value: unknown): value is string {
  return typeof value === "string" && (BY_ID.has(value) || value === CUSTOM_THEME_ID);
}

/**
 * The theme for an id.
 *
 * `custom` is not in the table — its four colours live in the user's settings — so it
 * is expanded on the spot through exactly the same derivation as the built-in forty.
 */
export function theme(id: unknown, custom?: CustomTheme | null): Theme {
  if (id === CUSTOM_THEME_ID) return expandCustom(custom ?? DEFAULT_CUSTOM_THEME);
  return (isThemeId(id) ? BY_ID.get(id) : undefined) ?? (BY_ID.get(DEFAULT_THEME) as Theme);
}

function expandCustom(custom: CustomTheme): Theme {
  return expand({
    id: CUSTOM_THEME_ID,
    family: CUSTOM_THEME_ID,
    ko: "사용자 정의",
    en: "Custom",
    kind: custom.kind === "dark" ? "dark" : "light",
    bg: custom.bg,
    panel: custom.panel,
    text: custom.text,
    accent: custom.accent,
  });
}

export function themeBackground(id: unknown, custom?: CustomTheme | null): string {
  return theme(id, custom).background;
}

/**
 * What the toolbar's theme button switches to: a theme of the other kind, chosen at
 * random from the twenty of them.
 *
 * Alternating the kind on every press is what makes the button predictable — one
 * press darkens, the next lightens — while picking the family at random is what
 * makes it worth pressing more than twice. The current theme is excluded, so a press
 * always visibly does something.
 *
 * `pick` is injectable so the behaviour can be tested without waiting for a
 * coincidence.
 */
export function counterpartOf(
  id: unknown,
  custom?: CustomTheme | null,
  pick: (count: number) => number = (count) => Math.floor(Math.random() * count),
): string {
  const current = theme(id, custom);
  const wanted: ThemeKind = current.kind === "dark" ? "light" : "dark";
  const candidates = THEMES.filter((item) => item.kind === wanted && item.id !== current.id);
  if (candidates.length === 0) return DEFAULT_THEME;
  const index = Math.min(candidates.length - 1, Math.max(0, pick(candidates.length)));
  return candidates[index].id;
}

/** Applies a theme to `document.documentElement`. Browser only. */
export function applyTheme(id: unknown, custom?: CustomTheme | null): Theme {
  const selected = theme(id, custom);
  const root = document.documentElement;
  for (const [name, value] of Object.entries(selected.vars)) root.style.setProperty(name, value);
  root.dataset.theme = selected.id;
  root.dataset.themeKind = selected.kind;
  root.style.colorScheme = selected.kind;
  return selected;
}

/**
 * A pane title bar's colours, for the theme in force.
 *
 * The swatch a user picks is a hue, not a finished colour: used literally it is a
 * pastel, which is right on a light theme and wrong on a dark one — the bar stays
 * bright while everything round it goes dark, and the text on it has to be hard-coded
 * to stay readable. So the swatch is blended into the theme's own panel colour, which
 * keeps the hue and lets the lightness follow the theme, and the text colour is then
 * measured against the result rather than assumed.
 */
export function paneHeaderStyle(
  swatch: string,
  themeId: unknown,
  custom?: CustomTheme | null,
): { background: string; color: string } {
  const current = theme(themeId, custom);
  const background = mix(current.vars["--panel-3"], swatch, current.kind === "dark" ? 0.3 : 0.72);
  return { background, color: readableOn(background) };
}

/** Pastel swatches offered for the pane title bars, ported from the WinForms palette. */
export const HEADER_PALETTE = [
  "#dcf5d2", "#d2ebff", "#ffe4eb", "#fff0d2", "#e8e0ff",
  "#d2f5f0", "#ffe8dc", "#f0e6ff", "#fff8d2", "#d7f0ff",
];

export const DEFAULT_HEADER_COLORS = {
  base: "#fff0d2",
  left: "#dcf5d2",
  right: "#d2ebff",
  result: "#e8e0ff",
};
