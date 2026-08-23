import React from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@ui/App'
import { ServiceContext } from '@ui/ServiceContext'
import { WebArchiveService } from './WebArchiveService'
import '@ui/theme.css'

const service = new WebArchiveService()

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ServiceContext.Provider value={service}>
      <App />
    </ServiceContext.Provider>
  </React.StrictMode>
)
