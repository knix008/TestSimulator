import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import type { MenuId } from './commands.ts'

/**
 * One bundle, three entry points. The menu popups and the dialogs are separate
 * OS windows that load this same file with a hash route, which is what lets a
 * long menu overhang the app and a dialog be dragged anywhere on the desktop.
 *
 * Each route is loaded on demand, so a popup window pulls in only what it needs
 * instead of the whole editor: a menu listing a dozen rows has no use for the
 * canvas engine, the filters or the file codecs.
 */
const App = lazy(() => import('./App.tsx'))
const MenuHost = lazy(() => import('./MenuHost.tsx'))
const DialogHost = lazy(() => import('./DialogHost.tsx'))

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
  <StrictMode>
    {/* Nothing is drawn until the route arrives: a popup window stays hidden
        until its content reports a size, so a spinner would only flash. */}
    <Suspense fallback={null}>{routeFromHash()}</Suspense>
  </StrictMode>,
)
