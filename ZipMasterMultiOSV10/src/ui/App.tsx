import { StoreProvider, useStore } from './store'
import { TitleBar } from './TitleBar'
import { Toolbar } from './Toolbar'
import { FileBrowser } from './FileBrowser'
import { ArchiveViewer } from './ArchiveViewer'
import { StatusBar } from './StatusBar'
import { AboutModal } from './AboutModal'
import { SettingsModal } from './SettingsModal'
import { CompressModal } from './CompressModal'
import { ProgressModal } from './ProgressModal'
import { ErrorModal } from './ErrorModal'
import { ContextMenuProvider } from './ContextMenu'

function Shell() {
  const { toast, compressReq, dismissToast } = useStore()

  return (
    <div className="app">
      <TitleBar />
      <Toolbar />

      <main className="panels">
        <FileBrowser />
        <ArchiveViewer />
      </main>

      <StatusBar />

      {toast && (
        <div className={`toast ${toast.kind}`} role="status" aria-live="polite" onClick={dismissToast}>
          <span className="toast-msg">{toast.msg}</span>
          {toast.action && (
            <button
              className="toast-action"
              onClick={(e) => {
                e.stopPropagation()
                toast.action!.onClick()
                dismissToast()
              }}
            >
              {toast.action.label}
            </button>
          )}
        </div>
      )}
      <AboutModal />
      <SettingsModal />
      {compressReq && <CompressModal />}
      <ProgressModal />
      <ErrorModal />
    </div>
  )
}

export function App() {
  return (
    <StoreProvider>
      <ContextMenuProvider>
        <Shell />
      </ContextMenuProvider>
    </StoreProvider>
  )
}
