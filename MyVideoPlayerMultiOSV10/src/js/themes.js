import { persistGetItem, persistSetItem } from './persist.js';

const CUSTOM_STORAGE_KEY = 'myvideoplayer.customThemes.v1';

/** Editable keys shown in the custom theme editor */
export const THEME_EDIT_KEYS = [
  { key: '--bg-app', labelKey: 'colorAppBg' },
  { key: '--bg-toolbar', labelKey: 'colorToolbar' },
  { key: '--bg-stage', labelKey: 'colorStage' },
  { key: '--bg-modal', labelKey: 'colorDialog' },
  { key: '--bg-control', labelKey: 'colorControls' },
  { key: '--bg-primary', labelKey: 'colorAccent' },
  { key: '--bg-primary-hover', labelKey: 'colorAccentHover' },
  { key: '--text', labelKey: 'colorText' },
  { key: '--text-muted', labelKey: 'colorMuted' },
  { key: '--border', labelKey: 'colorBorder' },
  { key: '--seek-fill', labelKey: 'colorSeek' },
  { key: '--danger', labelKey: 'colorDanger' },
  { key: '--spectrum-bar', labelKey: 'colorSpectrum' }
];

export const BUILTIN_THEME_NAME_KEYS = {
  dark: 'themeDark',
  ocean: 'themeOcean',
  forest: 'themeForest',
  dusk: 'themeDusk',
  ember: 'themeEmber',
  graphite: 'themeGraphite',
  nebula: 'themeNebula',
  mocha: 'themeMocha',
  aurora: 'themeAurora',
  onyx: 'themeOnyx',
  light: 'themeLight',
  sky: 'themeSky',
  mint: 'themeMint',
  lavender: 'themeLavender',
  slate: 'themeSlate',
  sand: 'themeSand',
  rose: 'themeRose',
  citrus: 'themeCitrus',
  frost: 'themeFrost',
  blossom: 'themeBlossom'
};

/**
 * @param {'dark'|'light'} scheme
 * @param {Record<string, string>} v
 */
function pack(scheme, v) {
  const primary = v.primary;
  const primaryHover = v.primaryHover || primary;
  const defaultDanger = scheme === 'light' ? '#cf3b3b' : '#e85d5d';
  const defaultDangerHover = scheme === 'light' ? '#e04a4a' : '#f07070';
  const danger = v.danger || defaultDanger;
  const dangerHover = v.dangerHover || (v.danger ? danger : defaultDangerHover);
  return {
    '--bg-app': v.app,
    '--bg-chrome': v.chrome || v.toolbar,
    '--bg-toolbar': v.toolbar,
    '--bg-stage': v.stage || v.app,
    '--bg-panel': v.panel || v.app,
    '--bg-statusbar': v.status || v.toolbar,
    '--bg-modal': v.modal,
    '--bg-control': v.control,
    '--bg-control-hover': v.controlHover || v.control,
    '--bg-primary': primary,
    '--bg-primary-hover': primaryHover,
    '--border': v.border,
    '--border-strong': v.borderStrong || v.border,
    '--text': v.text,
    '--text-muted': v.textMuted,
    '--text-inverse': v.textInverse || (scheme === 'light' ? '#ffffff' : '#0e1014'),
    '--danger': danger,
    '--danger-hover': dangerHover,
    '--seek-track': v.seekTrack || v.border,
    '--seek-fill': v.seekFill || primary,
    '--subtitle-bg':
      v.subtitleBg ||
      (scheme === 'light' ? 'rgba(0, 0, 0, 0.62)' : 'rgba(0, 0, 0, 0.55)'),
    '--subtitle-text': '#ffffff',
    '--shadow':
      v.shadow ||
      (scheme === 'light'
        ? '0 12px 36px rgba(30, 40, 60, 0.18)'
        : '0 12px 40px rgba(0, 0, 0, 0.45)'),
    '--tooltip-bg': v.tooltipBg || v.control,
    '--tooltip-text': v.tooltipText || v.text,
    '--spectrum-bar': v.spectrum || primaryHover || primary,
    '--spectrum-glow': v.spectrumGlow || 'rgba(90, 176, 255, 0.35)',
    '--ctrl-seek': v.ctrlSeek,
    '--ctrl-seek-hover': v.ctrlSeekHover || v.ctrlSeek,
    '--ctrl-volume': v.ctrlVolume,
    '--ctrl-volume-hover': v.ctrlVolumeHover || v.ctrlVolume,
    '--ctrl-rate': v.ctrlRate,
    '--ctrl-rate-hover': v.ctrlRateHover || v.ctrlRate
  };
}

