// Colour themes: twenty dark and twenty light palettes.
//
// A theme is a plain token set; the UI turns it into CSS custom properties, so
// adding a theme never needs a stylesheet change.

export type ThemeMode = 'dark' | 'light'

export interface Theme {
  id: string
  mode: ThemeMode
  name: { ko: string; en: string }
  colors: {
    /** window background */
    bg: string
    /** dialogs, cards */
    panel: string
    /** side panels, toolbars */
    panelAlt: string
    /** borders */
    line: string
    text: string
    muted: string
    accent: string
    button: string
    danger: string
    /** viewport radial gradient */
    viewportA: string
    viewportB: string
    /** 3D grid lines */
    gridMajor: string
    gridMinor: string
  }
}

function dark(id: string, ko: string, en: string, colors: Theme['colors']): Theme {
  return { id, mode: 'dark', name: { ko, en }, colors }
}

function light(id: string, ko: string, en: string, colors: Theme['colors']): Theme {
  return { id, mode: 'light', name: { ko, en }, colors }
}

export const THEMES: Theme[] = [
  // ── dark ────────────────────────────────────────────────────────────────
  dark('dark', '미드나이트', 'Midnight', {
    bg: '#1b232c', panel: '#232c36', panelAlt: '#1a232c', line: '#3a4754', text: '#e7eef5', muted: '#9aabba',
    accent: '#3ec1ff', button: '#2c3844', danger: '#d36b6b', viewportA: '#243240', viewportB: '#0c1218',
    gridMajor: '#3d5a73', gridMinor: '#2a3b4a'
  }),
  dark('graphite', '그래파이트', 'Graphite', {
    bg: '#2a2a2a', panel: '#333333', panelAlt: '#262626', line: '#555555', text: '#f2f2f2', muted: '#a8a8a8',
    accent: '#d0a85c', button: '#3f3f3f', danger: '#cf6c5c', viewportA: '#3a3a3a', viewportB: '#161616',
    gridMajor: '#5c5c5c', gridMinor: '#3a3a3a'
  }),
  dark('blueprint', '청사진', 'Blueprint', {
    bg: '#0e2a43', panel: '#123352', panelAlt: '#0c2439', line: '#2f6f9f', text: '#e7f4ff', muted: '#8fbede',
    accent: '#7fd0ff', button: '#18466c', danger: '#e08a7a', viewportA: '#124068', viewportB: '#06192a',
    gridMajor: '#3f86bd', gridMinor: '#1d4d74'
  }),
  dark('contrast', '고대비', 'High contrast', {
    bg: '#000000', panel: '#000000', panelAlt: '#000000', line: '#ffffff', text: '#ffffff', muted: '#d0d0d0',
    accent: '#ffff00', button: '#111111', danger: '#ff5555', viewportA: '#101010', viewportB: '#000000',
    gridMajor: '#ffffff', gridMinor: '#606060'
  }),
  dark('carbon', '카본', 'Carbon', {
    bg: '#161616', panel: '#202020', panelAlt: '#121212', line: '#393939', text: '#f4f4f4', muted: '#a0a0a0',
    accent: '#4589ff', button: '#2a2a2a', danger: '#fa4d56', viewportA: '#242424', viewportB: '#0b0b0b',
    gridMajor: '#4a4a4a', gridMinor: '#2c2c2c'
  }),
  dark('ocean', '오션', 'Ocean', {
    bg: '#0b1f2a', panel: '#12303e', panelAlt: '#0a1c26', line: '#1f5468', text: '#e2f4fb', muted: '#86b3c4',
    accent: '#36d6d6', button: '#154254', danger: '#e2786a', viewportA: '#123948', viewportB: '#05131b',
    gridMajor: '#2f7f97', gridMinor: '#16414f'
  }),
  dark('forest', '포레스트', 'Forest', {
    bg: '#14231a', panel: '#1c3226', panelAlt: '#111e16', line: '#2f5740', text: '#e6f4ea', muted: '#93b8a1',
    accent: '#5fd68a', button: '#234232', danger: '#d9776a', viewportA: '#1a3325', viewportB: '#08130d',
    gridMajor: '#3d7754', gridMinor: '#234533'
  }),
  dark('plum', '플럼', 'Plum', {
    bg: '#1d1424', panel: '#2a1d34', panelAlt: '#181020', line: '#4a3159', text: '#f2e9f8', muted: '#b298c2',
    accent: '#c07bff', button: '#39264a', danger: '#e06f8c', viewportA: '#2b1d38', viewportB: '#100a16',
    gridMajor: '#6a4780', gridMinor: '#3d2a4d'
  }),
  dark('ember', '엠버', 'Ember', {
    bg: '#241812', panel: '#33231a', panelAlt: '#1d130e', line: '#5a3b29', text: '#fbeee6', muted: '#c5a996',
    accent: '#ff9450', button: '#43301f', danger: '#ef5f4f', viewportA: '#33231a', viewportB: '#150c08',
    gridMajor: '#7d5334', gridMinor: '#4a331f'
  }),
  dark('slate', '슬레이트', 'Slate', {
    bg: '#1e242b', panel: '#2a323b', panelAlt: '#1a2027', line: '#414d59', text: '#e9eef3', muted: '#9caab8',
    accent: '#8bb4ff', button: '#333d48', danger: '#e07b7b', viewportA: '#2b343d', viewportB: '#111519',
    gridMajor: '#4d5b69', gridMinor: '#2d3640'
  }),
  dark('cobalt', '코발트', 'Cobalt', {
    bg: '#062146', panel: '#0b2f5e', panelAlt: '#05193a', line: '#1c4f8c', text: '#e8f1ff', muted: '#8fb2dc',
    accent: '#ffc857', button: '#103a6e', danger: '#ff7b72', viewportA: '#0c3466', viewportB: '#03112a',
    gridMajor: '#2c6bb0', gridMinor: '#123f75'
  }),
  dark('mocha', '모카', 'Mocha', {
    bg: '#1e1b18', panel: '#2b2723', panelAlt: '#191613', line: '#4a423a', text: '#f3ece4', muted: '#b6a18f',
    accent: '#e0a96d', button: '#382f28', danger: '#d9776a', viewportA: '#2c2621', viewportB: '#12100e',
    gridMajor: '#6b5c4d', gridMinor: '#3d352d'
  }),
  dark('nord', '노르드', 'Nord', {
    bg: '#2e3440', panel: '#3b4252', panelAlt: '#272c36', line: '#4c566a', text: '#eceff4', muted: '#a8b3c4',
    accent: '#88c0d0', button: '#434c5e', danger: '#bf616a', viewportA: '#3b4252', viewportB: '#20242c',
    gridMajor: '#5c6a80', gridMinor: '#3b4354'
  }),
  dark('dracula', '드라큘라', 'Dracula', {
    bg: '#282a36', panel: '#343746', panelAlt: '#21222c', line: '#4d5064', text: '#f8f8f2', muted: '#b6b9cc',
    accent: '#bd93f9', button: '#3c3f52', danger: '#ff5555', viewportA: '#343746', viewportB: '#1a1b22',
    gridMajor: '#5c6080', gridMinor: '#3a3d4e'
  }),
  dark('solarizedDark', '솔라라이즈드 다크', 'Solarized dark', {
    bg: '#002b36', panel: '#073642', panelAlt: '#00232c', line: '#1f5a66', text: '#eee8d5', muted: '#93a1a1',
    accent: '#b58900', button: '#0b4553', danger: '#dc322f', viewportA: '#073642', viewportB: '#001a21',
    gridMajor: '#2e6f7d', gridMinor: '#0f4450'
  }),
  dark('monokai', '모노카이', 'Monokai', {
    bg: '#272822', panel: '#31322c', panelAlt: '#20211c', line: '#4b4c44', text: '#f8f8f2', muted: '#b3b3a8',
    accent: '#a6e22e', button: '#3a3b33', danger: '#f92672', viewportA: '#32332c', viewportB: '#191a16',
    gridMajor: '#5d5e52', gridMinor: '#3b3c34'
  }),
  dark('tealDark', '틸 다크', 'Teal dark', {
    bg: '#0f2224', panel: '#163134', panelAlt: '#0b1a1c', line: '#245a5f', text: '#e2f6f6', muted: '#8cbdbf',
    accent: '#3fe0c8', button: '#1b4246', danger: '#e07a6a', viewportA: '#173538', viewportB: '#071213',
    gridMajor: '#2d7d84', gridMinor: '#17474c'
  }),
  dark('roseDark', '로즈 다크', 'Rose dark', {
    bg: '#241a1f', panel: '#33262c', panelAlt: '#1c1418', line: '#573d46', text: '#fbeaee', muted: '#c39ba7',
    accent: '#ff8fab', button: '#42313a', danger: '#ef5f6f', viewportA: '#33262c', viewportB: '#140e11',
    gridMajor: '#7a5765', gridMinor: '#45323a'
  }),
  dark('amberDark', '앰버 다크', 'Amber dark', {
    bg: '#221c0e', panel: '#302814', panelAlt: '#1a150b', line: '#5b4a21', text: '#faf2dd', muted: '#c3b184',
    accent: '#ffca3a', button: '#3f3419', danger: '#e2725b', viewportA: '#2f2714', viewportB: '#131007',
    gridMajor: '#7d682e', gridMinor: '#4a3d1c'
  }),
  dark('steel', '스틸', 'Steel', {
    bg: '#202833', panel: '#2b3542', panelAlt: '#1a212a', line: '#445266', text: '#e8edf4', muted: '#9aa8ba',
    accent: '#60a5fa', button: '#35404f', danger: '#e06c75', viewportA: '#2c3744', viewportB: '#121821',
    gridMajor: '#4f6076', gridMinor: '#2f3947'
  }),

  // ── light ───────────────────────────────────────────────────────────────
  light('light', '데이라이트', 'Daylight', {
    bg: '#f4f7fb', panel: '#ffffff', panelAlt: '#eef3f9', line: '#d5dee8', text: '#1c2833', muted: '#5d6d7e',
    accent: '#1478b8', button: '#e8eef5', danger: '#c0392b', viewportA: '#ffffff', viewportB: '#dbe6f0',
    gridMajor: '#b7c7d6', gridMinor: '#d9e3ec'
  }),
  light('paper', '페이퍼', 'Paper', {
    bg: '#faf9f6', panel: '#ffffff', panelAlt: '#f2f0ea', line: '#ddd8cc', text: '#2b2a26', muted: '#6d685c',
    accent: '#b3701f', button: '#eeebe2', danger: '#b23a3a', viewportA: '#ffffff', viewportB: '#e6e2d6',
    gridMajor: '#c9c2b2', gridMinor: '#e2ded2'
  }),
  light('blueprintLight', '청사진 라이트', 'Blueprint light', {
    bg: '#eaf2fb', panel: '#ffffff', panelAlt: '#dfeaf7', line: '#b7cfe8', text: '#123152', muted: '#4a6d90',
    accent: '#1565c0', button: '#d8e6f6', danger: '#c0392b', viewportA: '#f4f9ff', viewportB: '#cfe0f2',
    gridMajor: '#9dbede', gridMinor: '#c8dcf0'
  }),
  light('contrastLight', '고대비 라이트', 'High contrast light', {
    bg: '#ffffff', panel: '#ffffff', panelAlt: '#ffffff', line: '#000000', text: '#000000', muted: '#333333',
    accent: '#0000ee', button: '#f0f0f0', danger: '#cc0000', viewportA: '#ffffff', viewportB: '#e8e8e8',
    gridMajor: '#000000', gridMinor: '#909090'
  }),
  light('sand', '샌드', 'Sand', {
    bg: '#f7f1e6', panel: '#fffdf8', panelAlt: '#efe6d6', line: '#ddcdb4', text: '#3a3122', muted: '#7a6a52',
    accent: '#c07a2b', button: '#ece0cc', danger: '#b5452f', viewportA: '#fffdf8', viewportB: '#e4d7c0',
    gridMajor: '#c9b795', gridMinor: '#e0d3ba'
  }),
  light('mint', '민트', 'Mint', {
    bg: '#eefaf4', panel: '#ffffff', panelAlt: '#e0f4ea', line: '#b8e0cd', text: '#123528', muted: '#4b7c66',
    accent: '#14a06e', button: '#d7f0e3', danger: '#c0523f', viewportA: '#f7fffb', viewportB: '#d2ece0',
    gridMajor: '#9dd4bb', gridMinor: '#c8e8d9'
  }),
  light('sky', '스카이', 'Sky', {
    bg: '#eef6ff', panel: '#ffffff', panelAlt: '#e0eefc', line: '#bcd9f2', text: '#10304d', muted: '#4a7396',
    accent: '#1e88e5', button: '#d8eafb', danger: '#c0392b', viewportA: '#f8fcff', viewportB: '#d3e6f8',
    gridMajor: '#a3c8e6', gridMinor: '#cadff2'
  }),
  light('lavender', '라벤더', 'Lavender', {
    bg: '#f5f1fb', panel: '#ffffff', panelAlt: '#ece4f7', line: '#d3c4ea', text: '#2e2140', muted: '#6b5c85',
    accent: '#7c4dff', button: '#e5dbf5', danger: '#c0392b', viewportA: '#fbf8ff', viewportB: '#e2d7f2',
    gridMajor: '#bda9dd', gridMinor: '#dccfee'
  }),
  light('roseLight', '로즈 라이트', 'Rose light', {
    bg: '#fdf1f4', panel: '#ffffff', panelAlt: '#f7e3e9', line: '#eec6d2', text: '#40202b', muted: '#8a5c6a',
    accent: '#e05780', button: '#f6dde4', danger: '#c0392b', viewportA: '#fff8fa', viewportB: '#f2d8e0',
    gridMajor: '#e0aabb', gridMinor: '#f0d2dc'
  }),
  light('linen', '리넨', 'Linen', {
    bg: '#f6f4ef', panel: '#ffffff', panelAlt: '#ece8df', line: '#d8d2c6', text: '#33302a', muted: '#6f6a5f',
    accent: '#8a7a4e', button: '#e9e5da', danger: '#b5452f', viewportA: '#fdfcf9', viewportB: '#e3ded2',
    gridMajor: '#c6bfae', gridMinor: '#ded8cb'
  }),
  light('cloud', '클라우드', 'Cloud', {
    bg: '#f2f5f8', panel: '#ffffff', panelAlt: '#e8edf3', line: '#ccd6e0', text: '#26313b', muted: '#5f6f7d',
    accent: '#0f89a8', button: '#e2e9f1', danger: '#c0392b', viewportA: '#fbfcfe', viewportB: '#dde5ed',
    gridMajor: '#b3c1cf', gridMinor: '#d5dee7'
  }),
  light('solarizedLight', '솔라라이즈드 라이트', 'Solarized light', {
    bg: '#fdf6e3', panel: '#fffbf0', panelAlt: '#f3ecd8', line: '#ded6bf', text: '#073642', muted: '#657b83',
    accent: '#268bd2', button: '#efe8d3', danger: '#dc322f', viewportA: '#fffcf2', viewportB: '#ece3ca',
    gridMajor: '#cbc0a2', gridMinor: '#e3dac2'
  }),
  light('sepia', '세피아', 'Sepia', {
    bg: '#f4ecdf', panel: '#fdf7ec', panelAlt: '#eadfcc', line: '#d6c5a8', text: '#3d3123', muted: '#7b6a53',
    accent: '#9c6b30', button: '#e7dbc4', danger: '#a8422c', viewportA: '#fdf7ec', viewportB: '#e2d3b8',
    gridMajor: '#c6b18c', gridMinor: '#ded0b6'
  }),
  light('ice', '아이스', 'Ice', {
    bg: '#eff8fa', panel: '#ffffff', panelAlt: '#e0f1f5', line: '#bcdfe8', text: '#14323a', muted: '#4b7683',
    accent: '#0aa2c0', button: '#d7eef4', danger: '#c0523f', viewportA: '#f9fdff', viewportB: '#d3e9f0',
    gridMajor: '#a3cfda', gridMinor: '#c9e4eb'
  }),
  light('meadow', '메도우', 'Meadow', {
    bg: '#f2f8ec', panel: '#ffffff', panelAlt: '#e6f2da', line: '#c6dfb2', text: '#243318', muted: '#5c7a45',
    accent: '#4c9a2a', button: '#dcecd0', danger: '#b5452f', viewportA: '#fbfff7', viewportB: '#dbeccb',
    gridMajor: '#b1d196', gridMinor: '#d2e6c2'
  }),
  light('peach', '피치', 'Peach', {
    bg: '#fff4ec', panel: '#ffffff', panelAlt: '#fae5d8', line: '#f0cdb7', text: '#40291c', muted: '#8a6450',
    accent: '#e2703a', button: '#f8e0d1', danger: '#c0392b', viewportA: '#fffaf6', viewportB: '#f5dbc9',
    gridMajor: '#e6bda2', gridMinor: '#f2d8c6'
  }),
  light('silver', '실버', 'Silver', {
    bg: '#f1f2f4', panel: '#ffffff', panelAlt: '#e6e8ec', line: '#cdd1d8', text: '#23262b', muted: '#5f656e',
    accent: '#5b6b7d', button: '#e0e3e8', danger: '#b5452f', viewportA: '#fafbfc', viewportB: '#dcdfe5',
    gridMajor: '#b7bcc6', gridMinor: '#d6d9df'
  }),
  light('porcelain', '포슬린', 'Porcelain', {
    bg: '#fbfbfd', panel: '#ffffff', panelAlt: '#f0f1f5', line: '#dcdee6', text: '#1f2430', muted: '#626a7c',
    accent: '#3f51b5', button: '#eaecf3', danger: '#c0392b', viewportA: '#ffffff', viewportB: '#e6e8f0',
    gridMajor: '#c3c7d6', gridMinor: '#e0e3ec'
  }),
  light('latte', '라떼', 'Latte', {
    bg: '#f5efe7', panel: '#fffaf4', panelAlt: '#ebe1d5', line: '#d9c9b6', text: '#3a2e24', muted: '#7d6a58',
    accent: '#a5682a', button: '#e8dccc', danger: '#b5452f', viewportA: '#fffaf4', viewportB: '#e4d7c6',
    gridMajor: '#cbb69c', gridMinor: '#e0d3c2'
  }),
  light('graphiteLight', '그래파이트 라이트', 'Graphite light', {
    bg: '#eceef0', panel: '#ffffff', panelAlt: '#e1e4e7', line: '#c6cace', text: '#202325', muted: '#5a6065',
    accent: '#c07a1f', button: '#dcdfe3', danger: '#b5452f', viewportA: '#f7f8f9', viewportB: '#d7dbdf',
    gridMajor: '#b2b7bd', gridMinor: '#d2d6da'
  })
]

