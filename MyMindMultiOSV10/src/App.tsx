import { Toolbar } from './components/Toolbar'
import { StatusBar } from './components/StatusBar'
import { ContextMenu } from './components/ContextMenu'
import { AboutDialog } from './components/AboutDialog'
import { DiagramCanvas } from './components/DiagramCanvas'
import { useAppState } from './hooks/useAppState'

export default function App() {
  const state = useAppState()
  const isElectron = Boolean(window.mymind?.isElectron)

  return (
    <div className="app-shell">
      <Toolbar
        doc={state.doc}
        theme={state.settings.theme}
        locale={state.settings.locale}
        showGrid={state.settings.showGrid}
        isElectron={isElectron}
        onNew={state.newDoc}
        onOpen={state.openDoc}
        onSave={state.saveDoc}
        onMode={state.switchMode}
        onAddChild={state.onAddChild}
        onAddSibling={state.onAddSibling}
        onDelete={state.onDelete}
        onLayout={state.onLayout}
        onShape={state.onShape}
        onColor={state.onColor}
        onLine={state.onLine}
        onTheme={state.setTheme}
        onLocale={state.setLocale}
        onToggleGrid={state.toggleGrid}
        onResetView={state.resetView}
        onAutoAlign={state.autoAlign}
        onAbout={() => state.setAboutOpen(true)}
      />

      <DiagramCanvas
        doc={state.doc}
        zoom={state.zoom}
        showGrid={state.settings.showGrid}
        viewResetKey={state.viewResetKey}
        editingId={state.editingId}
        onSelect={state.selectNode}
        onMoveNode={state.onMoveNode}
        onContext={state.showContext}
        onEditStart={state.setEditingId}
        onEditCommit={(id, text) => {
          state.editText(id, text)
          state.setEditingId(null)
        }}
        onEditCancel={() => state.setEditingId(null)}
        onZoom={state.setZoom}
      />

      <StatusBar
        doc={state.doc}
        statusText={state.statusText}
        zoom={state.zoom}
        showGrid={state.settings.showGrid}
        onToggleGrid={state.toggleGrid}
      />

      <ContextMenu
        menu={state.contextMenu}
        currentShape={
          state.doc.nodes.find((n) => n.id === state.contextMenu.nodeId)?.shape ??
          state.doc.defaultShape
        }
        currentColor={
          state.doc.nodes.find((n) => n.id === state.contextMenu.nodeId)?.color ?? '#3b82f6'
        }
        currentLine={
          state.doc.edges.find(
            (e) => e.to === state.contextMenu.nodeId || e.from === state.contextMenu.nodeId,
          )?.lineType ?? state.doc.defaultLine
        }
        onClose={state.hideContext}
        onAddChild={state.onAddChild}
        onAddSibling={state.onAddSibling}
        onEdit={() => {
          if (state.contextMenu.nodeId) state.setEditingId(state.contextMenu.nodeId)
        }}
        onDelete={state.onDelete}
        onShape={state.onShape}
        onColor={state.onColor}
        onLine={state.onLine}
      />

      <AboutDialog open={state.aboutOpen} onClose={() => state.setAboutOpen(false)} />
    </div>
  )
}