const BASE_VARS = {
  /* ——— Dark (10) ——— */
  dark: pack('dark', {
    app: '#121418',
    chrome: '#0e1014',
    toolbar: '#1a1e26',
    stage: '#0a0c10',
    panel: '#161a22',
    status: '#151922',
    modal: '#1c212b',
    control: '#252b36',
    controlHover: '#323a49',
    primary: '#3d8bfd',
    primaryHover: '#5a9dff',
    border: '#2a3140',
    borderStrong: '#3a4458',
    text: '#e8ecf3',
    textMuted: '#9aa3b5',
    textInverse: '#0e1014',
    seekTrack: '#2f3747',
    spectrum: '#5ab0ff',
    spectrumGlow: 'rgba(90, 176, 255, 0.35)',
    ctrlSeek: '#8b7cf7',
    ctrlSeekHover: '#a396ff',
    ctrlVolume: '#2ec4a8',
    ctrlVolumeHover: '#45d4ba',
    ctrlRate: '#f0a04b',
    ctrlRateHover: '#f5b56d'
  }),
  ocean: pack('dark', {
    app: '#0b171c',
    chrome: '#081216',
    toolbar: '#122229',
    stage: '#061014',
    panel: '#13262e',
    status: '#101f26',
    modal: '#173039',
    control: '#1d3a45',
    controlHover: '#274a57',
    primary: '#2bb8a8',
    primaryHover: '#3dcebd',
    border: '#274652',
    borderStrong: '#356574',
    text: '#e4f4f2',
    textMuted: '#8fb0b4',
    textInverse: '#061014',
    danger: '#e07070',
    dangerHover: '#ef8585',
    seekTrack: '#243f4a',
    spectrum: '#3dcebd',
    spectrumGlow: 'rgba(43, 184, 168, 0.35)',
    ctrlSeek: '#38bdf8',
    ctrlSeekHover: '#7dd3fc',
    ctrlVolume: '#22d3ee',
    ctrlVolumeHover: '#67e8f9',
    ctrlRate: '#fb7185',
    ctrlRateHover: '#fda4af'
  }),
  forest: pack('dark', {
    app: '#12160f',
    chrome: '#0e120c',
    toolbar: '#1a2116',
    stage: '#0b0f09',
    panel: '#182015',
    status: '#151c12',
    modal: '#1e2819',
    control: '#2a3524',
    controlHover: '#38462f',
    primary: '#6faf4e',
    primaryHover: '#84c462',
    border: '#33402c',
    borderStrong: '#45573c',
    text: '#eaf0e4',
    textMuted: '#9aab8f',
    textInverse: '#0b0f09',
    danger: '#d96b5c',
    dangerHover: '#e78376',
    seekTrack: '#2f3b28',
    spectrum: '#84c462',
    spectrumGlow: 'rgba(111, 175, 78, 0.35)',
    ctrlSeek: '#a3e635',
    ctrlSeekHover: '#bef264',
    ctrlVolume: '#34d399',
    ctrlVolumeHover: '#6ee7b7',
    ctrlRate: '#fbbf24',
    ctrlRateHover: '#fcd34d'
  }),
  dusk: pack('dark', {
    app: '#16121f',
    chrome: '#110e18',
    toolbar: '#1f1a2c',
    stage: '#0d0a14',
    panel: '#1c1728',
    status: '#1a1524',
    modal: '#241e33',
    control: '#322a44',
    controlHover: '#403656',
    primary: '#a78bfa',
    primaryHover: '#c4b5fd',
    border: '#3a314f',
    borderStrong: '#4f4468',
    text: '#efe9f8',
    textMuted: '#a99bc0',
    textInverse: '#0d0a14',
    seekTrack: '#3a314f',
    spectrum: '#c4b5fd',
    spectrumGlow: 'rgba(167, 139, 250, 0.35)',
    ctrlSeek: '#e879f9',
    ctrlSeekHover: '#f0abfc',
    ctrlVolume: '#818cf8',
    ctrlVolumeHover: '#a5b4fc',
    ctrlRate: '#f472b6',
    ctrlRateHover: '#f9a8d4'
  }),
  ember: pack('dark', {
    app: '#1a1210',
    chrome: '#140e0c',
    toolbar: '#241816',
    stage: '#100b09',
    panel: '#211614',
    status: '#1e1412',
    modal: '#2a1c19',
    control: '#3a2823',
    controlHover: '#4a342e',
    primary: '#f97316',
    primaryHover: '#fb923c',
    border: '#4a342e',
    borderStrong: '#5e443c',
    text: '#f5ebe6',
    textMuted: '#b8a098',
    textInverse: '#100b09',
    danger: '#ef4444',
    dangerHover: '#f87171',
    seekTrack: '#4a342e',
    spectrum: '#fb923c',
    spectrumGlow: 'rgba(249, 115, 22, 0.35)',
    ctrlSeek: '#eab308',
    ctrlSeekHover: '#facc15',
    ctrlVolume: '#ea580c',
    ctrlVolumeHover: '#f97316',
    ctrlRate: '#dc2626',
    ctrlRateHover: '#ef4444'
  }),
  graphite: pack('dark', {
    app: '#141518',
    chrome: '#0f1012',
    toolbar: '#1c1e22',
    stage: '#0b0c0e',
    panel: '#191b1f',
    status: '#17191d',
    modal: '#22252a',
    control: '#2e3238',
    controlHover: '#3b4048',
    primary: '#94a3b8',
    primaryHover: '#cbd5e1',
    border: '#3b4048',
    borderStrong: '#525862',
    text: '#e8eaed',
    textMuted: '#9aa0a8',
    textInverse: '#0b0c0e',
    seekTrack: '#3b4048',
    spectrum: '#cbd5e1',
    spectrumGlow: 'rgba(148, 163, 184, 0.35)',
    ctrlSeek: '#64748b',
    ctrlSeekHover: '#94a3b8',
    ctrlVolume: '#38bdf8',
    ctrlVolumeHover: '#7dd3fc',
    ctrlRate: '#a78bfa',
    ctrlRateHover: '#c4b5fd'
  }),
  nebula: pack('dark', {
    app: '#100f1c',
    chrome: '#0c0b16',
    toolbar: '#18162a',
    stage: '#090814',
    panel: '#151328',
    status: '#131122',
    modal: '#1e1b33',
    control: '#2a2744',
    controlHover: '#38345a',
    primary: '#d946ef',
    primaryHover: '#e879f9',
    border: '#38345a',
    borderStrong: '#4c4772',
    text: '#f3e8ff',
    textMuted: '#b4a5d0',
    textInverse: '#090814',
    seekTrack: '#38345a',
    spectrum: '#e879f9',
    spectrumGlow: 'rgba(217, 70, 239, 0.35)',
    ctrlSeek: '#6366f1',
    ctrlSeekHover: '#818cf8',
    ctrlVolume: '#06b6d4',
    ctrlVolumeHover: '#22d3ee',
    ctrlRate: '#f43f5e',
    ctrlRateHover: '#fb7185'
  }),
  mocha: pack('dark', {
    app: '#171310',
    chrome: '#120e0c',
    toolbar: '#211b16',
    stage: '#0e0b09',
    panel: '#1d1713',
    status: '#1a1511',
    modal: '#271f19',
    control: '#352a22',
    controlHover: '#45362c',
    primary: '#d4a574',
    primaryHover: '#e0b98c',
    border: '#45362c',
    borderStrong: '#5a473a',
    text: '#f0e6dc',
    textMuted: '#b0a090',
    textInverse: '#0e0b09',
    danger: '#d97757',
    dangerHover: '#e89174',
    seekTrack: '#45362c',
    spectrum: '#e0b98c',
    spectrumGlow: 'rgba(212, 165, 116, 0.35)',
    ctrlSeek: '#a78b6a',
    ctrlSeekHover: '#c4a882',
    ctrlVolume: '#86a873',
    ctrlVolumeHover: '#9fbf88',
    ctrlRate: '#c47a4a',
    ctrlRateHover: '#d99262'
  }),
  aurora: pack('dark', {
    app: '#0c1618',
    chrome: '#081113',
    toolbar: '#132024',
    stage: '#060e10',
    panel: '#111c20',
    status: '#0f1a1e',
    modal: '#17282e',
    control: '#223840',
    controlHover: '#2e4a54',
    primary: '#34d399',
    primaryHover: '#6ee7b7',
    border: '#2e4a54',
    borderStrong: '#3d5f6b',
    text: '#e2f7f0',
    textMuted: '#8fb8ae',
    textInverse: '#060e10',
    seekTrack: '#2e4a54',
    spectrum: '#6ee7b7',
    spectrumGlow: 'rgba(52, 211, 153, 0.35)',
    ctrlSeek: '#2dd4bf',
    ctrlSeekHover: '#5eead4',
    ctrlVolume: '#22d3ee',
    ctrlVolumeHover: '#67e8f9',
    ctrlRate: '#a3e635',
    ctrlRateHover: '#bef264'
  }),
  onyx: pack('dark', {
    app: '#0a0a0c',
    chrome: '#050506',
    toolbar: '#121216',
    stage: '#000000',
    panel: '#101014',
    status: '#0e0e12',
    modal: '#18181e',
    control: '#24242c',
    controlHover: '#32323c',
    primary: '#60a5fa',
    primaryHover: '#93c5fd',
    border: '#2c2c36',
    borderStrong: '#3e3e4a',
    text: '#f4f4f5',
    textMuted: '#a1a1aa',
    textInverse: '#000000',
    seekTrack: '#2c2c36',
    spectrum: '#93c5fd',
    spectrumGlow: 'rgba(96, 165, 250, 0.35)',
    ctrlSeek: '#818cf8',
    ctrlSeekHover: '#a5b4fc',
    ctrlVolume: '#2dd4bf',
    ctrlVolumeHover: '#5eead4',
    ctrlRate: '#fbbf24',
    ctrlRateHover: '#fcd34d'
  }),

  /* ——— Light (10) ——— */
  light: pack('light', {
    app: '#eceff4',
    chrome: '#e2e7ef',
    toolbar: '#f4f6fa',
    stage: '#d8dee8',
    panel: '#eef1f6',
    status: '#e6ebf3',
    modal: '#ffffff',
    control: '#dfe5ef',
    controlHover: '#cfd7e4',
    primary: '#1f6feb',
    primaryHover: '#388bfd',
    border: '#c5cedc',
    borderStrong: '#9aa8bd',
    text: '#1a2230',
    textMuted: '#5b677a',
    textInverse: '#ffffff',
    danger: '#cf3b3b',
    dangerHover: '#e04a4a',
    seekTrack: '#c5cedc',
    spectrum: '#1f6feb',
    spectrumGlow: 'rgba(31, 111, 235, 0.28)',
    ctrlSeek: '#c026d3',
    ctrlSeekHover: '#d946ef',
    ctrlVolume: '#0891b2',
    ctrlVolumeHover: '#06b6d4',
    ctrlRate: '#ea580c',
    ctrlRateHover: '#f97316'
  }),
  sky: pack('light', {
    app: '#e8f4fc',
    chrome: '#d9ecf8',
    toolbar: '#f0f8fd',
    stage: '#cfe6f5',
    panel: '#eef7fc',
    status: '#e2f0fa',
    modal: '#ffffff',
    control: '#d4e8f6',
    controlHover: '#bddcf0',
    primary: '#0284c7',
    primaryHover: '#0ea5e9',
    border: '#b4d4ea',
    borderStrong: '#7eb6d8',
    text: '#0c2a3d',
    textMuted: '#4a6f86',
    spectrum: '#0ea5e9',
    spectrumGlow: 'rgba(14, 165, 233, 0.28)',
    ctrlSeek: '#6366f1',
    ctrlSeekHover: '#818cf8',
    ctrlVolume: '#06b6d4',
    ctrlVolumeHover: '#22d3ee',
    ctrlRate: '#f59e0b',
    ctrlRateHover: '#fbbf24'
  }),
  mint: pack('light', {
    app: '#e8f6f0',
    chrome: '#d8eee4',
    toolbar: '#f1faf6',
    stage: '#cfe9dd',
    panel: '#eef8f3',
    status: '#e0f2ea',
    modal: '#ffffff',
    control: '#d2ebe0',
    controlHover: '#b9dfcf',
    primary: '#059669',
    primaryHover: '#10b981',
    border: '#aed9c6',
    borderStrong: '#7cbc9f',
    text: '#0f2e22',
    textMuted: '#4a7262',
    spectrum: '#10b981',
    spectrumGlow: 'rgba(16, 185, 129, 0.28)',
    ctrlSeek: '#14b8a6',
    ctrlSeekHover: '#2dd4bf',
    ctrlVolume: '#0d9488',
    ctrlVolumeHover: '#14b8a6',
    ctrlRate: '#ca8a04',
    ctrlRateHover: '#eab308'
  }),
  lavender: pack('light', {
    app: '#f1eef8',
    chrome: '#e6e1f2',
    toolbar: '#f7f5fb',
    stage: '#ddd6ee',
    panel: '#f4f1fa',
    status: '#ebe7f5',
    modal: '#ffffff',
    control: '#e2dcf0',
    controlHover: '#d0c7e6',
    primary: '#7c3aed',
    primaryHover: '#8b5cf6',
    border: '#cdc3e2',
    borderStrong: '#a794cb',
    text: '#271a40',
    textMuted: '#6b5b88',
    spectrum: '#8b5cf6',
    spectrumGlow: 'rgba(139, 92, 246, 0.28)',
    ctrlSeek: '#a855f7',
    ctrlSeekHover: '#c084fc',
    ctrlVolume: '#6366f1',
    ctrlVolumeHover: '#818cf8',
    ctrlRate: '#db2777',
    ctrlRateHover: '#ec4899'
  }),
  slate: pack('light', {
    app: '#eef1f4',
    chrome: '#e3e7ec',
    toolbar: '#f6f8fa',
    stage: '#dce1e7',
    panel: '#f1f4f7',
    status: '#e8ecf0',
    modal: '#ffffff',
    control: '#dde3ea',
    controlHover: '#cdd5de',
    primary: '#475569',
    primaryHover: '#64748b',
    border: '#c5ced8',
    borderStrong: '#94a3b4',
    text: '#1e293b',
    textMuted: '#64748b',
    spectrum: '#64748b',
    spectrumGlow: 'rgba(100, 116, 139, 0.28)',
    ctrlSeek: '#3b82f6',
    ctrlSeekHover: '#60a5fa',
    ctrlVolume: '#0ea5e9',
    ctrlVolumeHover: '#38bdf8',
    ctrlRate: '#f97316',
    ctrlRateHover: '#fb923c'
  }),
  sand: pack('light', {
    app: '#f3efe8',
    chrome: '#eae4da',
    toolbar: '#f8f5f0',
    stage: '#e4dccf',
    panel: '#f5f1eb',
    status: '#efe9e0',
    modal: '#ffffff',
    control: '#e8e0d4',
    controlHover: '#dbd0c0',
    primary: '#b45309',
    primaryHover: '#d97706',
    border: '#d4c8b6',
    borderStrong: '#b5a48c',
    text: '#2c2418',
    textMuted: '#6f6354',
    spectrum: '#d97706',
    spectrumGlow: 'rgba(217, 119, 6, 0.28)',
    ctrlSeek: '#a16207',
    ctrlSeekHover: '#ca8a04',
    ctrlVolume: '#15803d',
    ctrlVolumeHover: '#16a34a',
    ctrlRate: '#c2410c',
    ctrlRateHover: '#ea580c'
  }),
  rose: pack('light', {
    app: '#f8eef1',
    chrome: '#f0e2e7',
    toolbar: '#fbf5f7',
    stage: '#edd9e0',
    panel: '#f9f2f5',
    status: '#f3e8ec',
    modal: '#ffffff',
    control: '#efdde4',
    controlHover: '#e3c8d2',
    primary: '#e11d48',
    primaryHover: '#f43f5e',
    border: '#e0c4ce',
    borderStrong: '#c492a4',
    text: '#3f1524',
    textMuted: '#8a5466',
    spectrum: '#f43f5e',
    spectrumGlow: 'rgba(244, 63, 94, 0.28)',
    ctrlSeek: '#db2777',
    ctrlSeekHover: '#ec4899',
    ctrlVolume: '#0d9488',
    ctrlVolumeHover: '#14b8a6',
    ctrlRate: '#ea580c',
    ctrlRateHover: '#f97316'
  }),
  citrus: pack('light', {
    app: '#f4f7e8',
    chrome: '#eaf0d8',
    toolbar: '#f8faef',
    stage: '#e2eac8',
    panel: '#f5f8ec',
    status: '#eef3e0',
    modal: '#ffffff',
    control: '#e6edd4',
    controlHover: '#d7e0bc',
    primary: '#65a30d',
    primaryHover: '#84cc16',
    border: '#c9d6a4',
    borderStrong: '#a3b872',
    text: '#243010',
    textMuted: '#5c6e38',
    spectrum: '#84cc16',
    spectrumGlow: 'rgba(132, 204, 22, 0.28)',
    ctrlSeek: '#16a34a',
    ctrlSeekHover: '#22c55e',
    ctrlVolume: '#0d9488',
    ctrlVolumeHover: '#14b8a6',
    ctrlRate: '#ca8a04',
    ctrlRateHover: '#eab308'
  }),
  frost: pack('light', {
    app: '#eef4f8',
    chrome: '#e2ebf2',
    toolbar: '#f5f9fc',
    stage: '#d8e4ee',
    panel: '#f1f6fa',
    status: '#e8f0f6',
    modal: '#ffffff',
    control: '#dce7f0',
    controlHover: '#cad8e4',
    primary: '#0369a1',
    primaryHover: '#0284c7',
    border: '#b9ccd9',
    borderStrong: '#8aabc0',
    text: '#0f2740',
    textMuted: '#4d6a82',
    spectrum: '#0284c7',
    spectrumGlow: 'rgba(2, 132, 199, 0.28)',
    ctrlSeek: '#4f46e5',
    ctrlSeekHover: '#6366f1',
    ctrlVolume: '#0891b2',
    ctrlVolumeHover: '#06b6d4',
    ctrlRate: '#7c3aed',
    ctrlRateHover: '#8b5cf6'
  }),
  blossom: pack('light', {
    app: '#f7f0f4',
    chrome: '#efe4eb',
    toolbar: '#faf5f8',
    stage: '#eadce5',
    panel: '#f8f2f6',
    status: '#f2e9ef',
    modal: '#ffffff',
    control: '#ecdde6',
    controlHover: '#decbd7',
    primary: '#c026d3',
    primaryHover: '#d946ef',
    border: '#dcc6d4',
    borderStrong: '#b995ac',
    text: '#3a1838',
    textMuted: '#7d5578',
    spectrum: '#d946ef',
    spectrumGlow: 'rgba(217, 70, 239, 0.28)',
    ctrlSeek: '#a855f7',
    ctrlSeekHover: '#c084fc',
    ctrlVolume: '#ec4899',
    ctrlVolumeHover: '#f472b6',
    ctrlRate: '#f59e0b',
    ctrlRateHover: '#fbbf24'
  })
};

