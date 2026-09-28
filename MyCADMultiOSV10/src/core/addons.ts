// Addon manager: a catalogue of installable extensions, manifest validation,
// install/enable/uninstall bookkeeping and the commands an addon contributes.
//
// Addons are data, never executable JavaScript: a manifest may carry a Python
// macro, which runs in the sandboxed interpreter, or a theme.
import type { Theme } from './themes'

export type AddonKind = 'workbench' | 'macro' | 'theme' | 'library'

export interface AddonCommand {
  id: string
  label: { ko: string; en: string }
  icon: string
  /** Python source run by the sandboxed interpreter. */
  macro: string
}

export interface AddonManifest {
  id: string
  name: { ko: string; en: string }
  version: string
  author: string
  description: { ko: string; en: string }
  kind: AddonKind
  /** minimum MyCAD version, e.g. "1.0.0" */
  requires: string
  commands?: AddonCommand[]
  theme?: Theme
  /** other addon ids that must be installed first */
  dependencies?: string[]
}

export interface InstalledAddon {
  manifest: AddonManifest
  enabled: boolean
  installedAt: number
  source: 'catalog' | 'file' | 'url'
}

/** Extensions shipped with the application, the way FreeCAD's addon manager lists them. */
export const ADDON_CATALOG: AddonManifest[] = [
  {
    id: 'gear-generator',
    name: { ko: '기어 생성기', en: 'Gear generator' },
    version: '1.2.0',
    author: 'MyCAD community',
    description: { ko: '평기어 프로파일을 파라미터로 만듭니다.', en: 'Parametric spur gear profiles.' },
    kind: 'macro',
    requires: '1.0.0',
    commands: [{
      id: 'addonGear',
      label: { ko: '평기어 만들기', en: 'Make spur gear' },
      icon: '⚙',
      macro: [
        'import Part',
        'import math',
        'teeth = 12',
        'module = 3',
        'radius = teeth * module / 2',
        'body = Part.makeCylinder(radius, 8)',
        'for i in range(teeth):',
        '    angle = 2 * math.pi * i / teeth',
        '    tooth = Part.makeBox(module * 2, 8, module * 1.6)',
        '    body = body + tooth',
        'print("gear", teeth, "teeth, pitch radius", round(radius, 2))',
        'Part.show(body)'
      ].join('\n')
    }]
  },
  {
    id: 'fasteners',
    name: { ko: '패스너', en: 'Fasteners' },
    version: '0.9.3',
    author: 'MyCAD community',
    description: { ko: '표준 볼트와 너트를 넣습니다.', en: 'Standard bolts and nuts.' },
    kind: 'macro',
    requires: '1.0.0',
    commands: [{
      id: 'addonBolt',
      label: { ko: 'M8 볼트', en: 'M8 bolt' },
      icon: '🔩',
      macro: [
        'import Part',
        'head = Part.makePrism(6, 7, 5)',
        'shank = Part.makeCylinder(4, 30)',
        'bolt = head + shank',
        'print("M8 bolt volume", round(bolt.Volume, 1))',
        'Part.show(bolt)'
      ].join('\n')
    }]
  },
  {
    id: 'solar-theme',
    name: { ko: '솔라 테마 팩', en: 'Solar theme pack' },
    version: '1.0.1',
    author: 'MyCAD community',
    description: { ko: '따뜻한 색조의 추가 테마입니다.', en: 'A warm extra theme.' },
    kind: 'theme',
    requires: '1.0.0',
    theme: {
      id: 'solarFlare',
      mode: 'dark',
      name: { ko: '솔라 플레어', en: 'Solar flare' },
      colors: {
        bg: '#241606', panel: '#33210c', panelAlt: '#1b1004', line: '#6a4415', text: '#ffeccd', muted: '#c9a273',
        accent: '#ff8a3d', button: '#452c10', danger: '#e2503f', viewportA: '#33210c', viewportB: '#140b02',
        gridMajor: '#8a5a1f', gridMinor: '#4a3010'
      }
    }
  },
  {
    id: 'sheet-metal-tools',
    name: { ko: '시트메탈 도구 모음', en: 'Sheet metal tools' },
    version: '2.1.0',
    author: 'MyCAD community',
    description: { ko: '전개도 유틸리티를 추가합니다.', en: 'Extra unfolding utilities.' },
    kind: 'workbench',
    requires: '1.0.0',
    dependencies: [],
    commands: [{
      id: 'addonUnfoldAll',
      label: { ko: '전체 전개', en: 'Unfold all' },
      icon: '⬓',
      macro: [
        'import Part',
        'plate = Part.makeBox(120, 2, 60)',
        'print("flat blank 120 x 60 x 2")',
        'Part.show(plate)'
      ].join('\n')
    }]
  }
]

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((part) => Number(part) || 0)
  const pb = b.split('.').map((part) => Number(part) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff > 0 ? 1 : -1
  }
  return 0
}

export interface Compatibility {
  ok: boolean
  reason: string
}

/** Check the manifest against the running application version and dependencies. */
export function checkCompatibility(manifest: AddonManifest, appVersion: string, installed: InstalledAddon[] = []): Compatibility {
  if (compareVersions(appVersion, manifest.requires) < 0) {
    return { ok: false, reason: `MyCAD ${manifest.requires} 이상이 필요합니다 (현재 ${appVersion})` }
  }
  const missing = (manifest.dependencies ?? []).filter((id) => !installed.some((addon) => addon.manifest.id === id))
  if (missing.length > 0) return { ok: false, reason: `의존 애드온이 없습니다: ${missing.join(', ')}` }
  return { ok: true, reason: 'ok' }
}

