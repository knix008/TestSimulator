import { createRoot } from 'react-dom/client'
import { App } from './ui/App'
import { ErrorBoundary } from './ui/ErrorBoundary'
import { PopupHost } from './ui/PopupHost'
import './ui/styles.css'

const params = new URLSearchParams(window.location.search)
const popup = params.get('popup')
const root = document.getElementById('root')
if (!root) throw new Error('root element is missing')

createRoot(root).render(
  <ErrorBoundary source={popup ? `popup:${popup}` : 'app'} platform={window.mycad?.platform}>
    {popup ? <PopupHost kind={popup} /> : <App />}
  </ErrorBoundary>
)
