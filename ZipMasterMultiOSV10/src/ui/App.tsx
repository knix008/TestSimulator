import { StoreProvider, useStore } from './store'
import { TitleBar } from './TitleBar'
import { Toolbar } from './Toolbar'
import { OptionsBar } from './OptionsBar'
import { FileBrowser } from './FileBrowser'
import { ArchiveViewer } from './ArchiveViewer'
import { ProgressBar } from './ProgressBar'
import { AboutModal } from './AboutModal'
import { ErrorModal } from './ErrorModal'

function Shell() {
  const { t, busy, progress, toast } = useStore()

  return (
    <div className="app">
      <TitleBar />
      <Toolbar />
      <OptionsBar />

      <main className="panels">
        <FileBrowser />
        <ArchiveViewer />
      </main>

      <footer className="statusbar">
        <ProgressBar progress={progress} busy={busy} />
        {!busy && !progress && <span className="status-ready">{t.ready}</span>}
      </footer>

      {toast && <div className={`toast ${toast.kind}`}>{toast.msg}</div>}
      <AboutModal />
      <ErrorModal />
    </div>
  )
}

export function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  )
}
