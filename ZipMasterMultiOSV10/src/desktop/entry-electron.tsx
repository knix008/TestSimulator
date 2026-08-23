import React from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@ui/App'
import { ServiceContext } from '@ui/ServiceContext'
import { ElectronArchiveService } from './ElectronArchiveService'
import '@ui/theme.css'

const service = new ElectronArchiveService()

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ServiceContext.Provider value={service}>
      <App />
    </ServiceContext.Provider>
  </React.StrictMode>
)
