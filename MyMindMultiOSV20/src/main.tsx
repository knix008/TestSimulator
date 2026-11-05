import { createRoot } from 'react-dom/client'
import App from './App'
import { host } from './host'
import i18n, { startI18n } from './i18n'
import { preparePopouts } from './popout'
import { sanitizeSettings } from './settings'
import { applyTheme, setCustomThemes } from './themes'
import { installTooltips, setTipTranslator } from './tooltips'
import './styles/fonts.css'
import './styles/icons.css'
import './styles/chrome.css'
import './styles/start.css'
import './styles/global.css'

// The browser's own drag of selected content would cancel every drag the app does itself.
window.addEventListener('dragstart', (event) => event.preventDefault())
// The program's own menu is the only one: text fields keep the system's for cut, copy and paste.
window.addEventListener('contextmenu', (event) => {
  if (!(event.target as Element | null)?.closest?.('input, textarea')) event.preventDefault()
})

const settings = sanitizeSettings(await host.loadSettings().catch(() => ({})))
setCustomThemes(settings.customThemes)
applyTheme(settings.theme)
startI18n(settings.language)
setTipTranslator((key) => i18n.t(key))
installTooltips()
await preparePopouts()
document.documentElement.lang = settings.language

createRoot(document.getElementById('root')!).render(<App initialSettings={settings} />)
requestAnimationFrame(() => requestAnimationFrame(() => void host.ready()))
