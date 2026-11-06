import { createRoot } from 'react-dom/client'
import App, { type Shot } from './App'
import { DOC_CSS } from './document'
import { host } from './host'
import i18n, { startI18n } from './i18n'
import { preparePopouts } from './popout'
import { sanitizeSettings, type AppSettings } from './settings'
import { applyTheme, setCustomThemes } from './themes'
import { installTooltips, setTipTranslator } from './tooltips'
import './styles/icons.css'
import './styles/chrome.css'
import './styles/start.css'
import './styles/global.css'
import './styles/app.css'

// Text fields and the editor keep the system's menu for cut, copy and paste; elsewhere there is none.
window.addEventListener('contextmenu', (event) => {
  if (!(event.target as Element | null)?.closest?.('input, textarea, [contenteditable]')) event.preventDefault()
})

// ?shot=name&lang=ko stages one screen for the guide's screenshots (npm run screenshots).
const query = new URLSearchParams(location.search)
const shot: Shot | undefined = query.get('shot') ? { name: query.get('shot')! } : undefined

let settings: AppSettings = sanitizeSettings(shot ? {} : await host.loadSettings().catch(() => ({})))
if (shot) {
  settings = sanitizeSettings({
    language: query.get('lang') === 'en' ? 'en' : 'ko',
    theme: query.get('theme') ?? 'light-classic',
    outline: true,
    startScreen: { showOnStartup: shot.name === 'start', askTutorial: false, speed: 0, background: query.get('bg') ?? undefined },
  })
}
// The document's own look: the editor, the preview, the paper and the exports share it.
const docSheet = document.createElement('style')
docSheet.id = 'doc-style'
docSheet.textContent = DOC_CSS
document.head.append(docSheet)

setCustomThemes(settings.customThemes)
applyTheme(settings.theme)
startI18n(settings.language)
setTipTranslator((key) => i18n.t(key))
installTooltips()
document.documentElement.lang = settings.language
if (shot) document.documentElement.dataset.shot = shot.name
await preparePopouts()

createRoot(document.getElementById('root')!).render(<App initialSettings={settings} shot={shot} />)
requestAnimationFrame(() => requestAnimationFrame(() => void host.ready()))