/** Parse and validate a manifest supplied as JSON text. */
export function parseManifest(text: string): AddonManifest {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch (error) {
    throw new Error(`애드온 매니페스트를 읽을 수 없습니다: ${(error as Error).message}`)
  }
  const raw = data as Partial<AddonManifest>
  const kinds: AddonKind[] = ['workbench', 'macro', 'theme', 'library']
  if (!raw || typeof raw.id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/i.test(raw.id)) throw new Error('애드온 id가 올바르지 않습니다.')
  if (typeof raw.version !== 'string') throw new Error('애드온 version이 필요합니다.')
  if (!kinds.includes(raw.kind as AddonKind)) throw new Error('애드온 kind가 올바르지 않습니다.')
  const name = raw.name ?? { ko: raw.id, en: raw.id }
  const description = raw.description ?? { ko: '', en: '' }
  const commands = (raw.commands ?? []).map((command) => {
    if (!command || typeof command.id !== 'string' || typeof command.macro !== 'string') {
      throw new Error('애드온 명령에는 id와 macro가 필요합니다.')
    }
    return {
      id: command.id,
      label: command.label ?? { ko: command.id, en: command.id },
      icon: typeof command.icon === 'string' && command.icon ? command.icon : '🧩',
      macro: command.macro
    }
  })
  return {
    id: raw.id,
    name: { ko: String(name.ko ?? raw.id), en: String(name.en ?? raw.id) },
    version: raw.version,
    author: typeof raw.author === 'string' ? raw.author : 'unknown',
    description: { ko: String(description.ko ?? ''), en: String(description.en ?? '') },
    kind: raw.kind as AddonKind,
    requires: typeof raw.requires === 'string' ? raw.requires : '1.0.0',
    commands,
    theme: raw.theme,
    dependencies: Array.isArray(raw.dependencies) ? raw.dependencies.filter((id) => typeof id === 'string') : []
  }
}

export function installAddon(
  installed: InstalledAddon[],
  manifest: AddonManifest,
  source: InstalledAddon['source'] = 'catalog',
  appVersion = '1.0.0',
  now = 0
): InstalledAddon[] {
  const compatibility = checkCompatibility(manifest, appVersion, installed)
  if (!compatibility.ok) throw new Error(compatibility.reason)
  const existing = installed.find((addon) => addon.manifest.id === manifest.id)
  if (existing && compareVersions(manifest.version, existing.manifest.version) <= 0) {
    throw new Error(`이미 설치되어 있습니다: ${manifest.id} ${existing.manifest.version}`)
  }
  const rest = installed.filter((addon) => addon.manifest.id !== manifest.id)
  return [...rest, { manifest, enabled: true, installedAt: now, source }]
}

export function uninstallAddon(installed: InstalledAddon[], id: string): InstalledAddon[] {
  const dependents = installed.filter((addon) => (addon.manifest.dependencies ?? []).includes(id))
  if (dependents.length > 0) {
    throw new Error(`다른 애드온이 사용 중입니다: ${dependents.map((addon) => addon.manifest.id).join(', ')}`)
  }
  return installed.filter((addon) => addon.manifest.id !== id)
}

export function setAddonEnabled(installed: InstalledAddon[], id: string, enabled: boolean): InstalledAddon[] {
  return installed.map((addon) => (addon.manifest.id === id ? { ...addon, enabled } : addon))
}

/** Commands contributed by the enabled addons, ready for the command registry. */
export function addonCommands(installed: InstalledAddon[]): Array<AddonCommand & { addonId: string }> {
  return installed
    .filter((addon) => addon.enabled)
    .flatMap((addon) => (addon.manifest.commands ?? []).map((command) => ({ ...command, addonId: addon.manifest.id })))
}

/** Themes contributed by the enabled addons. */
export function addonThemes(installed: InstalledAddon[]): Theme[] {
  return installed
    .filter((addon) => addon.enabled && addon.manifest.theme)
    .map((addon) => addon.manifest.theme as Theme)
}

export function findAddonCommand(installed: InstalledAddon[], commandId: string): (AddonCommand & { addonId: string }) | undefined {
  return addonCommands(installed).find((command) => command.id === commandId)
}

export function sanitizeInstalled(input: unknown): InstalledAddon[] {
  if (!Array.isArray(input)) return []
  const out: InstalledAddon[] = []
  for (const entry of input) {
    const record = entry as Partial<InstalledAddon>
    if (!record || typeof record !== 'object' || !record.manifest) continue
    try {
      const manifest = parseManifest(JSON.stringify(record.manifest))
      out.push({
        manifest,
        enabled: record.enabled !== false,
        installedAt: typeof record.installedAt === 'number' ? record.installedAt : 0,
        source: record.source === 'file' || record.source === 'url' ? record.source : 'catalog'
      })
    } catch {
      // Skip manifests that no longer validate rather than failing the load.
    }
  }
  return out
}

export function addonReport(installed: InstalledAddon[], lang: 'ko' | 'en' = 'ko'): string[] {
  if (installed.length === 0) return [lang === 'ko' ? '설치된 애드온이 없습니다.' : 'No addons installed.']
  return installed.map((addon) => {
    const commands = (addon.manifest.commands ?? []).length
    return `${addon.enabled ? '☑' : '☐'} ${addon.manifest.name[lang]} ${addon.manifest.version} · ${addon.manifest.kind}` +
      `${commands > 0 ? ` · ${commands} ${lang === 'ko' ? '명령' : 'commands'}` : ''} · ${addon.manifest.author}`
  })
}

/** Catalogue entries that are not installed yet. */
export function availableAddons(installed: InstalledAddon[]): AddonManifest[] {
  return ADDON_CATALOG.filter((manifest) => !installed.some((addon) => addon.manifest.id === manifest.id))
}
