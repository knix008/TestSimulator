import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { PreferencesProvider } from '../i18n/Preferences'
import { installTauriBridge } from '../platform/tauri-bridge'
import { applyTheme, loadThemeId } from '../theme/themes'
import { ToolApp } from './ToolApp'
import '../styles.css'
import '../start/start.css'
import '../start/background.css'
import '../ui.css'
import '../layout/layout.css'
import '../print/print.css'
import './tool.css'
import '../typography.css'

applyTheme(loadThemeId())
installTauriBridge()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PreferencesProvider>
      <ToolApp />
    </PreferencesProvider>
  </StrictMode>,
)
