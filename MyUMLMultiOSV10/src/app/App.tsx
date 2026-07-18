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
  ImageDown,
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
import { GIFEncoder, applyPalette, quantize } from 'gifenc';
import { useEffect, useMemo, useRef, useState } from 'react';
import { diagramDefinitions, getDiagramDefinition, type ConnectorTool, type DiagramKind, type PaletteTool, type RelationshipKind, type UmlElementKind } from '../uml/diagramRegistry.js';
import { addOwnedElement, addPaletteNode, connectNodes, createDiagramDocument, moveNode, renameEdge, renameNode, renameOwnedElement, updateEdgeMultiplicity, updateEdgeRelationship, updateEdgeRoute, updateOwnedElementKind, type EdgeRoute, type UmlDiagramDocument, type UmlEdge, type UmlNode, type UmlOwnedElementKind } from '../uml/editorModel.js';
import { getUmlConnectorNotation } from '../uml/umlNotation.js';
import { connectorLabels, diagramLabels, diagramScopes, messages, notationHints, type Locale, toolLabels } from './i18n.js';

type Theme = 'light' | 'dark';
type ImageExportFormat = 'png' | 'jpeg' | 'gif' | 'webp';
type ContextMenuState =
  | { target: 'canvas'; x: number; y: number; canvasX: number; canvasY: number }
  | { target: 'node'; x: number; y: number; nodeId: string }
  | { target: 'edge'; x: number; y: number; edgeId: string };
const projectStorageKey = 'my-uml-multi-os:last-project';
const minimumZoom = 0.5;
const maximumZoom = 2;
const appIconUrl = `${import.meta.env.BASE_URL}app-icon.svg`;
const imageExportFormats: ImageExportFormat[] = ['png', 'jpeg', 'gif', 'webp'];
const transparentImageExportFormats: ImageExportFormat[] = ['png', 'gif', 'webp'];
const imageExportMimeTypes: Record<ImageExportFormat, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp'
};

interface SavedProjectFile {
  format: 'my-uml-multi-os-project';
  version: 1;
  documents: UmlDiagramDocument[];
  activeDocumentId: string;
}

interface ProjectOpenEvent extends Event {
  detail?: SavedProjectFile;
}

function readStoredProject(locale: Locale): SavedProjectFile {
  try {
    const stored = globalThis.localStorage?.getItem(projectStorageKey);

    if (stored) {
      return normalizeProjectFile(JSON.parse(stored) as SavedProjectFile, locale);
    }
  } catch {
    globalThis.localStorage?.removeItem(projectStorageKey);
  }

  const document = createLocalizedDiagramDocument('class', locale);
  return createProjectFile([document], document.id, locale);
}

