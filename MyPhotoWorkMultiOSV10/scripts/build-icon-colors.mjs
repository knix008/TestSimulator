#!/usr/bin/env node
/**
 * Writes src/iconColors.css: a colour for every lucide icon the app imports, so no
 * icon is drawn in the plain text colour - toolbars, menus, context menus, dialogs,
 * popups and the start screen cards alike.
 *
 * Every lucide <svg> carries the class lucide-<name> and draws with currentColor, so
 * setting `color` on that class colours it wherever it appears. The colour comes from
 * what the icon means (delete is red, folders are amber, saving is blue ...), and an
 * icon no rule covers gets one from a hash of its name. Each colour has a light-theme
 * and a dark-theme shade so it reads on both.
 *
 *   node scripts/build-icon-colors.mjs           write the file
 *   node scripts/build-icon-colors.mjs --check   exit 1 when the file is out of date
 */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(path.join(root, 'package.json'))
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const lucide = require('lucide-react')

export const OUT = path.join(root, 'src', 'iconColors.css')

/** Light-theme shade, dark-theme shade. */
export const PALETTE = {
  red: ['#d63a3a', '#ff7a7a'],
  orange: ['#dd6b12', '#ffa25c'],
  amber: ['#c98a00', '#ffc94d'],
  lime: ['#5f9a12', '#a8e05a'],
  green: ['#1f9a4a', '#5fdc8a'],
  teal: ['#0f8f86', '#4fd8cc'],
  cyan: ['#0a8bbf', '#5cc9f5'],
  blue: ['#2f6fdb', '#79a8ff'],
  indigo: ['#5a4fd6', '#a59bff'],
  violet: ['#8a3fd1', '#c99bff'],
  pink: ['#cc3d8f', '#ff8ac8'],
  brown: ['#a0612e', '#e0a46e'],
}
const HASH_ORDER = ['blue', 'teal', 'violet', 'orange', 'green', 'pink', 'cyan', 'indigo', 'amber', 'lime', 'red', 'brown']

/** First match wins; patterns are tested against the kebab-case icon name. */
const RULES = [
  ['red', /trash|^x$|-x$|^x-|circle-x|square-x|octagon|^ban$|eraser|delete|alert|triangle-alert|flame|power|log-out|unlink|bug|siren|heart-crack|skull|scissors/],
  ['green', /check|^plus$|-plus|plus-|^play|play-|^circle-play|badge-check|leaf|sprout|tree|shield-check|thumbs-up|refresh|rotate|redo|undo|recycle|repeat|history|clock|timer|hourglass/],
  ['amber', /folder|(^|-)star($|-)|sun|lightbulb|^zap|award|crown|trophy|(^|-)key($|-)|lock|bell|medal|sparkle|wand/],
  ['blue', /save|download|upload|import|export|^info|help|circle-question|file|book|monitor|laptop|cloud|share|external|link|^log-in|printer|clipboard|copy|paste|database|hard-drive|server|inbox|mail|send/],
  ['pink', /palette|swatch|pipette|heart|contrast|blend|rainbow|paint-bucket|droplets|spray|flower|smile|baby|user|person|users|contact/],
  ['orange', /brush|paint|pen|pencil|highlighter|signature|edit|stamp|hand|pointer|mouse|cursor|flag|tag|ticket|fire/],
  ['violet', /layers|layer|brain|bot|cpu|sparkles|type|text|letter|a-large|baseline|heading|pilcrow|italic|bold|underline|strikethrough|languages|globe|keyboard|command|code|binary|atom|orbit|ghost/],
  ['cyan', /droplet|waves|wave|wind|snowflake|cloud-rain|crop|scan|focus|aperture|camera|video|film|clapperboard|eye|glasses|search|zoom|maximize|minimize|expand|shrink|fullscreen|scaling|move|locate|crosshair|target/],
  ['teal', /image|images|picture|frame|grid|layout|panel|columns|rows|table|square|rectangle|circle|triangle|hexagon|pentagon|shapes|box|boxes|package|component|blocks|dice|cuboid|cylinder|cone|torus/],
  ['indigo', /settings|sliders|cog|wrench|hammer|tool|gauge|filter|funnel|list|menu|ellipsis|more|grip|align|distribute|between|arrow|chevron|corner|move-|undo-|redo-|flip|rotate-|refresh-|swap|shuffle|split|merge|combine|git/],
  ['lime', /moon|mountain|tent|map|compass|navigation|route|signpost|car|bike|plane|ship|truck|rocket/],
  ['brown', /archive|briefcase|coffee|cookie|wood|axe|shovel|anchor|bone/],
]

