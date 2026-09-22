export type ThemeKind = 'dark' | 'light'

export type ThemeDefinition = {
  id: string
  kind: ThemeKind
  names: { ko: string; en: string }
  accent: string
  appA: string
  appB: string
  vars: Record<string, string>
}

function rgb(hex: string) {
  const value = hex.replace('#', '')
  return `${Number.parseInt(value.slice(0, 2), 16)}, ${Number.parseInt(value.slice(2, 4), 16)}, ${Number.parseInt(value.slice(4, 6), 16)}`
}

/** Relative luminance of a #rrggbb colour, 0 (black) to 1 (white). */
export function luminance(hex: string): number {
  const channel = (value: number) => { const c = value / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
  const v = hex.replace('#', '')
  return 0.2126 * channel(Number.parseInt(v.slice(0, 2), 16)) + 0.7152 * channel(Number.parseInt(v.slice(2, 4), 16)) + 0.0722 * channel(Number.parseInt(v.slice(4, 6), 16))
}

/** WCAG contrast ratio between two #rrggbb colours. */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/** The text colour (near-black or white) with the better contrast on a background. */
export function contrastOn(background: string): string {
  return contrastRatio(background, '#0b1220') >= contrastRatio(background, '#ffffff') ? '#0b1220' : '#ffffff'
}

function buildTheme(
  id: string,
  kind: ThemeKind,
  names: { ko: string; en: string },
  palette: {
    accent: string
    appA: string
    appB: string
    toolbar: string
    panel: string
    menu: string
    control: string
    input: string
    text: string
    muted: string
    stage: string
    checkA: string
    checkB: string
  },
): ThemeDefinition {
  const accentRgb = rgb(palette.accent)
  // Black or white, whichever reads better on the accent (WCAG relative luminance).
  const accentContrast = contrastOn(palette.accent)
  const lineRgb = kind === 'dark' ? '227, 240, 245' : '31, 50, 64'
  return {
    id,
    kind,
    names,
    accent: palette.accent,
    appA: palette.appA,
    appB: palette.appB,
    vars: {
      '--accent': palette.accent,
      '--accent-soft': `rgba(${accentRgb}, ${kind === 'dark' ? 0.2 : 0.16})`,
      '--accent-contrast': accentContrast,
      '--app-bg-a': palette.appA,
      '--app-bg-b': palette.appB,
      '--border': `rgba(${lineRgb}, ${kind === 'dark' ? 0.14 : 0.16})`,
      '--control-bg': palette.control,
      '--input-bg': palette.input,
      '--menu-bg': palette.menu,
      '--panel-bg': palette.panel,
      '--shine': `rgba(${accentRgb}, ${kind === 'dark' ? 0.16 : 0.2})`,
      '--stage-bg': palette.stage,
      '--stage-check-a': palette.checkA,
      '--stage-check-b': palette.checkB,
      '--grid-line': kind === 'dark' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(21, 40, 52, 0.16)',
      '--text-muted': palette.muted,
      '--text-primary': palette.text,
      '--toolbar-bg': palette.toolbar,
    },
  }
}

export const themes: ThemeDefinition[] = [
  buildTheme('dark', 'dark', { ko: '다크', en: 'Dark' }, {
    accent: '#6ec8ff', appA: '#0f151b', appB: '#1a2430', toolbar: 'rgba(14, 20, 26, 0.94)', panel: 'rgba(16, 23, 29, 0.94)',
    menu: '#192027', control: 'rgba(255, 255, 255, 0.06)', input: 'rgba(0, 0, 0, 0.18)', text: '#eef6fa', muted: '#a8b8b6',
    stage: '#10151a', checkA: '#1b232c', checkB: '#151b22',
  }),
  buildTheme('midnight', 'dark', { ko: '미드나잇', en: 'Midnight' }, {
    accent: '#7aa2ff', appA: '#070b18', appB: '#121a32', toolbar: 'rgba(10, 16, 32, 0.96)', panel: 'rgba(14, 22, 42, 0.96)',
    menu: '#152040', control: 'rgba(122, 162, 255, 0.12)', input: 'rgba(0, 0, 0, 0.28)', text: '#eef2ff', muted: '#8fa0c8',
    stage: '#0a1020', checkA: '#182246', checkB: '#10182e',
  }),
  buildTheme('ocean', 'dark', { ko: '오션', en: 'Ocean' }, {
    accent: '#2ed3e6', appA: '#07191f', appB: '#0e2f38', toolbar: 'rgba(8, 32, 40, 0.96)', panel: 'rgba(10, 38, 46, 0.96)',
    menu: '#12343c', control: 'rgba(46, 211, 230, 0.12)', input: 'rgba(0, 20, 24, 0.4)', text: '#e8f8fb', muted: '#7aa5b0',
    stage: '#0a2027', checkA: '#163840', checkB: '#0e2a32',
  }),
  buildTheme('forest', 'dark', { ko: '포레스트', en: 'Forest' }, {
    accent: '#8fd86a', appA: '#0d1610', appB: '#17301c', toolbar: 'rgba(14, 28, 18, 0.96)', panel: 'rgba(16, 34, 22, 0.96)',
    menu: '#1c3a24', control: 'rgba(143, 216, 106, 0.12)', input: 'rgba(0, 16, 8, 0.35)', text: '#eef8ee', muted: '#86a48c',
    stage: '#101c14', checkA: '#1e3824', checkB: '#15281a',
  }),
  buildTheme('sunset', 'dark', { ko: '선셋', en: 'Sunset' }, {
    accent: '#ff8a5b', appA: '#1a0e14', appB: '#3a1820', toolbar: 'rgba(32, 14, 20, 0.96)', panel: 'rgba(40, 18, 26, 0.96)',
    menu: '#4a2230', control: 'rgba(255, 138, 91, 0.14)', input: 'rgba(24, 6, 10, 0.4)', text: '#fff1ea', muted: '#c49a96',
    stage: '#1c1016', checkA: '#3a2430', checkB: '#26141c',
  }),
  buildTheme('rose', 'dark', { ko: '로즈', en: 'Rose' }, {
    accent: '#ff7aa8', appA: '#1c0c12', appB: '#35141e', toolbar: 'rgba(36, 14, 22, 0.96)', panel: 'rgba(42, 18, 26, 0.96)',
    menu: '#4a2230', control: 'rgba(255, 122, 168, 0.14)', input: 'rgba(24, 6, 12, 0.4)', text: '#fff0f4', muted: '#c090a0',
    stage: '#1a0e14', checkA: '#3c1e28', checkB: '#28141c',
  }),
  buildTheme('slate', 'dark', { ko: '슬레이트', en: 'Slate' }, {
    accent: '#ffb547', appA: '#1c2128', appB: '#2a323c', toolbar: 'rgba(32, 38, 46, 0.96)', panel: 'rgba(36, 44, 52, 0.96)',
    menu: '#3a4450', control: 'rgba(255, 181, 71, 0.12)', input: 'rgba(8, 10, 14, 0.35)', text: '#f4f7fb', muted: '#96a2b0',
    stage: '#222830', checkA: '#343c46', checkB: '#262c34',
  }),
  buildTheme('mono', 'dark', { ko: '모노', en: 'Mono' }, {
    accent: '#e6e6e6', appA: '#101010', appB: '#1c1c1c', toolbar: 'rgba(18, 18, 18, 0.96)', panel: 'rgba(22, 22, 22, 0.96)',
    menu: '#2a2a2a', control: 'rgba(255, 255, 255, 0.08)', input: 'rgba(0, 0, 0, 0.4)', text: '#f4f4f4', muted: '#8f8f8f',
    stage: '#141414', checkA: '#2a2a2a', checkB: '#1a1a1a',
  }),
  buildTheme('neon', 'dark', { ko: '네온', en: 'Neon' }, {
    accent: '#ff2ec4', appA: '#050509', appB: '#161022', toolbar: 'rgba(10, 8, 18, 0.96)', panel: 'rgba(16, 12, 28, 0.96)',
    menu: '#221830', control: 'rgba(255, 46, 196, 0.14)', input: 'rgba(6, 0, 14, 0.5)', text: '#f8f2ff', muted: '#a090c0',
    stage: '#08080f', checkA: '#241830', checkB: '#120e1c',
  }),
  buildTheme('classic', 'dark', { ko: '클래식', en: 'Classic' }, {
    accent: '#d98345', appA: '#1c1510', appB: '#322418', toolbar: 'rgba(32, 24, 18, 0.96)', panel: 'rgba(40, 30, 22, 0.96)',
    menu: '#4a3828', control: 'rgba(217, 131, 69, 0.14)', input: 'rgba(18, 10, 6, 0.4)', text: '#fff4e6', muted: '#b8a68e',
    stage: '#1e1812', checkA: '#3a2c20', checkB: '#261c14',
  }),
  buildTheme('carbon', 'dark', { ko: '카본', en: 'Carbon' }, {
    accent: '#5eead4', appA: '#0a0c0e', appB: '#171b1e', toolbar: 'rgba(12, 14, 16, 0.96)', panel: 'rgba(16, 20, 22, 0.96)',
    menu: '#22282c', control: 'rgba(94, 234, 212, 0.12)', input: 'rgba(0, 0, 0, 0.45)', text: '#e8f4f2', muted: '#7f9692',
    stage: '#0c0e10', checkA: '#222628', checkB: '#14181a',
  }),
  buildTheme('grape', 'dark', { ko: '그레이프', en: 'Grape' }, {
    accent: '#c084fc', appA: '#140c1c', appB: '#2a1840', toolbar: 'rgba(24, 14, 36, 0.96)', panel: 'rgba(30, 18, 46, 0.96)',
    menu: '#3c2458', control: 'rgba(192, 132, 252, 0.14)', input: 'rgba(12, 4, 22, 0.45)', text: '#f6eeff', muted: '#b09ac8',
    stage: '#160e22', checkA: '#322046', checkB: '#20142e',
  }),
  buildTheme('ember', 'dark', { ko: '엠버', en: 'Ember' }, {
    accent: '#fb7185', appA: '#1a0a0a', appB: '#3a1414', toolbar: 'rgba(36, 12, 12, 0.96)', panel: 'rgba(44, 16, 16, 0.96)',
    menu: '#5a2020', control: 'rgba(251, 113, 133, 0.14)', input: 'rgba(20, 4, 4, 0.45)', text: '#fff1f0', muted: '#c49a96',
    stage: '#180c0c', checkA: '#3c1c1c', checkB: '#261010',
  }),
  buildTheme('light', 'light', { ko: '라이트', en: 'Light' }, {
    accent: '#1565c0', appA: '#f4f7f8', appB: '#dde6ee', toolbar: 'rgba(249, 252, 253, 0.94)', panel: 'rgba(250, 252, 253, 0.94)',
    menu: '#ffffff', control: 'rgba(255, 255, 255, 0.74)', input: '#ffffff', text: '#142026', muted: '#526066',
    stage: '#d7dee6', checkA: '#ffffff', checkB: '#d5dbe2',
  }),
  buildTheme('arctic', 'light', { ko: '아틱', en: 'Arctic' }, {
    accent: '#1f7ae0', appA: '#eaf1f8', appB: '#d5e4f2', toolbar: 'rgba(245, 249, 253, 0.96)', panel: 'rgba(255, 255, 255, 0.96)',
    menu: '#ffffff', control: 'rgba(31, 122, 224, 0.08)', input: '#ffffff', text: '#0f2438', muted: '#66788c',
    stage: '#d3e0ec', checkA: '#ffffff', checkB: '#cfdcea',
  }),
  buildTheme('sand', 'light', { ko: '샌드', en: 'Sand' }, {
    accent: '#b7692c', appA: '#f3ecdf', appB: '#e4d5bc', toolbar: 'rgba(250, 245, 235, 0.96)', panel: 'rgba(255, 251, 243, 0.96)',
    menu: '#fffbf3', control: 'rgba(183, 105, 44, 0.1)', input: '#fffdf7', text: '#241a10', muted: '#84725f',
    stage: '#e0d4c0', checkA: '#fffaf0', checkB: '#d8cbb6',
  }),
  buildTheme('lavender', 'light', { ko: '라벤더', en: 'Lavender' }, {
    accent: '#7c5cff', appA: '#f1eefa', appB: '#ddd6f2', toolbar: 'rgba(249, 247, 254, 0.96)', panel: 'rgba(255, 255, 255, 0.96)',
    menu: '#ffffff', control: 'rgba(124, 92, 255, 0.1)', input: '#ffffff', text: '#1e1a33', muted: '#736d8f',
    stage: '#dcd6ee', checkA: '#ffffff', checkB: '#d4cce8',
  }),
  buildTheme('coffee', 'light', { ko: '커피', en: 'Coffee' }, {
    accent: '#6f4630', appA: '#efe6dc', appB: '#ddcfc0', toolbar: 'rgba(247, 240, 232, 0.96)', panel: 'rgba(253, 248, 242, 0.96)',
    menu: '#fdf8f2', control: 'rgba(111, 70, 48, 0.1)', input: '#fffaf4', text: '#26170f', muted: '#836d5f',
    stage: '#d9cdc0', checkA: '#fff8f0', checkB: '#d2c4b4',
  }),
  buildTheme('mint', 'light', { ko: '민트', en: 'Mint' }, {
    accent: '#0f766e', appA: '#e8f6f2', appB: '#cfe8e0', toolbar: 'rgba(244, 252, 249, 0.96)', panel: 'rgba(255, 255, 255, 0.96)',
    menu: '#ffffff', control: 'rgba(15, 118, 110, 0.1)', input: '#ffffff', text: '#0f2a26', muted: '#4f746e',
    stage: '#cfe3dc', checkA: '#ffffff', checkB: '#c5ddd6',
  }),
  buildTheme('sakura', 'light', { ko: '사쿠라', en: 'Sakura' }, {
    accent: '#db2777', appA: '#fceef4', appB: '#f3d4e2', toolbar: 'rgba(255, 246, 250, 0.96)', panel: 'rgba(255, 255, 255, 0.96)',
    menu: '#fff7fa', control: 'rgba(219, 39, 119, 0.1)', input: '#ffffff', text: '#3b1024', muted: '#8d5a70',
    stage: '#efd4e0', checkA: '#ffffff', checkB: '#ebc9d8',
  }),
]

export type Theme = (typeof themes)[number]['id']

export function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && themes.some((theme) => theme.id === value)
}

export function getTheme(id: string) {
  return themes.find((theme) => theme.id === id) ?? themes[0]
}

export function themeLabel(language: 'ko' | 'en', id: string) {
  return getTheme(id).names[language]
}

export function applyTheme(id: string) {
  const theme = getTheme(id)
  const root = document.documentElement
  root.dataset.theme = theme.kind
  root.style.colorScheme = theme.kind
  for (const [key, value] of Object.entries(theme.vars)) {
    root.style.setProperty(key, value)
  }
}
