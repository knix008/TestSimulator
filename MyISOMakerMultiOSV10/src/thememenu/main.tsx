import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { applyTheme, loadThemeId } from '../theme/themes'
import { ThemeMenuWindow } from './ThemeMenuWindow'
import '../styles.css'
import '../ui.css'
import '../typography.css'

applyTheme(loadThemeId())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeMenuWindow />
  </StrictMode>,
)
