import { lazy } from 'react'

/**
 * The three things this bundle can be: the editor, a menu popup, or a dialog.
 *
 * Each is loaded on demand so a popup window pulls in only what it needs — a
 * menu listing a dozen rows has no use for the canvas engine, the filters or
 * the file codecs. They live here rather than in `main.tsx` because a module
 * that defines components has to export them for fast refresh to work.
 */
export const App = lazy(() => import('./App.tsx'))
export const MenuHost = lazy(() => import('./MenuHost.tsx'))
export const DialogHost = lazy(() => import('./DialogHost.tsx'))