export function App() {
  const [initialProject] = useState(() => readStoredProject('ko'));
  const [documents, setDocuments] = useState<UmlDiagramDocument[]>(() => initialProject.documents);
  const [activeDocumentId, setActiveDocumentId] = useState<string>(() => initialProject.activeDocumentId);
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
  const [imageExportOpen, setImageExportOpen] = useState(false);
  const [imageExportFormat, setImageExportFormat] = useState<ImageExportFormat>('png');
  const [imageExportTransparent, setImageExportTransparent] = useState(false);
  const [imageExportError, setImageExportError] = useState<string | undefined>();
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
  const effectiveImageExportFormat = imageExportTransparent && !transparentImageExportFormats.includes(imageExportFormat) ? 'png' : imageExportFormat;
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

      applyProjectFile(parsed);
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
    const nextProject = createProjectFile([nextDocument], nextDocument.id, locale);

    setDocuments(nextProject.documents);
    setActiveDocumentId(nextProject.activeDocumentId);
    persistProjectFile(nextProject);
    resetSelection();
  }

  function saveProject() {
    const projectFile = createProjectFile(documents, document.id, locale);
    const serializedProject = JSON.stringify(projectFile, null, 2);
    const blob = new Blob([serializedProject], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = globalThis.document.createElement('a');

    persistProjectFile(projectFile);
    link.href = url;
    link.download = `${document.name || 'my-uml-project'}.umlprj`;
    link.style.display = 'none';
    globalThis.document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function saveDiagramImage() {
    const svg = canvasRef.current;

    if (!svg) {
      return;
    }

    try {
      setImageExportError(undefined);
      const format = imageExportTransparent && !transparentImageExportFormats.includes(imageExportFormat) ? 'png' : imageExportFormat;
      const { canvas, backgroundColor } = await rasterizeDiagramSvg(svg, { transparent: imageExportTransparent });
      const blob = format === 'gif'
        ? encodeGif(canvas, imageExportTransparent)
        : await encodeCanvas(canvas, imageExportMimeTypes[format], format === 'jpeg' ? 0.92 : 0.96, backgroundColor);

      downloadBlob(blob, `${sanitizeFileName(document.name || 'diagram')}.${format}`);
      setImageExportOpen(false);
    } catch (error) {
      setImageExportError(error instanceof Error ? error.message : text.imageExportFailed);
    }
  }

  function updateImageExportTransparent(transparent: boolean) {
    setImageExportTransparent(transparent);

    if (transparent && !transparentImageExportFormats.includes(imageExportFormat)) {
      setImageExportFormat('png');
    }
  }

  async function openProject(file: File | undefined) {
    if (!file) {
      return;
    }

    const parsed = JSON.parse(await file.text()) as SavedProjectFile;

    if (parsed.format !== 'my-uml-multi-os-project' || parsed.version !== 1 || parsed.documents.length === 0) {
      throw new Error('Unsupported My UML Multi OS project file.');
    }

    applyProjectFile(parsed);
  }

  function applyProjectFile(projectFile: SavedProjectFile) {
    const normalizedProject = normalizeProjectFile(projectFile, locale);

    setDocuments(normalizedProject.documents);
    setActiveDocumentId(normalizedProject.activeDocumentId);
    persistProjectFile(normalizedProject);
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
          <button type="button" title={text.saveImage} aria-label={text.saveImage} onClick={() => { setImageExportError(undefined); setImageExportOpen(true); }} className="text-button">
            <ImageDown size={18} />
            <span>{text.saveImage}</span>
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
            {selectedOwnedElementValue && selectedOwnedElementNode ? (
              <>
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
              </>
            ) : selectedNode ? (
              <>
                <label>
                  {text.name}
                  <input value={selectedNode.name} onChange={(event) => updateActiveDocument((current) => renameNode(current, selectedNode.id, event.target.value))} />
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
              </>
            ) : selectedEdge ? (
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
              </>
            ) : (
              <p className="empty-state">{text.emptySelection}</p>
            )}
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
            <img className="about-app-icon" src={appIconUrl} alt="My UML Multi OS" />
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
      {imageExportOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setImageExportOpen(false)}>
          <section className="image-export-dialog" role="dialog" aria-modal="true" aria-labelledby="image-export-title" onClick={(event) => event.stopPropagation()}>
            <div className="panel-heading">
              <ImageDown size={18} />
              <span id="image-export-title">{text.saveImage}</span>
            </div>
            <label>
              {text.imageFormat}
              <select value={effectiveImageExportFormat} onChange={(event) => setImageExportFormat(event.target.value as ImageExportFormat)}>
                {imageExportFormats.map((format) => (
                  <option key={format} value={format} disabled={imageExportTransparent && !transparentImageExportFormats.includes(format)}>{format.toUpperCase()}</option>
                ))}
              </select>
            </label>
            <label className="checkbox-label">
              <input type="checkbox" checked={imageExportTransparent} onChange={(event) => updateImageExportTransparent(event.target.checked)} />
              <span>{text.transparentBackground}</span>
            </label>
            <p className="export-hint">{imageExportTransparent ? text.transparentFormatHint : text.opaqueFormatHint}</p>
            {imageExportError ? <p className="export-error">{imageExportError}</p> : null}
            <div className="modal-actions">
              <button type="button" className="text-button" onClick={() => setImageExportOpen(false)}>
                <span>{text.close}</span>
              </button>
              <button type="button" className="text-button primary-action" onClick={() => { void saveDiagramImage(); }}>
                <ImageDown size={17} />
                <span>{text.saveImage}</span>
              </button>
            </div>
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

function createProjectFile(documents: UmlDiagramDocument[], activeDocumentId: string, locale: Locale): SavedProjectFile {
  return normalizeProjectFile({
    format: 'my-uml-multi-os-project',
    version: 1,
    documents,
    activeDocumentId
  }, locale);
}

function persistProjectFile(projectFile: SavedProjectFile) {
  try {
    globalThis.localStorage?.setItem(projectStorageKey, JSON.stringify(projectFile));
  } catch {
    // Local project recovery is best-effort; file download remains the source of truth.
  }
}

function normalizeProjectFile(projectFile: SavedProjectFile, locale: Locale): SavedProjectFile {
  const documents = (Array.isArray(projectFile.documents) ? projectFile.documents : [])
    .map((document, index) => normalizeDiagramDocument(document, locale, index))
    .filter((document): document is UmlDiagramDocument => Boolean(document));

  if (documents.length === 0) {
    const document = createLocalizedDiagramDocument('class', locale);
    return createProjectFile([document], document.id, locale);
  }

  const activeDocumentId = documents.some((document) => document.id === projectFile.activeDocumentId) ? projectFile.activeDocumentId : documents[0].id;

  return {
    format: 'my-uml-multi-os-project',
    version: 1,
    documents,
    activeDocumentId
  };
}

function normalizeDiagramDocument(document: UmlDiagramDocument, locale: Locale, index: number): UmlDiagramDocument | undefined {
  if (!isDiagramKind(document.kind)) {
    return undefined;
  }

  const definition = getDiagramDefinition(document.kind);
  const nodes = (Array.isArray(document.nodes) ? document.nodes : []).map((node, nodeIndex) => normalizeNode(node, definition.palette, nodeIndex));
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = (Array.isArray(document.edges) ? document.edges : [])
    .map((edge, edgeIndex) => normalizeEdge(edge, definition.connectors, edgeIndex))
    .filter((edge): edge is UmlEdge => edge !== undefined && nodeIds.has(edge.sourceId) && nodeIds.has(edge.targetId));

  return {
    id: nonEmptyString(document.id, `diagram-${index + 1}`),
    kind: document.kind,
    name: nonEmptyString(document.name, diagramLabels[locale][document.kind]),
    nodes,
    edges
  };
}

function normalizeNode(node: UmlNode, palette: PaletteTool[], index: number): UmlNode {
  const fallbackKind = palette[0]?.kind ?? 'class';
  const kind = isUmlElementKind(node.kind) ? node.kind : fallbackKind;
  const tool = palette.find((candidate) => candidate.kind === kind) ?? allPaletteTools().find((candidate) => candidate.kind === kind);
  const size = defaultSavedNodeSize(kind);
  const ownedElements = (Array.isArray(node.ownedElements) ? node.ownedElements : []).map((element, elementIndex) => normalizeOwnedElement(element, elementIndex));
  const width = finitePositiveNumber(node.width, size.width);
  const minimumHeight = usesClassCompartments(kind) ? Math.max(size.height, classCompartmentHeight(ownedElements.filter((element) => element.kind !== 'operation').length, ownedElements.filter((element) => element.kind === 'operation').length)) : size.height;

  return {
    id: nonEmptyString(node.id, `${kind}-${index + 1}`),
    kind,
    name: nonEmptyString(node.name, `${tool?.defaultName ?? kind}${index + 1}`),
    umlType: nonEmptyString(node.umlType, tool?.umlType ?? `uml:${capitalize(kind)}`),
    ownedElements,
    x: finiteNumber(node.x, 24),
    y: finiteNumber(node.y, 24),
    width,
    height: Math.max(finitePositiveNumber(node.height, minimumHeight), minimumHeight)
  };
}

function normalizeOwnedElement(element: { id?: string; kind?: UmlOwnedElementKind; name?: string; umlType?: string }, index: number) {
  const kind = isOwnedElementKind(element.kind) ? element.kind : 'attribute';

  return {
    id: nonEmptyString(element.id, `${kind}-${index + 1}`),
    kind,
    name: nonEmptyString(element.name, `${kind}${index + 1}`),
    umlType: nonEmptyString(element.umlType, defaultSavedOwnedElementType(kind))
  };
}

function normalizeEdge(edge: UmlEdge, connectors: ConnectorTool[], index: number): UmlEdge | undefined {
  const connector = connectors.find((candidate) => candidate.kind === edge.kind) ?? allConnectorTools().find((candidate) => candidate.kind === edge.kind) ?? connectors[0];

  if (!connector || !nonEmptyString(edge.sourceId, '') || !nonEmptyString(edge.targetId, '')) {
    return undefined;
  }

  return {
    id: nonEmptyString(edge.id, `${connector.kind}-${index + 1}`),
    kind: connector.kind,
    name: nonEmptyString(edge.name, `${connector.defaultName}${index + 1}`),
    umlType: nonEmptyString(edge.umlType, connector.umlType),
    sourceId: edge.sourceId,
    targetId: edge.targetId,
    directed: typeof edge.directed === 'boolean' ? edge.directed : connector.directed,
    route: isEdgeRoute(edge.route) ? edge.route : 'straight',
    sourceMultiplicity: typeof edge.sourceMultiplicity === 'string' ? edge.sourceMultiplicity : defaultSavedMultiplicity(connector.kind),
    targetMultiplicity: typeof edge.targetMultiplicity === 'string' ? edge.targetMultiplicity : defaultSavedMultiplicity(connector.kind)
  };
}

function allPaletteTools(): PaletteTool[] {
  return diagramDefinitions.flatMap((definition) => definition.palette);
}

function allConnectorTools(): ConnectorTool[] {
  return diagramDefinitions.flatMap((definition) => definition.connectors);
}

function isDiagramKind(kind: string): kind is DiagramKind {
  return diagramDefinitions.some((definition) => definition.kind === kind);
}

function isUmlElementKind(kind: string | undefined): kind is UmlElementKind {
  return allPaletteTools().some((tool) => tool.kind === kind);
}

function isOwnedElementKind(kind: string | undefined): kind is UmlOwnedElementKind {
  return kind === 'attribute' || kind === 'operation' || kind === 'literal' || kind === 'slot' || kind === 'port' || kind === 'part' || kind === 'region' || kind === 'entry' || kind === 'exit';
}

function isEdgeRoute(route: string | undefined): route is EdgeRoute {
  return route === 'straight' || route === 'orthogonal' || route === 'curve';
}

function nonEmptyString(value: string | undefined, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function finiteNumber(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function finitePositiveNumber(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

function defaultSavedNodeSize(kind: UmlElementKind): { width: number; height: number } {
  switch (kind) {
    case 'class':
    case 'interface':
    case 'dataType':
    case 'enumeration':
      return { width: 148, height: 176 };
    case 'actor':
      return { width: 88, height: 112 };
    case 'useCase':
      return { width: 136, height: 68 };
    case 'lifeline':
      return { width: 124, height: 260 };
    case 'message':
      return { width: 132, height: 34 };
    case 'initialNode':
    case 'finalNode':
    case 'pseudostate':
      return { width: 54, height: 54 };
    case 'decisionNode':
      return { width: 82, height: 82 };
    default:
      return { width: 148, height: 78 };
  }
}

function defaultSavedOwnedElementType(kind: UmlOwnedElementKind): string {
  switch (kind) {
    case 'attribute':
      return 'uml:Property';
    case 'operation':
      return 'uml:Operation';
    case 'literal':
      return 'uml:EnumerationLiteral';
    case 'slot':
      return 'uml:Slot';
    case 'port':
      return 'uml:Port';
    case 'part':
      return 'uml:Property';
    case 'region':
      return 'uml:Region';
    case 'entry':
    case 'exit':
      return 'uml:Behavior';
  }
}

function defaultSavedMultiplicity(kind: RelationshipKind): string | undefined {
  return kind === 'association' || kind === 'connector' || kind === 'deployment' ? '1' : undefined;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

async function rasterizeDiagramSvg(svg: SVGSVGElement, options: { transparent: boolean }): Promise<{ canvas: HTMLCanvasElement; backgroundColor: string }> {
  const crop = getDiagramExportBounds(svg);
  const width = Math.max(1, Math.ceil(crop.width));
  const height = Math.max(1, Math.ceil(crop.height));
  const scale = 2;
  const shell = svg.closest('.shell') ?? globalThis.document.documentElement;
  const shellStyle = globalThis.getComputedStyle(shell);
  const backgroundColor = cssVariable(shellStyle, '--canvas', '#ffffff');
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const defs = clone.querySelector('defs');
  const gridRect = clone.querySelector('rect[fill="url(#grid)"]');
  const style = globalThis.document.createElementNS('http://www.w3.org/2000/svg', 'style');

  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  clone.setAttribute('viewBox', `${crop.x} ${crop.y} ${width} ${height}`);
  clone.querySelectorAll('.selected').forEach((element) => element.classList.remove('selected'));
  clone.querySelectorAll('.preview-edge').forEach((element) => element.remove());
  style.textContent = createExportSvgCss(shellStyle, options.transparent ? 'transparent' : backgroundColor);

  if (defs) {
    defs.after(style);
  } else {
    clone.prepend(style);
  }

  if (options.transparent) {
    gridRect?.remove();
  } else {
    const background = globalThis.document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    background.setAttribute('x', String(crop.x));
    background.setAttribute('y', String(crop.y));
    background.setAttribute('width', String(width));
    background.setAttribute('height', String(height));
    background.setAttribute('fill', backgroundColor);
    style.after(background);

    if (gridRect) {
      gridRect.setAttribute('x', String(crop.x));
      gridRect.setAttribute('y', String(crop.y));
      gridRect.setAttribute('width', String(width));
      gridRect.setAttribute('height', String(height));
    }
  }

  const svgBlob = new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml;charset=utf-8' });
  const svgUrl = URL.createObjectURL(svgBlob);

  try {
    const image = await loadImage(svgUrl);
    const canvas = globalThis.document.createElement('canvas');
    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error('Canvas export is not available in this browser.');
    }

    canvas.width = width * scale;
    canvas.height = height * scale;
    context.scale(scale, scale);
    if (!options.transparent) {
      context.fillStyle = backgroundColor;
      context.fillRect(0, 0, width, height);
    }
    context.drawImage(image, 0, 0, width, height);

    return { canvas, backgroundColor };
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

function getDiagramExportBounds(svg: SVGSVGElement): { x: number; y: number; width: number; height: number } {
  const svgBounds = svg.getBoundingClientRect();
  const exportElements = Array.from(svg.querySelectorAll<SVGGraphicsElement>('.node, .edge:not(.preview-edge)'));
  const elementBounds = exportElements.map((element) => element.getBoundingClientRect()).filter((bounds) => bounds.width > 0 && bounds.height > 0);
  const padding = 18;

  if (elementBounds.length === 0) {
    return { x: 0, y: 0, width: Math.max(1, svgBounds.width), height: Math.max(1, svgBounds.height) };
  }

  const left = Math.min(...elementBounds.map((bounds) => bounds.left)) - svgBounds.left - padding;
  const top = Math.min(...elementBounds.map((bounds) => bounds.top)) - svgBounds.top - padding;
  const right = Math.max(...elementBounds.map((bounds) => bounds.right)) - svgBounds.left + padding;
  const bottom = Math.max(...elementBounds.map((bounds) => bounds.bottom)) - svgBounds.top + padding;

  return {
    x: Math.floor(left),
    y: Math.floor(top),
    width: Math.max(1, Math.ceil(right - left)),
    height: Math.max(1, Math.ceil(bottom - top))
  };
}

function createExportSvgCss(shellStyle: CSSStyleDeclaration, backgroundColor: string): string {
  const nodeFill = cssVariable(shellStyle, '--node-fill', '#ffffff');
  const nodeStroke = cssVariable(shellStyle, '--node-stroke', '#111111');
  const text = cssVariable(shellStyle, '--text', '#111111');
  const muted = cssVariable(shellStyle, '--muted', '#666666');
  const grid = cssVariable(shellStyle, '--grid', '#dddddd');

  return `
    .grid-line { stroke: ${grid}; }
    .node rect, .node ellipse, .node circle, .node path { fill: ${nodeFill}; stroke: ${nodeStroke}; stroke-width: 1.4; }
    .node line { stroke: ${nodeStroke}; stroke-width: 1.2; }
    .node .filled { fill: ${nodeStroke}; }
    .node text { fill: ${text}; font-family: Bahnschrift, 'Aptos Display', 'Segoe UI', sans-serif; font-size: 13px; }
    .node .compartment-label { fill: ${muted}; font-size: 12px; font-weight: 800; }
    .owned-element-shape rect { fill: transparent; stroke: transparent; stroke-width: 0; }
    .edge path { fill: none; stroke: ${nodeStroke}; stroke-width: 1.7; }
    .edge text { fill: ${text}; font-family: Bahnschrift, 'Aptos Display', 'Segoe UI', sans-serif; font-size: 12px; paint-order: stroke; stroke: ${backgroundColor}; stroke-width: 4px; }
    .arrow-marker, .hollow-arrow-marker { stroke: ${nodeStroke}; stroke-width: 1.4; }
    .arrow-marker { fill: none; }
    .hollow-arrow-marker { fill: ${backgroundColor}; }
  `;
}

function cssVariable(style: CSSStyleDeclaration, name: string, fallback: string): string {
  return style.getPropertyValue(name).trim() || fallback;
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not render the diagram image.'));
    image.src = url;
  });
}

async function encodeCanvas(canvas: HTMLCanvasElement, mimeType: string, quality: number, backgroundColor: string): Promise<Blob> {
  const exportCanvas = mimeType === 'image/jpeg' ? flattenCanvas(canvas, backgroundColor) : canvas;
  const blob = await new Promise<Blob | null>((resolve) => exportCanvas.toBlob(resolve, mimeType, quality));

  if (!blob) {
    throw new Error(`${mimeType} export is not supported by this browser.`);
  }

  return blob;
}

function flattenCanvas(canvas: HTMLCanvasElement, backgroundColor: string): HTMLCanvasElement {
  const flattened = globalThis.document.createElement('canvas');
  const context = flattened.getContext('2d');

  if (!context) {
    return canvas;
  }

  flattened.width = canvas.width;
  flattened.height = canvas.height;
  context.fillStyle = backgroundColor;
  context.fillRect(0, 0, flattened.width, flattened.height);
  context.drawImage(canvas, 0, 0);

  return flattened;
}

function encodeGif(canvas: HTMLCanvasElement, transparent: boolean): Blob {
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Canvas export is not available in this browser.');
  }

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const format = transparent ? 'rgba4444' : 'rgb565';
  const palette = quantize(imageData.data, 256, { format, oneBitAlpha: transparent ? 127 : false });
  const index = applyPalette(imageData.data, palette, format);
  const transparentIndex = transparent ? palette.findIndex((color) => (color[3] ?? 255) <= 127) : -1;
  const gif = GIFEncoder();

  gif.writeFrame(index, canvas.width, canvas.height, { palette, transparent: transparentIndex >= 0, transparentIndex: Math.max(0, transparentIndex) });
  gif.finish();

  const bytes = gif.bytes();
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

  return new Blob([buffer], { type: 'image/gif' });
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = globalThis.document.createElement('a');

  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  globalThis.document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function sanitizeFileName(value: string): string {
  return value.trim().replace(/[<>:"/\\|?*]+/g, '-').replace(/\s+/g, '-').replace(/^-+|-+$/g, '') || 'diagram';
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
  const attributeElements = ownedElements.filter((element) => element.kind !== 'operation');
  const methodElements = ownedElements.filter((element) => element.kind === 'operation');
  const classCompartmentNode = usesClassCompartments(node.kind);
  const nodeHeight = classCompartmentNode ? Math.max(node.height, classCompartmentHeight(attributeElements.length, methodElements.length)) : node.height;
  const title = displayNodeName(node);
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
        <text x={node.width / 2} y={node.height / 2 + 5} textAnchor="middle">{title}</text>
      </g>
    );
  }

  if (node.kind === 'actor') {
    return (
      <g className={className} transform={`translate(${node.x} ${node.y})`} {...pointerHandlers}>
        <circle cx="44" cy="18" r="13" />
        <path d="M44 31 V68 M18 44 H70 M44 68 L22 104 M44 68 L66 104" />
        <text x="44" y="124" textAnchor="middle">{title}</text>
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
        <text x="41" y="46" textAnchor="middle">{title}</text>
      </g>
    );
  }

  if (node.kind === 'lifeline') {
    return (
      <g className={className} transform={`translate(${node.x} ${node.y})`} {...pointerHandlers}>
        <rect width={node.width} height="44" rx="4" />
        <line x1={node.width / 2} y1="44" x2={node.width / 2} y2={node.height} strokeDasharray="6 6" />
        <text x={node.width / 2} y="28" textAnchor="middle">{title}</text>
      </g>
    );
  }

  return (
    <g className={className} transform={`translate(${node.x} ${node.y})`} {...pointerHandlers}>
      <rect width={node.width} height={nodeHeight} rx="5" />
      <line x1="0" y1="30" x2={node.width} y2="30" />
      <text x={node.width / 2} y="21" textAnchor="middle">{title}</text>
      {classCompartmentNode ? (
        <>
          <line x1="0" y1="42" x2={node.width} y2="42" />
          <text className="compartment-label" x="10" y="58">Attribute</text>
          {attributeElements.map((element, index) => (
            <OwnedElementText key={element.id} element={element} y={80 + index * 18} nodeWidth={node.width} selected={selectedOwnedElementId === element.id} onSelect={() => onOwnedElementSelect(element.id)} />
          ))}
          <line x1="0" y1={attributeCompartmentBottom(attributeElements.length)} x2={node.width} y2={attributeCompartmentBottom(attributeElements.length)} />
          <text className="compartment-label" x="10" y={attributeCompartmentBottom(attributeElements.length) + 18}>Method</text>
          {methodElements.map((element, index) => (
            <OwnedElementText key={element.id} element={element} y={attributeCompartmentBottom(attributeElements.length) + 40 + index * 18} nodeWidth={node.width} selected={selectedOwnedElementId === element.id} onSelect={() => onOwnedElementSelect(element.id)} />
          ))}
        </>
      ) : (
        ownedElements.map((element, index) => (
          <OwnedElementText key={element.id} element={element} y={54 + index * 18} nodeWidth={node.width} selected={selectedOwnedElementId === element.id} onSelect={() => onOwnedElementSelect(element.id)} />
        ))
      )}
    </g>
  );
}

function OwnedElementText({ element, y, nodeWidth, selected, onSelect }: { element: { id: string; kind: UmlOwnedElementKind; name: string }; y: number; nodeWidth: number; selected: boolean; onSelect: () => void }) {
  return (
    <g className={selected ? 'owned-element-shape selected' : 'owned-element-shape'} onPointerDown={(event) => { event.stopPropagation(); onSelect(); }} onClick={(event) => event.stopPropagation()}>
      <rect x="4" y={y - 16} width={nodeWidth - 8} height="18" rx="3" />
      <text x="10" y={y}>{formatOwnedElement(element.kind, element.name)}</text>
    </g>
  );
}

function attributeCompartmentBottom(attributeCount: number): number {
  return 88 + Math.max(1, attributeCount) * 18;
}

function classCompartmentHeight(attributeCount: number, methodCount: number): number {
  return attributeCompartmentBottom(attributeCount) + 52 + Math.max(1, methodCount) * 18;
}

function usesClassCompartments(kind: UmlElementKind): boolean {
  return kind === 'class' || kind === 'interface' || kind === 'dataType' || kind === 'enumeration';
}

function displayNodeName(node: UmlNode): string {
  return /^uml:/i.test(node.name.trim()) ? '' : node.name;
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
    operation: 'Method',
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
    operation: '메서드',
    literal: '리터럴',
    slot: '슬롯',
    port: '포트',
    part: '파트',
    region: '영역',
    entry: '진입 동작',
    exit: '종료 동작'
  }
};