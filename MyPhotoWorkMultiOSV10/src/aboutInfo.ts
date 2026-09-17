import { t } from './i18n'
// The import attribute is required by Node's ESM loader, which the tests use.
import buildInfo from './build-info.json' with { type: 'json' }
import type { Language } from './lib/types'

/** Everything the About window lists, in the order it is shown. */
export function aboutFacts(language: Language): { label: string; value: string }[] {
  const tr = (key: string) => t(language, key)
  const versions = typeof window !== 'undefined' ? window.electronAppApi?.versions() : undefined
  const formatted = (() => {
    try {
      return new Date(buildInfo.buildTime).toLocaleString(language === 'ko' ? 'ko-KR' : 'en-GB')
    } catch {
      return buildInfo.buildTime
    }
  })()

  const facts: { label: string; value: string }[] = [
    { label: tr('aboutVersion'), value: buildInfo.version },
    { label: tr('aboutBuilt'), value: formatted },
  ]
  if (buildInfo.commit) {
    facts.push({ label: tr('aboutCommit'), value: buildInfo.branch ? `${buildInfo.commit} (${buildInfo.branch})` : buildInfo.commit })
  }
  facts.push({ label: tr('aboutCreator'), value: buildInfo.author })
  facts.push({ label: tr('aboutLicense'), value: 'MIT' })
  facts.push({
    label: tr('aboutRuntime'),
    value: versions
      ? `Electron ${versions.electron} · Chromium ${versions.chrome} · Node ${versions.node}`
      : tr('aboutBrowser'),
  })
  facts.push({ label: tr('aboutBuiltWith'), value: `React ${buildInfo.react} · Vite ${buildInfo.vite}` })
  if (versions) {
    facts.push({ label: tr('aboutPlatform'), value: `${versions.platform} ${versions.arch}` })
  }
  return facts
}
