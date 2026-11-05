import { useTranslation } from 'react-i18next'
import { ContextMenu } from './components/ContextMenu'
import { DiagramCanvas } from './components/DiagramCanvas'
import { AboutDialog, ExportDialog, InputDialog, MessageDialog, UnsavedDialog } from './components/dialogs'
import { GuideDialog } from './components/Guide'
import { PreferencesDialog } from './components/Preferences'
import { SidePanels } from './components/SidePanels'
import { StartScreen } from './components/StartScreen'
import { StatusBar } from './components/StatusBar'
import { Toolbar } from './components/Toolbar'
import { useAppState } from './hooks/useAppState'
import type { AppSettings } from './settings'

export default function App({ initialSettings }: { initialSettings: AppSettings }) {
  const state = useAppState(initialSettings)
  const { t } = useTranslation()
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
  const { settings } = state

  return (
    <div className="app-shell">
      <Toolbar
        doc={state.doc}
        title={state.titleText}
        themeId={settings.theme}
        customThemes={settings.customThemes}
        language={settings.language}
        showGrid={settings.showGrid}
        showStart={state.showStart}
        canUndo={state.canUndo}
        canRedo={state.canRedo}
        onToggleStart={state.toggleStart}
        onNew={state.newDoc}
        onOpen={state.openDoc}
        onSave={state.saveDoc}
        onSaveAs={state.saveDocAs}
        onExport={state.exportImage}
        onMode={state.switchMode}
        onLayout={state.onLayout}
        onTheme={state.setTheme}
        onLanguage={state.setLanguage}
        onToggleGrid={state.toggleGrid}
        onResetView={state.resetView}
        onAutoAlign={state.autoAlign}
        onPreferences={state.openPreferences}
        onGuide={state.openGuide}
        onAbout={() => state.setAboutOpen(true)}
        onRequestClose={state.requestClose}
        onUndo={state.undo}
        onRedo={state.redo}
        onAddChild={state.onAddChild}
        onAddSibling={state.onAddSibling}
        onDelete={state.onDelete}
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
          theme={settings.theme}
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
          showGrid={settings.showGrid}
          theme={settings.theme}
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

        {/* Over the workspace, not instead of it: a diagram opened from here must be fitted to the real canvas. */}
        {state.showStart && (
          <StartScreen
            language={settings.language}
            themeId={settings.theme}
            customThemes={settings.customThemes}
            start={settings.startScreen}
            recent={settings.recent}
            onStart={state.setStart}
            onNew={state.newDoc}
            onOpen={state.openDoc}
            onContinue={state.closeStart}
            onOpenRecent={state.openRecent}
            onOpenSample={state.openSample}
            onRemoveRecent={state.forgetRecent}
            onClearRecent={state.clearRecent}
            onTheme={state.setTheme}
            onPreferences={state.openPreferences}
            onLanguage={() => state.setLanguage(settings.language === 'en' ? 'ko' : 'en')}
            onGuide={state.openGuide}
            onAbout={() => state.setAboutOpen(true)}
            onExit={state.requestClose}
          />
        )}
      </main>

      <StatusBar
        doc={state.doc}
        statusText={state.statusText}
        zoom={state.zoom}
        showGrid={settings.showGrid}
        onToggleGrid={state.toggleGrid}
      />

      <ContextMenu
        menu={state.contextMenu}
        selectedCount={state.doc.selectedIds.length}
        canPaste={state.canPaste}
        canUndo={state.canUndo}
        canRedo={state.canRedo}
        showGrid={settings.showGrid}
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
        onAddText={state.askTextAtContext}
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

      {state.aboutOpen && <AboutDialog onClose={() => state.setAboutOpen(false)} />}

      {state.guideOpen && <GuideDialog language={settings.language} onClose={state.closeGuide} />}

      {state.exportOpen && <ExportDialog onExport={state.runExport} onCancel={() => state.setExportOpen(false)} />}

      {state.prefsTab !== null && (
        <PreferencesDialog
          initialTab={state.prefsTab}
          general={settings.general}
          onGeneral={state.setGeneral}
          showGrid={settings.showGrid}
          onToggleGrid={state.toggleGrid}
          recentCount={settings.recent.length}
          onClearRecent={state.clearRecent}
          language={settings.language}
          onLanguage={state.setLanguage}
          themeId={settings.theme}
          onTheme={state.setTheme}
          customThemes={settings.customThemes}
          onCustomThemes={state.setCustomThemeList}
          start={settings.startScreen}
          onStart={state.setStart}
          onClose={() => state.setPrefsTab(null)}
        />
      )}

      {state.addingText && (
        <InputDialog
          title={t('context.addText')}
          label={t('context.addTextPrompt')}
          initial={t('canvas.centralTopic')}
          onOk={state.addTextAtContext}
          onCancel={() => state.setAddingText(false)}
        />
      )}

      {state.unsavedOpen && (
        <UnsavedDialog
          name={state.docName}
          onSave={state.unsavedSave}
          onDiscard={state.unsavedDiscard}
          onCancel={state.unsavedCancel}
        />
      )}

      {state.message && <MessageDialog message={state.message} onClose={() => state.setMessage(null)} />}
    </div>
  )
}
