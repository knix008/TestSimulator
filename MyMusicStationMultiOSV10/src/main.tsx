import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { loadAppSettingsDurable } from './appSettings'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Root element not found')
}

void loadAppSettingsDurable().then((initialSettings) => {
  createRoot(rootElement).render(
    <StrictMode>
      <App initialSettings={initialSettings} />
    </StrictMode>,
  )
})
