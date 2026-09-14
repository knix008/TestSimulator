// Generates the app icon in one place: a simple, bright, 3D-looking, and
// unmistakably-music design (glossy rounded square + one connected white eighth
// note with a drop shadow). Writes the shared in-app SVG (asset/ + public/) and
// a 1024 PNG source for `npx tauri icon`.
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'

// viewBox 0 0 1024 1024 — resolution-independent, reused as-is for the in-app SVG.
const svg = `<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- Diagonal body gradient gives the base sense of light-from-top-left -->
    <linearGradient id="body" x1="0.12" y1="0" x2="0.9" y2="1">
      <stop offset="0" stop-color="#86DDFF"/>
      <stop offset="0.5" stop-color="#3E92F0"/>
      <stop offset="1" stop-color="#1A63CC"/>
    </linearGradient>
    <!-- Glossy specular highlight, top-left -->
    <radialGradient id="gloss" cx="0.32" cy="0.22" r="0.72">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.6"/>
      <stop offset="0.5" stop-color="#ffffff" stop-opacity="0.12"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <!-- Depth shading, bottom-right -->
    <radialGradient id="shade" cx="0.82" cy="0.86" r="0.75">
      <stop offset="0" stop-color="#0A2F6B" stop-opacity="0.5"/>
      <stop offset="1" stop-color="#0A2F6B" stop-opacity="0"/>
    </radialGradient>
    <!-- Beveled rim: bright on top edge, dark on the bottom edge -->
    <linearGradient id="rim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.9"/>
      <stop offset="0.5" stop-color="#ffffff" stop-opacity="0.08"/>
      <stop offset="1" stop-color="#04244f" stop-opacity="0.55"/>
    </linearGradient>
    <!-- Note body gradient for rounded, 3D volume. userSpaceOnUse so the shared
         gradient spans the whole note and the overlapping parts light uniformly. -->
    <linearGradient id="note" x1="300" y1="280" x2="560" y2="800" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="0.6" stop-color="#EFF6FF"/>
      <stop offset="1" stop-color="#CFE4FF"/>
    </linearGradient>
    <filter id="noteShadow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="16" stdDeviation="18" flood-color="#082a63" flood-opacity="0.4"/>
    </filter>
  </defs>

  <!-- Body + lighting layers -->
  <rect x="72" y="72" width="880" height="880" rx="200" fill="url(#body)"/>
  <rect x="72" y="72" width="880" height="880" rx="200" fill="url(#shade)"/>
  <rect x="72" y="72" width="880" height="880" rx="200" fill="url(#gloss)"/>
  <!-- Beveled edge -->
  <rect x="76" y="76" width="872" height="872" rx="196" fill="none" stroke="url(#rim)" stroke-width="7"/>

  <!-- One connected eighth note: stem overlaps both the head and the flag, all
       filled with the same gradient so it reads as a single solid 3D shape.
       Lifted off the body with a soft drop shadow. -->
  <g filter="url(#noteShadow)" fill="url(#note)">
    <!-- flag (curls off the top of the stem, overlaps the stem's left edge) -->
    <path d="M560 300 C700 300 790 380 768 502 C759 556 730 596 690 620
             C726 560 720 500 688 456 C662 420 612 398 560 392 Z"/>
    <!-- stem (runs down into the head) -->
    <rect x="560" y="300" width="54" height="392" rx="27"/>
    <!-- note head (tilted, overlaps the bottom of the stem) -->
    <ellipse cx="452" cy="676" rx="126" ry="98" transform="rotate(-20 452 676)"/>
  </g>
</svg>
`

const root = process.cwd()
writeFileSync(join(root, 'asset', 'app-icon.svg'), svg)
writeFileSync(join(root, 'public', 'app-icon.svg'), svg)

const out = join(root, 'scripts', 'app-icon-source.png')
await sharp(Buffer.from(svg)).resize(1024, 1024).png().toFile(out)
console.log('wrote asset/app-icon.svg, public/app-icon.svg,', out)
