import { Toolbar } from './components/Toolbar'
import { StatusBar } from './components/StatusBar'
import { ContextMenu } from './components/ContextMenu'
import { AboutDialog } from './components/AboutDialog'
import { ConfirmCloseDialog } from './components/ConfirmCloseDialog'
import { ExportDialog } from './components/ExportDialog'
import { DiagramCanvas } from './components/DiagramCanvas'
import { SidePanels } from './components/SidePanels'
import { useAppState } from './hooks/useAppState'

export default function App() {
  const state = useAppState()
  const isElectron = Boolean(window.mymind?.isElectron)
  const selectedNode = state.doc.nodes.find((node) => node.id === state.doc.selectedId) ?? null
  // An independently-selected edge takes priority; otherwise fall back to the
  // edge implied by the selected node (its connection to its parent/children).
  const selectedEdge = state.doc.selectedEdgeId
    ? state.doc.edges.find((edge) => edge.id === state.doc.selectedEdgeId)
    : state.doc.edges.find(
        (edge) => edge.to === state.doc.selectedId || edge.from === state.doc.selectedId,
      )
  const edgeOnlySelected = Boolean(state.doc.selectedEdgeId)
  const currentLine = selectedEdge?.lineType ?? state.doc.defaultLine
  const currentLinePattern = selectedEdge?.linePattern ?? state.doc.defaultLinePattern
  const currentLineColor = selectedEdge?.color ?? '#94a3b8'
  const currentStartCap = selectedEdge?.startCap ?? 'none'
  const currentEndCap = selectedEdge?.endCap ?? 'none'
  const currentFromSide = selectedEdge?.fromSide ?? 'auto'
  const currentToSide = selectedEdge?.toSide ?? 'auto'

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
        onLayout={state.onLayout}
        onTheme={state.setTheme}
        onLocale={state.setLocale}
        onToggleGrid={state.toggleGrid}
        onResetView={state.resetView}
        onAutoAlign={state.autoAlign}
        onAbout={() => state.setAboutOpen(true)}
        onRequestClose={state.requestClose}
        onUndo={state.undo}
        onRedo={state.redo}
        canUndo={state.canUndo}
        canRedo={state.canRedo}
      />

      <main className="workspace">
        <SidePanels
          doc={state.doc}
          selectedNode={selectedNode}
          edgeOnlySelected={edgeOnlySelected}
          currentLine={currentLine}
          currentLinePattern={currentLinePattern}
          currentLineColor={currentLineColor}
          currentStartCap={currentStartCap}
          currentEndCap={currentEndCap}
          currentFromSide={currentFromSide}
          currentToSide={currentToSide}
          theme={state.settings.theme}
          onSelect={state.selectNode}
          onShape={state.onShape}
          onColor={state.onColor}
          onNote={state.onNote}
          onLine={state.onLine}
          onLinePattern={state.onLinePattern}
          onLineColor={state.onLineColor}
          onLineStartCap={state.onLineStartCap}
          onLineEndCap={state.onLineEndCap}
          onLineFromSide={state.onLineFromSide}
          onLineToSide={state.onLineToSide}
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
          onSelectEdge={state.selectEdgeById}
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
        canPaste={state.canPaste}
        canUndo={state.canUndo}
        canRedo={state.canRedo}
        showGrid={state.settings.showGrid}
        onClose={state.hideContext}
        onUndo={state.undo}
        onRedo={state.redo}
        onNew={state.newDoc}
        onOpen={state.openDoc}
        onSave={state.saveDoc}
        onExport={state.exportImage}
        onAutoAlign={state.autoAlign}
        onResetView={state.resetView}
        onToggleGrid={state.toggleGrid}
        onAddText={state.addTextAtContext}
        onAddChild={state.onAddChild}
        onAddSibling={state.onAddSibling}
        onEdit={() => {
          if (state.contextMenu.nodeId) state.setEditingId(state.contextMenu.nodeId)
        }}
        onDuplicate={state.duplicateAtContext}
        onCopy={state.copyAtContext}
        onPaste={state.pasteAtContext}
        onDelete={state.onDelete}
      />

      <AboutDialog open={state.aboutOpen} onClose={() => state.setAboutOpen(false)} />

      <ExportDialog
        open={state.exportOpen}
        onExport={state.runExport}
        onCancel={() => state.setExportOpen(false)}
      />

      <ConfirmCloseDialog
        open={state.closePromptOpen}
        onSave={state.closePromptSave}
        onDiscard={state.closePromptDiscard}
        onCancel={state.closePromptCancel}
      />
    </div>
  )
}
