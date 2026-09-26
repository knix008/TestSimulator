import { buildInfo } from '../core/buildInfo'
import { AboutDialog } from './dialogs'

export function PopupHost({ kind }: { kind: string }) {
  const info = buildInfo(window.mycad?.platform || 'web')
  if (kind === 'about') {
    return <AboutDialog platform={info.platform} onClose={() => window.close()} />
  }
  return <AboutDialog platform={info.platform} onClose={() => window.close()} />
}
