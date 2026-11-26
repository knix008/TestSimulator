import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { applyTheme, loadThemeId } from '../theme/themes'
import { PrintApp } from './PrintApp'
import '../styles.css'
import '../ui.css'
import '../layout/layout.css'
import './print.css'
import '../typography.css'

applyTheme(loadThemeId())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PrintApp />
  </StrictMode>,
)