export type ThemeId = string

export function themeById(id: string): Theme {
  return THEMES.find((theme) => theme.id === id) ?? THEMES[0]
}

export function themesByMode(mode: ThemeMode): Theme[] {
  return THEMES.filter((theme) => theme.mode === mode)
}

export function themeIds(): string[] {
  return THEMES.map((theme) => theme.id)
}

/** CSS custom properties for a theme, applied inline on the app root. */
export function themeVars(theme: Theme): Record<string, string> {
  return {
    '--bg': theme.colors.bg,
    '--panel': theme.colors.panel,
    '--panel-alt': theme.colors.panelAlt,
    '--line': theme.colors.line,
    '--text': theme.colors.text,
    '--muted': theme.colors.muted,
    '--accent': theme.colors.accent,
    '--button': theme.colors.button,
    '--danger': theme.colors.danger,
    '--viewport-a': theme.colors.viewportA,
    '--viewport-b': theme.colors.viewportB,
    '--grid-major': theme.colors.gridMajor,
    '--grid-minor': theme.colors.gridMinor
  }
}

/** The id of the editable, user defined theme. */
export const CUSTOM_THEME_ID = 'custom'

/** A starting point for the user's own theme: the default dark palette. */
export function createCustomTheme(base: Theme = THEMES[0]): Theme {
  return {
    id: CUSTOM_THEME_ID,
    mode: base.mode,
    name: { ko: '사용자 정의', en: 'Custom' },
    colors: { ...base.colors }
  }
}

