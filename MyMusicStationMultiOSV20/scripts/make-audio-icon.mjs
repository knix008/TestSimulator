// Source of truth for music-file type icons.
//
//   node scripts/make-audio-icon.mjs            write SVGs + generate ICO files
//   node scripts/make-audio-icon.mjs --svg-only write asset SVGs only
//
// Generic document: asset/audio-icon.svg
// Per-format badges: asset/audio-icons/{mp3,wav,...}.svg
// Windows Explorer icons: src-tauri/audio-icons/{icon,mp3,wav,...}.ico
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = process.cwd()
const svgOnly = process.argv.includes('--svg-only')

/** One visual identity per container. `.aif` reuses the AIFF artwork. */
const audioFormatIcons = [
  { ext: 'mp3', label: 'MP3', paper: '#FFF6EC', fold: '#FFE0C2', accent: '#F08C00', accentDark: '#C46A00', badgeText: '#ffffff' },
  { ext: 'wav', label: 'WAV', paper: '#EEFBF3', fold: '#C8F0D8', accent: '#1FA971', accentDark: '#157A52', badgeText: '#ffffff' },
  { ext: 'flac', label: 'FLAC', paper: '#F7F0FB', fold: '#E3CFF3', accent: '#8E44AD', accentDark: '#5B2C6F', badgeText: '#ffffff' },
  { ext: 'ogg', label: 'OGG', paper: '#FDEDEC', fold: '#F5B7B1', accent: '#E74C3C', accentDark: '#A93226', badgeText: '#ffffff' },
  { ext: 'aac', label: 'AAC', paper: '#E8F8F5', fold: '#A3E4D7', accent: '#0E9F85', accentDark: '#0B6E5C', badgeText: '#ffffff' },
  { ext: 'm4a', label: 'M4A', paper: '#FDEEF4', fold: '#F8BBD0', accent: '#E91E63', accentDark: '#AD1457', badgeText: '#ffffff' },
  { ext: 'webm', label: 'WEBM', paper: '#F9EBEA', fold: '#E6B0AA', accent: '#B03A2E', accentDark: '#7B241C', badgeText: '#ffffff' },
  { ext: 'opus', label: 'OPUS', paper: '#EAF6FB', fold: '#AED6F1', accent: '#1A7FBF', accentDark: '#0E4D73', badgeText: '#ffffff' },
  { ext: 'wma', label: 'WMA', paper: '#EAF2F8', fold: '#A9CCE3', accent: '#2E86C1', accentDark: '#1B4F72', badgeText: '#ffffff' },
  { ext: 'aiff', label: 'AIFF', paper: '#FEF9E7', fold: '#F9E79F', accent: '#D4A017', accentDark: '#9A7B0A', badgeText: '#2C2200' },
]

const genericAudioSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <!-- Music-file type icon (distinct from the app tile and the .mplist document).
       Generate ICO/ICNS: node scripts/make-audio-icon.mjs -->
  <defs>
    <linearGradient id="paper" x1="142" y1="70" x2="390" y2="442" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#ffffff" />
      <stop offset="1" stop-color="#e8f6ff" />
    </linearGradient>
    <linearGradient id="fold" x1="302" y1="70" x2="390" y2="166" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#cfe8ff" />
      <stop offset="1" stop-color="#ffffff" />
    </linearGradient>
    <linearGradient id="note" x1="168" y1="150" x2="340" y2="340" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#3E92F0" />
      <stop offset="1" stop-color="#1558C0" />
    </linearGradient>
  </defs>
  <path d="M142 70h160l88 88v284H142z" fill="url(#paper)" stroke="#0d2f6f" stroke-width="24" stroke-linejoin="round" />
  <path d="M302 70v96h88" fill="url(#fold)" stroke="#0d2f6f" stroke-width="24" stroke-linejoin="round" />
  <g fill="url(#note)">
    <path d="M272 152 C348 152 396 196 382 262 C376 294 356 318 328 332
             C350 290 346 250 326 226 C310 206 290 192 272 188 Z" />
    <rect x="250" y="152" width="26" height="176" rx="13" />
    <ellipse cx="198" cy="318" rx="56" ry="42" transform="rotate(-22 198 318)" />
  </g>
  <g fill="#2eb8e6">
    <rect x="176" y="390" width="18" height="28" rx="9" />
    <rect x="202" y="376" width="18" height="42" rx="9" />
    <rect x="228" y="368" width="18" height="50" rx="9" />
    <rect x="254" y="380" width="18" height="38" rx="9" />
    <rect x="280" y="372" width="18" height="46" rx="9" />
    <rect x="306" y="386" width="18" height="32" rx="9" />
    <rect x="332" y="394" width="18" height="24" rx="9" />
  </g>
</svg>
`

const formatAudioSvg = ({ ext, label, paper, fold, accent, accentDark, badgeText }) => {
  const id = ext.replace(/[^a-z0-9]/gi, '')
  const fontSize = label.length > 3 ? 28 : 34
  const tracking = label.length > 3 ? '-1.2' : '0.4'

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <!-- ${label} audio file type icon. Generate ICO: node scripts/make-audio-icon.mjs -->
  <defs>
    <linearGradient id="paper-${id}" x1="142" y1="70" x2="390" y2="442" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#ffffff" />
      <stop offset="1" stop-color="${paper}" />
    </linearGradient>
    <linearGradient id="fold-${id}" x1="302" y1="70" x2="390" y2="166" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${fold}" />
      <stop offset="1" stop-color="#ffffff" />
    </linearGradient>
    <linearGradient id="note-${id}" x1="168" y1="140" x2="340" y2="330" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${accent}" />
      <stop offset="1" stop-color="${accentDark}" />
    </linearGradient>
  </defs>
  <path d="M142 70h160l88 88v284H142z" fill="url(#paper-${id})" stroke="#0d2f6f" stroke-width="24" stroke-linejoin="round" />
  <path d="M302 70v96h88" fill="url(#fold-${id})" stroke="#0d2f6f" stroke-width="24" stroke-linejoin="round" />
  <g fill="url(#note-${id})">
    <path d="M272 138 C348 138 396 182 382 248 C376 280 356 304 328 318
             C350 276 346 236 326 212 C310 192 290 178 272 174 Z" />
    <rect x="250" y="138" width="26" height="168" rx="13" />
    <ellipse cx="198" cy="296" rx="56" ry="42" transform="rotate(-22 198 296)" />
  </g>
  <rect x="166" y="368" width="180" height="58" rx="14" fill="${accentDark}" />
  <rect x="168" y="370" width="176" height="54" rx="13" fill="${accent}" />
  <text x="256" y="408" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="800" letter-spacing="${tracking}" fill="${badgeText}">${label}</text>
</svg>
`
}

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