/** Every name imported from lucide-react anywhere in src (aliases resolve to the original). */
export function importedIcons() {
  const names = new Set()
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (/\.(tsx?|jsx?)$/.test(entry.name)) {
        const text = fs.readFileSync(full, 'utf8')
        for (const match of text.matchAll(/import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*['"]lucide-react['"]/g)) {
          for (const part of match[1].split(',')) {
            const name = part.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim()
            if (name && /^[A-Z]/.test(name) && !/^(Lucide|Icon)(Props|Icon)?$/.test(name) && name !== 'LucideIcon' && name !== 'LucideProps') names.add(name)
          }
        }
      }
    }
  }
  walk(path.join(root, 'src'))
  return [...names].sort()
}

/** The kebab-case class lucide gives the icon, read from what it actually renders. */
function classOf(exportName) {
  const Component = lucide[exportName]
  if (!Component) return null
  const html = renderToStaticMarkup(React.createElement(Component))
  const classes = /class="([^"]*)"/.exec(html)?.[1].split(/\s+/) ?? []
  return classes.find((name) => name.startsWith('lucide-'))?.slice('lucide-'.length) ?? null
}

function hash(text) {
  let value = 2166136261
  for (const char of text) value = Math.imul(value ^ char.charCodeAt(0), 16777619) >>> 0
  return value
}

export function colourFor(kebab) {
  for (const [colour, pattern] of RULES) if (pattern.test(kebab)) return colour
  return HASH_ORDER[hash(kebab) % HASH_ORDER.length]
}

export function buildCss() {
  const byColour = new Map(Object.keys(PALETTE).map((colour) => [colour, []]))
  const icons = []
  for (const name of importedIcons()) {
    const kebab = classOf(name)
    if (!kebab) continue
    if (icons.includes(kebab)) continue
    icons.push(kebab)
    byColour.get(colourFor(kebab)).push(kebab)
  }
  const lines = [
    '/* Generated by scripts/build-icon-colors.mjs - do not edit by hand. */',
    '/* Every lucide icon in the app has a colour; see the script for the rules. */',
    '',
    ':root {',
    ...Object.entries(PALETTE).map(([colour, [light]]) => `  --icon-${colour}: ${light};`),
    '}',
    ':root[data-theme="dark"] {',
    ...Object.entries(PALETTE).map(([colour, [, dark]]) => `  --icon-${colour}: ${dark};`),
    '}',
    '',
  ]
  for (const [colour, list] of byColour) {
    if (!list.length) continue
    lines.push(`${list.sort().map((kebab) => `svg.lucide-${kebab}`).join(',\n')} {\n  color: var(--icon-${colour}) !important;\n}\n`)
  }
  lines.push(
    '/* On an accent-filled background (a pressed or chosen control) the icon follows the',
    '   text colour there, so it never disappears into the accent. */',
    [
      '.start-button.primary svg.lucide',
      '.bg-kind.on svg.lucide',
      '.option-list button.chosen svg.lucide',
      ".choice-pair button[aria-pressed='true'] svg.lucide",
      '.tutorial-ask-foot button.primary svg.lucide',
      '.tutorial-foot button.primary svg.lucide',
    ].join(',\n') + ' {\n  color: inherit !important;\n}\n',
    '/* Every close button: a red X that turns white on the red hover fill. */',
    [
      '.dialog-close:hover svg.lucide',
      '.dialog-close:focus-visible svg.lucide',
      '.window-controls .window-close:hover svg.lucide',
      '.window-controls .window-close:focus-visible svg.lucide',
      '.tutorial-x:hover svg.lucide',
      '.tutorial-x:focus-visible svg.lucide',
    ].join(',\n') + ' {\n  color: #ffffff !important;\n}\n',
  )
  return { css: lines.join('\n'), icons }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { css, icons } = buildCss()
  const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : ''
  if (process.argv.includes('--check')) {
    if (current !== css) {
      console.error('src/iconColors.css is out of date: run npm run build:icon-colors')
      process.exit(1)
    }
    console.log(`icon colours up to date (${icons.length} icons)`)
  } else {
    if (current !== css) fs.writeFileSync(OUT, css)
    console.log(`icon colours: ${icons.length} icons -> ${path.relative(root, OUT)}`)
  }
}
