// Source of truth for music-file type icons (in-app artwork + Explorer).
//
//   node scripts/make-audio-icon.mjs            write SVGs + generate ICO files
//   node scripts/make-audio-icon.mjs --svg-only write asset SVGs only
//
// Generic: asset/audio-icon.svg
// Per-format: asset/audio-icons/{mp3,wav,...}.svg
// Windows Explorer: src-tauri/audio-icons/{icon,mp3,wav,...}.ico
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = process.cwd()
const svgOnly = process.argv.includes('--svg-only')

/** Unique color + mark per container so 16px Explorer tiles still read apart. */
const audioFormatIcons = [
  { ext: 'mp3', label: 'MP3', kind: 'notes', light: '#FFE08A', accent: '#FF6A00', deep: '#B33A00' },
  { ext: 'wav', label: 'WAV', kind: 'wave', light: '#9CFFD4', accent: '#00C853', deep: '#007A38' },
  { ext: 'flac', label: 'FLAC', kind: 'crystal', light: '#F0C8FF', accent: '#A855F7', deep: '#6B21A8' },
  { ext: 'ogg', label: 'OGG', kind: 'rings', light: '#FFC2B6', accent: '#FF3B2E', deep: '#B71C1C' },
  { ext: 'aac', label: 'AAC', kind: 'eq', light: '#9EFFF3', accent: '#00BFA5', deep: '#00695C' },
  { ext: 'm4a', label: 'M4A', kind: 'vinyl', light: '#FFC2DA', accent: '#FF2E7A', deep: '#AD1457' },
  { ext: 'webm', label: 'WEBM', kind: 'play', light: '#FFD0B0', accent: '#FF5722', deep: '#BF360C' },
  { ext: 'opus', label: 'OPUS', kind: 'arcs', light: '#B8F0FF', accent: '#00B0F0', deep: '#01579B' },
  { ext: 'wma', label: 'WMA', kind: 'tiles', light: '#D4D8FF', accent: '#5C6CFF', deep: '#283593' },
  { ext: 'aiff', label: 'AIFF', kind: 'sine', light: '#FFE9A0', accent: '#F5C400', deep: '#C67A00', mark: '#2C2200' },
]

