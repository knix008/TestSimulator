import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { PreferencesProvider } from './i18n/Preferences'
import WebApp from './web/App'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PreferencesProvider>
      <WebApp />
    </PreferencesProvider>
  </StrictMode>,
)