const DARK_THEME_IDS = [
  'dark',
  'ocean',
  'forest',
  'dusk',
  'ember',
  'graphite',
  'nebula',
  'mocha',
  'aurora',
  'onyx'
];

const LIGHT_THEME_IDS = [
  'light',
  'sky',
  'mint',
  'lavender',
  'slate',
  'sand',
  'rose',
  'citrus',
  'frost',
  'blossom'
];

const THEME_META = {
  dark: { name: 'Dark', scheme: 'dark' },
  ocean: { name: 'Ocean', scheme: 'dark' },
  forest: { name: 'Forest', scheme: 'dark' },
  dusk: { name: 'Dusk', scheme: 'dark' },
  ember: { name: 'Ember', scheme: 'dark' },
  graphite: { name: 'Graphite', scheme: 'dark' },
  nebula: { name: 'Nebula', scheme: 'dark' },
  mocha: { name: 'Mocha', scheme: 'dark' },
  aurora: { name: 'Aurora', scheme: 'dark' },
  onyx: { name: 'Onyx', scheme: 'dark' },
  light: { name: 'Light', scheme: 'light' },
  sky: { name: 'Sky', scheme: 'light' },
  mint: { name: 'Mint', scheme: 'light' },
  lavender: { name: 'Lavender', scheme: 'light' },
  slate: { name: 'Slate', scheme: 'light' },
  sand: { name: 'Sand', scheme: 'light' },
  rose: { name: 'Rose', scheme: 'light' },
  citrus: { name: 'Citrus', scheme: 'light' },
  frost: { name: 'Frost', scheme: 'light' },
  blossom: { name: 'Blossom', scheme: 'light' }
};