const markGlyph = (kind, fill, stroke, deep) => {
  switch (kind) {
    case 'notes':
      return `
    <g fill="${fill}">
      <ellipse cx="176" cy="236" rx="52" ry="38" transform="rotate(-18 176 236)" />
      <rect x="212" y="96" width="26" height="148" rx="13" />
      <ellipse cx="292" cy="214" rx="52" ry="38" transform="rotate(-18 292 214)" />
      <rect x="328" y="74" width="26" height="148" rx="13" />
      <path d="M225 74h129c8 0 12 10 8 16L346 132H237c-8 0-13-8-10-16z" />
    </g>`
    case 'wave':
      return `
    <g fill="${fill}">
      <rect x="132" y="168" width="32" height="96" rx="16" />
      <rect x="176" y="118" width="32" height="146" rx="16" />
      <rect x="220" y="78" width="32" height="186" rx="16" />
      <rect x="264" y="132" width="32" height="132" rx="16" />
      <rect x="308" y="98" width="32" height="166" rx="16" />
      <rect x="352" y="158" width="32" height="106" rx="16" />
    </g>`
    case 'crystal':
      return `
    <g fill="${fill}">
      <path d="M256 72l92 86-36 118H200l-36-118z" />
    </g>
    <path d="M256 72l92 86H164z" fill="#ffffff" fill-opacity="0.28" />
    <path d="M256 72L200 276l56-48z" fill="${deep}" fill-opacity="0.28" />`
    case 'rings':
      return `
    <g fill="none" stroke="${stroke}" stroke-linecap="round">
      <circle cx="256" cy="168" r="28" stroke-width="22" />
      <circle cx="256" cy="168" r="70" stroke-width="18" />
      <circle cx="256" cy="168" r="112" stroke-width="16" />
    </g>`
    case 'eq':
      return `
    <g fill="${fill}">
      <rect x="136" y="150" width="36" height="114" rx="18" />
      <rect x="188" y="88" width="36" height="176" rx="18" />
      <rect x="240" y="62" width="36" height="202" rx="18" />
      <rect x="292" y="108" width="36" height="156" rx="18" />
      <rect x="344" y="142" width="36" height="122" rx="18" />
    </g>`
    case 'vinyl':
      return `
    <circle cx="256" cy="168" r="118" fill="${fill}" />
    <g fill="none" stroke="${deep}" stroke-opacity="0.4">
      <circle cx="256" cy="168" r="92" stroke-width="8" />
      <circle cx="256" cy="168" r="70" stroke-width="8" />
      <circle cx="256" cy="168" r="48" stroke-width="8" />
    </g>
    <circle cx="256" cy="168" r="20" fill="${deep}" fill-opacity="0.45" />
    <circle cx="256" cy="168" r="10" fill="${fill}" />`
    case 'play':
      return `
    <g fill="${fill}">
      <circle cx="256" cy="168" r="118" fill-opacity="0.28" />
      <path d="M214 96l132 72-132 72z" />
    </g>`
    case 'arcs':
      return `
    <g fill="none" stroke="${stroke}" stroke-linecap="round">
      <path d="M168 220c36-86 140-86 176 0" stroke-width="22" />
      <path d="M140 248c52-128 180-128 232 0" stroke-width="18" />
      <path d="M114 276c66-168 218-168 284 0" stroke-width="16" />
      <circle cx="256" cy="236" r="16" fill="${fill}" stroke="none" />
    </g>`
    case 'tiles':
      return `
    <g fill="${fill}">
      <rect x="148" y="70" width="88" height="88" rx="26" />
      <rect x="276" y="70" width="88" height="88" rx="26" />
      <rect x="148" y="178" width="88" height="88" rx="26" fill-opacity="0.72" />
      <rect x="276" y="178" width="88" height="88" rx="26" fill-opacity="0.72" />
    </g>`
    case 'sine':
      return `
    <path fill="none" stroke="${stroke}" stroke-width="28" stroke-linecap="round" stroke-linejoin="round"
          d="M118 176c28-88 56-88 84 0s56 88 84 0 56-88 84 0 56 88 84 0" />`
    default:
      return `
    <g fill="${fill}">
      <path d="M281 96 C361 96 412 140 400 208 C395 239 378 262 355 275
               C376 241 372 206 353 181 C338 160 311 148 281 145 Z" />
      <rect x="281" y="96" width="32" height="188" rx="16" />
      <ellipse cx="220" cy="276" rx="70" ry="54" transform="rotate(-18 220 276)" />
    </g>`
  }
}

