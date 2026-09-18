import { StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App, DialogHost, MenuHost } from './routes.ts'
import type { MenuId } from './commands.ts'

/**
 * One bundle, three entry points. The menu popups and the dialogs are separate
 * OS windows that load this same file with a hash route, which is what lets a
 * long menu overhang the app and a dialog be dragged anywhere on the desktop.
 *
 * The route says which of the three to be, not which menu or which dialog: a
 * popup window is handed that over IPC, so one warm window can serve any of
 * them and none of them has to wait for a renderer to start.
 */
function routeFromHash() {
  const hash = window.location.hash.replace(/^#/, '')
  const params = new URLSearchParams(hash)
  if (params.has('menu')) return <MenuHost menu={(params.get('menu') || '') as MenuId} />
  if (params.has('dialog')) return <DialogHost name={params.get('dialog') || ''} />
  return <App />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Nothing is drawn until the route arrives: a popup window stays hidden
        until its content reports a size, so a spinner would only flash. */}
    <Suspense fallback={null}>{routeFromHash()}</Suspense>
  </StrictMode>,
)
