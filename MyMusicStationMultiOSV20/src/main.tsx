import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { loadAppSettingsDurable } from './appSettings'
import PopupApp from './popups/PopupApp'
import { isPopupKind, popupQueryParam } from './popups/protocol'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Root element not found')
}

// Popup OS windows load the same bundle with `?popup=<kind>` and render only that dialog.
const popupKind = new URLSearchParams(window.location.search).get(popupQueryParam)

if (isPopupKind(popupKind)) {
  createRoot(rootElement).render(
    <StrictMode>
      <PopupApp kind={popupKind} />
    </StrictMode>,
  )
} else {
  void loadAppSettingsDurable().then((initialSettings) => {
    createRoot(rootElement).render(
      <StrictMode>
        <App initialSettings={initialSettings} />
      </StrictMode>,
    )
  })
}
