import { createRoot } from 'react-dom/client'
import { App } from './ui/App'
import { PopupHost } from './ui/PopupHost'
import './ui/styles.css'

const params = new URLSearchParams(window.location.search)
const popup = params.get('popup')
const root = document.getElementById('root')
if (!root) throw new Error('root element is missing')

createRoot(root).render(popup ? <PopupHost kind={popup} /> : <App />)
