import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import MenuHost from './MenuHost.tsx'
import DialogHost from './DialogHost.tsx'
import type { MenuId } from './commands.ts'

/**
 * One bundle, three entry points. The menu popups and the dialogs are separate
 * OS windows that load this same file with a hash route, which is what lets a
 * long menu overhang the app and a dialog be dragged anywhere on the desktop.
 */
function routeFromHash() {
  const hash = window.location.hash.replace(/^#/, '')
  const params = new URLSearchParams(hash)
  const menu = params.get('menu')
  if (menu) return <MenuHost menu={menu as MenuId} />
  const dialog = params.get('dialog')
  if (dialog) return <DialogHost name={dialog} />
  return <App />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>{routeFromHash()}</StrictMode>,
)