export function sanitizeTheme(input: unknown): Theme {
  const base = createCustomTheme()
  if (!input || typeof input !== 'object') return base
  const raw = input as Partial<Theme>
  const colors = { ...base.colors }
  const source = (raw.colors ?? {}) as Record<string, unknown>
  for (const key of Object.keys(colors) as Array<keyof Theme['colors']>) {
    const value = source[key]
    if (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)) colors[key] = value
  }
  return {
    id: CUSTOM_THEME_ID,
    mode: raw.mode === 'light' ? 'light' : 'dark',
    name: {
      ko: typeof raw.name?.ko === 'string' && raw.name.ko ? raw.name.ko : base.name.ko,
      en: typeof raw.name?.en === 'string' && raw.name.en ? raw.name.en : base.name.en
    },
    colors
  }
}

/** Resolve the active theme, including the user's own. */
export function resolveTheme(id: string, custom?: Theme): Theme {
  if (id === CUSTOM_THEME_ID) return custom ? sanitizeTheme(custom) : createCustomTheme()
  return themeById(id)
}

/** Every theme the pickers offer: the built-in palettes plus the custom one. */
export function allThemes(custom?: Theme): Theme[] {
  return [...THEMES, custom ? sanitizeTheme(custom) : createCustomTheme()]
}

export const THEME_TOKENS: Array<{ key: keyof Theme['colors']; ko: string; en: string }> = [
  { key: 'bg', ko: '배경', en: 'Background' },
  { key: 'panel', ko: '패널', en: 'Panel' },
  { key: 'panelAlt', ko: '보조 패널', en: 'Side panel' },
  { key: 'line', ko: '경계선', en: 'Border' },
  { key: 'text', ko: '글자', en: 'Text' },
  { key: 'muted', ko: '흐린 글자', en: 'Muted text' },
  { key: 'accent', ko: '강조', en: 'Accent' },
  { key: 'button', ko: '버튼', en: 'Button' },
  { key: 'danger', ko: '경고', en: 'Danger' },
  { key: 'viewportA', ko: '뷰포트 중심', en: 'Viewport centre' },
  { key: 'viewportB', ko: '뷰포트 가장자리', en: 'Viewport edge' },
  { key: 'gridMajor', ko: '그리드 주선', en: 'Grid major' },
  { key: 'gridMinor', ko: '그리드 보조선', en: 'Grid minor' }
]