const squircleAudioSvg = ({
  id,
  light,
  accent,
  deep,
  label = '',
  kind = 'note',
  mark = '#ffffff',
}) => {
  const fontSize = label.length > 3 ? 62 : 84
  const tracking = label.length > 3 ? '-2.5' : '1.2'
  const fill = `url(#mark-${id})`
  const badge = label
    ? `
  <text x="258" y="412" text-anchor="middle" font-family="Arial Black, Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="800" letter-spacing="${tracking}" fill="${deep}" fill-opacity="0.38">${label}</text>
  <text x="256" y="402" text-anchor="middle" font-family="Arial Black, Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="800" letter-spacing="${tracking}" fill="${mark}">${label}</text>`
    : ''

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <!-- ${label || 'Audio'} file mark. 3D squircle, unique glyph, large type. -->
  <defs>
    <linearGradient id="body-${id}" x1="0.08" y1="0" x2="0.92" y2="1">
      <stop offset="0" stop-color="${light}" />
      <stop offset="0.45" stop-color="${accent}" />
      <stop offset="1" stop-color="${deep}" />
    </linearGradient>
    <radialGradient id="shade-${id}" cx="0.78" cy="0.92" r="0.7">
      <stop offset="0" stop-color="#1a0628" stop-opacity="0.42" />
      <stop offset="1" stop-color="#1a0628" stop-opacity="0" />
    </radialGradient>
    <radialGradient id="gloss-${id}" cx="0.28" cy="0.12" r="0.68">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.58" />
      <stop offset="0.42" stop-color="#ffffff" stop-opacity="0.12" />
      <stop offset="1" stop-color="#ffffff" stop-opacity="0" />
    </radialGradient>
    <linearGradient id="mark-${id}" x1="150" y1="70" x2="340" y2="320" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#ffffff" />
      <stop offset="1" stop-color="#E8EEFF" />
    </linearGradient>
    <clipPath id="tile-${id}">
      <rect x="48" y="36" width="416" height="416" rx="114" />
    </clipPath>
    <filter id="lift-${id}" x="-18%" y="-8%" width="136%" height="140%">
      <feDropShadow dx="0" dy="12" stdDeviation="14" flood-color="#1a0628" flood-opacity="0.4" />
    </filter>
    <filter id="markShadow-${id}" x="-30%" y="-20%" width="160%" height="160%">
      <feDropShadow dx="0" dy="8" stdDeviation="8" flood-color="#2a0860" flood-opacity="0.32" />
    </filter>
  </defs>
  <g filter="url(#lift-${id})">
    <rect x="48" y="36" width="416" height="416" rx="114" fill="url(#body-${id})" />
  </g>
  <g clip-path="url(#tile-${id})">
    <rect x="48" y="36" width="416" height="416" fill="url(#shade-${id})" />
    <rect x="48" y="36" width="416" height="416" fill="url(#gloss-${id})" />
    <ellipse cx="196" cy="84" rx="130" ry="44" fill="#ffffff" fill-opacity="0.26" />
    <rect x="70" y="58" width="372" height="372" rx="96" fill="none" stroke="#ffffff" stroke-opacity="0.22" stroke-width="6" />
  </g>
  <g filter="url(#markShadow-${id})">${markGlyph(kind, fill, fill, deep)}
  </g>${badge}
</svg>
`
}

const genericAudioSvg = squircleAudioSvg({
  id: 'audio',
  light: '#9AFFFF',
  accent: '#6A62FF',
  deep: '#5B1FA8',
  kind: 'note',
})

const formatAudioSvg = (format) =>
  squircleAudioSvg({
    id: format.ext,
    light: format.light,
    accent: format.accent,
    deep: format.deep,
    label: format.label,
    kind: format.kind,
    mark: format.mark || '#ffffff',
  })

const runTauriIcon = (svgPath, outDir) => {
  mkdirSync(outDir, { recursive: true })
  const result = spawnSync(`npx tauri icon "${svgPath}" -o "${outDir}"`, {
    cwd: root,
    stdio: 'inherit',
    shell: true,
  })
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

const assetDir = join(root, 'asset')
const formatAssetDir = join(assetDir, 'audio-icons')
const icoDir = join(root, 'src-tauri', 'audio-icons')

mkdirSync(formatAssetDir, { recursive: true })
mkdirSync(icoDir, { recursive: true })

writeFileSync(join(assetDir, 'audio-icon.svg'), genericAudioSvg)

for (const format of audioFormatIcons) {
  writeFileSync(join(formatAssetDir, `${format.ext}.svg`), formatAudioSvg(format))
}

console.log(`wrote ${audioFormatIcons.length} format SVGs plus generic audio-icon.svg`)

if (svgOnly) {
  process.exit(0)
}

const buildDir = join(icoDir, '.build')
rmSync(buildDir, { recursive: true, force: true })

runTauriIcon(join(assetDir, 'audio-icon.svg'), join(buildDir, 'generic'))
copyFileSync(join(buildDir, 'generic', 'icon.ico'), join(icoDir, 'icon.ico'))
console.log('wrote src-tauri/audio-icons/icon.ico')

for (const format of audioFormatIcons) {
  const svgPath = join(formatAssetDir, `${format.ext}.svg`)
  const outDir = join(buildDir, format.ext)
  runTauriIcon(svgPath, outDir)
  copyFileSync(join(outDir, 'icon.ico'), join(icoDir, `${format.ext}.ico`))
  console.log(`wrote src-tauri/audio-icons/${format.ext}.ico`)
}

rmSync(buildDir, { recursive: true, force: true })
console.log('wrote asset/audio-icon.svg, asset/audio-icons/*, and src-tauri/audio-icons/*.ico')
