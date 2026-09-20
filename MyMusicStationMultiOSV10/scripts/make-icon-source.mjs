// Generates the app icon: glossy dark 3D rounded square with an LP turntable,
// MusicStation title. Writes shared SVGs and a 1024 PNG for `npx tauri icon`.
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'

const svg = `<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="body" x1="0.08" y1="0" x2="0.95" y2="1">
      <stop offset="0" stop-color="#3A7CC8"/>
      <stop offset="0.4" stop-color="#1A4F9E"/>
      <stop offset="1" stop-color="#061530"/>
    </linearGradient>
    <radialGradient id="gloss" cx="0.28" cy="0.18" r="0.8">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.38"/>
      <stop offset="0.4" stop-color="#ffffff" stop-opacity="0.08"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="shade" cx="0.86" cy="0.9" r="0.7">
      <stop offset="0" stop-color="#010810" stop-opacity="0.75"/>
      <stop offset="1" stop-color="#010810" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="rim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.7"/>
      <stop offset="0.45" stop-color="#ffffff" stop-opacity="0.08"/>
      <stop offset="1" stop-color="#01060F" stop-opacity="0.85"/>
    </linearGradient>

    <!-- Plinth / deck -->
    <linearGradient id="plinth" x1="140" y1="220" x2="900" y2="760" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#3A4554"/>
      <stop offset="0.45" stop-color="#232B36"/>
      <stop offset="1" stop-color="#10151C"/>
    </linearGradient>
    <linearGradient id="plinthTop" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.22"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="plinthEdge" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#6A7688"/>
      <stop offset="1" stop-color="#0A0E14"/>
    </linearGradient>

    <!-- Vinyl disc -->
    <radialGradient id="vinyl" cx="0.42" cy="0.38" r="0.72">
      <stop offset="0" stop-color="#3A3A42"/>
      <stop offset="0.35" stop-color="#1A1A20"/>
      <stop offset="0.72" stop-color="#0A0A0E"/>
      <stop offset="1" stop-color="#050508"/>
    </radialGradient>
    <radialGradient id="vinylShine" cx="0.32" cy="0.28" r="0.55">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.28"/>
      <stop offset="0.4" stop-color="#9ec5ff" stop-opacity="0.12"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="label" cx="0.4" cy="0.35" r="0.65">
      <stop offset="0" stop-color="#FFE08A"/>
      <stop offset="0.45" stop-color="#FFB020"/>
      <stop offset="1" stop-color="#C24A08"/>
    </radialGradient>

    <filter id="deckShadow" x="-20%" y="-20%" width="140%" height="150%">
      <feDropShadow dx="6" dy="18" stdDeviation="16" flood-color="#010810" flood-opacity="0.55"/>
    </filter>
    <filter id="discShadow" x="-25%" y="-25%" width="150%" height="150%">
      <feDropShadow dx="4" dy="10" stdDeviation="10" flood-color="#000000" flood-opacity="0.55"/>
    </filter>
    <clipPath id="iconClip">
      <rect x="72" y="72" width="880" height="880" rx="200"/>
    </clipPath>
  </defs>

  <!-- 3D icon body -->
  <rect x="72" y="72" width="880" height="880" rx="200" fill="url(#body)"/>
  <rect x="72" y="72" width="880" height="880" rx="200" fill="url(#shade)"/>
  <rect x="72" y="72" width="880" height="880" rx="200" fill="url(#gloss)"/>
  <rect x="76" y="76" width="872" height="872" rx="196" fill="none" stroke="url(#rim)" stroke-width="9"/>

  <g clip-path="url(#iconClip)">
    <ellipse cx="512" cy="520" rx="380" ry="260" fill="#010B1C" opacity="0.45"/>

    <!-- Turntable deck -->
    <g filter="url(#deckShadow)" transform="rotate(-6 512 460)">
      <rect x="148" y="230" width="740" height="480" rx="36" fill="url(#plinth)"/>
      <rect x="148" y="230" width="740" height="90" rx="36" fill="url(#plinthTop)"/>
      <path d="M148 686 L176 720 L888 720 L888 686 Z" fill="url(#plinthEdge)"/>
      <path d="M888 230 L916 262 L916 720 L888 686 Z" fill="#0C1118"/>

      <!-- platter mat ring -->
      <circle cx="430" cy="470" r="248" fill="#151A22"/>
      <circle cx="430" cy="470" r="236" fill="#0D1118"/>

      <!-- Vinyl LP -->
      <g filter="url(#discShadow)">
        <circle cx="430" cy="470" r="220" fill="url(#vinyl)"/>
        <!-- groove rings -->
        <circle cx="430" cy="470" r="200" fill="none" stroke="#2A2A32" stroke-width="3" opacity="0.9"/>
        <circle cx="430" cy="470" r="178" fill="none" stroke="#22222A" stroke-width="2.5" opacity="0.85"/>
        <circle cx="430" cy="470" r="156" fill="none" stroke="#2A2A32" stroke-width="2.5" opacity="0.8"/>
        <circle cx="430" cy="470" r="134" fill="none" stroke="#1E1E26" stroke-width="2" opacity="0.85"/>
        <circle cx="430" cy="470" r="112" fill="none" stroke="#2A2A32" stroke-width="2" opacity="0.75"/>
        <circle cx="430" cy="470" r="92" fill="none" stroke="#1A1A22" stroke-width="2" opacity="0.8"/>
        <circle cx="430" cy="470" r="220" fill="url(#vinylShine)"/>
        <!-- center label -->
        <circle cx="430" cy="470" r="68" fill="url(#label)"/>
        <circle cx="430" cy="470" r="58" fill="none" stroke="#FFF0C0" stroke-width="3" opacity="0.45"/>
        <circle cx="430" cy="470" r="14" fill="#1A1208"/>
        <circle cx="430" cy="470" r="7" fill="#FFD070"/>
      </g>

      <!-- Tonearm -->
      <g>
        <!-- base pivot -->
        <circle cx="760" cy="300" r="34" fill="#2A3340"/>
        <circle cx="760" cy="300" r="22" fill="#C0CAD8"/>
        <circle cx="760" cy="300" r="10" fill="#4A5566"/>
        <!-- arm -->
        <path d="M760 300
                 C720 340 640 420 560 470
                 C540 482 520 500 508 520"
              fill="none" stroke="#D7DEE8" stroke-width="18" stroke-linecap="round"/>
        <path d="M760 300
                 C720 340 640 420 560 470
                 C540 482 520 500 508 520"
              fill="none" stroke="#8A95A6" stroke-width="6" stroke-linecap="round" opacity="0.55"/>
        <!-- cartridge / headshell -->
        <rect x="488" y="508" width="52" height="28" rx="6" transform="rotate(-28 514 522)" fill="#E8EEF6"/>
        <rect x="496" y="516" width="28" height="12" rx="3" transform="rotate(-28 510 522)" fill="#FFB020"/>
      </g>

      <!-- Speed / cue knobs -->
      <circle cx="780" cy="560" r="28" fill="#1A222C"/>
      <circle cx="780" cy="560" r="18" fill="#FFB020"/>
      <circle cx="780" cy="620" r="22" fill="#1A222C"/>
      <circle cx="780" cy="620" r="12" fill="#C0CAD8"/>
      <!-- Start lamp -->
      <circle cx="720" cy="620" r="14" fill="#1A222C"/>
      <circle cx="720" cy="620" r="8" fill="#4CFFB0"/>
    </g>

    <!-- Title -->
    <text x="512" y="888" text-anchor="middle"
          font-family="Segoe UI, Aptos, Arial Black, Arial, sans-serif"
          font-size="88" font-weight="800" letter-spacing="1"
          fill="#031022" opacity="0.45">MusicStation</text>
    <text x="512" y="882" text-anchor="middle"
          font-family="Segoe UI, Aptos, Arial Black, Arial, sans-serif"
          font-size="88" font-weight="800" letter-spacing="1"
          fill="#F4F8FF">MusicStation</text>
  </g>
</svg>
`