export const BUILTIN_THEMES = [...DARK_THEME_IDS, ...LIGHT_THEME_IDS].map((id) => ({
  id,
  name: THEME_META[id].name,
  scheme: THEME_META[id].scheme,
  vars: BASE_VARS[id]
}));

export function getBuiltinTheme(id) {
  return BUILTIN_THEMES.find((t) => t.id === id) || BUILTIN_THEMES[0];
}

export function loadCustomThemes() {
  try {
    const raw = persistGetItem(CUSTOM_STORAGE_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list.filter((t) => t && t.id && t.name && t.vars);
  } catch {
    return [];
  }
}

export function saveCustomThemes(list) {
  persistSetItem(CUSTOM_STORAGE_KEY, JSON.stringify(list));
}

export function getCustomTheme(id) {
  return loadCustomThemes().find((t) => t.id === id) || null;
}

export function upsertCustomTheme(theme) {
  const list = loadCustomThemes();
  const idx = list.findIndex((t) => t.id === theme.id);
  const next = {
    id: theme.id,
    name: String(theme.name || 'Custom').trim().slice(0, 40) || 'Custom',
    scheme: theme.scheme === 'light' ? 'light' : 'dark',
    vars: { ...theme.vars },
    updatedAt: Date.now()
  };
  if (idx >= 0) list[idx] = next;
  else list.push(next);
  saveCustomThemes(list);
  return next;
}

export function deleteCustomTheme(id) {
  const list = loadCustomThemes().filter((t) => t.id !== id);
  saveCustomThemes(list);
  return list;
}

export function createThemeId() {
  return `custom_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function resolveThemeId(themeSetting) {
  if (!themeSetting) return 'dark';
  if (themeSetting === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  if (BUILTIN_THEMES.some((t) => t.id === themeSetting)) return themeSetting;
  if (String(themeSetting).startsWith('custom:')) {
    const id = themeSetting.slice('custom:'.length);
    return getCustomTheme(id) ? themeSetting : 'dark';
  }
  return getCustomTheme(themeSetting) ? `custom:${themeSetting}` : 'dark';
}

export function getThemeDefinition(themeSetting) {
  const resolved = resolveThemeId(themeSetting);
  if (resolved.startsWith('custom:')) {
    const custom = getCustomTheme(resolved.slice('custom:'.length));
    if (custom) return { ...custom, settingId: resolved, builtin: false };
  }
  const builtin = getBuiltinTheme(resolved);
  return { ...builtin, settingId: builtin.id, builtin: true };
}

export function getThemeDisplayName(themeSetting) {
  const def = getThemeDefinition(themeSetting);
  return def?.name || 'Dark';
}

export const THEME_VAR_KEYS = Object.keys(BASE_VARS.dark);

/**
 * Copy computed theme variables onto top-layer overlays (dialogs/menus),
 * so they always follow the active theme even in the dialog top layer.
 */
export function syncThemeToOverlays(root = document.documentElement) {
  if (typeof document === 'undefined') return;
  const styles = getComputedStyle(root);
  const themeId = root.getAttribute('data-theme') || 'dark';
  const scheme =
    root.getAttribute('data-color-scheme') ||
    (themeId === 'light' ? 'light' : 'dark');

  const overlays = document.querySelectorAll(
    'dialog.modal, dialog.modal .modal-card, .recent-menu, .popup-menu, .tooltip, .save-progress-popup'
  );

  const fallbacks =
    scheme === 'light'
      ? {
          '--bg-modal': '#ffffff',
          '--bg-control': '#dfe5ef',
          '--border': '#c5cedc',
          '--text': '#1a2230',
          '--text-muted': '#4b5568',
          '--bg-primary': '#1f6feb'
        }
      : {
          '--bg-modal': '#1c212b',
          '--bg-control': '#252b36',
          '--border': '#2a3140',
          '--text': '#e8ecf3',
          '--text-muted': '#a8b0c0',
          '--bg-primary': '#5a9dff'
        };

  for (const el of overlays) {
    el.setAttribute('data-theme', themeId);
    el.setAttribute('data-color-scheme', scheme);
    el.style.colorScheme = scheme === 'light' ? 'light' : 'dark';

    const isToolbarMenu =
      el.classList.contains('popup-menu') || el.classList.contains('recent-menu');
    if (isToolbarMenu) {
      for (const key of THEME_VAR_KEYS) {
        el.style.removeProperty(key);
      }
      continue;
    }

    for (const key of THEME_VAR_KEYS) {
      const value = styles.getPropertyValue(key).trim() || fallbacks[key] || '';
      if (value) el.style.setProperty(key, value);
      else el.style.removeProperty(key);
    }
    for (const [key, value] of Object.entries(fallbacks)) {
      if (!styles.getPropertyValue(key).trim()) {
        el.style.setProperty(key, value);
      }
    }
  }
}

/**
 * Apply theme vars to documentElement.
 * Builtins use data-theme attribute (CSS file).
 * Customs use data-theme="custom" + inline CSS variables.
 */
export function applyThemeToDocument(themeSetting) {
  const def = getThemeDefinition(themeSetting);
  const root = document.documentElement;
  for (const key of THEME_VAR_KEYS) {
    root.style.removeProperty(key);
  }

  const scheme = def.scheme === 'light' ? 'light' : 'dark';
  if (def.builtin) {
    root.setAttribute('data-theme', def.id);
    root.setAttribute('data-color-scheme', scheme);
    for (const [key, value] of Object.entries(def.vars || {})) {
      root.style.setProperty(key, value);
    }
  } else {
    root.setAttribute('data-theme', 'custom');
    root.setAttribute('data-color-scheme', scheme);
    for (const [key, value] of Object.entries(def.vars || {})) {
      root.style.setProperty(key, value);
    }
  }
  root.style.colorScheme = scheme;
  syncThemeToOverlays(root);
  return def;
}

export function cloneVarsFromTheme(themeSetting) {
  const def = getThemeDefinition(themeSetting);
  return { ...(def.vars || getBuiltinTheme('dark').vars) };
}

export function ensureDerivedVars(vars) {
  const next = { ...vars };
  if (next['--bg-primary'] && !next['--seek-fill']) next['--seek-fill'] = next['--bg-primary'];
  if (next['--bg-primary'] && !next['--spectrum-bar']) next['--spectrum-bar'] = next['--bg-primary'];
  if (next['--bg-primary'] && !next['--bg-primary-hover']) next['--bg-primary-hover'] = next['--bg-primary'];
  if (next['--danger'] && !next['--danger-hover']) next['--danger-hover'] = next['--danger'];
  if (next['--bg-toolbar'] && !next['--bg-chrome']) next['--bg-chrome'] = next['--bg-toolbar'];
  if (next['--bg-toolbar'] && !next['--bg-statusbar']) next['--bg-statusbar'] = next['--bg-toolbar'];
  if (next['--bg-control'] && !next['--bg-control-hover']) next['--bg-control-hover'] = next['--bg-control'];
  if (next['--bg-control'] && !next['--tooltip-bg']) next['--tooltip-bg'] = next['--bg-control'];
  if (next['--bg-app'] && !next['--bg-panel']) next['--bg-panel'] = next['--bg-app'];
  if (next['--bg-app'] && !next['--bg-stage']) next['--bg-stage'] = next['--bg-app'];
  if (next['--text'] && !next['--tooltip-text']) next['--tooltip-text'] = next['--text'];
  if (!next['--border-strong'] && next['--border']) next['--border-strong'] = next['--border'];
  if (!next['--seek-track'] && next['--border']) next['--seek-track'] = next['--border'];
  if (!next['--subtitle-bg']) next['--subtitle-bg'] = 'rgba(0, 0, 0, 0.55)';
  if (!next['--subtitle-text']) next['--subtitle-text'] = '#ffffff';
  if (!next['--shadow']) next['--shadow'] = '0 12px 40px rgba(0, 0, 0, 0.4)';
  if (!next['--spectrum-glow'] && next['--spectrum-bar']) {
    next['--spectrum-glow'] = 'rgba(90, 176, 255, 0.3)';
  }
  if (!next['--text-inverse']) next['--text-inverse'] = '#ffffff';
  if (next['--ctrl-seek'] && !next['--ctrl-seek-hover']) {
    next['--ctrl-seek-hover'] = next['--ctrl-seek'];
  }
  if (next['--ctrl-volume'] && !next['--ctrl-volume-hover']) {
    next['--ctrl-volume-hover'] = next['--ctrl-volume'];
  }
  if (next['--ctrl-rate'] && !next['--ctrl-rate-hover']) {
    next['--ctrl-rate-hover'] = next['--ctrl-rate'];
  }
  return next;
}
