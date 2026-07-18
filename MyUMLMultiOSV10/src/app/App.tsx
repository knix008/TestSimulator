import {
  Activity,
  ArrowRight,
  Binary,
  Box,
  Boxes,
  Braces,
  Circle,
  CircleDot,
  Clock3,
  Component,
  GitBranch,
  Info,
  Languages,
  Layers,
  ListTree,
  Moon,
  MousePointer2,
  Network,
  FilePlus2,
  FolderOpen,
  Package,
  PackagePlus,
  Plus,
  Puzzle,
  Save,
  Shapes,
  Square,
  Sun,
  ToggleLeft,
  UserRound,
  Waypoints,
  Workflow,
  ZoomIn,
  ZoomOut,
  type LucideIcon
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { diagramDefinitions, getDiagramDefinition, type ConnectorTool, type DiagramKind, type PaletteTool, type RelationshipKind, type UmlElementKind } from '../uml/diagramRegistry.js';
import { addOwnedElement, addPaletteNode, connectNodes, createDiagramDocument, moveNode, renameEdge, renameNode, renameOwnedElement, updateEdgeMultiplicity, updateEdgeRelationship, updateEdgeRoute, updateOwnedElementKind, type EdgeRoute, type UmlDiagramDocument, type UmlEdge, type UmlNode, type UmlOwnedElementKind } from '../uml/editorModel.js';
import { getUmlConnectorNotation } from '../uml/umlNotation.js';
import { connectorLabels, diagramLabels, diagramScopes, messages, notationHints, type Locale, toolLabels } from './i18n.js';

type Theme = 'light' | 'dark';
type ContextMenuState =
  | { target: 'canvas'; x: number; y: number; canvasX: number; canvasY: number }
  | { target: 'node'; x: number; y: number; nodeId: string }
  | { target: 'edge'; x: number; y: number; edgeId: string };
const projectStorageKey = 'my-uml-multi-os:last-project';
const minimumZoom = 0.5;
const maximumZoom = 2;

interface SavedProjectFile {
  format: 'my-uml-multi-os-project';
  version: 1;
  documents: UmlDiagramDocument[];
  activeDocumentId: string;
}

interface ProjectOpenEvent extends Event {
  detail?: SavedProjectFile;
}

export function App() {
  const [documents, setDocuments] = useState<UmlDiagramDocument[]>(() => [createLocalizedDiagramDocument('class', 'ko')]);
  const [activeDocumentId, setActiveDocumentId] = useState<string>(() => documents[0].id);
  const [selectedTool, setSelectedTool] = useState<PaletteTool | undefined>();
  const [selectedConnector, setSelectedConnector] = useState<ConnectorTool | undefined>();
  const [pendingSourceNodeId, setPendingSourceNodeId] = useState<string | undefined>();
  const [selectedNodeId, setSelectedNodeId] = useState<string | undefined>();
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | undefined>();
  const [selectedOwnedElement, setSelectedOwnedElement] = useState<{ nodeId: string; elementId: string } | undefined>();
  const [connectorPreviewPoint, setConnectorPreviewPoint] = useState<Point | undefined>();
  const [canvasZooms, setCanvasZooms] = useState<Record<string, number>>({});
  const [locale, setLocale] = useState<Locale>('ko');
  const [theme, setTheme] = useState<Theme>('light');
  const [aboutOpen, setAboutOpen] = useState(false);
  const [diagramChooserOpen, setDiagramChooserOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | undefined>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<SVGSVGElement>(null);
  const dragStateRef = useRef<{ nodeId: string; startClientX: number; startClientY: number; startX: number; startY: number } | undefined>(undefined);
  const pendingSourceNodeIdRef = useRef<string | undefined>(undefined);

  const document = documents.find((candidate) => candidate.id === activeDocumentId) ?? documents[0];
  const definition = useMemo(() => getDiagramDefinition(document.kind), [document.kind]);
  const text = messages[locale];
  const selectedNode = document.nodes.find((node) => node.id === selectedNodeId);
  const selectedEdge = document.edges.find((edge) => edge.id === selectedEdgeId);
  const selectedOwnedElementNode = document.nodes.find((node) => node.id === selectedOwnedElement?.nodeId);
  const selectedOwnedElementValue = selectedOwnedElementNode?.ownedElements?.find((element) => element.id === selectedOwnedElement?.elementId);
  const canvasZoom = canvasZooms[document.id] ?? 1;
  const activeMode = selectedConnector ? connectorLabels[locale][selectedConnector.kind] ?? selectedConnector.label : selectedTool ? toolLabels[locale][selectedTool.kind] ?? selectedTool.label : text.pointer;
  const selectionLabel = selectedOwnedElementValue
    ? `${selectedOwnedElementNode?.name ?? text.ownedElements} / ${selectedOwnedElementValue.name}`
    : selectedNode
      ? selectedNode.name
      : selectedEdge
        ? selectedEdge.name
        : text.noSelection;

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        activatePointer();
        setContextMenu(undefined);
        setDiagramChooserOpen(false);
        setAboutOpen(false);
      }
    }

    globalThis.addEventListener('keydown', handleKeyDown);
    return () => globalThis.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    function handleProjectOpen(event: ProjectOpenEvent) {
      const parsed = event.detail;

      if (!parsed || parsed.format !== 'my-uml-multi-os-project' || parsed.version !== 1 || parsed.documents.length === 0) {
        return;
      }

      setDocuments(parsed.documents);
      setActiveDocumentId(parsed.documents.some((candidate) => candidate.id === parsed.activeDocumentId) ? parsed.activeDocumentId : parsed.documents[0].id);
      resetSelection();
    }

    globalThis.addEventListener('my-uml-open-project', handleProjectOpen as EventListener);
    return () => globalThis.removeEventListener('my-uml-open-project', handleProjectOpen as EventListener);
  }, []);

  function updateActiveDocument(updater: (current: UmlDiagramDocument) => UmlDiagramDocument) {
    setDocuments((currentDocuments) => currentDocuments.map((candidate) => (candidate.id === document.id ? updater(candidate) : candidate)));
  }

  function createDiagram(kind: DiagramKind) {
    const nextDocument = createLocalizedDiagramDocument(kind, locale);

    setDocuments((currentDocuments) => [...currentDocuments, nextDocument]);
    setActiveDocumentId(nextDocument.id);
    setDiagramChooserOpen(false);
    resetSelection();
  }

  function activateDocument(documentId: string) {
    setActiveDocumentId(documentId);
    resetSelection();
  }

  function resetSelection() {
    setSelectedTool(undefined);
    setSelectedConnector(undefined);
    pendingSourceNodeIdRef.current = undefined;
    setPendingSourceNodeId(undefined);
    setSelectedNodeId(undefined);
    setSelectedEdgeId(undefined);
    setSelectedOwnedElement(undefined);
    setConnectorPreviewPoint(undefined);
    setContextMenu(undefined);
  }

  function createNewProject() {
    const nextDocument = createLocalizedDiagramDocument('class', locale);

    setDocuments([nextDocument]);
    setActiveDocumentId(nextDocument.id);
    resetSelection();
  }

  function saveProject() {
    const projectFile: SavedProjectFile = {
      format: 'my-uml-multi-os-project',
      version: 1,
      documents,
      activeDocumentId: document.id
    };
    const serializedProject = JSON.stringify(projectFile, null, 2);
    const blob = new Blob([serializedProject], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = globalThis.document.createElement('a');

    globalThis.localStorage.setItem(projectStorageKey, serializedProject);
    link.href = url;
    link.download = `${document.name || 'my-uml-project'}.umlprj`;
    link.style.display = 'none';
    globalThis.document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function openProject(file: File | undefined) {
    if (!file) {
      return;
    }

    const parsed = JSON.parse(await file.text()) as SavedProjectFile;

    if (parsed.format !== 'my-uml-multi-os-project' || parsed.version !== 1 || parsed.documents.length === 0) {
      throw new Error('Unsupported My UML Multi OS project file.');
    }

    setDocuments(parsed.documents);
    setActiveDocumentId(parsed.documents.some((candidate) => candidate.id === parsed.activeDocumentId) ? parsed.activeDocumentId : parsed.documents[0].id);
    resetSelection();
  }

  function switchLocale(nextLocale: Locale) {
    const currentDefaultNames = Object.values(diagramLabels.en).concat(Object.values(diagramLabels.ko));

    setLocale(nextLocale);
    setDocuments((currentDocuments) =>
      currentDocuments.map((candidate) => ({
        ...candidate,
        name: currentDefaultNames.includes(candidate.name) ? diagramLabels[nextLocale][candidate.kind] : candidate.name
      }))
    );
  }

  function addNodeAtCanvas(event: React.MouseEvent<SVGSVGElement>) {
    setContextMenu(undefined);

    if (!selectedTool) {
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    const x = Math.round((event.clientX - bounds.left) / canvasZoom - 70);
    const y = Math.round((event.clientY - bounds.top) / canvasZoom - 32);
    const nextDocument = addPaletteNode(document, selectedTool, Math.max(24, x), Math.max(24, y));

    updateActiveDocument(() => nextDocument);
    setSelectedNodeId(nextDocument.nodes[nextDocument.nodes.length - 1].id);
    setSelectedEdgeId(undefined);
    setSelectedOwnedElement(undefined);
  }

  function addNodeFromContext(tool: PaletteTool, x: number, y: number) {
    const nextDocument = addPaletteNode(document, tool, Math.max(24, Math.round(x - 70)), Math.max(24, Math.round(y - 32)));

    updateActiveDocument(() => nextDocument);
    setSelectedNodeId(nextDocument.nodes[nextDocument.nodes.length - 1].id);
    setSelectedEdgeId(undefined);
    setSelectedOwnedElement(undefined);
    setContextMenu(undefined);
  }

  function activatePointer() {
    setSelectedTool(undefined);
    setSelectedConnector(undefined);
    pendingSourceNodeIdRef.current = undefined;
    setPendingSourceNodeId(undefined);
    setConnectorPreviewPoint(undefined);
  }

  function selectNode(nodeId: string) {
    setContextMenu(undefined);

    if (!selectedConnector) {
      pendingSourceNodeIdRef.current = undefined;
      setSelectedNodeId(nodeId);
      setSelectedEdgeId(undefined);
      setSelectedOwnedElement(undefined);
      setConnectorPreviewPoint(undefined);
      return;
    }

    const pendingSourceNodeIdValue = pendingSourceNodeIdRef.current;

    if (!pendingSourceNodeIdValue) {
      pendingSourceNodeIdRef.current = nodeId;
      setPendingSourceNodeId(nodeId);
      setSelectedNodeId(nodeId);
      setSelectedEdgeId(undefined);
      setSelectedOwnedElement(undefined);
      setConnectorPreviewPoint(centerOf(document.nodes.find((node) => node.id === nodeId) ?? document.nodes[0]));
      return;
    }

    const nextDocument = connectNodes(document, selectedConnector, pendingSourceNodeIdValue, nodeId);

    updateActiveDocument(() => nextDocument);
    pendingSourceNodeIdRef.current = undefined;
    setPendingSourceNodeId(undefined);
    setConnectorPreviewPoint(undefined);
    setSelectedNodeId(undefined);
    setSelectedEdgeId(nextDocument.edges[nextDocument.edges.length - 1]?.id);
    setSelectedOwnedElement(undefined);
  }

  function selectEdge(edgeId: string) {
    setContextMenu(undefined);
    setSelectedNodeId(undefined);
    setSelectedEdgeId(edgeId);
    setSelectedOwnedElement(undefined);
    pendingSourceNodeIdRef.current = undefined;
    setPendingSourceNodeId(undefined);
    setConnectorPreviewPoint(undefined);
  }

  function selectOwnedElement(nodeId: string, elementId: string) {
    setContextMenu(undefined);
    setSelectedNodeId(nodeId);
    setSelectedEdgeId(undefined);
    setSelectedOwnedElement({ nodeId, elementId });
    pendingSourceNodeIdRef.current = undefined;
    setPendingSourceNodeId(undefined);
    setConnectorPreviewPoint(undefined);
  }

  function addElementToSelectedNode(kind: UmlOwnedElementKind) {
    if (!selectedNode) {
      return;
    }

    const nextDocument = addOwnedElement(document, selectedNode.id, kind);
    const nextNode = nextDocument.nodes.find((node) => node.id === selectedNode.id);
    const nextElement = nextNode?.ownedElements?.[nextNode.ownedElements.length - 1];

    updateActiveDocument(() => nextDocument);
    if (nextElement) {
      setSelectedOwnedElement({ nodeId: selectedNode.id, elementId: nextElement.id });
    }
  }

  function addElementToNode(nodeId: string, kind: UmlOwnedElementKind) {
    const nextDocument = addOwnedElement(document, nodeId, kind);
    const nextNode = nextDocument.nodes.find((node) => node.id === nodeId);
    const nextElement = nextNode?.ownedElements?.[nextNode.ownedElements.length - 1];

    updateActiveDocument(() => nextDocument);
    setSelectedNodeId(nodeId);
    setSelectedEdgeId(undefined);
    if (nextElement) {
      setSelectedOwnedElement({ nodeId, elementId: nextElement.id });
    }
    setContextMenu(undefined);
  }

  function deleteNode(nodeId: string) {
    updateActiveDocument((current) => ({
      ...current,
      nodes: current.nodes.filter((node) => node.id !== nodeId),
      edges: current.edges.filter((edge) => edge.sourceId !== nodeId && edge.targetId !== nodeId)
    }));
    resetSelection();
  }

  function deleteEdge(edgeId: string) {
    updateActiveDocument((current) => ({ ...current, edges: current.edges.filter((edge) => edge.id !== edgeId) }));
    resetSelection();
  }

  function deleteOwnedElement(nodeId: string, elementId: string) {
    updateActiveDocument((current) => ({
      ...current,
      nodes: current.nodes.map((node) => (node.id === nodeId ? { ...node, ownedElements: (node.ownedElements ?? []).filter((element) => element.id !== elementId) } : node))
    }));
    resetSelection();
  }

  function deleteSelection() {
    if (selectedOwnedElement) {
      deleteOwnedElement(selectedOwnedElement.nodeId, selectedOwnedElement.elementId);
      return;
    }

    if (selectedNodeId) {
      deleteNode(selectedNodeId);
      return;
    }

    if (selectedEdgeId) {
      deleteEdge(selectedEdgeId);
    }
  }

  function openCanvasContextMenu(event: React.MouseEvent<SVGSVGElement>) {
    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();

    setContextMenu({
      target: 'canvas',
      x: event.clientX,
      y: event.clientY,
      canvasX: (event.clientX - bounds.left) / canvasZoom,
      canvasY: (event.clientY - bounds.top) / canvasZoom
    });
  }

  function openNodeContextMenu(event: React.MouseEvent<SVGGElement>, nodeId: string) {
    event.preventDefault();
    event.stopPropagation();
    pendingSourceNodeIdRef.current = undefined;
    setPendingSourceNodeId(undefined);
    setConnectorPreviewPoint(undefined);
    setSelectedNodeId(nodeId);
    setSelectedEdgeId(undefined);
    setSelectedOwnedElement(undefined);
    setContextMenu({ target: 'node', x: event.clientX, y: event.clientY, nodeId });
  }

  function openEdgeContextMenu(event: React.MouseEvent<SVGGElement>, edgeId: string) {
    event.preventDefault();
    event.stopPropagation();
    setSelectedNodeId(undefined);
    setSelectedEdgeId(edgeId);
    setSelectedOwnedElement(undefined);
    pendingSourceNodeIdRef.current = undefined;
    setPendingSourceNodeId(undefined);
    setConnectorPreviewPoint(undefined);
    setContextMenu({ target: 'edge', x: event.clientX, y: event.clientY, edgeId });
  }

  function handleNodePointerDown(event: React.PointerEvent<SVGGElement>, node: UmlNode) {
    event.stopPropagation();
    selectNode(node.id);

    if (selectedConnector) {
      return;
    }

    dragStateRef.current = {
      nodeId: node.id,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: node.x,
      startY: node.y
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleCanvasPointerMove(event: React.PointerEvent<SVGElement>) {
    const dragState = dragStateRef.current;

    if (!dragState) {
      if (selectedConnector && pendingSourceNodeIdRef.current && canvasRef.current) {
        const bounds = canvasRef.current.getBoundingClientRect();
        setConnectorPreviewPoint({
          x: (event.clientX - bounds.left) / canvasZoom,
          y: (event.clientY - bounds.top) / canvasZoom
        });
      }

      return;
    }

    const nextX = Math.max(0, Math.round(dragState.startX + (event.clientX - dragState.startClientX) / canvasZoom));
    const nextY = Math.max(0, Math.round(dragState.startY + (event.clientY - dragState.startClientY) / canvasZoom));
    updateActiveDocument((current) => moveNode(current, dragState.nodeId, nextX, nextY));
  }

  function handleCanvasWheel(event: React.WheelEvent<SVGSVGElement>) {
    event.preventDefault();
    setContextMenu(undefined);
    updateCanvasZoom(event.deltaY < 0 ? 0.1 : -0.1);
  }

  function stopDragging() {
    dragStateRef.current = undefined;
  }

  function updateCanvasZoom(delta: number) {
    setCanvasZooms((current) => ({
      ...current,
      [document.id]: clampZoom((current[document.id] ?? 1) + delta)
    }));
  }

  function resetCanvasZoom() {
    setCanvasZooms((current) => ({ ...current, [document.id]: 1 }));
  }

  function findNodeName(nodeId: string): string {
    return document.nodes.find((node) => node.id === nodeId)?.name ?? nodeId;
  }

  return (
    <main className="shell" data-theme={theme} lang={locale} onClick={() => setContextMenu(undefined)}>
      <header className="topbar">
        <div>
          <span className="eyebrow">{text.eyebrow}</span>
          <h1>My UML Multi OS</h1>
        </div>
        <div className="top-actions" aria-label={text.projectActions}>
          <input ref={fileInputRef} className="file-input" type="file" accept=".umlprj,.json,application/json" onChange={(event) => { void openProject(event.currentTarget.files?.[0]); event.currentTarget.value = ''; }} />
          <button type="button" title={text.newProject} aria-label={text.newProject} onClick={createNewProject} className="text-button">
            <FilePlus2 size={18} />
            <span>{text.newProject}</span>
          </button>
          <button type="button" title={text.openProject} aria-label={text.openProject} onClick={() => fileInputRef.current?.click()} className="text-button">
            <FolderOpen size={18} />
            <span>{text.openProject}</span>
          </button>
          <button type="button" title={text.save} aria-label={text.save} onClick={saveProject} className="text-button">
            <Save size={18} />
            <span>{text.save}</span>
          </button>
          <button type="button" title={text.addDiagram} aria-label={text.addDiagram} onClick={() => setDiagramChooserOpen(true)} className="text-button">
            <Plus size={18} />
            <span>{text.addDiagram}</span>
          </button>
          <button type="button" className="icon-button" title={text.zoomOut} aria-label={text.zoomOut} onClick={() => updateCanvasZoom(-0.1)}>
            <ZoomOut size={17} />
          </button>
          <button type="button" className="zoom-value" title={text.resetZoom} aria-label={text.resetZoom} onClick={resetCanvasZoom}>{Math.round(canvasZoom * 100)}%</button>
          <button type="button" className="icon-button" title={text.zoomIn} aria-label={text.zoomIn} onClick={() => updateCanvasZoom(0.1)}>
            <ZoomIn size={17} />
          </button>
          <button type="button" className="text-button" onClick={() => switchLocale(locale === 'ko' ? 'en' : 'ko')}>
            <Languages size={17} />
            <span>{locale === 'ko' ? text.english : text.korean}</span>
          </button>
          <button type="button" className="text-button" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
            {theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}
            <span>{theme === 'light' ? text.dark : text.light}</span>
          </button>
        </div>
        <button type="button" title={text.about} aria-label={text.about} onClick={() => setAboutOpen(true)} className="text-button about-toolbar-button">
          <Info size={17} />
          <span>{text.about}</span>
        </button>
      </header>

      <section className="workspace">
        <aside className="palette" aria-label={text.palette}>
          <div className="panel-heading">
            <PackagePlus size={18} />
            <span>{text.palette}</span>
          </div>
          <button type="button" title={text.pointer} aria-label={text.pointer} onClick={activatePointer} className={!selectedTool && !selectedConnector ? 'tool active' : 'tool'}>
            <MousePointer2 size={16} />
            <span>{text.pointer}</span>
          </button>
          {definition.palette.map((tool) => (
            <button key={`${definition.kind}-${tool.kind}-${tool.label}`} type="button" className={selectedTool?.label === tool.label ? 'tool active' : 'tool'} onClick={() => { setSelectedTool(tool); setSelectedConnector(undefined); pendingSourceNodeIdRef.current = undefined; setPendingSourceNodeId(undefined); }}>
              <ToolIcon kind={tool.kind} size={16} />
              <span>{toolLabels[locale][tool.kind] ?? tool.label}</span>
            </button>
          ))}
          <div className="panel-heading connector-heading">
            <ArrowRight size={18} />
            <span>{text.connectors}</span>
          </div>
          {definition.connectors.map((connector) => (
            <button key={`${definition.kind}-${connector.kind}-${connector.label}`} type="button" className={selectedConnector?.label === connector.label ? 'tool active' : 'tool'} onClick={() => { setSelectedConnector(connector); setSelectedTool(undefined); pendingSourceNodeIdRef.current = undefined; setPendingSourceNodeId(undefined); }}>
              <ConnectorIcon kind={connector.kind} size={16} />
              <span>{connectorLabels[locale][connector.kind] ?? connector.label}</span>
            </button>
          ))}
          {selectedConnector ? <p className="mode-hint">{pendingSourceNodeId ? text.connectTarget : text.connectSource}</p> : null}
        </aside>

        <section className="editor">
          <div className="document-tabs" role="tablist" aria-label={text.openDiagrams}>
            {documents.map((candidate) => (
              <button key={candidate.id} type="button" role="tab" aria-selected={candidate.id === document.id} className={candidate.id === document.id ? 'document-tab active' : 'document-tab'} onClick={() => activateDocument(candidate.id)}>
                <DiagramIcon kind={candidate.kind} size={15} />
                <span>{candidate.name}</span>
              </button>
            ))}
          </div>
          <div className="editor-header">
            <div>
              <h2>{document.name}</h2>
              <p>{diagramScopes[locale][definition.kind]}</p>
            </div>
            <code>{definition.papyrusDiagramId}</code>
          </div>

          <svg ref={canvasRef} className="canvas" role="application" aria-label={`${document.name} ${text.canvasSuffix}`} onClick={addNodeAtCanvas} onContextMenu={openCanvasContextMenu} onWheel={handleCanvasWheel} onPointerMove={handleCanvasPointerMove} onPointerUp={stopDragging} onPointerLeave={stopDragging}>
            <defs>
              <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
                <path className="grid-line" d="M 24 0 L 0 0 0 24" fill="none" strokeWidth="1" />
              </pattern>
              <marker id="line-arrow" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto" markerUnits="strokeWidth">
                <path d="M2 2 L10 6 L2 10" className="arrow-marker" />
              </marker>
              <marker id="triangle-arrow" markerWidth="14" markerHeight="14" refX="12" refY="7" orient="auto" markerUnits="strokeWidth">
                <path d="M2 2 L12 7 L2 12 Z" className="hollow-arrow-marker" />
              </marker>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
            <g transform={`scale(${canvasZoom})`}>
              {document.edges.map((edge) => (
                <DiagramEdge key={edge.id} edge={edge} nodes={document.nodes} selected={edge.id === selectedEdgeId} onSelect={() => selectEdge(edge.id)} onContextMenu={(event: React.MouseEvent<SVGGElement>) => openEdgeContextMenu(event, edge.id)} />
              ))}
              {selectedConnector && pendingSourceNodeId && connectorPreviewPoint ? <ConnectorPreview source={document.nodes.find((node) => node.id === pendingSourceNodeId)} target={connectorPreviewPoint} connector={selectedConnector} /> : null}
              {document.nodes.map((node) => (
                <DiagramNode key={node.id} node={node} selected={node.id === selectedNodeId || node.id === pendingSourceNodeId} selectedOwnedElementId={selectedOwnedElement?.nodeId === node.id ? selectedOwnedElement.elementId : undefined} onPointerDown={(event) => handleNodePointerDown(event, node)} onPointerMove={handleCanvasPointerMove} onPointerUp={stopDragging} onOwnedElementSelect={(elementId) => selectOwnedElement(node.id, elementId)} onContextMenu={(event: React.MouseEvent<SVGGElement>) => openNodeContextMenu(event, node.id)} />
              ))}
            </g>
          </svg>
        </section>

        <aside className="inspector" aria-label={text.properties}>
          <section className="tree-panel" aria-label={text.modelTree}>
            <div className="panel-heading">
              <ListTree size={18} />
              <span>{text.modelTree}</span>
            </div>
            <button type="button" className={!selectedNode && !selectedEdge && !selectedOwnedElementValue ? 'tree-item active' : 'tree-item'} onClick={() => { setSelectedNodeId(undefined); setSelectedEdgeId(undefined); setSelectedOwnedElement(undefined); }}>
              <DiagramIcon kind={definition.kind} size={16} />
              <span>{document.name}</span>
            </button>
            <div className="tree-group">{text.nodes}</div>
            {document.nodes.map((node) => (
              <div key={node.id}>
                <button type="button" className={selectedNodeId === node.id && !selectedOwnedElementValue ? 'tree-item child active' : 'tree-item child'} onClick={() => selectNode(node.id)}>
                  <ToolIcon kind={node.kind} size={15} />
                  <span>{node.name}</span>
                </button>
                {(node.ownedElements ?? []).map((element) => (
                  <button key={element.id} type="button" className={selectedOwnedElement?.elementId === element.id ? 'tree-item grandchild active' : 'tree-item grandchild'} onClick={() => selectOwnedElement(node.id, element.id)}>
                    <Braces size={14} />
                    <span>{element.name}</span>
                  </button>
                ))}
              </div>
            ))}
            <div className="tree-group">{text.edges}</div>
            {document.edges.map((edge) => (
              <button key={edge.id} type="button" className={selectedEdgeId === edge.id ? 'tree-item child active' : 'tree-item child'} onClick={() => selectEdge(edge.id)}>
                <ConnectorIcon kind={edge.kind} size={15} />
                <span>{edge.name}</span>
              </button>
            ))}
          </section>

          <section className="properties" aria-label={text.properties}>
            <div className="panel-heading">
              <Braces size={18} />
              <span>{text.properties}</span>
            </div>
            <label>
              {text.diagram}
              <input value={document.name} onChange={(event) => updateActiveDocument((current) => ({ ...current, name: event.target.value }))} />
            </label>
            <label>
              {text.papyrusNotation}
              <textarea readOnly value={notationHints[locale][definition.kind]} />
            </label>
            {selectedNode ? (
              <>
                <label>
                  {text.name}
                  <input value={selectedNode.name} onChange={(event) => updateActiveDocument((current) => renameNode(current, selectedNode.id, event.target.value))} />
                </label>
                <label>
                  {text.umlType}
                  <input readOnly value={selectedNode.umlType} />
                </label>
                <div className="element-actions">
                  <span>{text.ownedElements}</span>
                  <select aria-label={text.elementType} onChange={(event) => addElementToSelectedNode(event.target.value as UmlOwnedElementKind)} value="">
                    <option value="" disabled>{text.addElement}</option>
                    {ownedElementKindsForNode(selectedNode).map((kind) => (
                      <option key={kind} value={kind}>{ownedElementLabels[locale][kind]}</option>
                    ))}
                  </select>
                </div>
                {(selectedNode.ownedElements ?? []).length > 0 ? (
                  <div className="owned-element-list" aria-label={text.ownedElements}>
                    {(selectedNode.ownedElements ?? []).map((element) => (
                      <div key={element.id} className={selectedOwnedElement?.elementId === element.id ? 'owned-element-row active' : 'owned-element-row'} onClick={() => selectOwnedElement(selectedNode.id, element.id)}>
                        <select aria-label={text.elementType} value={element.kind} onChange={(event) => updateActiveDocument((current) => updateOwnedElementKind(current, selectedNode.id, element.id, event.target.value as UmlOwnedElementKind))}>
                          {ownedElementKindsForNode(selectedNode).map((kind) => (
                            <option key={kind} value={kind}>{ownedElementLabels[locale][kind]}</option>
                          ))}
                        </select>
                        <input aria-label={text.name} value={element.name} onChange={(event) => updateActiveDocument((current) => renameOwnedElement(current, selectedNode.id, element.id, event.target.value))} />
                        <input aria-label={text.umlType} readOnly value={element.umlType} />
                      </div>
                    ))}
                  </div>
                ) : null}
              </>
            ) : null}
            {selectedOwnedElementValue && selectedOwnedElementNode ? (
              <>
                <label>
                  {text.elementOwner}
                  <input readOnly value={selectedOwnedElementNode.name} />
                </label>
                <label>
                  {text.name}
                  <input value={selectedOwnedElementValue.name} onChange={(event) => updateActiveDocument((current) => renameOwnedElement(current, selectedOwnedElementNode.id, selectedOwnedElementValue.id, event.target.value))} />
                </label>
                <label>
                  {text.elementType}
                  <select value={selectedOwnedElementValue.kind} onChange={(event) => updateActiveDocument((current) => updateOwnedElementKind(current, selectedOwnedElementNode.id, selectedOwnedElementValue.id, event.target.value as UmlOwnedElementKind))}>
                    {ownedElementKindsForNode(selectedOwnedElementNode).map((kind) => (
                      <option key={kind} value={kind}>{ownedElementLabels[locale][kind]}</option>
                    ))}
                  </select>
                </label>
                <label>
                  {text.umlType}
                  <input readOnly value={selectedOwnedElementValue.umlType} />
                </label>
              </>
            ) : null}
            {selectedEdge ? (
              <>
                <label>
                  {text.name}
                  <input value={selectedEdge.name} onChange={(event) => updateActiveDocument((current) => renameEdge(current, selectedEdge.id, event.target.value))} />
                </label>
                <label>
                  {text.relationship}
                  <select value={selectedEdge.kind} onChange={(event) => updateActiveDocument((current) => updateEdgeRelationship(current, selectedEdge.id, definition.connectors.find((connector) => connector.kind === event.target.value) ?? definition.connectors[0]))}>
                    {definition.connectors.map((connector) => (
                      <option key={connector.kind} value={connector.kind}>{connectorLabels[locale][connector.kind] ?? connector.label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  {text.lineStyle}
                  <select value={selectedEdge.route} onChange={(event) => updateActiveDocument((current) => updateEdgeRoute(current, selectedEdge.id, event.target.value as EdgeRoute))}>
                    <option value="straight">{text.straight}</option>
                    <option value="orthogonal">{text.orthogonal}</option>
                    <option value="curve">{text.curve}</option>
                  </select>
                </label>
                {supportsMultiplicity(selectedEdge.kind) ? (
                  <>
                    <label>
                      {text.sourceMultiplicity}
                      <input value={selectedEdge.sourceMultiplicity ?? ''} onChange={(event) => updateActiveDocument((current) => updateEdgeMultiplicity(current, selectedEdge.id, 'source', event.target.value))} />
                    </label>
                    <label>
                      {text.targetMultiplicity}
                      <input value={selectedEdge.targetMultiplicity ?? ''} onChange={(event) => updateActiveDocument((current) => updateEdgeMultiplicity(current, selectedEdge.id, 'target', event.target.value))} />
                    </label>
                  </>
                ) : null}
                <label>
                  {text.umlType}
                  <input readOnly value={selectedEdge.umlType} />
                </label>
                <label>
                  {text.source}
                  <input readOnly value={findNodeName(selectedEdge.sourceId)} />
                </label>
                <label>
                  {text.target}
                  <input readOnly value={findNodeName(selectedEdge.targetId)} />
                </label>
              </>
            ) : null}
            {!selectedNode && !selectedEdge && !selectedOwnedElementValue ? <p className="empty-state">{text.emptySelection}</p> : null}
          </section>
        </aside>
      </section>
      {contextMenu ? (
        <div className="context-menu" role="menu" aria-label={text.contextMenu} style={{ left: contextMenu.x, top: contextMenu.y }} onClick={(event) => event.stopPropagation()}>
          {contextMenu.target === 'canvas' ? (
            <>
              <div className="context-menu-heading">{text.addElement}</div>
              {definition.palette.map((tool) => (
                <button key={`context-${definition.kind}-${tool.kind}-${tool.label}`} type="button" role="menuitem" onClick={() => addNodeFromContext(tool, contextMenu.canvasX, contextMenu.canvasY)}>
                  <ToolIcon kind={tool.kind} size={14} />
                  <span>{toolLabels[locale][tool.kind] ?? tool.label}</span>
                </button>
              ))}
              <div className="context-menu-heading">{text.connectors}</div>
              {definition.connectors.map((connector) => (
                <button key={`context-${definition.kind}-${connector.kind}-${connector.label}`} type="button" role="menuitem" onClick={() => { setSelectedConnector(connector); setSelectedTool(undefined); pendingSourceNodeIdRef.current = undefined; setPendingSourceNodeId(undefined); setConnectorPreviewPoint(undefined); setContextMenu(undefined); }}>
                  <ConnectorIcon kind={connector.kind} size={14} />
                  <span>{connectorLabels[locale][connector.kind] ?? connector.label}</span>
                </button>
              ))}
              {selectedNodeId || selectedEdgeId || selectedOwnedElement ? <button type="button" role="menuitem" className="danger-menu-item" onClick={deleteSelection}>{text.deleteSelected}</button> : null}
            </>
          ) : null}
          {contextMenu.target === 'node' ? (
            <>
              <button type="button" role="menuitem" onClick={() => selectNode(contextMenu.nodeId)}>{text.select}</button>
              <div className="context-menu-heading">{text.ownedElements}</div>
              {ownedElementKindsForNode(document.nodes.find((node) => node.id === contextMenu.nodeId) ?? document.nodes[0]).map((kind) => (
                <button key={`owned-${kind}`} type="button" role="menuitem" onClick={() => addElementToNode(contextMenu.nodeId, kind)}>{ownedElementLabels[locale][kind]}</button>
              ))}
              <button type="button" role="menuitem" className="danger-menu-item" onClick={() => deleteNode(contextMenu.nodeId)}>{text.deleteSelected}</button>
            </>
          ) : null}
          {contextMenu.target === 'edge' ? (
            <>
              <button type="button" role="menuitem" onClick={() => selectEdge(contextMenu.edgeId)}>{text.select}</button>
              <div className="context-menu-heading">{text.lineStyle}</div>
              <button type="button" role="menuitem" onClick={() => { updateActiveDocument((current) => updateEdgeRoute(current, contextMenu.edgeId, 'straight')); setContextMenu(undefined); }}>{text.straight}</button>
              <button type="button" role="menuitem" onClick={() => { updateActiveDocument((current) => updateEdgeRoute(current, contextMenu.edgeId, 'orthogonal')); setContextMenu(undefined); }}>{text.orthogonal}</button>
              <button type="button" role="menuitem" onClick={() => { updateActiveDocument((current) => updateEdgeRoute(current, contextMenu.edgeId, 'curve')); setContextMenu(undefined); }}>{text.curve}</button>
              <button type="button" role="menuitem" className="danger-menu-item" onClick={() => deleteEdge(contextMenu.edgeId)}>{text.deleteSelected}</button>
            </>
          ) : null}
        </div>
      ) : null}
      {aboutOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setAboutOpen(false)}>
          <section className="about-dialog" role="dialog" aria-modal="true" aria-labelledby="about-title" onClick={(event) => event.stopPropagation()}>
            <div className="panel-heading">
              <Info size={18} />
              <span id="about-title">{text.about}</span>
            </div>
            <img className="about-app-icon" src="/app-icon.svg" alt="My UML Multi OS" />
            <h2>My UML Multi OS</h2>
            <p>{text.aboutDescription}</p>
            <p>{text.copyright}</p>
            <p>{text.authorCredit}</p>
            <button type="button" className="text-button about-close" onClick={() => setAboutOpen(false)}>
              <span>{text.close}</span>
            </button>
          </section>
        </div>
      ) : null}
      {diagramChooserOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setDiagramChooserOpen(false)}>
          <section className="diagram-chooser" role="dialog" aria-modal="true" aria-labelledby="diagram-chooser-title" onClick={(event) => event.stopPropagation()}>
            <div className="panel-heading">
              <Plus size={18} />
              <span id="diagram-chooser-title">{text.chooseDiagram}</span>
            </div>
            <div className="diagram-choice-grid">
              {diagramDefinitions.map((diagram) => (
                <button key={diagram.kind} type="button" className="diagram-choice" onClick={() => createDiagram(diagram.kind)}>
                  <DiagramIcon kind={diagram.kind} size={18} />
                  <span>{diagramLabels[locale][diagram.kind]}</span>
                </button>
              ))}
            </div>
            <button type="button" className="text-button about-close" onClick={() => setDiagramChooserOpen(false)}>
              <span>{text.close}</span>
            </button>
          </section>
        </div>
      ) : null}
      <footer className="status-bar" aria-label={text.statusBar}>
        <span>{document.name}</span>
        <span>{diagramLabels[locale][definition.kind]}</span>
        <span>{text.statusMode}: {activeMode}</span>
        <span>{text.statusSelection}: {selectionLabel}</span>
        <span>{text.nodes}: {document.nodes.length}</span>
        <span>{text.edges}: {document.edges.length}</span>
        <span>{Math.round(canvasZoom * 100)}%</span>
        <span>{theme === 'dark' ? text.dark : text.light}</span>
      </footer>
    </main>
  );
}

const diagramIconMap: Record<DiagramKind, LucideIcon> = {
  class: Shapes,
  profile: Braces,
  package: Package,
  object: Box,
  compositeStructure: Boxes,
  component: Component,
  deployment: Network,
  useCase: UserRound,
  sequence: Workflow,
  communication: GitBranch,
  activity: Activity,
  stateMachine: ToggleLeft,
  timing: Clock3
};

const toolIconMap: Partial<Record<UmlElementKind, LucideIcon>> = {
  package: Package,
  class: Square,
  interface: Circle,
  dataType: Binary,
  enumeration: Layers,
  profile: Braces,
  stereotype: Puzzle,
  instanceSpecification: Box,
  component: Component,
  artifact: Package,
  node: Network,
  device: Box,
  executionEnvironment: Boxes,
  actor: UserRound,
  useCase: Circle,
  lifeline: Workflow,
  message: Waypoints,
  action: Activity,
  decisionNode: GitBranch,
  initialNode: CircleDot,
  finalNode: CircleDot,
  state: ToggleLeft,
  pseudostate: CircleDot,
  timeObservation: Clock3
};

function DiagramIcon({ kind, size }: { kind: DiagramKind; size: number }) {
  const Icon = diagramIconMap[kind];
  return <Icon size={size} />;
}

function ToolIcon({ kind, size }: { kind: UmlElementKind; size: number }) {
  const Icon = toolIconMap[kind] ?? Waypoints;
  return <Icon size={size} />;
}

function ConnectorIcon({ kind, size }: { kind: RelationshipKind; size: number }) {
  const notation = getUmlConnectorNotation(kind);
  const dashArray = notation.dashed ? '3 3' : undefined;

  return (
    <svg width={size + 12} height={size} viewBox="0 0 28 16" aria-hidden="true" className="connector-glyph">
      <line x1="2" y1="8" x2={notation.marker === 'none' ? 26 : 20} y2="8" strokeDasharray={dashArray} />
      {notation.marker === 'openArrow' ? <path d="M19 4 L25 8 L19 12" /> : null}
      {notation.marker === 'hollowTriangle' ? <path d="M18 3 L26 8 L18 13 Z" /> : null}
    </svg>
  );
}

function DiagramEdge({ edge, nodes, selected, onSelect, onContextMenu }: { edge: UmlEdge; nodes: UmlNode[]; selected: boolean; onSelect: () => void; onContextMenu: (event: React.MouseEvent<SVGGElement>) => void }) {
  const source = nodes.find((node) => node.id === edge.sourceId);
  const target = nodes.find((node) => node.id === edge.targetId);

  if (!source || !target) {
    return null;
  }

  const sourceCenter = centerOf(source);
  const targetCenter = centerOf(target);
  const className = selected ? 'edge selected' : 'edge';
  const notation = getUmlConnectorNotation(edge.kind);
  const sourcePoint = notation.marker === 'none' ? boundaryPoint(source, targetCenter) : orthogonalBoundaryPoint(source, targetCenter);
  const targetPoint = notation.marker === 'none' ? boundaryPoint(target, sourceCenter) : orthogonalBoundaryPoint(target, sourceCenter);
  const markerEnd = notation.marker === 'hollowTriangle' ? 'url(#triangle-arrow)' : notation.marker === 'openArrow' ? 'url(#line-arrow)' : undefined;
  const label = notation.stereotype ? `«${notation.stereotype}»` : edge.name;
  const sourceMultiplicityPoint = pointBetween(sourcePoint, targetPoint, 0.18, -12);
  const targetMultiplicityPoint = pointBetween(sourcePoint, targetPoint, 0.82, -12);

  return (
    <g className={className} onClick={(event) => { event.stopPropagation(); onSelect(); }} onContextMenu={onContextMenu}>
      <path d={edgePath(edge.route, sourcePoint, targetPoint, notation.marker !== 'none')} markerEnd={markerEnd} strokeDasharray={notation.dashed ? '8 5' : undefined} />
      <text x={(sourcePoint.x + targetPoint.x) / 2} y={(sourcePoint.y + targetPoint.y) / 2 - 8} textAnchor="middle">{label}</text>
      {supportsMultiplicity(edge.kind) && edge.sourceMultiplicity ? <text className="multiplicity" x={sourceMultiplicityPoint.x} y={sourceMultiplicityPoint.y} textAnchor="middle">{edge.sourceMultiplicity}</text> : null}
      {supportsMultiplicity(edge.kind) && edge.targetMultiplicity ? <text className="multiplicity" x={targetMultiplicityPoint.x} y={targetMultiplicityPoint.y} textAnchor="middle">{edge.targetMultiplicity}</text> : null}
    </g>
  );
}

function ConnectorPreview({ source, target, connector }: { source: UmlNode | undefined; target: Point; connector: ConnectorTool }) {
  if (!source) {
    return null;
  }

  const notation = getUmlConnectorNotation(connector.kind);
  const sourcePoint = notation.marker === 'none' ? boundaryPoint(source, target) : orthogonalBoundaryPoint(source, target);
  const markerEnd = notation.marker === 'hollowTriangle' ? 'url(#triangle-arrow)' : notation.marker === 'openArrow' ? 'url(#line-arrow)' : undefined;

  return (
    <g className="edge preview-edge">
      <path d={edgePath('straight', sourcePoint, target, notation.marker !== 'none')} markerEnd={markerEnd} strokeDasharray={notation.dashed ? '8 5' : undefined} />
      <text x={(sourcePoint.x + target.x) / 2} y={(sourcePoint.y + target.y) / 2 - 8} textAnchor="middle">{notation.stereotype ? `«${notation.stereotype}»` : connector.label}</text>
    </g>
  );
}

function edgePath(route: EdgeRoute, source: Point, target: Point, forceOrthogonal: boolean): string {
  if (route === 'orthogonal' || forceOrthogonal) {
    const middleX = (source.x + target.x) / 2;
    return `M ${source.x} ${source.y} L ${middleX} ${source.y} L ${middleX} ${target.y} L ${target.x} ${target.y}`;
  }

  if (route === 'curve') {
    const controlX = (source.x + target.x) / 2;
    const controlY = Math.min(source.y, target.y) - 80;
    return `M ${source.x} ${source.y} Q ${controlX} ${controlY} ${target.x} ${target.y}`;
  }

  return `M ${source.x} ${source.y} L ${target.x} ${target.y}`;
}

interface Point {
  x: number;
  y: number;
}

function centerOf(node: UmlNode): Point {
  return {
    x: node.x + node.width / 2,
    y: node.y + node.height / 2
  };
}

function boundaryPoint(node: UmlNode, toward: Point): Point {
  const center = centerOf(node);
  const deltaX = toward.x - center.x;
  const deltaY = toward.y - center.y;

  if (deltaX === 0 && deltaY === 0) {
    return center;
  }

  if (node.kind === 'useCase') {
    const radiusX = node.width / 2;
    const radiusY = node.height / 2;
    const scale = 1 / Math.sqrt((deltaX * deltaX) / (radiusX * radiusX) + (deltaY * deltaY) / (radiusY * radiusY));

    return {
      x: center.x + deltaX * scale,
      y: center.y + deltaY * scale
    };
  }

  const halfWidth = node.width / 2;
  const halfHeight = node.height / 2;
  const scale = Math.min(Math.abs(halfWidth / deltaX) || Number.POSITIVE_INFINITY, Math.abs(halfHeight / deltaY) || Number.POSITIVE_INFINITY);

  return {
    x: center.x + deltaX * scale,
    y: center.y + deltaY * scale
  };
}

function orthogonalBoundaryPoint(node: UmlNode, toward: Point): Point {
  const center = centerOf(node);
  const deltaX = toward.x - center.x;
  const deltaY = toward.y - center.y;

  if (Math.abs(deltaX) >= Math.abs(deltaY)) {
    return {
      x: center.x + (deltaX >= 0 ? node.width / 2 : -node.width / 2),
      y: center.y
    };
  }

  return {
    x: center.x,
    y: center.y + (deltaY >= 0 ? node.height / 2 : -node.height / 2)
  };
}

function pointBetween(source: Point, target: Point, ratio: number, perpendicularOffset: number): Point {
  const x = source.x + (target.x - source.x) * ratio;
  const y = source.y + (target.y - source.y) * ratio;
  const deltaX = target.x - source.x;
  const deltaY = target.y - source.y;
  const length = Math.hypot(deltaX, deltaY) || 1;

  return {
    x: x + (-deltaY / length) * perpendicularOffset,
    y: y + (deltaX / length) * perpendicularOffset
  };
}

function supportsMultiplicity(kind: RelationshipKind): boolean {
  switch (kind) {
    case 'association':
    case 'connector':
    case 'deployment':
      return true;
    default:
      return false;
  }
}

function DiagramNode({ node, selected, selectedOwnedElementId, onPointerDown, onPointerMove, onPointerUp, onOwnedElementSelect, onContextMenu }: { node: UmlNode; selected: boolean; selectedOwnedElementId: string | undefined; onPointerDown: (event: React.PointerEvent<SVGGElement>) => void; onPointerMove: (event: React.PointerEvent<SVGElement>) => void; onPointerUp: () => void; onOwnedElementSelect: (elementId: string) => void; onContextMenu: (event: React.MouseEvent<SVGGElement>) => void }) {
  const className = selected ? 'node selected' : 'node';
  const ownedElements = node.ownedElements ?? [];
  const pointerHandlers = {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onClick: (event: React.MouseEvent<SVGGElement>) => event.stopPropagation(),
    onContextMenu
  };

  if (node.kind === 'useCase') {
    return (
      <g className={className} transform={`translate(${node.x} ${node.y})`} {...pointerHandlers}>
        <ellipse cx={node.width / 2} cy={node.height / 2} rx={node.width / 2} ry={node.height / 2} />
        <text x={node.width / 2} y={node.height / 2 + 5} textAnchor="middle">{node.name}</text>
      </g>
    );
  }

  if (node.kind === 'actor') {
    return (
      <g className={className} transform={`translate(${node.x} ${node.y})`} {...pointerHandlers}>
        <circle cx="44" cy="18" r="13" />
        <path d="M44 31 V68 M18 44 H70 M44 68 L22 104 M44 68 L66 104" />
        <text x="44" y="124" textAnchor="middle">{node.name}</text>
      </g>
    );
  }

  if (node.kind === 'initialNode' || node.kind === 'pseudostate') {
    return (
      <g className={className} transform={`translate(${node.x} ${node.y})`} {...pointerHandlers}>
        <circle cx="27" cy="27" r="18" className="filled" />
      </g>
    );
  }

  if (node.kind === 'decisionNode') {
    return (
      <g className={className} transform={`translate(${node.x} ${node.y})`} {...pointerHandlers}>
        <path d="M41 2 L80 41 L41 80 L2 41 Z" />
        <text x="41" y="46" textAnchor="middle">{node.name}</text>
      </g>
    );
  }

  if (node.kind === 'lifeline') {
    return (
      <g className={className} transform={`translate(${node.x} ${node.y})`} {...pointerHandlers}>
        <rect width={node.width} height="44" rx="4" />
        <line x1={node.width / 2} y1="44" x2={node.width / 2} y2={node.height} strokeDasharray="6 6" />
        <text x={node.width / 2} y="28" textAnchor="middle">{node.name}</text>
      </g>
    );
  }

  return (
    <g className={className} transform={`translate(${node.x} ${node.y})`} {...pointerHandlers}>
      <rect width={node.width} height={node.height} rx="5" />
      <line x1="0" y1="30" x2={node.width} y2="30" />
      <text x={node.width / 2} y="21" textAnchor="middle">{node.name}</text>
      <text x="10" y="53">{node.umlType}</text>
      {ownedElements.length > 0 ? <line x1="0" y1="64" x2={node.width} y2="64" /> : null}
      {ownedElements.map((element, index) => (
        <g key={element.id} className={selectedOwnedElementId === element.id ? 'owned-element-shape selected' : 'owned-element-shape'} onPointerDown={(event) => { event.stopPropagation(); onOwnedElementSelect(element.id); }} onClick={(event) => event.stopPropagation()}>
          <rect x="4" y={68 + index * 18} width={node.width - 8} height="18" rx="3" />
          <text x="10" y={84 + index * 18}>{formatOwnedElement(element.kind, element.name)}</text>
        </g>
      ))}
    </g>
  );
}

function createLocalizedDiagramDocument(kind: DiagramKind, locale: Locale): UmlDiagramDocument {
  return { ...createDiagramDocument(kind), name: diagramLabels[locale][kind] };
}

function clampZoom(value: number): number {
  return Math.min(maximumZoom, Math.max(minimumZoom, Number(value.toFixed(2))));
}

function ownedElementKindsForNode(node: UmlNode): UmlOwnedElementKind[] {
  switch (node.kind) {
    case 'class':
    case 'interface':
    case 'dataType':
      return ['attribute', 'operation'];
    case 'enumeration':
      return ['literal', 'operation'];
    case 'instanceSpecification':
      return ['slot'];
    case 'component':
    case 'node':
    case 'device':
    case 'executionEnvironment':
      return ['port', 'part'];
    case 'state':
      return ['entry', 'exit'];
    case 'package':
    case 'profile':
      return ['part'];
    default:
      return ['attribute', 'operation'];
  }
}

function formatOwnedElement(kind: UmlOwnedElementKind, name: string): string {
  switch (kind) {
    case 'operation':
      return `${name}()`;
    case 'literal':
      return name;
    case 'slot':
      return `${name}: Slot`;
    case 'port':
      return `${name}: Port`;
    case 'part':
      return `${name}: Part`;
    case 'region':
      return `${name}: Region`;
    case 'entry':
      return `entry / ${name}`;
    case 'exit':
      return `exit / ${name}`;
    default:
      return `${name}: Property`;
  }
}

const ownedElementLabels: Record<Locale, Record<UmlOwnedElementKind, string>> = {
  en: {
    attribute: 'Attribute',
    operation: 'Operation',
    literal: 'Literal',
    slot: 'Slot',
    port: 'Port',
    part: 'Part',
    region: 'Region',
    entry: 'Entry behavior',
    exit: 'Exit behavior'
  },
  ko: {
    attribute: '속성',
    operation: '오퍼레이션',
    literal: '리터럴',
    slot: '슬롯',
    port: '포트',
    part: '파트',
    region: '영역',
    entry: '진입 동작',
    exit: '종료 동작'
  }
};