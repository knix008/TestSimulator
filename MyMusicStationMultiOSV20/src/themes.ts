export type ThemeDefinition = {
  id: string
  name: string
  builtIn: boolean
  vars?: Record<string, string>
}

type Palette = {
  bg: string
  toolbar: string
  panel: string
  control: string
  tooltip: string
  text: string
  textStrong: string
  icon: string
  muted: string
  /** rgb triplet used for line / grid overlays, e.g. "221, 232, 241" */
  lineRgb: string
  primary: string
  /** rgb triplet of the accent, used for the soft / active tints */
  primaryRgb: string
  primaryText: string
  spectrum: string
  shadow: string
}

const darkShadow = '0 16px 38px rgba(0, 0, 0, 0.32)'
const lightShadow = '0 14px 36px rgba(24, 44, 39, 0.16)'

// Every built-in theme carries a complete variable set so the swatch preview in
// the settings window and the popup windows can render it without reading CSS.
const buildVars = (palette: Palette): Record<string, string> => ({
  '--bg': palette.bg,
  '--toolbar': palette.toolbar,
  '--panel': palette.panel,
  '--control': palette.control,
  '--tooltip': palette.tooltip,
  '--text': palette.text,
  '--text-strong': palette.textStrong,
  '--icon': palette.icon,
  '--muted': palette.muted,
  '--line': `rgba(${palette.lineRgb}, 0.13)`,
  '--line-strong': `rgba(${palette.lineRgb}, 0.24)`,
  '--grid': `rgba(${palette.lineRgb}, 0.05)`,
  '--primary': palette.primary,
  '--primary-soft': `rgba(${palette.primaryRgb}, 0.58)`,
  '--primary-text': palette.primaryText,
  '--active': `rgba(${palette.primaryRgb}, 0.16)`,
  '--spectrum': palette.spectrum,
  '--shadow': palette.shadow,
})

const builtIn = (id: string, name: string, palette: Palette): ThemeDefinition => ({
  id,
  name,
  builtIn: true,
  vars: buildVars(palette),
})