const root = process.cwd()
writeFileSync(join(root, 'asset', 'app-icon.svg'), svg)
writeFileSync(join(root, 'public', 'app-icon.svg'), svg)
writeFileSync(join(root, 'public', 'favicon.svg'), svg)

const traySvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="tray-bg" x1="40" y1="40" x2="470" y2="470" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#3A7CC8"/>
      <stop offset="0.5" stop-color="#1A4F9E"/>
      <stop offset="1" stop-color="#061530"/>
    </linearGradient>
    <radialGradient id="vinyl" cx="0.4" cy="0.35" r="0.7">
      <stop offset="0" stop-color="#3A3A42"/>
      <stop offset="1" stop-color="#0A0A0E"/>
    </radialGradient>
  </defs>
  <rect x="28" y="28" width="456" height="456" rx="96" fill="url(#tray-bg)"/>
  <rect x="70" y="96" width="372" height="300" rx="28" fill="#232B36"/>
  <circle cx="220" cy="250" r="118" fill="url(#vinyl)"/>
  <circle cx="220" cy="250" r="100" fill="none" stroke="#2A2A32" stroke-width="3"/>
  <circle cx="220" cy="250" r="80" fill="none" stroke="#22222A" stroke-width="2"/>
  <circle cx="220" cy="250" r="36" fill="#FFB020"/>
  <circle cx="220" cy="250" r="8" fill="#1A1208"/>
  <path d="M380 140 C350 180 300 230 250 270" fill="none" stroke="#D7DEE8" stroke-width="14" stroke-linecap="round"/>
  <circle cx="380" cy="140" r="18" fill="#C0CAD8"/>
  <rect x="232" y="262" width="28" height="16" rx="4" transform="rotate(-30 246 270)" fill="#FFB020"/>
