import { Toolbar } from './components/Toolbar'
import { StatusBar } from './components/StatusBar'
import { ContextMenu } from './components/ContextMenu'
import { AboutDialog } from './components/AboutDialog'
import { DiagramCanvas } from './components/DiagramCanvas'
import { SidePanels } from './components/SidePanels'
import { useAppState } from './hooks/useAppState'

export default function App() {
  const state = useAppState()
  const isElectron = Boolean(window.mymind?.isElectron)
  const selectedNode = state.doc.nodes.find((node) => node.id === state.doc.selectedId) ?? null
  const selectedEdge = state.doc.edges.find(
    (edge) => edge.to === state.doc.selectedId || edge.from === state.doc.selectedId,
  )
  const currentLine = selectedEdge?.lineType ?? state.doc.defaultLine
  const currentLinePattern = selectedEdge?.linePattern ?? state.doc.defaultLinePattern
  const currentLineColor = selectedEdge?.color ?? '#94a3b8'
  const currentStartCap = selectedEdge?.startCap ?? 'none'
  const currentEndCap = selectedEdge?.endCap ?? 'none'

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
        onExport={state.exportImage}
        onMode={state.switchMode}
        onTheme={state.setTheme}
        onLocale={state.setLocale}
        onToggleGrid={state.toggleGrid}
        onResetView={state.resetView}
        onAutoAlign={state.autoAlign}
        onAbout={() => state.setAboutOpen(true)}
      />

      <main className="workspace">
        <SidePanels
          doc={state.doc}
          selectedNode={selectedNode}
          currentLine={currentLine}
          currentLinePattern={currentLinePattern}
          currentLineColor={currentLineColor}
          currentStartCap={currentStartCap}
          currentEndCap={currentEndCap}
          theme={state.settings.theme}
          onLayout={state.onLayout}
          onSelect={state.selectNode}
          onShape={state.onShape}
          onColor={state.onColor}
          onNote={state.onNote}
          onLine={state.onLine}
          onLinePattern={state.onLinePattern}
          onLineColor={state.onLineColor}
          onLineStartCap={state.onLineStartCap}
          onLineEndCap={state.onLineEndCap}
          onTextStyle={state.onTextStyle}
          onTextChange={state.editText}
        />

        <DiagramCanvas
          doc={state.doc}
          zoom={state.zoom}
          showGrid={state.settings.showGrid}
          theme={state.settings.theme}
          viewResetKey={state.viewResetKey}
          editingId={state.editingId}
          onSelect={state.selectNode}
          onSelectMany={state.selectNodes}
          onMoveNodes={state.onMoveNodes}
          onContext={state.showContext}
          onEditStart={state.setEditingId}
          onEditCommit={(id, text) => {
            state.editText(id, text)
            state.setEditingId(null)
          }}
          onEditCancel={() => state.setEditingId(null)}
          onZoom={state.setZoom}
        />
      </main>

      <StatusBar
        doc={state.doc}
        statusText={state.statusText}
        zoom={state.zoom}
        showGrid={state.settings.showGrid}
        onToggleGrid={state.toggleGrid}
      />

      <ContextMenu
        menu={state.contextMenu}
        selectedCount={state.doc.selectedIds.length}
        onClose={state.hideContext}
        onAddText={state.addTextAtContext}
        onAddChild={state.onAddChild}
        onAddSibling={state.onAddSibling}
        onEdit={() => {
          if (state.contextMenu.nodeId) state.setEditingId(state.contextMenu.nodeId)
        }}
        onDelete={state.onDelete}
      />

      <AboutDialog open={state.aboutOpen} onClose={() => state.setAboutOpen(false)} />
    </div>
  )
}