// Order matters: the toolbar theme button cycles through this list top to bottom.
export const themes: ThemeDefinition[] = [
  builtIn('dark', 'Dark', {
    bg: '#0e1114',
    toolbar: '#151a1f',
    panel: '#171d22',
    control: '#20272d',
    tooltip: '#232b32',
    text: '#d5dde3',
    textStrong: '#f6f8fa',
    icon: '#eaeff3',
    muted: '#8e9aa4',
    lineRgb: '221, 232, 241',
    primary: '#4cc9a6',
    primaryRgb: '76, 201, 166',
    primaryText: '#07130f',
    spectrum: '#101519',
    shadow: darkShadow,
  }),
  builtIn('modern', 'Modern', {
    bg: '#edf3f1',
    toolbar: '#f8fbfa',
    panel: '#ffffff',
    control: '#f3f7f5',
    tooltip: '#ffffff',
    text: '#33413d',
    textStrong: '#10231f',
    icon: '#1f2d29',
    muted: '#65756f',
    lineRgb: '22, 45, 39',
    primary: '#e85d3f',
    primaryRgb: '232, 93, 63',
    primaryText: '#fffaf2',
    spectrum: '#f7f1e2',
    shadow: lightShadow,
  }),
  builtIn('classic', 'Classic', {
    bg: '#211a13',
    toolbar: '#2b2118',
    panel: '#33271c',
    control: '#403124',
    tooltip: '#4a392a',
    text: '#eadcc8',
    textStrong: '#fff6e8',
    icon: '#f6ecda',
    muted: '#b8a68e',
    lineRgb: '255, 236, 207',
    primary: '#d98345',
    primaryRgb: '217, 131, 69',
    primaryText: '#1b1008',
    spectrum: '#271d15',
    shadow: darkShadow,
  }),
  builtIn('fancy', 'Fancy', {
    bg: '#111416',
    toolbar: '#181d1f',
    panel: '#1c2222',
    control: '#252d2c',
    tooltip: '#2c3534',
    text: '#d7dfd7',
    textStrong: '#fff9ec',
    icon: '#edf3ea',
    muted: '#9aaca2',
    lineRgb: '255, 249, 236',
    primary: '#f2b84b',
    primaryRgb: '242, 184, 75',
    primaryText: '#1a1408',
    spectrum: '#101211',
    shadow: darkShadow,
  }),
  builtIn('midnight', 'Midnight', {
    bg: '#0b1020',
    toolbar: '#111a30',
    panel: '#141e36',
    control: '#1c2846',
    tooltip: '#213053',
    text: '#cfd8f0',
    textStrong: '#f2f5ff',
    icon: '#e4e9fb',
    muted: '#8391b8',
    lineRgb: '196, 210, 255',
    primary: '#5aa9ff',
    primaryRgb: '90, 169, 255',
    primaryText: '#04111f',
    spectrum: '#0d1428',
    shadow: darkShadow,
  }),
  builtIn('ocean', 'Ocean', {
    bg: '#07191f',
    toolbar: '#0b242c',
    panel: '#0e2a33',
    control: '#143641',
    tooltip: '#183f4b',
    text: '#c8e3ea',
    textStrong: '#f0fbff',
    icon: '#dff3f8',
    muted: '#7aa5b0',
    lineRgb: '190, 235, 245',
    primary: '#2ed3e6',
    primaryRgb: '46, 211, 230',
    primaryText: '#03181c',
    spectrum: '#0a2027',
    shadow: darkShadow,
  }),
  builtIn('forest', 'Forest', {
    bg: '#0f1a12',
    toolbar: '#15231a',
    panel: '#19291e',
    control: '#213527',
    tooltip: '#273e2e',
    text: '#cfe3d2',
    textStrong: '#f2fff4',
    icon: '#e3f3e6',
    muted: '#86a48c',
    lineRgb: '206, 240, 212',
    primary: '#9be15d',
    primaryRgb: '155, 225, 93',
    primaryText: '#0c1a06',
    spectrum: '#12201a',
    shadow: darkShadow,
  }),
  builtIn('sunset', 'Sunset', {
    bg: '#1c0f1e',
    toolbar: '#27152a',
    panel: '#2e1a31',
    control: '#3a233d',
    tooltip: '#452a48',
    text: '#eed6e2',
    textStrong: '#fff4f8',
    icon: '#f8e6ee',
    muted: '#b08ea0',
    lineRgb: '255, 220, 236',
    primary: '#ff7a59',
    primaryRgb: '255, 122, 89',
    primaryText: '#2a0c05',
    spectrum: '#221327',
    shadow: darkShadow,
  }),
  builtIn('rose', 'Rose', {
    bg: '#1f0d12',
    toolbar: '#2a1219',
    panel: '#32161e',
    control: '#3f1f28',
    tooltip: '#4a2530',
    text: '#f0d5dc',
    textStrong: '#fff2f6',
    icon: '#fae4ea',
    muted: '#b3889a',
    lineRgb: '255, 214, 226',
    primary: '#ff6b9d',
    primaryRgb: '255, 107, 157',
    primaryText: '#2b0715',
    spectrum: '#251016',
    shadow: darkShadow,
  }),
  builtIn('lavender', 'Lavender', {
    bg: '#f1eefa',
    toolbar: '#f9f7fe',
    panel: '#ffffff',
    control: '#f3f0fb',
    tooltip: '#ffffff',
    text: '#3f3a56',
    textStrong: '#1e1a33',
    icon: '#2b2544',
    muted: '#736d8f',
    lineRgb: '52, 40, 92',
    primary: '#7c5cff',
    primaryRgb: '124, 92, 255',
    primaryText: '#ffffff',
    spectrum: '#ebe6f8',
    shadow: '0 14px 36px rgba(52, 40, 92, 0.16)',
  }),
  builtIn('sand', 'Sand', {
    bg: '#f3ecdf',
    toolbar: '#faf5eb',
    panel: '#fffbf3',
    control: '#f4eddf',
    tooltip: '#fffdf7',
    text: '#4c4033',
    textStrong: '#241a10',
    icon: '#33281c',
    muted: '#84725f',
    lineRgb: '82, 60, 30',
    primary: '#b7692c',
    primaryRgb: '183, 105, 44',
    primaryText: '#fff8ee',
    spectrum: '#f0e6d2',
    shadow: '0 14px 36px rgba(82, 60, 30, 0.16)',
  }),
  builtIn('arctic', 'Arctic', {
    bg: '#eaf1f8',
    toolbar: '#f5f9fd',
    panel: '#ffffff',
    control: '#eef4fa',
    tooltip: '#ffffff',
    text: '#33475c',
    textStrong: '#0f2438',
    icon: '#1e3348',
    muted: '#66788c',
    lineRgb: '20, 50, 80',
    primary: '#1f7ae0',
    primaryRgb: '31, 122, 224',
    primaryText: '#ffffff',
    spectrum: '#e2ebf4',
    shadow: '0 14px 36px rgba(20, 50, 80, 0.16)',
  }),
  builtIn('mono', 'Mono', {
    bg: '#121212',
    toolbar: '#1a1a1a',
    panel: '#1e1e1e',
    control: '#292929',
    tooltip: '#303030',
    text: '#d9d9d9',
    textStrong: '#ffffff',
    icon: '#f0f0f0',
    muted: '#8f8f8f',
    lineRgb: '255, 255, 255',
    primary: '#e6e6e6',
    primaryRgb: '230, 230, 230',
    primaryText: '#111111',
    spectrum: '#161616',
    shadow: darkShadow,
  }),
  builtIn('neon', 'Neon', {
    bg: '#050509',
    toolbar: '#0c0c16',
    panel: '#10101c',
    control: '#181828',
    tooltip: '#1e1e30',
    text: '#d6d2f2',
    textStrong: '#fdfcff',
    icon: '#ece8ff',
    muted: '#8b86b3',
    lineRgb: '224, 200, 255',
    primary: '#ff2ec4',
    primaryRgb: '255, 46, 196',
    primaryText: '#1c0216',
    spectrum: '#090912',
    shadow: '0 16px 38px rgba(255, 46, 196, 0.18)',
  }),
  builtIn('coffee', 'Coffee', {
    bg: '#efe6dc',
    toolbar: '#f7f0e8',
    panel: '#fdf8f2',
    control: '#f1e8de',
    tooltip: '#fffaf4',
    text: '#4a3a30',
    textStrong: '#26170f',
    icon: '#35241a',
    muted: '#836d5f',
    lineRgb: '70, 40, 20',
    primary: '#6f4630',
    primaryRgb: '111, 70, 48',
    primaryText: '#fff6ee',
    spectrum: '#e9ddd0',
    shadow: '0 14px 36px rgba(70, 40, 20, 0.16)',
  }),
  builtIn('slate', 'Slate', {
    bg: '#262c34',
    toolbar: '#2e353e',
    panel: '#323a44',
    control: '#3c4550',
    tooltip: '#434d59',
    text: '#d6dde6',
    textStrong: '#f7f9fc',
    icon: '#e8edf3',
    muted: '#96a2b0',
    lineRgb: '220, 230, 240',
    primary: '#ffb547',
    primaryRgb: '255, 181, 71',
    primaryText: '#1f1503',
    spectrum: '#2a313a',
    shadow: darkShadow,
  }),
]

const fallbackVars = themes[0].vars ?? {}

/** Resolves a theme variable, falling back to the default (Dark) base a custom theme inherits. */
export const themeVar = (theme: ThemeDefinition, key: string) => theme.vars?.[key] ?? fallbackVars[key] ?? ''

export type ThemeSwatch = {
  bg: string
  panel: string
  control: string
  primary: string
  text: string
}

/** The handful of colours the settings window shows as a preview tile for each theme. */
export const themeSwatch = (theme: ThemeDefinition): ThemeSwatch => ({
  bg: themeVar(theme, '--bg'),
  panel: themeVar(theme, '--panel'),
  control: themeVar(theme, '--control'),
  primary: themeVar(theme, '--primary'),
  text: themeVar(theme, '--text-strong'),
})