</svg>
`

writeFileSync(join(root, 'asset', 'tray-icon.svg'), traySvg)

// Playlist file icon: same brand body, document + mini LP (distinct from app icon).
const playlistSvg = `<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="body" x1="0.08" y1="0" x2="0.95" y2="1">
      <stop offset="0" stop-color="#3A7CC8"/>
      <stop offset="0.4" stop-color="#1A4F9E"/>
      <stop offset="1" stop-color="#061530"/>
    </linearGradient>
    <radialGradient id="gloss" cx="0.28" cy="0.18" r="0.8">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.38"/>
      <stop offset="0.4" stop-color="#ffffff" stop-opacity="0.08"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="shade" cx="0.86" cy="0.9" r="0.7">
      <stop offset="0" stop-color="#010810" stop-opacity="0.75"/>
      <stop offset="1" stop-color="#010810" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="rim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.7"/>
      <stop offset="0.45" stop-color="#ffffff" stop-opacity="0.08"/>
      <stop offset="1" stop-color="#01060F" stop-opacity="0.85"/>
    </linearGradient>
    <linearGradient id="paper" x1="220" y1="160" x2="760" y2="820" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#F7FBFF"/>
      <stop offset="1" stop-color="#D7E6F8"/>
    </linearGradient>
    <linearGradient id="fold" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#B8D4F0"/>
      <stop offset="1" stop-color="#EEF5FC"/>
    </linearGradient>
    <radialGradient id="vinyl" cx="0.4" cy="0.35" r="0.7">
      <stop offset="0" stop-color="#3A3A42"/>
      <stop offset="1" stop-color="#0A0A0E"/>
    </radialGradient>
    <radialGradient id="label" cx="0.4" cy="0.35" r="0.65">
      <stop offset="0" stop-color="#FFE08A"/>
      <stop offset="0.45" stop-color="#FFB020"/>
      <stop offset="1" stop-color="#C24A08"/>
    </radialGradient>
    <filter id="docShadow" x="-20%" y="-20%" width="140%" height="150%">
      <feDropShadow dx="4" dy="14" stdDeviation="14" flood-color="#010810" flood-opacity="0.5"/>
    </filter>
  </defs>

  <rect x="72" y="72" width="880" height="880" rx="200" fill="url(#body)"/>
  <rect x="72" y="72" width="880" height="880" rx="200" fill="url(#shade)"/>
  <rect x="72" y="72" width="880" height="880" rx="200" fill="url(#gloss)"/>
  <rect x="76" y="76" width="872" height="872" rx="196" fill="none" stroke="url(#rim)" stroke-width="9"/>

  <!-- Document -->
  <g filter="url(#docShadow)" transform="rotate(-4 512 520)">
    <path d="M268 180 H620 L756 316 V820 H268 Z" fill="url(#paper)"/>
    <path d="M620 180 V316 H756 Z" fill="url(#fold)"/>
    <path d="M620 180 L756 316" fill="none" stroke="#7FA8D4" stroke-width="8" stroke-linejoin="round"/>
    <!-- playlist rows -->
    <rect x="320" y="420" width="300" height="36" rx="12" fill="#1A4F9E" opacity="0.85"/>
    <rect x="320" y="500" width="260" height="36" rx="12" fill="#3A7CC8" opacity="0.75"/>
    <rect x="320" y="580" width="220" height="36" rx="12" fill="#5A9AD8" opacity="0.65"/>
    <rect x="320" y="660" width="180" height="36" rx="12" fill="#7AB4E8" opacity="0.55"/>
  </g>

  <!-- Mini LP badge -->
  <g transform="translate(560 560)">
    <circle cx="0" cy="0" r="150" fill="#010810" opacity="0.35"/>
    <circle cx="0" cy="0" r="138" fill="url(#vinyl)"/>
    <circle cx="0" cy="0" r="118" fill="none" stroke="#2A2A32" stroke-width="4"/>
    <circle cx="0" cy="0" r="96" fill="none" stroke="#22222A" stroke-width="3"/>
    <circle cx="0" cy="0" r="74" fill="none" stroke="#2A2A32" stroke-width="3"/>
    <circle cx="0" cy="0" r="48" fill="url(#label)"/>
    <circle cx="0" cy="0" r="12" fill="#1A1208"/>
    <circle cx="0" cy="0" r="6" fill="#FFD070"/>
  </g>
</svg>
`

writeFileSync(join(root, 'asset', 'playlist-icon.svg'), playlistSvg)
writeFileSync(join(root, 'public', 'playlist-icon.svg'), playlistSvg)

const out = join(root, 'scripts', 'app-icon-source.png')
await sharp(Buffer.from(svg)).resize(1024, 1024).png().toFile(out)

const playlistOut = join(root, 'scripts', 'playlist-icon-source.png')
await sharp(Buffer.from(playlistSvg)).resize(1024, 1024).png().toFile(playlistOut)

const trayPng = join(root, 'src-tauri', 'tray-icons', '32x32.png')
await sharp(Buffer.from(traySvg)).resize(32, 32).png().toFile(trayPng)

console.log('wrote asset/app-icon.svg, public/app-icon.svg, public/favicon.svg,')
console.log('wrote asset/playlist-icon.svg, public/playlist-icon.svg,', playlistOut)
console.log('wrote asset/tray-icon.svg,', out, trayPng)
