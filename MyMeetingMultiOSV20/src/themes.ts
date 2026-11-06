// The 40 built-in themes (20 light, 20 dark) and the user's own. A theme is a set of CSS variables.

export const DEFAULT_THEME_ID = "light-classic"
export const THEME_COLOR_KEYS = ["bg", "panel", "ink", "muted", "line", "accent", "soft", "header", "alt", "danger"] as const
export type ThemeColorKey = (typeof THEME_COLOR_KEYS)[number]
export type ThemeColors = Record<ThemeColorKey, string>
export type ThemeMode = "light" | "dark"
export type Theme = { id: string; nameKo: string; nameEn: string; mode: ThemeMode; swatch: [string, string, string]; vars: Record<string, string> }
export type CustomTheme = { id: string; name: string; mode: ThemeMode; colors: ThemeColors }
export const CUSTOM_THEME_PREFIX = "custom-"
const channels = (hex: string): [number, number, number] => {
  const value = Number.parseInt(hex.slice(1), 16)
  return [value >> 16 & 255, value >> 8 & 255, value & 255]
}
function luminance(hex: string) {
  const [r, g, b] = channels(hex).map((c) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
/** The WCAG contrast ratio of two colours, 1 to 21. */
export function contrast(a: string, b: string) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (high + 0.05) / (low + 0.05)
}
const toHex = (rgb: number[]) => `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")}`
const mix = (from: string, to: string, k: number) => {
  const a = channels(from)
  const b = channels(to)
  return toHex(a.map((c, i) => c + (b[i] - c) * k))
}
/** The first colour on the way from `from` to `to` that passes, or `to` itself. */
function approach(from: string, to: string, passes: (candidate: string) => boolean) {
  if (passes(from)) return from
  for (let k = 0.05; k < 1; k += 0.05) {
    const candidate = mix(from, to, k)
    if (passes(candidate)) return candidate
  }
  return to
}
/**
 * The colour itself when it can be read on every given background; otherwise moved just far
 * enough towards `fallback` (by default black or white, whichever reads better).
 */
export function readable(color: string, backgrounds: string[], minimum: number, fallback?: string) {
  const worst = (candidate: string) => Math.min(...backgrounds.map((bg) => contrast(candidate, bg)))
  const target = fallback ?? (worst("#000000") >= worst("#ffffff") ? "#000000" : "#ffffff")
  return approach(color, target, (candidate) => worst(candidate) >= minimum)
}
const onAccent = (accent: string) => (contrast("#ffffff", accent) >= contrast("#1a1a1a", accent) ? "#ffffff" : "#1a1a1a")
const MIN_TEXT = 4.5
/** What a picture needs against what is behind it. */
export const MIN_ICON = 3
const translucent = (hex: string, alpha: number) => `rgba(${channels(hex).join(", ")}, ${alpha})`
/** A theme's accent can be nearly white. As a thin line around a button that glares, so lines stop here. */
export const MAX_ACCENT_LINE = 5
/**
 * A theme's variables from its colours. The window has one text colour, so a theme whose
 * surfaces disagree (a user's dark panel under a still-light header) cannot be fixed by the
 * text alone: any colour in between is unreadable on both. So the text is settled against
 * the panel, and every other surface that does not suit it moves towards the panel. Secondary
 * colours then move towards the text, which is known to read on all of them.
 */
function theme(mode: ThemeMode, id: string, nameKo: string, nameEn: string, rawBg: string, panel: string, rawInk: string, rawMuted: string, line: string, accent: string, rawSoft: string, rawHeader: string, rawAlt: string, rawDanger: string): Theme {
  const light = mode === "light"
  const ink = readable(rawInk, [panel], MIN_TEXT)
  const surface = (color: string) => approach(color, panel, (candidate) => contrast(ink, candidate) >= MIN_TEXT)
  const bg = surface(rawBg)
  const soft = surface(rawSoft)
  const header = surface(rawHeader)
  const alt = surface(rawAlt)
  const chrome = light ? header : bg
  const muted = readable(rawMuted, [bg, panel, header, chrome], MIN_TEXT, ink)
  const danger = readable(rawDanger, [panel], MIN_TEXT, ink)
  return {
    id: `${mode}-${id}`,
    nameKo,
    nameEn,
    mode,
    swatch: [bg, panel, accent],
    vars: {
      "--bg": bg,
      "--panel": panel,
      "--ink": ink,
      "--muted": muted,
      "--line": line,
      "--accent": accent,
      "--accent-line": approach(accent, panel, (candidate) => contrast(candidate, panel) <= MAX_ACCENT_LINE),
      "--accent-ink": readable(accent, [soft, panel], MIN_TEXT, ink),
      "--accent-soft": soft,
      "--header": header,
      "--danger": danger,
      "--chrome": light ? header : bg,
      "--hover": soft,
      "--button": panel,
      "--button-border": line,
      "--pop": panel,
      "--selected": soft,
      "--row-line": line,
      "--alt-row": alt,
      "--head-ink": ink,
      "--ref-bg": soft,
      "--ref-ink": accent,
      "--add-bg": light ? "#e7f7ee" : "#14352c",
      "--add-ink": light ? "#067647" : "#6ee7b7",
      "--del-bg": light ? "#fdecec" : "#3f1d24",
      "--del-ink": light ? "#b42318" : "#fca5a5",
      "--hunk-bg": soft,
      "--hunk-ink": accent,
      "--input": panel,
      // Written out, because an exported SVG has to stand alone (exportImage.ts puts these in).
      "--spine": muted,
      "--node-stroke": translucent(ink, light ? 0.14 : 0.16),
      "--grid-line": translucent(muted, light ? 0.18 : 0.14),
      "--grid-line-major": translucent(muted, light ? 0.34 : 0.26),
      "--banner-bg": light ? "#fff7ed" : "#3b2a14",
      "--banner-ink": light ? "#9a3412" : "#fdba74",
      "--overlay": light ? "rgba(16, 24, 40, 0.35)" : "rgba(0, 0, 0, 0.55)",
      "--on-accent": onAccent(accent),
      "--shadow": light ? "0 8px 24px rgba(16, 24, 40, 0.12)" : "0 8px 24px rgba(0, 0, 0, 0.45)"
    }
  }
}
export function buildTheme(mode: ThemeMode, id: string, nameKo: string, nameEn: string, colors: ThemeColors) {
  const c = colors
  return theme(mode, id, nameKo, nameEn, c.bg, c.panel, c.ink, c.muted, c.line, c.accent, c.soft, c.header, c.alt, c.danger)
}
export function themeColors(item: Theme): ThemeColors {
  const v = item.vars
  return {
    bg: v["--bg"],
    panel: v["--panel"],
    ink: v["--ink"],
    muted: v["--muted"],
    line: v["--line"],
    accent: v["--accent"],
    soft: v["--accent-soft"],
    header: v["--header"],
    alt: v["--alt-row"],
    danger: v["--danger"]
  }
}
export const THEMES: Theme[] = [
  theme("light", "classic", "\uD074\uB798\uC2DD", "Classic", "#f3f4f6", "#ffffff", "#1f2328", "#667085", "#d8dbe2", "#2563eb", "#e8efff", "#eef2f6", "#fcfcfd", "#dc2626"),
  theme("light", "paper", "\uC885\uC774", "Paper", "#f6f1e7", "#fffaf3", "#3f3428", "#8a7564", "#e4d8c8", "#9a3412", "#f8ebe3", "#f3eadf", "#fffdf8", "#b45309"),
  theme("light", "snow", "\uB208", "Snow", "#f4f7fb", "#ffffff", "#1e293b", "#64748b", "#dbe3ee", "#0284c7", "#e0f2fe", "#eef4fa", "#f8fbff", "#e11d48"),
  theme("light", "mint", "\uBBFC\uD2B8", "Mint", "#f3faf6", "#ffffff", "#14352b", "#5f7d72", "#d5e7de", "#059669", "#e7f7ee", "#eef8f3", "#f7fdf9", "#dc2626"),
  theme("light", "sand", "\uBAA8\uB798", "Sand", "#f7f3ea", "#fffdf8", "#3d3426", "#8d7b64", "#e6dccb", "#b45309", "#fef3c7", "#f4efe4", "#fffaf2", "#c2410c"),
  theme("light", "rose", "\uC7A5\uBBF8", "Rose", "#fdf2f4", "#ffffff", "#3f1d2a", "#9d6b7b", "#f3d5dc", "#e11d48", "#ffe4e6", "#fbecef", "#fff7f8", "#be123c"),
  theme("light", "lavender", "\uB77C\uBCA4\uB354", "Lavender", "#f6f4fb", "#ffffff", "#2e1065", "#7c6a9a", "#e4dff0", "#7c3aed", "#f3e8ff", "#f3f0fa", "#fbfaff", "#db2777"),
  theme("light", "sky", "\uD558\uB298", "Sky", "#f0f9ff", "#ffffff", "#0c4a6e", "#5b7c90", "#d5e8f2", "#0284c7", "#e0f2fe", "#e8f4fb", "#f7fcff", "#e11d48"),
  theme("light", "lemon", "\uB808\uBAAC", "Lemon", "#fbf8ef", "#fffef8", "#3f3a1e", "#8a8158", "#ebe4c4", "#ca8a04", "#fef9c3", "#f7f3e2", "#fffdf5", "#dc2626"),
  theme("light", "ocean", "\uBC14\uB2E4", "Ocean", "#eef3f7", "#f8fbfc", "#163042", "#5d7384", "#d3dee6", "#0f766e", "#ccfbf1", "#e7eef3", "#f4f8fa", "#dc2626"),
  theme("light", "forest", "\uC232", "Forest", "#f2f6f1", "#fbfdfb", "#1c3324", "#5e7564", "#d4e0d6", "#15803d", "#dcfce7", "#eaf2ea", "#f7fbf7", "#b91c1c"),
  theme("light", "cherry", "\uCCB4\uB9AC", "Cherry", "#fff5f5", "#ffffff", "#451a1a", "#9a6a6a", "#f3d6d6", "#dc2626", "#fee2e2", "#fbeeee", "#fffafa", "#9f1239"),
  theme("light", "graphite", "\uD751\uC5F0", "Graphite", "#f2f2f2", "#fafafa", "#1a1a1a", "#6b6b6b", "#d9d9d9", "#404040", "#ececec", "#eaeaea", "#f7f7f7", "#dc2626"),
  theme("light", "pearl", "\uC9C4\uC8FC", "Pearl", "#f7f5f2", "#fffcf9", "#2c2825", "#7d746c", "#e5dfd8", "#57534e", "#f5f0eb", "#f1ece7", "#fbf9f7", "#c2410c"),
  theme("light", "aqua", "\uC544\uCFE0\uC544", "Aqua", "#f0fdfa", "#ffffff", "#134e4a", "#5f8a86", "#d1efeb", "#0d9488", "#ccfbf1", "#e6f7f5", "#f7fffe", "#e11d48"),
  theme("light", "blossom", "\uAF43", "Blossom", "#fff7fb", "#ffffff", "#4a1942", "#946888", "#f3d7ea", "#db2777", "#fce7f3", "#fbeff6", "#fff9fc", "#be123c"),
  theme("light", "amber", "\uD638\uBC15", "Amber", "#fff8ef", "#ffffff", "#431407", "#9a6b45", "#f3e0c8", "#d97706", "#ffedd5", "#fbf1e4", "#fffbf5", "#dc2626"),
  theme("light", "indigo", "\uB0A8\uC0C9", "Indigo", "#f4f6fb", "#ffffff", "#1e1b4b", "#6d6a8d", "#dfe3f1", "#4338ca", "#e0e7ff", "#eceff8", "#f8f9fd", "#e11d48"),
  theme("light", "sage", "\uC138\uC774\uC9C0", "Sage", "#f4f6f2", "#fbfcf8", "#2a3324", "#6d7864", "#dde3d6", "#4d7c0f", "#ecfccb", "#eef2ea", "#f8faf5", "#b91c1c"),
  theme("light", "porcelain", "\uC790\uAE30", "Porcelain", "#f8fafc", "#ffffff", "#0f172a", "#64748b", "#e2e8f0", "#0369a1", "#e0f2fe", "#f1f5f9", "#f8fafc", "#e11d48"),
  theme("dark", "midnight", "\uC790\uC815", "Midnight", "#0f1419", "#161b22", "#e6edf3", "#8b949e", "#30363d", "#58a6ff", "#1c2d41", "#1c2128", "#1a2028", "#f85149"),
  theme("dark", "ink", "\uC789\uD06C", "Ink", "#121212", "#1c1c1c", "#f2f2f2", "#a3a3a3", "#2e2e2e", "#d4d4d4", "#2a2a2a", "#181818", "#202020", "#f87171"),
  theme("dark", "navy", "\uB124\uC774\uBE44", "Navy", "#0b1220", "#111a2e", "#e2e8f0", "#94a3b8", "#243049", "#60a5fa", "#1e293b", "#0f172a", "#152036", "#fb7185"),
  theme("dark", "grove", "\uBC24\uC232", "Grove", "#0e1612", "#15201a", "#e7f5ec", "#8eaa98", "#2a3b32", "#34d399", "#16352b", "#121c17", "#18241e", "#f87171"),
  theme("dark", "wine", "\uC640\uC778", "Wine", "#1a1014", "#24161c", "#f8e8ee", "#c4a3b0", "#3d2832", "#fb7185", "#3f1d2e", "#201318", "#2a1a22", "#fda4af"),
  theme("dark", "slate", "\uC2AC\uB808\uC774\uD2B8", "Slate", "#0f172a", "#1e293b", "#e2e8f0", "#94a3b8", "#334155", "#38bdf8", "#1e3a4c", "#172033", "#243044", "#f87171"),
  theme("dark", "ember", "\uC794\uD654", "Ember", "#1a120b", "#24180f", "#f8efe6", "#c4b3a3", "#3d2e22", "#fb923c", "#3b2414", "#20160f", "#2a1d14", "#f87171"),
  theme("dark", "violet", "\uBCF4\uB77C", "Violet", "#140f1f", "#1c152b", "#f3e8ff", "#c4b5d6", "#342848", "#c084fc", "#2a2040", "#191326", "#221a33", "#fb7185"),
  theme("dark", "graphite", "\uD751\uC5F0", "Graphite", "#18181b", "#232326", "#f4f4f5", "#a1a1aa", "#3f3f46", "#a1a1aa", "#2a2a2e", "#1f1f23", "#27272a", "#f87171"),
  theme("dark", "trench", "\uC2EC\uD574", "Trench", "#071316", "#0e1c20", "#e6f4f6", "#8fb4b8", "#1e3338", "#2dd4bf", "#12343a", "#0b171a", "#122226", "#fb7185"),
  theme("dark", "coffee", "\uCEE4\uD53C", "Coffee", "#1c1410", "#271c16", "#f6efe8", "#cbb8a8", "#3e3028", "#e2b07a", "#3a2a20", "#211812", "#2c211b", "#f87171"),
  theme("dark", "aurora", "\uC624\uB85C\uB77C", "Aurora", "#0b1218", "#121a22", "#e8f7ff", "#9bb4c4", "#243240", "#67e8f9", "#12323a", "#101820", "#162028", "#fb7185"),
  theme("dark", "carbon", "\uCE74\uBCF8", "Carbon", "#0c0c0c", "#141414", "#ededed", "#9a9a9a", "#2a2a2a", "#f5f5f5", "#262626", "#101010", "#1a1a1a", "#f87171"),
  theme("dark", "plum", "\uC790\uB450", "Plum", "#160f18", "#211621", "#f8eef8", "#c7aec7", "#3a2a3a", "#e879f9", "#3b2040", "#1c121e", "#271a28", "#fb7185"),
  theme("dark", "storm", "\uD3ED\uD48D", "Storm", "#12161c", "#1a212b", "#e8eef6", "#9aabbd", "#2c3644", "#93c5fd", "#1e2a3a", "#161c24", "#1f2732", "#f87171"),
  theme("dark", "copper", "\uAD6C\uB9AC", "Copper", "#18120e", "#221812", "#f8efe8", "#cbb5a6", "#3c2e26", "#f0a06a", "#3d291c", "#1e1612", "#2a1e18", "#f87171"),
  theme("dark", "arctic", "\uBD81\uADF9", "Arctic", "#2e3440", "#3b4252", "#eceff4", "#d8dee9", "#4c566a", "#88c0d0", "#3b4a5a", "#343b49", "#434c5e", "#bf616a"),
  theme("dark", "orchid", "\uB09C\uCD08", "Orchid", "#1b1520", "#261c2c", "#f6e9f8", "#cbb6d0", "#3d3144", "#f0abfc", "#3a2744", "#211828", "#2d2234", "#fb7185"),
  theme("dark", "olive", "\uC62C\uB9AC\uBE0C", "Olive", "#14160f", "#1c1f14", "#f1f5e6", "#b7c2a4", "#323828", "#bef264", "#2a3318", "#181b12", "#222618", "#f87171"),
  theme("dark", "ice", "\uC5BC\uC74C", "Ice", "#0d141c", "#141c27", "#e8f1fb", "#9eb0c4", "#2a3848", "#7dd3fc", "#163044", "#111923", "#1a2432", "#fb7185")
]
const byId = new Map(THEMES.map((item) => [item.id, item]))
let customThemes: Theme[] = []
let customById = new Map<string, Theme>()
export function customTheme(item: CustomTheme): Theme {
  const built = buildTheme(item.mode, "custom", item.name, item.name, item.colors)
  return { ...built, id: item.id }
}
export function setCustomThemes(list: CustomTheme[] | null | undefined) {
  customThemes = (list ?? []).map(customTheme)
  customById = new Map(customThemes.map((item) => [item.id, item]))
  if (typeof document !== "undefined") writeCustomSheet()
}
export function registeredCustomThemes() {
  return customThemes
}
export function allThemes() {
  return [...THEMES, ...customThemes]
}
export function themeById(id: string | null | undefined): Theme {
  return byId.get(id ?? "") ?? customById.get(id ?? "") ?? byId.get(DEFAULT_THEME_ID)!
}
export function nextThemeId(current: string) {
  const list = allThemes()
  const index = list.findIndex((item) => item.id === themeById(current).id)
  return list[(index + 1) % list.length].id
}
export function isThemeId(id: unknown, custom?: { id: string }[]): id is string {
  if (typeof id !== "string") return false
  if (byId.has(id)) return true
  return Boolean(custom?.some((item) => item.id === id))
}
const THEME_STYLE_ID = "mymeeting-themes"
const CUSTOM_STYLE_ID = "mymeeting-custom-themes"
let themeSheetReady = false
function themeRule(item: Theme) {
  let body = `color-scheme:${item.mode}`
  for (const key in item.vars) body += `;${key}:${item.vars[key]}`
  return `:root[data-theme="${item.id}"]{${body}}`
}
function writeCustomSheet() {
  let node = document.getElementById(CUSTOM_STYLE_ID) as HTMLStyleElement | null
  if (!node) {
    node = document.createElement("style")
    node.id = CUSTOM_STYLE_ID
    document.head.appendChild(node)
  }
  node.textContent = customThemes.map(themeRule).join("")
}
function ensureThemeSheet() {
  if (themeSheetReady) return
  themeSheetReady = true
  const node = document.createElement("style")
  node.id = THEME_STYLE_ID
  node.textContent = THEMES.map(themeRule).join("")
  document.head.appendChild(node)
}
export function applyTheme(id: string) {
  if (typeof document === "undefined") return
  const item = themeById(id)
  const root = document.documentElement
  ensureThemeSheet()
  if (root.dataset.theme === item.id && root.dataset.mode === item.mode) {
    root.dispatchEvent(new Event("mymeeting-theme"))
    return
  }
  root.dataset.theme = item.id
  root.dataset.mode = item.mode
  root.dispatchEvent(new Event("mymeeting-theme"))
}
