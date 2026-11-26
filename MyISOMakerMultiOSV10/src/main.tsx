import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { PreferencesProvider } from './i18n/Preferences'
import { installTauriBridge } from './platform/tauri-bridge'
import { applyTheme, loadThemeId } from './theme/themes'
import './styles.css'
import './start/start.css'
import './ui.css'
import './layout/layout.css'
import './typography.css'

applyTheme(loadThemeId())
installTauriBridge()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PreferencesProvider>
      <App />
    </PreferencesProvider>
  </StrictMode>,
)
