import {
  Activity,
  ChevronDown,
  ChevronRight,
  ArrowRight,
  Binary,
  Box,
  Boxes,
  Braces,
  Circle,
  CircleDot,
  Clock3,
  Component,
  X,
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
  RefreshCw,
  Redo2,
  Save,
  Shapes,
  Square,
  Sun,
  Trash2,
  ToggleLeft,
  Undo2,
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
import { addOwnedElement, addPaletteNode, connectNodes, createDiagramDocument, moveNode, renameEdge, renameNode, renameOwnedElement, updateEdgeAnchor, updateEdgeMultiplicity, updateEdgeRelationship, updateEdgeRoute, updateOwnedElementKind, type EdgeAnchor, type EdgeRoute, type UmlDiagramDocument, type UmlEdge, type UmlNode, type UmlOwnedElement, type UmlOwnedElementKind } from '../uml/editorModel.js';
import { getUmlConnectorNotation } from '../uml/umlNotation.js';
import { renderActivityDiagramNode } from './diagrams/activityDiagram.js';
import { renderUseCaseDiagramNode } from './diagrams/useCaseDiagram.js';
import { connectorLabels, diagramLabels, diagramScopes, messages, notationHints, type Locale, toolLabels } from './i18n.js';

type Theme = 'light' | 'dark';
type ImageExportFormat = 'png' | 'jpeg' | 'gif' | 'webp';
type ContextMenuState =
  | { target: 'canvas'; x: number; y: number; canvasX: number; canvasY: number }
  | { target: 'project'; x: number; y: number }
  | { target: 'diagram'; x: number; y: number; documentId: string }
  | { target: 'node'; x: number; y: number; nodeId: string }
  | { target: 'ownedElement'; x: number; y: number; nodeId: string; elementId: string }
  | { target: 'edge'; x: number; y: number; edgeId: string };
const projectStorageKey = 'my-uml-multi-os:last-project';
const minimumZoom = 0.5;
const maximumZoom = 2;
const classifierDragDataType = 'application/x-my-uml-classifier';
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
  projectName?: string;
  documents: UmlDiagramDocument[];
  activeDocumentId: string;
}

interface ProjectOpenEvent extends Event {
  detail?: SavedProjectFile;
}

interface ProjectSnapshot {
  projectName: string;
  documents: UmlDiagramDocument[];
  activeDocumentId: string | undefined;
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

  return createProjectFile([], undefined, locale);
}

export function App() {
  const [initialProject] = useState(() => readStoredProject('ko'));
  const [projectName, setProjectName] = useState<string>(() => initialProject.projectName ?? 'My UML Project');
  const [documents, setDocuments] = useState<UmlDiagramDocument[]>(() => initialProject.documents);
  const [activeDocumentId, setActiveDocumentId] = useState<string | undefined>(() => initialProject.activeDocumentId || undefined);
  const [openDocumentIds, setOpenDocumentIds] = useState<string[]>(() => initialProject.activeDocumentId ? [initialProject.activeDocumentId] : []);
  const [undoStack, setUndoStack] = useState<ProjectSnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<ProjectSnapshot[]>([]);
  const [selectedTool, setSelectedTool] = useState<PaletteTool | undefined>();
  const [selectedConnector, setSelectedConnector] = useState<ConnectorTool | undefined>();
  const [pendingSourceNodeId, setPendingSourceNodeId] = useState<string | undefined>();
  const [selectedNodeId, setSelectedNodeId] = useState<string | undefined>();
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | undefined>();
  const [selectedOwnedElement, setSelectedOwnedElement] = useState<{ nodeId: string; elementId: string } | undefined>();
  const [projectSelected, setProjectSelected] = useState(false);
  const [diagramSelectedId, setDiagramSelectedId] = useState<string | undefined>(() => initialProject.activeDocumentId || undefined);
  const [collapsedDiagramIds, setCollapsedDiagramIds] = useState<Set<string>>(() => new Set());
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
  const dragStateRef = useRef<{ nodeId: string; startClientX: number; startClientY: number; startX: number; startY: number; moved: boolean } | undefined>(undefined);
  const resizeStateRef = useRef<{ nodeId: string; nodeKind: UmlElementKind; startClientX: number; startClientY: number; startWidth: number; startHeight: number; minWidth: number; minHeight: number } | undefined>(undefined);
  const connectorDragStateRef = useRef<{ sourceId: string; startClientX: number; startClientY: number; moved: boolean; sequenceY?: number; startedFromLine?: boolean } | undefined>(undefined);
  const messageReorderStateRef = useRef<{ edgeId: string; startClientY: number; startSequenceY: number } | undefined>(undefined);
  const pendingConnectorRef = useRef<ConnectorTool | undefined>(undefined);
  const pendingSourceNodeIdRef = useRef<string | undefined>(undefined);

  const activeDocument = documents.find((candidate) => candidate.id === activeDocumentId);
  const hasActiveDocument = Boolean(activeDocument);
  const document = activeDocument ?? emptyDiagramDocument(locale);
  const definition = useMemo(() => getDiagramDefinition(document.kind), [document.kind]);
  const text = messages[locale];
  const selectedNode = document?.nodes.find((node) => node.id === selectedNodeId);
  const selectedEdge = document?.edges.find((edge) => edge.id === selectedEdgeId);
  const selectedOwnedElementNode = document?.nodes.find((node) => node.id === selectedOwnedElement?.nodeId);
  const selectedOwnedElementValue = selectedOwnedElementNode?.ownedElements?.find((element) => element.id === selectedOwnedElement?.elementId);
  const selectedDiagram = diagramSelectedId ? documents.find((candidate) => candidate.id === diagramSelectedId) : undefined;
  const openDocuments = openDocumentIds.map((documentId) => documents.find((candidate) => candidate.id === documentId)).filter((candidate): candidate is UmlDiagramDocument => Boolean(candidate));
  const canvasZoom = document ? canvasZooms[document.id] ?? 1 : 1;
  const effectiveImageExportFormat = imageExportTransparent && !transparentImageExportFormats.includes(imageExportFormat) ? 'png' : imageExportFormat;
  const canDeleteDiagram = documents.length > 0;
  const canDeleteSelectedDiagram = canDeleteDiagram && Boolean(diagramSelectedId);
  const canUndo = undoStack.length > 0;
  const canRedo = redoStack.length > 0;
  const activeConnector = selectedConnector ?? pendingConnectorRef.current;
  const activeMode = activeConnector ? connectorLabels[locale][activeConnector.kind] ?? activeConnector.label : selectedTool ? paletteToolLabel(locale, selectedTool) : text.pointer;
  const canvasClassName = activeConnector ? 'canvas connector-mode' : 'canvas';
  const selectionLabel = selectedOwnedElementValue
    ? `${selectedOwnedElementNode?.name ?? text.ownedElements} / ${selectedOwnedElementValue.name}`
    : selectedNode
      ? selectedNode.name
      : selectedEdge
        ? selectedEdge.name
        : selectedDiagram
          ? selectedDiagram.name
          : projectSelected
            ? projectName
            : text.noSelection;

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        activatePointer();
        clearCanvasSelection();
        setDiagramChooserOpen(false);
        setAboutOpen(false);
        return;
      }

      if (event.key === 'Delete' && !isTextEditingTarget(event.target)) {
        event.preventDefault();
        deleteSelection();
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !event.shiftKey) {
        event.preventDefault();
        undoProjectChange();
        return;
      }

      if ((event.ctrlKey || event.metaKey) && (event.key.toLowerCase() === 'y' || (event.shiftKey && event.key.toLowerCase() === 'z'))) {
        event.preventDefault();
        redoProjectChange();
      }
    }

    globalThis.addEventListener('keydown', handleKeyDown);
    return () => globalThis.removeEventListener('keydown', handleKeyDown);
  });

  useEffect(() => {
    function handleProjectOpen(event: ProjectOpenEvent) {
      const parsed = event.detail;

      if (!parsed || parsed.format !== 'my-uml-multi-os-project' || parsed.version !== 1) {
        return;
      }

      applyProjectFile(parsed);
    }

    globalThis.addEventListener('my-uml-open-project', handleProjectOpen as EventListener);
    return () => globalThis.removeEventListener('my-uml-open-project', handleProjectOpen as EventListener);
  }, []);

  function updateActiveDocument(updater: (current: UmlDiagramDocument) => UmlDiagramDocument) {
    if (!document) {
      return;
    }

    pushUndoSnapshot();
    setDocuments((currentDocuments) => currentDocuments.map((candidate) => (candidate.id === document.id ? updater(candidate) : candidate)));
  }

  function updateActiveDocumentLive(updater: (current: UmlDiagramDocument) => UmlDiagramDocument) {
    if (!document) {
      return;
    }

    setDocuments((currentDocuments) => currentDocuments.map((candidate) => (candidate.id === document.id ? updater(candidate) : candidate)));
  }

  function pushUndoSnapshot() {
    setUndoStack((current) => [...current.slice(-99), { projectName, documents, activeDocumentId }]);
    setRedoStack([]);
  }

  function restoreProjectSnapshot(snapshot: ProjectSnapshot) {
    setProjectName(snapshot.projectName);
    setDocuments(snapshot.documents);
    setActiveDocumentId(snapshot.activeDocumentId);
    setOpenDocumentIds(snapshot.activeDocumentId ? [snapshot.activeDocumentId] : []);
    resetSelection();
    persistProjectFile(createProjectFile(snapshot.documents, snapshot.activeDocumentId, locale, snapshot.projectName));
  }

  function undoProjectChange() {
    setUndoStack((current) => {
      const previous = current[current.length - 1];

      if (!previous) {
        return current;
      }

      setRedoStack((redoCurrent) => [...redoCurrent.slice(-99), { projectName, documents, activeDocumentId }]);
      restoreProjectSnapshot(previous);
      return current.slice(0, -1);
    });
  }

  function redoProjectChange() {
    setRedoStack((current) => {
      const next = current[current.length - 1];

      if (!next) {
        return current;
      }

      setUndoStack((undoCurrent) => [...undoCurrent.slice(-99), { projectName, documents, activeDocumentId }]);
      restoreProjectSnapshot(next);
      return current.slice(0, -1);
    });
  }

  function createDiagram(kind: DiagramKind) {
    const nextDocument = createLocalizedDiagramDocument(kind, locale);

    pushUndoSnapshot();
    setDocuments((currentDocuments) => [...currentDocuments, nextDocument]);
    setActiveDocumentId(nextDocument.id);
    setOpenDocumentIds((current) => [...current.filter((documentId) => documentId !== nextDocument.id), nextDocument.id]);
    setDiagramChooserOpen(false);
    resetSelection();
  }

  function activateDocument(documentId: string) {
    setActiveDocumentId(documentId);
    setOpenDocumentIds((current) => (current.includes(documentId) ? current : [...current, documentId]));
    resetSelection();
    setDiagramSelectedId(documentId);
  }

  function deleteActiveDiagram() {
    if (diagramSelectedId) {
      deleteDiagram(diagramSelectedId);
    }
  }

  function closeDiagram(documentId: string) {
    if (openDocuments.length === 0) {
      return;
    }

    const currentIndex = Math.max(0, openDocuments.findIndex((candidate) => candidate.id === documentId));
    const nextOpenDocumentIds = openDocuments.map((candidate) => candidate.id).filter((candidateId) => candidateId !== documentId);
    const nextActiveDocumentId = activeDocumentId === documentId ? nextOpenDocumentIds[Math.min(currentIndex, nextOpenDocumentIds.length - 1)] ?? nextOpenDocumentIds[0] : activeDocumentId;

    setOpenDocumentIds(nextOpenDocumentIds);
    setActiveDocumentId(nextActiveDocumentId);
    resetSelection();
  }

  function deleteDiagram(documentId: string) {
    if (documents.length === 0) {
      return;
    }

    const currentIndex = Math.max(0, documents.findIndex((candidate) => candidate.id === documentId));
    const nextDocuments = documents.filter((candidate) => candidate.id !== documentId);
    const nextActiveDocument = nextDocuments.find((candidate) => candidate.id === activeDocumentId) ?? nextDocuments[Math.min(currentIndex, nextDocuments.length - 1)] ?? nextDocuments[0];
    const nextActiveDocumentId = nextActiveDocument?.id;

    pushUndoSnapshot();
    setDocuments(nextDocuments);
    setOpenDocumentIds((current) => {
      const nextOpenIds = current.filter((candidateId) => candidateId !== documentId && nextDocuments.some((candidate) => candidate.id === candidateId));
      return nextActiveDocumentId && !nextOpenIds.includes(nextActiveDocumentId) ? [...nextOpenIds, nextActiveDocumentId] : nextOpenIds;
    });
    setActiveDocumentId(nextActiveDocumentId);
    resetSelection();
    persistProjectFile(createProjectFile(nextDocuments, nextActiveDocumentId, locale, projectName));
  }

  function resetSelection() {
    setSelectedTool(undefined);
    setSelectedConnector(undefined);
    pendingConnectorRef.current = undefined;
    pendingSourceNodeIdRef.current = undefined;
    connectorDragStateRef.current = undefined;
    messageReorderStateRef.current = undefined;
    setPendingSourceNodeId(undefined);
    setSelectedNodeId(undefined);
    setSelectedEdgeId(undefined);
    setSelectedOwnedElement(undefined);
    setProjectSelected(false);
    setDiagramSelectedId(undefined);
    setConnectorPreviewPoint(undefined);
    setContextMenu(undefined);
  }

  function createNewProject() {
    const nextProjectName = 'My UML Project';
    const nextProject = createProjectFile([], undefined, locale, nextProjectName);

    pushUndoSnapshot();
    setProjectName(nextProjectName);
    setDocuments(nextProject.documents);
    setActiveDocumentId(undefined);
    setOpenDocumentIds([]);
    persistProjectFile(nextProject);
    resetSelection();
  }

  function saveProject() {
    const projectFile = createProjectFile(documents, activeDocumentId, locale, projectName);
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

    if (parsed.format !== 'my-uml-multi-os-project' || parsed.version !== 1) {
      throw new Error('Unsupported MyUML project file.');
    }

    applyProjectFile(parsed);
  }

  function applyProjectFile(projectFile: SavedProjectFile) {
    const normalizedProject = normalizeProjectFile(projectFile, locale);

    pushUndoSnapshot();
    setProjectName(normalizedProject.projectName ?? 'My UML Project');
    setDocuments(normalizedProject.documents);
    setActiveDocumentId(normalizedProject.activeDocumentId || undefined);
    setOpenDocumentIds(normalizedProject.activeDocumentId ? [normalizedProject.activeDocumentId] : []);
    persistProjectFile(normalizedProject);
    resetSelection();
  }

  function updateProjectName(name: string) {
    pushUndoSnapshot();
    setProjectName(name);
    persistProjectFile(createProjectFile(documents, activeDocumentId, locale, name));
  }

  function updateDiagramName(documentId: string, name: string) {
    pushUndoSnapshot();
    const nextDocuments = documents.map((candidate) => (candidate.id === documentId ? { ...candidate, name } : candidate));

    setDocuments(nextDocuments);
    persistProjectFile(createProjectFile(nextDocuments, activeDocumentId, locale, projectName));
  }

  function switchLocale(nextLocale: Locale) {
    const currentDefaultNames = Object.values(diagramLabels.en).concat(Object.values(diagramLabels.ko));

    setLocale(nextLocale);
  pushUndoSnapshot();
    setDocuments((currentDocuments) =>
      currentDocuments.map((candidate) => ({
        ...candidate,
        name: currentDefaultNames.includes(candidate.name) ? diagramLabels[nextLocale][candidate.kind] : candidate.name
      }))
    );
  }

  function clearCanvasSelection() {
    pendingConnectorRef.current = undefined;
    pendingSourceNodeIdRef.current = undefined;
    connectorDragStateRef.current = undefined;
    messageReorderStateRef.current = undefined;
    resizeStateRef.current = undefined;
    dragStateRef.current = undefined;
    setPendingSourceNodeId(undefined);
    setConnectorPreviewPoint(undefined);
    setSelectedNodeId(undefined);
    setSelectedEdgeId(undefined);
    setSelectedOwnedElement(undefined);
    setProjectSelected(false);
    setDiagramSelectedId(undefined);
    setContextMenu(undefined);
  }

  function addNodeAtCanvas(event: React.MouseEvent<SVGSVGElement>) {
    setContextMenu(undefined);

    if (!selectedTool) {
      clearCanvasSelection();
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    const x = Math.round((event.clientX - bounds.left) / canvasZoom - 70);
    const y = Math.round((event.clientY - bounds.top) / canvasZoom - 32);
    const nextDocument = attachComponentSurfaceNode(addPaletteNode(document, selectedTool, Math.max(24, x), Math.max(24, y)));

    updateActiveDocument(() => nextDocument);
    setSelectedNodeId(nextDocument.nodes[nextDocument.nodes.length - 1].id);
    setSelectedEdgeId(undefined);
    setSelectedOwnedElement(undefined);
  }

  function addNodeFromContext(tool: PaletteTool, x: number, y: number) {
    const nextDocument = attachComponentSurfaceNode(addPaletteNode(document, tool, Math.max(24, Math.round(x - 70)), Math.max(24, Math.round(y - 32))));

    updateActiveDocument(() => nextDocument);
    setSelectedNodeId(nextDocument.nodes[nextDocument.nodes.length - 1].id);
    setSelectedEdgeId(undefined);
    setSelectedOwnedElement(undefined);
    setContextMenu(undefined);
  }

  function startClassifierDrag(event: React.DragEvent<HTMLButtonElement>, node: UmlNode) {
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData(classifierDragDataType, JSON.stringify({ name: node.name }));
  }

  function handleCanvasDragOver(event: React.DragEvent<SVGSVGElement>) {
    if (document.kind !== 'sequence' || !event.dataTransfer.types.includes(classifierDragDataType)) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }

  function handleCanvasDrop(event: React.DragEvent<SVGSVGElement>) {
    if (document.kind !== 'sequence') {
      return;
    }

    const rawPayload = event.dataTransfer.getData(classifierDragDataType);

    if (!rawPayload) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const payload = JSON.parse(rawPayload) as { name?: string };
    const lifelineTool = definition.palette.find((tool) => tool.kind === 'lifeline');

    if (!lifelineTool || !payload.name) {
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    const x = Math.round((event.clientX - bounds.left) / canvasZoom - 62);
    const y = Math.round((event.clientY - bounds.top) / canvasZoom - 22);
    const withLifeline = addPaletteNode(document, lifelineTool, Math.max(24, x), Math.max(24, y));
    const createdNode = withLifeline.nodes[withLifeline.nodes.length - 1];
    const nextDocument = renameNode(withLifeline, createdNode.id, payload.name);

    updateActiveDocument(() => nextDocument);
    setSelectedNodeId(createdNode.id);
    setSelectedEdgeId(undefined);
    setSelectedOwnedElement(undefined);
    setContextMenu(undefined);
  }

  function activatePointer() {
    setSelectedTool(undefined);
    setSelectedConnector(undefined);
    clearConnectorState();
  }

  function clearConnectorState() {
    pendingConnectorRef.current = undefined;
    pendingSourceNodeIdRef.current = undefined;
    connectorDragStateRef.current = undefined;
    setPendingSourceNodeId(undefined);
    setConnectorPreviewPoint(undefined);
  }

  function completeConnector(sourceId: string, targetId: string) {
    const connector = selectedConnector ?? pendingConnectorRef.current;

    if (!connector) {
      return;
    }

    const source = document.nodes.find((node) => node.id === sourceId);
    const target = document.nodes.find((node) => node.id === targetId);

    if (document.kind === 'sequence' && connector.kind === 'message' && (source?.kind !== 'lifeline' || target?.kind !== 'lifeline')) {
      return;
    }

    const requestedSequenceY = connectorDragStateRef.current?.sequenceY ?? connectorPreviewPoint?.y ?? (source && target ? Math.max(source.y, target.y) + 72 : undefined);
    const sequenceDocument = document.kind === 'sequence' && connector.kind === 'message' && source && target && requestedSequenceY !== undefined
      ? extendLifelinesForMessage(document, sourceId, targetId, requestedSequenceY)
      : document;
    const sequenceSource = sequenceDocument.nodes.find((node) => node.id === sourceId);
    const sequenceTarget = sequenceDocument.nodes.find((node) => node.id === targetId);
    const sequenceY = sequenceDocument.kind === 'sequence' && connector.kind === 'message' && sequenceSource && sequenceTarget && requestedSequenceY !== undefined
      ? clampLifelineMessageY(sequenceSource, sequenceTarget, requestedSequenceY)
      : connectorPreviewPoint?.y;
    const connectedDocument = connectNodes(sequenceDocument, connector, sourceId, targetId, { sequenceY });
    const nextEdge = connectedDocument.edges[connectedDocument.edges.length - 1];
    const nextDocument = connectedDocument.kind === 'sequence' && nextEdge?.kind === 'message'
      ? spaceSequenceMessagesAfterInsert(connectedDocument, nextEdge.id)
      : connectedDocument;

    updateActiveDocument(() => nextDocument);
    clearConnectorState();
    setSelectedConnector(undefined);
    setSelectedTool(undefined);
    setSelectedNodeId(undefined);
    setSelectedEdgeId(nextEdge?.id);
    setSelectedOwnedElement(undefined);
  }

  function selectNode(nodeId: string) {
    setContextMenu(undefined);
    setProjectSelected(false);
    setDiagramSelectedId(undefined);

    if (!selectedConnector) {
      pendingSourceNodeIdRef.current = undefined;
      connectorDragStateRef.current = undefined;
      messageReorderStateRef.current = undefined;
      pendingConnectorRef.current = undefined;
      setSelectedNodeId(nodeId);
      setSelectedEdgeId(undefined);
      setSelectedOwnedElement(undefined);
      setConnectorPreviewPoint(undefined);
      return;
    }

    const pendingSourceNodeIdValue = pendingSourceNodeIdRef.current;

    if (!pendingSourceNodeIdValue) {
      const sourceNode = document.nodes.find((node) => node.id === nodeId) ?? document.nodes[0];

      if (document.kind === 'sequence' && selectedConnector.kind === 'message' && sourceNode?.kind !== 'lifeline') {
        return;
      }

      pendingConnectorRef.current = selectedConnector;
      pendingSourceNodeIdRef.current = nodeId;
      setPendingSourceNodeId(nodeId);
      setSelectedNodeId(nodeId);
      setSelectedEdgeId(undefined);
      setSelectedOwnedElement(undefined);
      setConnectorPreviewPoint(initialConnectorPreviewPoint(sourceNode));
      return;
    }

    completeConnector(pendingSourceNodeIdValue, nodeId);
  }

  function selectEdge(edgeId: string) {
    setContextMenu(undefined);
    setProjectSelected(false);
    setDiagramSelectedId(undefined);
    setSelectedNodeId(undefined);
    setSelectedEdgeId(edgeId);
    setSelectedOwnedElement(undefined);
    pendingSourceNodeIdRef.current = undefined;
    connectorDragStateRef.current = undefined;
    messageReorderStateRef.current = undefined;
    pendingConnectorRef.current = undefined;
    setPendingSourceNodeId(undefined);
    setConnectorPreviewPoint(undefined);
  }

  function selectOwnedElement(nodeId: string, elementId: string) {
    setContextMenu(undefined);
    setProjectSelected(false);
    setDiagramSelectedId(undefined);
    setSelectedNodeId(nodeId);
    setSelectedEdgeId(undefined);
    setSelectedOwnedElement({ nodeId, elementId });
    pendingSourceNodeIdRef.current = undefined;
    connectorDragStateRef.current = undefined;
    messageReorderStateRef.current = undefined;
    pendingConnectorRef.current = undefined;
    setPendingSourceNodeId(undefined);
    setConnectorPreviewPoint(undefined);
  }

  function selectProjectFromTree() {
    activatePointer();
    setSelectedNodeId(undefined);
    setSelectedEdgeId(undefined);
    setSelectedOwnedElement(undefined);
    setProjectSelected(true);
    setDiagramSelectedId(undefined);
    setContextMenu(undefined);
  }

  function openProjectContextMenu(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    activatePointer();
    setSelectedNodeId(undefined);
    setSelectedEdgeId(undefined);
    setSelectedOwnedElement(undefined);
    setProjectSelected(true);
    setDiagramSelectedId(undefined);
    setContextMenu({ target: 'project', x: event.clientX, y: event.clientY });
  }

  function selectDiagramFromTree(documentId: string) {
    activatePointer();
    setActiveDocumentId(documentId);
    setOpenDocumentIds((current) => (current.includes(documentId) ? current : [...current, documentId]));
    setSelectedNodeId(undefined);
    setSelectedEdgeId(undefined);
    setSelectedOwnedElement(undefined);
    setProjectSelected(false);
    setDiagramSelectedId(documentId);
    setContextMenu(undefined);
  }

  function openDiagramContextMenu(event: React.MouseEvent<HTMLButtonElement>, documentId: string) {
    event.preventDefault();
    event.stopPropagation();
    activatePointer();
    setActiveDocumentId(documentId);
    setOpenDocumentIds((current) => (current.includes(documentId) ? current : [...current, documentId]));
    setSelectedNodeId(undefined);
    setSelectedEdgeId(undefined);
    setSelectedOwnedElement(undefined);
    setProjectSelected(false);
    setDiagramSelectedId(documentId);
    setContextMenu({ target: 'diagram', x: event.clientX, y: event.clientY, documentId });
  }

  function toggleDiagramTree(documentId: string) {
    setCollapsedDiagramIds((current) => {
      const next = new Set(current);

      if (next.has(documentId)) {
        next.delete(documentId);
      } else {
        next.add(documentId);
      }

      return next;
    });
  }

  function selectNodeFromTree(documentId: string, nodeId: string) {
    activatePointer();
    setActiveDocumentId(documentId);
    setOpenDocumentIds((current) => (current.includes(documentId) ? current : [...current, documentId]));
    setSelectedNodeId(nodeId);
    setSelectedEdgeId(undefined);
    setSelectedOwnedElement(undefined);
    setProjectSelected(false);
    setDiagramSelectedId(undefined);
    setContextMenu(undefined);
  }

  function openTreeNodeContextMenu(event: React.MouseEvent<HTMLButtonElement>, documentId: string, nodeId: string) {
    event.preventDefault();
    event.stopPropagation();
    activatePointer();
    setActiveDocumentId(documentId);
    setOpenDocumentIds((current) => (current.includes(documentId) ? current : [...current, documentId]));
    setSelectedNodeId(nodeId);
    setSelectedEdgeId(undefined);
    setSelectedOwnedElement(undefined);
    setProjectSelected(false);
    setDiagramSelectedId(undefined);
    setContextMenu({ target: 'node', x: event.clientX, y: event.clientY, nodeId });
  }

  function selectOwnedElementFromTree(documentId: string, nodeId: string, elementId: string) {
    activatePointer();
    setActiveDocumentId(documentId);
    setOpenDocumentIds((current) => (current.includes(documentId) ? current : [...current, documentId]));
    setSelectedNodeId(nodeId);
    setSelectedEdgeId(undefined);
    setSelectedOwnedElement({ nodeId, elementId });
    setProjectSelected(false);
    setDiagramSelectedId(undefined);
    setContextMenu(undefined);
  }

  function openOwnedElementContextMenu(event: React.MouseEvent<HTMLButtonElement>, documentId: string, nodeId: string, elementId: string) {
    event.preventDefault();
    event.stopPropagation();
    activatePointer();
    setActiveDocumentId(documentId);
    setOpenDocumentIds((current) => (current.includes(documentId) ? current : [...current, documentId]));
    setSelectedNodeId(nodeId);
    setSelectedEdgeId(undefined);
    setSelectedOwnedElement({ nodeId, elementId });
    setProjectSelected(false);
    setDiagramSelectedId(undefined);
    setContextMenu({ target: 'ownedElement', x: event.clientX, y: event.clientY, nodeId, elementId });
  }

  function selectEdgeFromTree(documentId: string, edgeId: string) {
    activatePointer();
    setActiveDocumentId(documentId);
    setSelectedNodeId(undefined);
    setSelectedEdgeId(edgeId);
    setSelectedOwnedElement(undefined);
    setProjectSelected(false);
    setDiagramSelectedId(undefined);
    setContextMenu(undefined);
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

  function wrapMessageWithLoop(edgeId: string) {
    const edge = document.edges.find((candidate) => candidate.id === edgeId);
    const source = document.nodes.find((node) => node.id === edge?.sourceId);
    const target = document.nodes.find((node) => node.id === edge?.targetId);
    const loopTool = definition.palette.find((tool) => tool.kind === 'combinedFragment' && tool.label === 'Loop');

    if (!edge || !source || !target || !loopTool) {
      return;
    }

    const messageIndex = document.edges.slice(0, document.edges.findIndex((candidate) => candidate.id === edgeId)).filter((candidate) => candidate.kind === 'message').length;
    const points = getSequenceMessagePoints(document.kind, edge, source, target, messageIndex);

    if (!points) {
      return;
    }

    const left = Math.min(source.x, target.x, points.source.x, points.target.x) - 42;
    const right = Math.max(source.x + source.width, target.x + target.width, points.source.x, points.target.x) + 42;
    const top = points.source.y - 46;
    const height = points.selfCall ? 118 : 92;
    const withLoop = addPaletteNode(document, loopTool, Math.max(24, Math.round(left)), Math.max(24, Math.round(top)));
    const loopNode = withLoop.nodes[withLoop.nodes.length - 1];
    const nextDocument = {
      ...withLoop,
      nodes: withLoop.nodes.map((node) => (node.id === loopNode.id ? { ...node, width: Math.max(220, Math.round(right - left)), height } : node))
    };

    updateActiveDocument(() => nextDocument);
    setSelectedNodeId(loopNode.id);
    setSelectedEdgeId(undefined);
    setSelectedOwnedElement(undefined);
    setContextMenu(undefined);
  }

  function deleteOwnedElement(nodeId: string, elementId: string) {
    updateActiveDocument((current) => ({
      ...current,
      nodes: current.nodes.map((node) => (node.id === nodeId ? { ...node, ownedElements: (node.ownedElements ?? []).filter((element) => element.id !== elementId) } : node))
    }));
    resetSelection();
  }

  function deleteSelection() {
    if (diagramSelectedId) {
      deleteDiagram(diagramSelectedId);
      return;
    }

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

    const activeConnector = selectedConnector ?? pendingConnectorRef.current;

    if (activeConnector) {
      const pendingSourceNodeIdValue = pendingSourceNodeIdRef.current;

      if (document.kind === 'sequence' && activeConnector.kind === 'message' && node.kind !== 'lifeline') {
        return;
      }

      if (pendingSourceNodeIdValue) {
        updatePendingSequenceMessageY(event, node);
        completeConnector(pendingSourceNodeIdValue, node.id);
        return;
      }

      pendingConnectorRef.current = activeConnector;
      pendingSourceNodeIdRef.current = node.id;
      const startPoint = pointerToCanvasPoint(event) ?? initialConnectorPreviewPoint(node);
      const sequenceY = node.kind === 'lifeline' ? clampLifelineMessageY(node, node, startPoint.y) : undefined;
      connectorDragStateRef.current = { sourceId: node.id, startClientX: event.clientX, startClientY: event.clientY, moved: false, sequenceY };
      setPendingSourceNodeId(node.id);
      setSelectedNodeId(node.id);
      setSelectedEdgeId(undefined);
      setSelectedOwnedElement(undefined);
      setConnectorPreviewPoint(sequenceY === undefined ? initialConnectorPreviewPoint(node) : { x: initialConnectorPreviewPoint(node).x, y: sequenceY });
      return;
    }

    selectNode(node.id);

    dragStateRef.current = {
      nodeId: node.id,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: node.x,
      startY: node.y,
      moved: false
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleCanvasPointerMove(event: React.PointerEvent<SVGElement>) {
    const resizeState = resizeStateRef.current;

    if (resizeState) {
      const nextSize = resizeNodeSize(
        resizeState.nodeKind,
        resizeState.startWidth,
        resizeState.startHeight,
        (event.clientX - resizeState.startClientX) / canvasZoom,
        (event.clientY - resizeState.startClientY) / canvasZoom,
        { width: resizeState.minWidth, height: resizeState.minHeight }
      );
      updateActiveDocumentLive((current) => ({
        ...current,
        nodes: current.nodes.map((node) => (node.id === resizeState.nodeId ? { ...node, width: nextSize.width, height: nextSize.height } : node))
      }));
      return;
    }

    const messageReorderState = messageReorderStateRef.current;

    if (messageReorderState) {
      const nextY = messageReorderState.startSequenceY + (event.clientY - messageReorderState.startClientY) / canvasZoom;
      updateActiveDocument((current) => moveSequenceMessage(current, messageReorderState.edgeId, nextY));
      return;
    }

    const dragState = dragStateRef.current;

    if (!dragState) {
      if ((selectedConnector || pendingConnectorRef.current) && pendingSourceNodeIdRef.current && canvasRef.current) {
        const bounds = canvasRef.current.getBoundingClientRect();
        const connectorDragState = connectorDragStateRef.current;

        if (connectorDragState && Math.hypot(event.clientX - connectorDragState.startClientX, event.clientY - connectorDragState.startClientY) > 5) {
          connectorDragState.moved = true;
        }

        const previewY = (event.clientY - bounds.top) / canvasZoom;

        if (connectorDragState) {
          connectorDragState.sequenceY = previewY;
        }

        setConnectorPreviewPoint({
          x: (event.clientX - bounds.left) / canvasZoom,
          y: previewY
        });
      }

      return;
    }

    const deltaX = event.clientX - dragState.startClientX;
    const deltaY = event.clientY - dragState.startClientY;

    if (Math.hypot(deltaX, deltaY) > 5) {
      dragState.moved = true;
    }

    const nextX = Math.max(0, Math.round(dragState.startX + deltaX / canvasZoom));
    const nextY = Math.max(0, Math.round(dragState.startY + deltaY / canvasZoom));
    updateActiveDocument((current) => moveComponentDiagramNode(current, dragState.nodeId, nextX, nextY));
  }

  function pointerToCanvasPoint(event: React.PointerEvent<SVGElement>): Point | undefined {
    if (!canvasRef.current) {
      return undefined;
    }

    const bounds = canvasRef.current.getBoundingClientRect();

    return {
      x: (event.clientX - bounds.left) / canvasZoom,
      y: (event.clientY - bounds.top) / canvasZoom
    };
  }

  function handleNodePointerUp(event: React.PointerEvent<SVGGElement>, node: UmlNode) {
    event.stopPropagation();

    if (!selectedConnector && !pendingConnectorRef.current) {
      stopDragging();
      return;
    }

    const pendingSourceNodeIdValue = pendingSourceNodeIdRef.current;
    const connectorDragState = connectorDragStateRef.current;

    if (connectorDragState?.startedFromLine && pendingSourceNodeIdValue === node.id && !connectorDragState.moved) {
      connectorDragState.startedFromLine = false;
      return;
    }

    if (pendingSourceNodeIdValue && (pendingSourceNodeIdValue !== node.id || connectorDragState?.moved)) {
      updatePendingSequenceMessageY(event, node);
      completeConnector(pendingSourceNodeIdValue, node.id);
      return;
    }

    connectorDragStateRef.current = undefined;
  }

  function handleCanvasWheel(event: React.WheelEvent<SVGSVGElement>) {
    event.preventDefault();
    setContextMenu(undefined);
    updateCanvasZoom(event.deltaY < 0 ? 0.1 : -0.1);
  }

  function stopDragging() {
    dragStateRef.current = undefined;
    resizeStateRef.current = undefined;
    messageReorderStateRef.current = undefined;

    if (connectorDragStateRef.current?.moved) {
      pendingSourceNodeIdRef.current = undefined;
      pendingConnectorRef.current = undefined;
      setPendingSourceNodeId(undefined);
      setConnectorPreviewPoint(undefined);
    }

    connectorDragStateRef.current = undefined;
  }

  function beginMessageFromLifelineLine(event: React.PointerEvent<SVGElement>, node: UmlNode) {
    const messageConnector = definition.connectors.find((connector) => connector.kind === 'message');

    if (document.kind !== 'sequence' || node.kind !== 'lifeline' || !messageConnector) {
      return;
    }

    event.stopPropagation();
    const startPoint = pointerToCanvasPoint(event) ?? initialConnectorPreviewPoint(node);
    const sequenceY = clampLifelineMessageY(node, node, startPoint.y);

    const pendingSourceNodeIdValue = pendingSourceNodeIdRef.current;
    const activeConnector = selectedConnector ?? pendingConnectorRef.current;

    if (activeConnector?.kind !== 'message') {
      return;
    }

    if (pendingSourceNodeIdValue && activeConnector?.kind === 'message') {
      if (connectorDragStateRef.current) {
        connectorDragStateRef.current.sequenceY = startPoint.y;
      }

      completeConnector(pendingSourceNodeIdValue, node.id);
      return;
    }

    clearConnectorState();
    pendingConnectorRef.current = messageConnector;
    pendingSourceNodeIdRef.current = node.id;
    connectorDragStateRef.current = { sourceId: node.id, startClientX: event.clientX, startClientY: event.clientY, moved: false, sequenceY, startedFromLine: true };
    setPendingSourceNodeId(node.id);
    setSelectedNodeId(node.id);
    setSelectedEdgeId(undefined);
    setSelectedOwnedElement(undefined);
    setConnectorPreviewPoint({ x: initialConnectorPreviewPoint(node).x, y: sequenceY });
  }

  function updatePendingSequenceMessageY(event: React.PointerEvent<SVGElement>, target: UmlNode) {
    const connector = selectedConnector ?? pendingConnectorRef.current;

    if (document.kind !== 'sequence' || connector?.kind !== 'message' || target.kind !== 'lifeline') {
      return;
    }

    const point = pointerToCanvasPoint(event);

    if (!point) {
      return;
    }

    if (connectorDragStateRef.current) {
      connectorDragStateRef.current.sequenceY = point.y;
    } else {
      connectorDragStateRef.current = {
        sourceId: pendingSourceNodeIdRef.current ?? target.id,
        startClientX: event.clientX,
        startClientY: event.clientY,
        moved: true,
        sequenceY: point.y
      };
    }

    setConnectorPreviewPoint({ x: initialConnectorPreviewPoint(target).x, y: point.y });
  }

  function startNodeResize(event: React.PointerEvent<SVGGElement>, node: UmlNode) {
    event.preventDefault();
    event.stopPropagation();
    dragStateRef.current = undefined;
    connectorDragStateRef.current = undefined;
    pendingConnectorRef.current = undefined;
    pendingSourceNodeIdRef.current = undefined;
    setPendingSourceNodeId(undefined);
    setConnectorPreviewPoint(undefined);
    setContextMenu(undefined);
    setSelectedNodeId(node.id);
    setSelectedEdgeId(undefined);
    setSelectedOwnedElement(undefined);
    pushUndoSnapshot();
    const minSize = minimumResizableNodeSize(node.kind, node.ownedElements);
    resizeStateRef.current = {
      nodeId: node.id,
      nodeKind: node.kind,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startWidth: node.width,
      startHeight: node.height,
      minWidth: minSize.width,
      minHeight: minSize.height
    };
  }

  function startMessageReorder(event: React.PointerEvent<SVGGElement>, edge: UmlEdge) {
    if (document.kind !== 'sequence' || edge.kind !== 'message' || selectedConnector) {
      return;
    }

    event.stopPropagation();
    setContextMenu(undefined);
    pendingSourceNodeIdRef.current = undefined;
    connectorDragStateRef.current = undefined;
    setPendingSourceNodeId(undefined);
    setConnectorPreviewPoint(undefined);
    setSelectedNodeId(undefined);
    setSelectedEdgeId(edge.id);
    setSelectedOwnedElement(undefined);
    messageReorderStateRef.current = {
      edgeId: edge.id,
      startClientY: event.clientY,
      startSequenceY: sequenceYForEdge(document, edge)
    };
    event.currentTarget.setPointerCapture(event.pointerId);
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

  function refreshApplication() {
    globalThis.location.reload();
  }

  function findNodeName(nodeId: string): string {
    return document.nodes.find((node) => node.id === nodeId)?.name ?? nodeId;
  }

  return (
    <main className="shell" data-theme={theme} lang={locale} onClick={() => setContextMenu(undefined)}>
      <header className="topbar">
        {text.eyebrow ? <div><span className="eyebrow">{text.eyebrow}</span></div> : null}
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
          <button type="button" title={text.refresh} aria-label={text.refresh} onClick={refreshApplication} className="icon-button">
            <RefreshCw size={17} />
          </button>
          <button type="button" title={text.undo} aria-label={text.undo} onClick={undoProjectChange} className="icon-button" disabled={!canUndo}>
            <Undo2 size={17} />
          </button>
          <button type="button" title={text.redo} aria-label={text.redo} onClick={redoProjectChange} className="icon-button" disabled={!canRedo}>
            <Redo2 size={17} />
          </button>
          <button type="button" title={text.deleteDiagram} aria-label={text.deleteDiagram} onClick={deleteActiveDiagram} className="icon-button" disabled={!canDeleteSelectedDiagram}>
            <Trash2 size={17} />
          </button>
          <button type="button" title={text.saveImage} aria-label={text.saveImage} onClick={() => { setImageExportError(undefined); setImageExportOpen(true); }} className="text-button" disabled={!hasActiveDocument}>
            <ImageDown size={18} />
            <span>{text.saveImage}</span>
          </button>
          <button type="button" title={text.addDiagram} aria-label={text.addDiagram} onClick={() => setDiagramChooserOpen(true)} className="text-button">
            <Plus size={18} />
            <span>{text.addDiagram}</span>
          </button>
          <button type="button" className="icon-button" title={text.zoomOut} aria-label={text.zoomOut} onClick={() => updateCanvasZoom(-0.1)} disabled={!hasActiveDocument}>
            <ZoomOut size={17} />
          </button>
          <button type="button" className="zoom-value" title={text.resetZoom} aria-label={text.resetZoom} onClick={resetCanvasZoom} disabled={!hasActiveDocument}>{Math.round(canvasZoom * 100)}%</button>
          <button type="button" className="icon-button" title={text.zoomIn} aria-label={text.zoomIn} onClick={() => updateCanvasZoom(0.1)} disabled={!hasActiveDocument}>
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
          <button type="button" title={text.about} aria-label={text.about} onClick={() => setAboutOpen(true)} className="text-button about-toolbar-button">
            <Info size={17} />
            <span>{text.about}</span>
          </button>
        </div>
      </header>

      <section className="workspace">
        <aside className="palette" aria-label={text.palette}>
          {hasActiveDocument ? (
            <>
              <div className="panel-heading">
                <PackagePlus size={18} />
                <span>{text.palette}</span>
              </div>
              <button type="button" title={text.pointer} aria-label={text.pointer} onClick={activatePointer} className={!selectedTool && !activeConnector ? 'tool active' : 'tool'}>
                <MousePointer2 size={16} />
                <span>{text.pointer}</span>
              </button>
              {definition.palette.map((tool) => (
                <button key={`${definition.kind}-${tool.kind}-${tool.label}`} type="button" className={selectedTool?.label === tool.label ? 'tool active' : 'tool'} onClick={() => { setSelectedTool(tool); setSelectedConnector(undefined); clearConnectorState(); }}>
                  <ToolIcon kind={tool.kind} label={tool.label} size={16} />
                  <span>{paletteToolLabel(locale, tool)}</span>
                </button>
              ))}
              <div className="panel-heading connector-heading">
                <ArrowRight size={18} />
                <span>{text.connectors}</span>
              </div>
              {definition.connectors.map((connector) => (
                <button key={`${definition.kind}-${connector.kind}-${connector.label}`} type="button" className={selectedConnector?.label === connector.label ? 'tool active' : 'tool'} onClick={() => { clearConnectorState(); setSelectedConnector(connector); setSelectedTool(undefined); }}>
                  <ConnectorIcon kind={connector.kind} size={16} />
                  <span>{connectorLabels[locale][connector.kind] ?? connector.label}</span>
                </button>
              ))}
              {activeConnector ? <p className="mode-hint">{pendingSourceNodeId ? text.connectTarget : text.connectSource}</p> : null}
            </>
          ) : null}
        </aside>

        <section className="editor">
          <div className="document-tabs" role="tablist" aria-label={text.openDiagrams}>
            {openDocuments.map((candidate) => (
              <button key={candidate.id} type="button" role="tab" aria-selected={candidate.id === document.id} className={candidate.id === document.id ? 'document-tab active' : 'document-tab'} onClick={() => activateDocument(candidate.id)}>
                <DiagramIcon kind={candidate.kind} size={15} />
                <span>{candidate.name}</span>
                <span role="button" tabIndex={0} aria-label={text.close} title={text.close} className="document-tab-close" onClick={(event) => { event.stopPropagation(); closeDiagram(candidate.id); }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); closeDiagram(candidate.id); } }}>
                  <X size={12} />
                </span>
              </button>
            ))}
          </div>
          {hasActiveDocument ? (
            <>
              <div className="editor-header">
                <div>
                  <h2>{document.name}</h2>
                  <p>{diagramScopes[locale][definition.kind]}</p>
                </div>
                <code>{definition.papyrusDiagramId}</code>
              </div>

              <svg ref={canvasRef} className={canvasClassName} role="application" aria-label={`${document.name} ${text.canvasSuffix}`} onClick={addNodeAtCanvas} onContextMenu={openCanvasContextMenu} onWheel={handleCanvasWheel} onPointerMove={handleCanvasPointerMove} onPointerUp={stopDragging} onPointerLeave={stopDragging} onDragOver={handleCanvasDragOver} onDrop={handleCanvasDrop}>
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
                  {document.nodes.filter((node) => node.kind === 'combinedFragment' || node.kind === 'subject').map((node) => (
                    <DiagramNode key={node.id} node={node} selected={node.id === selectedNodeId || node.id === pendingSourceNodeId} selectedOwnedElementId={selectedOwnedElement?.nodeId === node.id ? selectedOwnedElement.elementId : undefined} showMessageStartLine={false} onMessageStartLine={(event) => beginMessageFromLifelineLine(event, node)} onPointerDown={(event) => handleNodePointerDown(event, node)} onPointerMove={handleCanvasPointerMove} onPointerUp={(event) => handleNodePointerUp(event, node)} onResizeStart={(event) => startNodeResize(event, node)} onOwnedElementSelect={(elementId) => selectOwnedElement(node.id, elementId)} onContextMenu={(event: React.MouseEvent<SVGGElement>) => openNodeContextMenu(event, node.id)} />
                  ))}
                  {document.edges.map((edge, edgeIndex) => (
                    <DiagramEdge key={edge.id} edge={edge} edgeIndex={document.kind === 'sequence' && edge.kind === 'message' ? document.edges.slice(0, edgeIndex).filter((candidate) => candidate.kind === 'message').length : edgeIndex} diagramKind={document.kind} nodes={document.nodes} selected={edge.id === selectedEdgeId} onSelect={() => selectEdge(edge.id)} onPointerDown={(event) => startMessageReorder(event, edge)} onContextMenu={(event: React.MouseEvent<SVGGElement>) => openEdgeContextMenu(event, edge.id)} />
                  ))}
                  {activeConnector && pendingSourceNodeId && connectorPreviewPoint ? <ConnectorPreview source={document.nodes.find((node) => node.id === pendingSourceNodeId)} target={connectorPreviewPoint} connector={activeConnector} diagramKind={document.kind} /> : null}
                  {document.nodes.filter((node) => node.kind !== 'combinedFragment' && node.kind !== 'subject').map((node) => (
                    <DiagramNode key={node.id} node={node} selected={node.id === selectedNodeId || node.id === pendingSourceNodeId} selectedOwnedElementId={selectedOwnedElement?.nodeId === node.id ? selectedOwnedElement.elementId : undefined} showMessageStartLine={document.kind === 'sequence' && node.kind === 'lifeline' && activeConnector?.kind === 'message'} onMessageStartLine={(event) => beginMessageFromLifelineLine(event, node)} onPointerDown={(event) => handleNodePointerDown(event, node)} onPointerMove={handleCanvasPointerMove} onPointerUp={(event) => handleNodePointerUp(event, node)} onResizeStart={(event) => startNodeResize(event, node)} onOwnedElementSelect={(elementId) => selectOwnedElement(node.id, elementId)} onContextMenu={(event: React.MouseEvent<SVGGElement>) => openNodeContextMenu(event, node.id)} />
                  ))}
                </g>
              </svg>
            </>
          ) : <div className="empty-canvas" />}
        </section>

        <aside className="inspector" aria-label={text.properties}>
          <section className="tree-panel" aria-label={text.modelTree}>
            <div className="panel-heading">
              <ListTree size={18} />
              <span>{text.modelTree}</span>
            </div>
            <div className="panel-scroll-body">
              <button type="button" className={projectSelected ? 'tree-item tree-root active' : 'tree-item tree-root'} onClick={selectProjectFromTree} onContextMenu={openProjectContextMenu}>
                <Package size={16} />
                <span>{projectName || 'My UML Project'}</span>
              </button>
              {documents.map((candidate) => {
                const collapsed = collapsedDiagramIds.has(candidate.id);

                return (
                <div key={candidate.id} className="tree-branch">
                  <button type="button" className={diagramSelectedId === candidate.id ? 'tree-item tree-level-1 active' : 'tree-item tree-level-1'} onClick={() => selectDiagramFromTree(candidate.id)} onContextMenu={(event) => openDiagramContextMenu(event, candidate.id)}>
                    <span role="button" tabIndex={0} aria-label={collapsed ? 'Expand diagram' : 'Collapse diagram'} className="tree-toggle" onClick={(event) => { event.stopPropagation(); toggleDiagramTree(candidate.id); }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); toggleDiagramTree(candidate.id); } }}>
                      {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                    </span>
                    <DiagramIcon kind={candidate.kind} size={15} />
                    <span>{candidate.name}</span>
                  </button>
                  {!collapsed ? (
                    <>
                      <div className="tree-group tree-level-2">{text.nodes}</div>
                      {candidate.nodes.map((node) => (
                        <div key={node.id}>
                          <button type="button" draggable={node.kind === 'class'} className={activeDocument?.id === candidate.id && selectedNodeId === node.id && !selectedOwnedElementValue ? 'tree-item tree-level-2 active' : 'tree-item tree-level-2'} onClick={() => selectNodeFromTree(candidate.id, node.id)} onContextMenu={(event) => openTreeNodeContextMenu(event, candidate.id, node.id)} onDragStart={(event) => startClassifierDrag(event, node)}>
                            <ToolIcon kind={node.kind} label={node.name} size={15} />
                            <span>{node.name}</span>
                          </button>
                          {(node.ownedElements ?? []).map((element) => (
                            <button key={element.id} type="button" className={activeDocument?.id === candidate.id && selectedOwnedElement?.nodeId === node.id && selectedOwnedElement.elementId === element.id ? 'tree-item tree-level-3 active' : 'tree-item tree-level-3'} onClick={() => selectOwnedElementFromTree(candidate.id, node.id, element.id)} onContextMenu={(event) => openOwnedElementContextMenu(event, candidate.id, node.id, element.id)}>
                              <Braces size={14} />
                              <span>{element.name}</span>
                            </button>
                          ))}
                        </div>
                      ))}
                    </>
                  ) : null}
                </div>
                );
              })}
            </div>
          </section>

          <section className="properties" aria-label={text.properties}>
            <div className="panel-heading">
              <Braces size={18} />
              <span>{text.properties}</span>
            </div>
            <div className="panel-scroll-body">
            {projectSelected ? (
              <>
                <label>
                  {text.name}
                  <input value={projectName} onChange={(event) => updateProjectName(event.target.value)} />
                </label>
              </>
            ) : selectedDiagram ? (
              <>
                <label>
                  {text.name}
                  <input value={selectedDiagram.name} onChange={(event) => updateDiagramName(selectedDiagram.id, event.target.value)} />
                </label>
                <label>
                  {text.diagramType}
                  <input value={diagramLabels[locale][selectedDiagram.kind]} readOnly />
                </label>
              </>
            ) : selectedOwnedElementValue && selectedOwnedElementNode ? (
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
                <label>
                  {text.sourceAnchor}
                  <select value={selectedEdge.sourceAnchor ?? 'auto'} onChange={(event) => updateActiveDocument((current) => updateEdgeAnchor(current, selectedEdge.id, 'source', edgeAnchorFromSelection(event.target.value)))}>
                    <option value="auto">{text.anchorAuto}</option>
                    <option value="left">{text.anchorLeft}</option>
                    <option value="right">{text.anchorRight}</option>
                    <option value="top">{text.anchorTop}</option>
                    <option value="bottom">{text.anchorBottom}</option>
                  </select>
                </label>
                <label>
                  {text.targetAnchor}
                  <select value={selectedEdge.targetAnchor ?? 'auto'} onChange={(event) => updateActiveDocument((current) => updateEdgeAnchor(current, selectedEdge.id, 'target', edgeAnchorFromSelection(event.target.value)))}>
                    <option value="auto">{text.anchorAuto}</option>
                    <option value="left">{text.anchorLeft}</option>
                    <option value="right">{text.anchorRight}</option>
                    <option value="top">{text.anchorTop}</option>
                    <option value="bottom">{text.anchorBottom}</option>
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
            </div>
          </section>
        </aside>
      </section>
      {contextMenu ? (
        <div className="context-menu" role="menu" aria-label={text.contextMenu} style={{ left: contextMenu.x, top: contextMenu.y }} onClick={(event) => event.stopPropagation()}>
          {contextMenu.target === 'canvas' && hasActiveDocument ? (
            <>
              <div className="context-menu-heading">{text.addElement}</div>
              {definition.palette.map((tool) => (
                <button key={`context-${definition.kind}-${tool.kind}-${tool.label}`} type="button" role="menuitem" onClick={() => addNodeFromContext(tool, contextMenu.canvasX, contextMenu.canvasY)}>
                  <ToolIcon kind={tool.kind} label={tool.label} size={14} />
                  <span>{paletteToolLabel(locale, tool)}</span>
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
          {contextMenu.target === 'project' ? (
            <button type="button" role="menuitem" onClick={selectProjectFromTree}>{text.select}</button>
          ) : null}
          {contextMenu.target === 'diagram' ? (
            <>
              <button type="button" role="menuitem" onClick={() => selectDiagramFromTree(contextMenu.documentId)}>{text.select}</button>
              <button type="button" role="menuitem" className="danger-menu-item" disabled={documents.length === 0} onClick={() => { deleteDiagram(contextMenu.documentId); setContextMenu(undefined); }}>{text.deleteDiagram}</button>
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
          {contextMenu.target === 'ownedElement' ? (
            <>
              <button type="button" role="menuitem" onClick={() => selectOwnedElement(contextMenu.nodeId, contextMenu.elementId)}>{text.select}</button>
              <button type="button" role="menuitem" className="danger-menu-item" onClick={() => deleteOwnedElement(contextMenu.nodeId, contextMenu.elementId)}>{text.deleteSelected}</button>
            </>
          ) : null}
          {contextMenu.target === 'edge' ? (
            <>
              <button type="button" role="menuitem" onClick={() => selectEdge(contextMenu.edgeId)}>{text.select}</button>
              {document.kind === 'sequence' && document.edges.find((edge) => edge.id === contextMenu.edgeId)?.kind === 'message' ? <button type="button" role="menuitem" onClick={() => wrapMessageWithLoop(contextMenu.edgeId)}>{text.wrapWithLoop}</button> : null}
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
            <img className="about-app-icon" src={appIconUrl} alt="UML editor" />
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
        <span>{hasActiveDocument ? document.name : projectName}</span>
        {hasActiveDocument ? <span>{diagramLabels[locale][definition.kind]}</span> : null}
        <span>{text.statusMode}: {activeMode}</span>
        <span>{text.statusSelection}: {selectionLabel}</span>
        {hasActiveDocument ? <span>{text.nodes}: {document.nodes.length}</span> : null}
        {hasActiveDocument ? <span>{text.edges}: {document.edges.length}</span> : null}
        {hasActiveDocument ? <span>{Math.round(canvasZoom * 100)}%</span> : null}
        <span>{theme === 'dark' ? text.dark : text.light}</span>
      </footer>
    </main>
  );
}

function createProjectFile(documents: UmlDiagramDocument[], activeDocumentId: string | undefined, locale: Locale, projectName = 'My UML Project'): SavedProjectFile {
  return normalizeProjectFile({
    format: 'my-uml-multi-os-project',
    version: 1,
    projectName,
    documents,
    activeDocumentId: activeDocumentId ?? ''
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

  const activeDocumentId = documents.some((document) => document.id === projectFile.activeDocumentId) ? projectFile.activeDocumentId : documents[0]?.id ?? '';

  return {
    format: 'my-uml-multi-os-project',
    version: 1,
    projectName: projectFile.projectName ?? 'My UML Project',
    documents,
    activeDocumentId
  };
}

function emptyDiagramDocument(locale: Locale): UmlDiagramDocument {
  return {
    id: '',
    kind: 'class',
    name: diagramLabels[locale].class,
    nodes: [],
    edges: []
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
  const minimumSize = minimumResizableNodeSize(kind);
  const width = Math.max(finitePositiveNumber(node.width, size.width), minimumSize.width);
  const height = Math.max(finitePositiveNumber(node.height, size.height), minimumSize.height);

  return {
    id: nonEmptyString(node.id, `${kind}-${index + 1}`),
    kind,
    name: nonEmptyString(node.name, `${tool?.defaultName ?? kind}${index + 1}`),
    umlType: nonEmptyString(node.umlType, tool?.umlType ?? `uml:${capitalize(kind)}`),
    ownedElements,
    x: finiteNumber(node.x, 24),
    y: finiteNumber(node.y, 24),
    width,
    height
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
    sourceAnchor: isEdgeAnchor(edge.sourceAnchor) ? edge.sourceAnchor : undefined,
    targetAnchor: isEdgeAnchor(edge.targetAnchor) ? edge.targetAnchor : undefined,
    sourceMultiplicity: typeof edge.sourceMultiplicity === 'string' ? edge.sourceMultiplicity : defaultSavedMultiplicity(connector.kind),
    targetMultiplicity: typeof edge.targetMultiplicity === 'string' ? edge.targetMultiplicity : defaultSavedMultiplicity(connector.kind),
    sequenceY: typeof edge.sequenceY === 'number' && Number.isFinite(edge.sequenceY) ? edge.sequenceY : undefined
  };
}

function attachComponentSurfaceNode(document: UmlDiagramDocument, nodeId?: string): UmlDiagramDocument {
  if (document.kind !== 'component') {
    return document;
  }

  const targetNode = nodeId ? document.nodes.find((node) => node.id === nodeId) : document.nodes[document.nodes.length - 1];

  if (!targetNode || !isComponentSurfaceNode(targetNode.kind)) {
    return document;
  }

  const port = targetNode.kind === 'providedInterface' || targetNode.kind === 'requiredInterface' ? nearestPortForInterface(document.nodes, targetNode) : undefined;

  if (port) {
    const attachedNode = snapInterfaceToPort(targetNode, port);

    if (attachedNode.x === targetNode.x && attachedNode.y === targetNode.y) {
      return document;
    }

    return {
      ...document,
      nodes: document.nodes.map((node) => (node.id === targetNode.id ? attachedNode : node))
    };
  }

  const component = nearestComponentForSurfaceNode(document.nodes, targetNode);

  if (!component) {
    return document;
  }

  const attachedNode = snapNodeToComponentSurface(targetNode, component);

  if (attachedNode.x === targetNode.x && attachedNode.y === targetNode.y) {
    return document;
  }

  return {
    ...document,
    nodes: document.nodes.map((node) => (node.id === targetNode.id ? attachedNode : node))
  };
}

function isComponentSurfaceNode(kind: UmlElementKind): boolean {
  return kind === 'port' || kind === 'providedInterface' || kind === 'requiredInterface';
}

function moveComponentDiagramNode(document: UmlDiagramDocument, nodeId: string, x: number, y: number): UmlDiagramDocument {
  if (document.kind !== 'component') {
    return moveNode(document, nodeId, x, y);
  }

  const movingNode = document.nodes.find((node) => node.id === nodeId);

  if (!movingNode) {
    return document;
  }

  const deltaX = x - movingNode.x;
  const deltaY = y - movingNode.y;
  let movedDocument: UmlDiagramDocument;

  if (movingNode.kind === 'component') {
    movedDocument = {
      ...document,
      nodes: document.nodes.map((node) => {
        if (node.id === nodeId) {
          return { ...node, x, y };
        }

        if (isComponentSurfaceNode(node.kind) && distanceToRect(nodeCenterPoint(node), movingNode) <= 88) {
          return { ...node, x: Math.max(0, Math.round(node.x + deltaX)), y: Math.max(0, Math.round(node.y + deltaY)) };
        }

        return node;
      })
    };
  } else if (movingNode.kind === 'port') {
    const portCenter = nodeCenterPoint(movingNode);

    movedDocument = {
      ...document,
      nodes: document.nodes.map((node) => {
        if (node.id === nodeId) {
          return { ...node, x, y };
        }

        if ((node.kind === 'providedInterface' || node.kind === 'requiredInterface') && distanceBetween(nodeCenterPoint(node), portCenter) <= 80) {
          return { ...node, x: Math.max(0, Math.round(node.x + deltaX)), y: Math.max(0, Math.round(node.y + deltaY)) };
        }

        return node;
      })
    };
  } else {
    movedDocument = moveNode(document, nodeId, x, y);
  }

  return attachAllComponentSurfaceNodes(movedDocument, nodeId);
}

function attachAllComponentSurfaceNodes(document: UmlDiagramDocument, preferredNodeId?: string): UmlDiagramDocument {
  const surfaceNodeIds = document.nodes
    .filter((node) => isComponentSurfaceNode(node.kind))
    .map((node) => node.id)
    .sort((left, right) => (left === preferredNodeId ? -1 : right === preferredNodeId ? 1 : 0));

  return surfaceNodeIds.reduce((current, surfaceNodeId) => attachComponentSurfaceNode(current, surfaceNodeId), document);
}

function nearestPortForInterface(nodes: UmlNode[], node: UmlNode): UmlNode | undefined {
  const nodeCenter = nodeCenterPoint(node);
  let nearest: { node: UmlNode; distance: number } | undefined;

  for (const candidate of nodes) {
    if (candidate.kind !== 'port' || candidate.id === node.id) {
      continue;
    }

    const candidateCenter = nodeCenterPoint(candidate);
    const distance = Math.hypot(nodeCenter.x - candidateCenter.x, nodeCenter.y - candidateCenter.y);

    if (distance > 120) {
      continue;
    }

    if (!nearest || distance < nearest.distance) {
      nearest = { node: candidate, distance };
    }
  }

  return nearest?.node;
}

function nearestComponentForSurfaceNode(nodes: UmlNode[], node: UmlNode): UmlNode | undefined {
  const nodeCenter = nodeCenterPoint(node);
  let nearest: { node: UmlNode; distance: number } | undefined;

  for (const candidate of nodes) {
    if (candidate.kind !== 'component' || candidate.id === node.id) {
      continue;
    }

    const distance = distanceToRect(nodeCenter, candidate);

    if (node.kind === 'port' && distance > 96) {
      continue;
    }

    if (!nearest || distance < nearest.distance) {
      nearest = { node: candidate, distance };
    }
  }

  return nearest?.node;
}

function snapNodeToComponentSurface(node: UmlNode, component: UmlNode): UmlNode {
  if (node.kind === 'providedInterface' || node.kind === 'requiredInterface') {
    const nodeCenter = nodeCenterPoint(node);
    const distances = [
      { edge: 'left' as const, value: Math.abs(nodeCenter.x - component.x) },
      { edge: 'right' as const, value: Math.abs(nodeCenter.x - (component.x + component.width)) },
      { edge: 'top' as const, value: Math.abs(nodeCenter.y - component.y) },
      { edge: 'bottom' as const, value: Math.abs(nodeCenter.y - (component.y + component.height)) }
    ].sort((left, right) => left.value - right.value);

    return snapInterfaceToComponentEdge(node, component, distances[0].edge);
  }

  const nodeCenter = nodeCenterPoint(node);
  const distances = [
    { edge: 'left' as const, value: Math.abs(nodeCenter.x - component.x) },
    { edge: 'right' as const, value: Math.abs(nodeCenter.x - (component.x + component.width)) },
    { edge: 'top' as const, value: Math.abs(nodeCenter.y - component.y) },
    { edge: 'bottom' as const, value: Math.abs(nodeCenter.y - (component.y + component.height)) }
  ].sort((left, right) => left.value - right.value);

  const edge = distances[0].edge;

  if (edge === 'left' || edge === 'right') {
    return {
      ...node,
      x: Math.round(edge === 'left' ? component.x - node.width / 2 : component.x + component.width - node.width / 2),
      y: Math.round(clamp(node.y, component.y, component.y + component.height - node.height))
    };
  }

  return {
    ...node,
    x: Math.round(clamp(node.x, component.x, component.x + component.width - node.width)),
    y: Math.round(edge === 'top' ? component.y - node.height / 2 : component.y + component.height - node.height / 2)
  };
}

function snapInterfaceToPort(node: UmlNode, port: UmlNode): UmlNode {
  const portCenter = nodeCenterPoint(port);
  const nodeCenter = nodeCenterPoint(node);
  const attachRight = nodeCenter.x >= portCenter.x;

  return {
    ...node,
    x: Math.round(attachRight ? portCenter.x : portCenter.x - node.width),
    y: Math.round(portCenter.y - node.height / 2)
  };
}

function snapInterfaceToComponentEdge(node: UmlNode, component: UmlNode, edge: EdgeAnchor): UmlNode {
  if (edge === 'left' || edge === 'right') {
    return {
      ...node,
      x: Math.round(edge === 'left' ? component.x - node.width : component.x + component.width),
      y: Math.round(clamp(node.y, component.y + 8, component.y + component.height - node.height - 8))
    };
  }

  return {
    ...node,
    x: Math.round(clamp(node.x, component.x + 8, component.x + component.width - node.width - 8)),
    y: Math.round(edge === 'top' ? component.y - node.height : component.y + component.height)
  };
}

function nodeCenterPoint(node: UmlNode): Point {
  return { x: node.x + node.width / 2, y: node.y + node.height / 2 };
}

function distanceToRect(point: Point, rect: UmlNode): number {
  const dx = Math.max(rect.x - point.x, 0, point.x - (rect.x + rect.width));
  const dy = Math.max(rect.y - point.y, 0, point.y - (rect.y + rect.height));

  return Math.hypot(dx, dy);
}

function distanceBetween(left: Point, right: Point): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function isTextEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return target.isContentEditable || target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
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

function isEdgeAnchor(anchor: string | undefined): anchor is EdgeAnchor {
  return anchor === 'left' || anchor === 'right' || anchor === 'top' || anchor === 'bottom';
}

function edgeAnchorFromSelection(anchor: string): EdgeAnchor | undefined {
  return isEdgeAnchor(anchor) ? anchor : undefined;
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
    case 'port':
      return { width: 26, height: 26 };
    case 'providedInterface':
    case 'requiredInterface':
      return { width: 88, height: 54 };
    case 'subject':
      return { width: 420, height: 280 };
    case 'lifeline':
      return { width: 124, height: 260 };
    case 'combinedFragment':
      return { width: 360, height: 220 };
    case 'message':
      return { width: 132, height: 34 };
    case 'initialNode':
    case 'finalNode':
    case 'flowFinalNode':
    case 'pseudostate':
      return { width: 54, height: 54 };
    case 'decisionNode':
    case 'mergeNode':
      return { width: 82, height: 82 };
    case 'forkNode':
    case 'joinNode':
      return { width: 96, height: 16 };
    case 'action':
      return { width: 142, height: 62 };
    case 'objectNode':
      return { width: 132, height: 54 };
    default:
      return { width: 148, height: 78 };
  }
}

function minimumResizableNodeSize(kind: UmlElementKind, ownedElements: UmlOwnedElement[] = []): { width: number; height: number } {
  switch (kind) {
    case 'port':
      return { width: 14, height: 14 };
    case 'actor':
      return { width: 44, height: 66 };
    case 'initialNode':
    case 'finalNode':
    case 'flowFinalNode':
    case 'pseudostate':
      return { width: 28, height: 28 };
    case 'forkNode':
    case 'joinNode':
      return { width: 28, height: 8 };
    case 'decisionNode':
    case 'mergeNode':
      return { width: 32, height: 32 };
    case 'providedInterface':
    case 'requiredInterface':
      return { width: 44, height: 28 };
    case 'lifeline':
      return { width: 64, height: 96 };
    case 'combinedFragment':
    case 'subject':
      return { width: 120, height: 80 };
    case 'class':
    case 'interface':
    case 'dataType':
    case 'enumeration':
      return { width: 96, height: Math.max(72, compartmentMinimumHeight(ownedElements)) };
    case 'component':
    case 'package':
    case 'node':
    case 'device':
    case 'executionEnvironment':
    case 'artifact':
    case 'state':
      return { width: 96, height: Math.max(58, ownedElements.length > 0 ? 54 + ownedElements.length * 18 : 58) };
    default:
      return { width: 48, height: 32 };
  }
}

function resizeNodeSize(kind: UmlElementKind, startWidth: number, startHeight: number, deltaWidth: number, deltaHeight: number, minimumSize: { width: number; height: number }): { width: number; height: number } {
  const requestedWidth = startWidth + deltaWidth;
  const requestedHeight = startHeight + deltaHeight;

  if (isSquareResizableNode(kind)) {
    const side = Math.max(minimumSize.width, minimumSize.height, Math.round(Math.max(requestedWidth, requestedHeight)));
    return { width: side, height: side };
  }

  if (kind === 'actor') {
    const aspect = 88 / 132;
    const scale = Math.max(requestedWidth / 88, requestedHeight / 132, minimumSize.width / 88, minimumSize.height / 132);
    return { width: Math.round(88 * scale), height: Math.round(132 * scale) };
  }

  if (kind === 'forkNode' || kind === 'joinNode') {
    return {
      width: Math.max(minimumSize.width, Math.round(requestedWidth)),
      height: clamp(Math.round(requestedHeight), minimumSize.height, 32)
    };
  }

  return {
    width: Math.max(minimumSize.width, Math.round(requestedWidth)),
    height: Math.max(minimumSize.height, Math.round(requestedHeight))
  };
}

function isSquareResizableNode(kind: UmlElementKind): boolean {
  switch (kind) {
    case 'port':
    case 'initialNode':
    case 'finalNode':
    case 'flowFinalNode':
    case 'pseudostate':
    case 'decisionNode':
    case 'mergeNode':
      return true;
    default:
      return false;
  }
}

function compartmentMinimumHeight(ownedElements: UmlOwnedElement[]): number {
  if (ownedElements.length === 0) {
    return 72;
  }

  const attributeCount = ownedElements.filter((element) => element.kind !== 'operation').length;
  const methodCount = ownedElements.filter((element) => element.kind === 'operation').length;

  return classCompartmentHeight(attributeCount, methodCount);
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
    .edge .activation-bar { fill: ${nodeFill}; stroke: ${nodeStroke}; stroke-width: 1.4; }
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
  subject: Square,
  lifeline: Workflow,
  message: Waypoints,
  combinedFragment: Braces,
  action: Activity,
  objectNode: Box,
  initialNode: CircleDot,
  finalNode: CircleDot,
  flowFinalNode: Circle,
  state: ToggleLeft,
  pseudostate: CircleDot,
  timeObservation: Clock3
};

function DiagramIcon({ kind, size }: { kind: DiagramKind; size: number }) {
  const Icon = diagramIconMap[kind];
  return <Icon size={size} />;
}

function ToolIcon({ kind, label, size }: { kind: UmlElementKind; label?: string; size: number }) {
  if (kind === 'combinedFragment') {
    return <CombinedFragmentIcon operator={combinedFragmentOperator(label)} size={size} />;
  }

  if (kind === 'component') {
    return <UmlComponentIcon size={size} />;
  }

  if (kind === 'artifact') {
    return <UmlArtifactIcon size={size} />;
  }

  if (kind === 'port') {
    return <UmlPortIcon size={size} />;
  }

  if (kind === 'providedInterface') {
    return <ProvidedInterfaceIcon size={size} />;
  }

  if (kind === 'requiredInterface') {
    return <RequiredInterfaceIcon size={size} />;
  }

  if (kind === 'initialNode' || kind === 'finalNode' || kind === 'flowFinalNode' || kind === 'decisionNode' || kind === 'mergeNode' || kind === 'forkNode' || kind === 'joinNode') {
    return <ActivityControlIcon kind={kind} size={size} />;
  }

  const Icon = toolIconMap[kind] ?? Waypoints;
  return <Icon size={size} />;
}

function UmlComponentIcon({ size }: { size: number }) {
  const strokeProps = { fill: 'none', stroke: 'currentColor', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, strokeWidth: 2 };

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect {...strokeProps} x="4" y="5" width="16" height="14" rx="2" />
      <rect {...strokeProps} x="2.5" y="8" width="5" height="3.5" rx="0.5" />
      <rect {...strokeProps} x="2.5" y="13" width="5" height="3.5" rx="0.5" />
    </svg>
  );
}

function UmlArtifactIcon({ size }: { size: number }) {
  const strokeProps = { fill: 'none', stroke: 'currentColor', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, strokeWidth: 2 };

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path {...strokeProps} d="M6 3 H15 L20 8 V21 H6 Z" />
      <path {...strokeProps} d="M15 3 V8 H20" />
    </svg>
  );
}

function UmlPortIcon({ size }: { size: number }) {
  const strokeProps = { fill: 'none', stroke: 'currentColor', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, strokeWidth: 2 };

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect {...strokeProps} x="6" y="6" width="12" height="12" rx="1.5" />
    </svg>
  );
}

function ProvidedInterfaceIcon({ size }: { size: number }) {
  const strokeProps = { fill: 'none', stroke: 'currentColor', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, strokeWidth: 2 };

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <line {...strokeProps} x1="4" y1="12" x2="10" y2="12" />
      <circle {...strokeProps} cx="15" cy="12" r="5" />
    </svg>
  );
}

function RequiredInterfaceIcon({ size }: { size: number }) {
  const strokeProps = { fill: 'none', stroke: 'currentColor', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, strokeWidth: 2 };

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <line {...strokeProps} x1="4" y1="12" x2="10" y2="12" />
      <path {...strokeProps} d="M18 7 A5 5 0 0 0 18 17" />
    </svg>
  );
}

function combinedFragmentOperator(label: string | undefined): 'loop' | 'alt' | 'opt' | 'par' | undefined {
  const normalized = label?.replace(/\d+$/, '').toLowerCase();

  if (normalized === 'loop' || normalized === 'alt' || normalized === 'opt' || normalized === 'par') {
    return normalized;
  }

  return undefined;
}

function CombinedFragmentIcon({ operator, size }: { operator?: 'loop' | 'alt' | 'opt' | 'par'; size: number }) {
  const strokeProps = { fill: 'none', stroke: 'currentColor', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, strokeWidth: 2 };

  if (operator === 'loop') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <path {...strokeProps} d="M17 7 A7 7 0 1 0 19 14" />
        <path {...strokeProps} d="M17 7 H21 V3" />
      </svg>
    );
  }

  if (operator === 'alt') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <path {...strokeProps} d="M4 5 H9 L15 19 H20" />
        <path {...strokeProps} d="M4 19 H9 L15 5 H20" />
      </svg>
    );
  }

  if (operator === 'opt') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <rect {...strokeProps} x="4" y="4" width="16" height="16" rx="3" />
        <path {...strokeProps} d="M8 12 L11 15 L17 8" />
      </svg>
    );
  }

  if (operator === 'par') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <path {...strokeProps} d="M5 5 V19" />
        <path {...strokeProps} d="M12 5 V19" />
        <path {...strokeProps} d="M19 5 V19" />
      </svg>
    );
  }

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect {...strokeProps} x="3" y="4" width="18" height="16" rx="2" />
      <path {...strokeProps} d="M3 4 H13 L16 7 V11 H3" />
    </svg>
  );
}

function ActivityControlIcon({ kind, size }: { kind?: UmlElementKind; size: number }) {
  const stroke = 'currentColor';
  const strokeProps = { fill: 'none', stroke, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, strokeWidth: 2 };

  if (kind === 'initialNode') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="8" fill="currentColor" />
      </svg>
    );
  }

  if (kind === 'finalNode') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <circle {...strokeProps} cx="12" cy="12" r="9" />
        <circle {...strokeProps} cx="12" cy="12" r="5" />
        <circle cx="12" cy="12" r="2.6" fill="currentColor" />
      </svg>
    );
  }

  if (kind === 'flowFinalNode') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <circle {...strokeProps} cx="12" cy="12" r="8" />
        <path {...strokeProps} d="M8 8 L16 16 M16 8 L8 16" />
      </svg>
    );
  }

  if (kind === 'decisionNode') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <path {...strokeProps} d="M12 3 L21 12 L12 21 L3 12 Z" />
      </svg>
    );
  }

  if (kind === 'mergeNode') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <path {...strokeProps} d="M12 3 L21 12 L12 21 L3 12 Z" />
      </svg>
    );
  }

  if (kind === 'forkNode' || kind === 'joinNode') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <rect x="4" y="10" width="16" height="4" rx="1" fill="currentColor" />
      </svg>
    );
  }

  return null;
}

function paletteToolLabel(locale: Locale, tool: PaletteTool): string {
  return tool.kind === 'combinedFragment' ? tool.label : toolLabels[locale][tool.kind] ?? tool.label;
}

function ConnectorIcon({ kind, size }: { kind: RelationshipKind; size: number }) {
  const notation = getUmlConnectorNotation(kind);
  const dashArray = notation.dashed ? '3 3' : undefined;

  if (kind === 'objectFlow') {
    return (
      <svg width={size + 12} height={size} viewBox="0 0 28 16" aria-hidden="true" className="connector-glyph object-flow-glyph">
        <line x1="2" y1="8" x2="7" y2="8" />
        <rect x="7" y="4" width="10" height="8" rx="1.5" />
        <line x1="17" y1="8" x2="20" y2="8" />
        <path d="M19 4 L25 8 L19 12" />
      </svg>
    );
  }

  if (kind === 'assemblyConnector') {
    return (
      <svg width={size + 12} height={size} viewBox="0 0 28 16" aria-hidden="true" className="connector-glyph">
        <path d="M5 4 A4 4 0 0 1 5 12" />
        <line x1="5" y1="8" x2="15" y2="8" />
        <circle cx="20" cy="8" r="4" />
      </svg>
    );
  }

  if (kind === 'delegationConnector') {
    return (
      <svg width={size + 12} height={size} viewBox="0 0 28 16" aria-hidden="true" className="connector-glyph">
        <line x1="2" y1="8" x2="26" y2="8" strokeDasharray="3 3" />
      </svg>
    );
  }

  return (
    <svg width={size + 12} height={size} viewBox="0 0 28 16" aria-hidden="true" className="connector-glyph">
      <line x1="2" y1="8" x2={notation.marker === 'none' ? 26 : 20} y2="8" strokeDasharray={dashArray} />
      {notation.objectToken ? <rect x="10" y="5" width="6" height="6" transform="rotate(45 13 8)" /> : null}
      {notation.marker === 'openArrow' ? <path d="M19 4 L25 8 L19 12" /> : null}
      {notation.marker === 'hollowTriangle' ? <path d="M18 3 L26 8 L18 13 Z" /> : null}
    </svg>
  );
}

function ObjectFlowToken({ source, target }: { source: Point; target: Point }) {
  const centerX = (source.x + target.x) / 2;
  const centerY = (source.y + target.y) / 2;

  return <rect className="object-flow-token" x={centerX - 5} y={centerY - 5} width="10" height="10" transform={`rotate(45 ${centerX} ${centerY})`} />;
}

function AssemblyConnectorGlyph({ source, target }: { source: Point; target: Point }) {
  const centerX = (source.x + target.x) / 2;
  const centerY = (source.y + target.y) / 2;
  const angle = Math.atan2(target.y - source.y, target.x - source.x) * 180 / Math.PI;

  return (
    <g className="assembly-connector-glyph" transform={`translate(${centerX} ${centerY}) rotate(${angle})`}>
      <path d="M -10 -6 A 6 6 0 0 1 -10 6" />
      <line x1="-10" y1="0" x2="4" y2="0" />
      <circle cx="10" cy="0" r="6" />
    </g>
  );
}

function DiagramEdge({ edge, edgeIndex, diagramKind, nodes, selected, onSelect, onPointerDown, onContextMenu }: { edge: UmlEdge; edgeIndex: number; diagramKind: DiagramKind; nodes: UmlNode[]; selected: boolean; onSelect: () => void; onPointerDown: (event: React.PointerEvent<SVGGElement>) => void; onContextMenu: (event: React.MouseEvent<SVGGElement>) => void }) {
  const source = nodes.find((node) => node.id === edge.sourceId);
  const target = nodes.find((node) => node.id === edge.targetId);

  if (!source || !target) {
    return null;
  }

  const sourceCenter = centerOf(source);
  const targetCenter = centerOf(target);
  const className = selected ? 'edge selected' : 'edge';
  const notation = getUmlConnectorNotation(edge.kind);
  const sequenceMessagePoints = getSequenceMessagePoints(diagramKind, edge, source, target, edgeIndex);
  const sourceAnchor = edge.route === 'orthogonal' ? edge.sourceAnchor ?? connectionSideToward(source, targetCenter) : edge.sourceAnchor;
  const targetAnchor = edge.route === 'orthogonal' ? edge.targetAnchor ?? connectionSideToward(target, sourceCenter) : edge.targetAnchor;
  const sourcePoint = sequenceMessagePoints?.source ?? connectionPoint(source, targetCenter, sourceAnchor);
  const targetPoint = sequenceMessagePoints?.target ?? connectionPoint(target, sourceCenter, targetAnchor);
  const markerEnd = notation.marker === 'hollowTriangle' ? 'url(#triangle-arrow)' : notation.marker === 'openArrow' ? 'url(#line-arrow)' : undefined;
  const label = notation.stereotype ? `«${notation.stereotype}»` : edge.name;
  const sourceMultiplicityPoint = pointBetween(sourcePoint, targetPoint, 0.18, -12);
  const targetMultiplicityPoint = pointBetween(sourcePoint, targetPoint, 0.82, -12);
  const activation = sequenceMessagePoints ? getSequenceActivationRect(target, sequenceMessagePoints.target) : undefined;
  const pathData = sequenceMessagePoints?.selfCall ? selfMessagePath(sequenceMessagePoints.source, sequenceMessagePoints.target) : edgePath(edge.route, sourcePoint, targetPoint, sourceAnchor, targetAnchor);
  const labelPoint = sequenceMessagePoints?.selfCall ? { x: sequenceMessagePoints.source.x + 42, y: sequenceMessagePoints.source.y - 8 } : { x: (sourcePoint.x + targetPoint.x) / 2, y: (sourcePoint.y + targetPoint.y) / 2 - 8 };

  return (
    <g className={className} onPointerDown={onPointerDown} onClick={(event) => { event.stopPropagation(); onSelect(); }} onContextMenu={onContextMenu}>
      {activation ? <rect className="activation-bar" x={activation.x} y={activation.y} width={activation.width} height={activation.height} rx="2" /> : null}
      <path d={pathData} markerEnd={markerEnd} strokeDasharray={notation.dashed ? '8 5' : undefined} />
      {edge.kind === 'assemblyConnector' ? <AssemblyConnectorGlyph source={sourcePoint} target={targetPoint} /> : null}
      {notation.objectToken ? <ObjectFlowToken source={sourcePoint} target={targetPoint} /> : null}
      <text x={labelPoint.x} y={labelPoint.y} textAnchor="middle">{label}</text>
      {supportsMultiplicity(edge.kind) && edge.sourceMultiplicity ? <text className="multiplicity" x={sourceMultiplicityPoint.x} y={sourceMultiplicityPoint.y} textAnchor="middle">{edge.sourceMultiplicity}</text> : null}
      {supportsMultiplicity(edge.kind) && edge.targetMultiplicity ? <text className="multiplicity" x={targetMultiplicityPoint.x} y={targetMultiplicityPoint.y} textAnchor="middle">{edge.targetMultiplicity}</text> : null}
    </g>
  );
}

function moveSequenceMessage(document: UmlDiagramDocument, edgeId: string, nextY: number): UmlDiagramDocument {
  if (document.kind !== 'sequence') {
    return document;
  }

  const edge = document.edges.find((candidate) => candidate.id === edgeId);

  if (!edge || edge.kind !== 'message') {
    return document;
  }

  const extendedDocument = extendLifelinesForMessage(document, edge.sourceId, edge.targetId, nextY);
  const extendedEdge = extendedDocument.edges.find((candidate) => candidate.id === edgeId) ?? edge;
  const clampedY = clampSequenceMessageY(extendedDocument, extendedEdge, nextY);
  const movedEdges = extendedDocument.edges.map((candidate) => (candidate.id === edgeId ? { ...candidate, sequenceY: clampedY } : candidate));
  const movedDocument = { ...extendedDocument, edges: movedEdges };
  const originalIndexes = new Map(document.edges.map((candidate, index) => [candidate.id, index]));
  const sortedMessages = movedEdges
    .filter((candidate) => candidate.kind === 'message')
    .sort((left, right) => sequenceYForEdge(movedDocument, left) - sequenceYForEdge(movedDocument, right) || (originalIndexes.get(left.id) ?? 0) - (originalIndexes.get(right.id) ?? 0));
  let messageIndex = 0;

  return {
    ...extendedDocument,
    edges: movedEdges.map((candidate) => (candidate.kind === 'message' ? sortedMessages[messageIndex++] : candidate))
  };
}

function spaceSequenceMessagesAfterInsert(document: UmlDiagramDocument, insertedEdgeId: string): UmlDiagramDocument {
  if (document.kind !== 'sequence') {
    return document;
  }

  const insertedEdge = document.edges.find((edge) => edge.id === insertedEdgeId);

  if (!insertedEdge || insertedEdge.kind !== 'message') {
    return document;
  }

  const minimumGap = 42;
  const originalIndexes = new Map(document.edges.map((edge, index) => [edge.id, index]));
  const sortedMessages = document.edges
    .filter((edge) => edge.kind === 'message')
    .sort((left, right) => {
      const yDifference = sequenceYForEdge(document, left) - sequenceYForEdge(document, right);

      if (yDifference !== 0) {
        return yDifference;
      }

      if (left.id === insertedEdgeId) {
        return -1;
      }

      if (right.id === insertedEdgeId) {
        return 1;
      }

      return (originalIndexes.get(left.id) ?? 0) - (originalIndexes.get(right.id) ?? 0);
    });
  const adjustedYByEdgeId = new Map<string, number>();
  let previousY: number | undefined;

  for (const message of sortedMessages) {
    const requestedY = sequenceYForEdge(document, message);
    const nextY = previousY === undefined ? requestedY : Math.max(requestedY, previousY + minimumGap);

    adjustedYByEdgeId.set(message.id, nextY);
    previousY = nextY;
  }

  let messageIndex = 0;
  const spacedDocument = {
    ...document,
    edges: document.edges.map((edge) => {
      if (edge.kind !== 'message') {
        return edge;
      }

      const sortedMessage = sortedMessages[messageIndex++];
      return { ...sortedMessage, sequenceY: adjustedYByEdgeId.get(sortedMessage.id) ?? sortedMessage.sequenceY };
    })
  };

  return spacedDocument.edges.reduce(
    (current, edge) => edge.kind === 'message' && edge.sequenceY !== undefined ? extendLifelinesForMessage(current, edge.sourceId, edge.targetId, edge.sequenceY) : current,
    spacedDocument
  );
}

function extendLifelinesForMessage(document: UmlDiagramDocument, sourceId: string, targetId: string, requestedY: number): UmlDiagramDocument {
  if (document.kind !== 'sequence') {
    return document;
  }

  const source = document.nodes.find((node) => node.id === sourceId);
  const target = document.nodes.find((node) => node.id === targetId);

  if (source?.kind !== 'lifeline' || target?.kind !== 'lifeline') {
    return document;
  }

  const requiredBottom = Math.round(requestedY) + 72;

  return {
    ...document,
    nodes: document.nodes.map((node) => {
      if (node.id !== sourceId && node.id !== targetId) {
        return node;
      }

      return { ...node, height: Math.max(node.height, requiredBottom - node.y) };
    })
  };
}

function sequenceYForEdge(document: UmlDiagramDocument, edge: UmlEdge): number {
  const source = document.nodes.find((node) => node.id === edge.sourceId);
  const target = document.nodes.find((node) => node.id === edge.targetId);

  if (!source || !target) {
    return edge.sequenceY ?? 72;
  }

  return edge.sequenceY ?? Math.max(source.y, target.y) + 72 + messageIndexForEdge(document.edges, edge.id) * 34;
}

function clampSequenceMessageY(document: UmlDiagramDocument, edge: UmlEdge, y: number): number {
  const source = document.nodes.find((node) => node.id === edge.sourceId);
  const target = document.nodes.find((node) => node.id === edge.targetId);

  if (!source || !target) {
    return y;
  }

  return clampLifelineMessageY(source, target, y);
}

function messageIndexForEdge(edges: UmlEdge[], edgeId: string): number {
  return Math.max(0, edges.filter((edge) => edge.kind === 'message').findIndex((edge) => edge.id === edgeId));
}

function ConnectorPreview({ source, target, connector, diagramKind }: { source: UmlNode | undefined; target: Point; connector: ConnectorTool; diagramKind: DiagramKind }) {
  if (!source) {
    return null;
  }

  const notation = getUmlConnectorNotation(connector.kind);
  const sequencePreview = diagramKind === 'sequence' && connector.kind === 'message' && source.kind === 'lifeline';
  const previewY = sequencePreview ? clampLifelineMessageY(source, source, target.y) : target.y;
  const sourcePoint = sequencePreview ? lifelineLinePoint(source, previewY) : connectionPoint(source, target);
  const targetPoint = sequencePreview ? { x: target.x, y: sourcePoint.y } : target;
  const markerEnd = notation.marker === 'hollowTriangle' ? 'url(#triangle-arrow)' : notation.marker === 'openArrow' ? 'url(#line-arrow)' : undefined;

  return (
    <g className="edge preview-edge">
      <path d={edgePath('straight', sourcePoint, targetPoint)} markerEnd={markerEnd} strokeDasharray={notation.dashed ? '8 5' : undefined} />
      {notation.objectToken ? <ObjectFlowToken source={sourcePoint} target={targetPoint} /> : null}
      <text x={(sourcePoint.x + targetPoint.x) / 2} y={(sourcePoint.y + targetPoint.y) / 2 - 8} textAnchor="middle">{notation.stereotype ? `«${notation.stereotype}»` : connector.label}</text>
    </g>
  );
}

interface SequenceMessagePoints {
  source: Point;
  target: Point;
  selfCall: boolean;
}

function getSequenceMessagePoints(diagramKind: DiagramKind, edge: UmlEdge, source: UmlNode, target: UmlNode, edgeIndex: number): SequenceMessagePoints | undefined {
  if (diagramKind !== 'sequence' || edge.kind !== 'message' || source.kind !== 'lifeline' || target.kind !== 'lifeline') {
    return undefined;
  }

  const y = clampLifelineMessageY(source, target, edge.sequenceY ?? Math.max(source.y, target.y) + 72 + edgeIndex * 34);

  if (source.id === target.id) {
    const sourcePoint = lifelineLinePoint(source, y);

    return {
      source: sourcePoint,
      target: lifelineLinePoint(source, y + 34),
      selfCall: true
    };
  }

  return {
    source: lifelineLinePoint(source, y),
    target: lifelineLinePoint(target, y),
    selfCall: false
  };
}

function lifelineLinePoint(lifeline: UmlNode, y: number): Point {
  return {
    x: lifeline.x + lifeline.width / 2,
    y: Math.max(lifeline.y + 44, Math.min(lifeline.y + lifeline.height, y))
  };
}

function clampLifelineMessageY(source: UmlNode, target: UmlNode, y: number): number {
  const top = Math.max(source.y, target.y) + 44;
  const bottom = Math.min(source.y + source.height, target.y + target.height);

  return Math.max(top, Math.min(bottom, Math.round(y)));
}

function selfMessagePath(source: Point, target: Point): string {
  const loopX = source.x + 58;

  return `M ${source.x} ${source.y} L ${loopX} ${source.y} L ${loopX} ${target.y} L ${target.x} ${target.y}`;
}

function getSequenceActivationRect(lifeline: UmlNode, messageTarget: Point): { x: number; y: number; width: number; height: number } {
  const width = 14;
  const y = Math.max(lifeline.y + 44, messageTarget.y);

  return {
    x: messageTarget.x - width / 2,
    y,
    width,
    height: Math.min(54, Math.max(34, lifeline.y + lifeline.height - y))
  };
}

function edgePath(route: EdgeRoute, source: Point, target: Point, sourceAnchor?: EdgeAnchor, targetAnchor?: EdgeAnchor): string {
  if (route === 'orthogonal') {
    return orthogonalEdgePath(source, target, sourceAnchor, targetAnchor);
  }

  if (route === 'curve') {
    const controlX = (source.x + target.x) / 2;
    const controlY = Math.min(source.y, target.y) - 80;
    return `M ${source.x} ${source.y} Q ${controlX} ${controlY} ${target.x} ${target.y}`;
  }

  return `M ${source.x} ${source.y} L ${target.x} ${target.y}`;
}

function orthogonalEdgePath(source: Point, target: Point, sourceAnchor?: EdgeAnchor, targetAnchor?: EdgeAnchor): string {
  const stubLength = 28;
  const sourceDirection = anchorDirection(sourceAnchor ?? horizontalAnchorBetween(source, target));
  const targetDirection = anchorDirection(targetAnchor ?? horizontalAnchorBetween(target, source));
  const sourceStub = { x: source.x + sourceDirection.x * stubLength, y: source.y + sourceDirection.y * stubLength };
  const targetStub = { x: target.x + targetDirection.x * stubLength, y: target.y + targetDirection.y * stubLength };
  const points = targetDirection.x !== 0
    ? [source, sourceStub, { x: targetStub.x, y: sourceStub.y }, targetStub, target]
    : [source, sourceStub, { x: sourceStub.x, y: targetStub.y }, targetStub, target];

  return pointsToPath(points);
}

function pointsToPath(points: Point[]): string {
  const uniquePoints = points.filter((point, index) => index === 0 || point.x !== points[index - 1].x || point.y !== points[index - 1].y);
  const [start, ...segments] = uniquePoints;

  return `M ${start.x} ${start.y}${segments.map((point) => ` L ${point.x} ${point.y}`).join('')}`;
}

function anchorDirection(anchor: EdgeAnchor): Point {
  switch (anchor) {
    case 'left':
      return { x: -1, y: 0 };
    case 'right':
      return { x: 1, y: 0 };
    case 'top':
      return { x: 0, y: -1 };
    case 'bottom':
      return { x: 0, y: 1 };
  }
}

function horizontalAnchorBetween(source: Point, target: Point): EdgeAnchor {
  return target.x >= source.x ? 'right' : 'left';
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

function initialConnectorPreviewPoint(node: UmlNode): Point {
  const center = centerOf(node);

  return node.kind === 'lifeline' ? { x: center.x + 88, y: Math.max(node.y + 72, center.y) } : center;
}

function connectionPoint(node: UmlNode, toward: Point, anchor?: EdgeAnchor): Point {
  if (!anchor) {
    return boundaryPoint(node, toward);
  }

  return anchoredBoundaryPoint(node, anchor);
}

function connectionSideToward(node: UmlNode, toward: Point): EdgeAnchor {
  const bounds = connectionBounds(node);
  const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  const deltaX = toward.x - center.x;
  const deltaY = toward.y - center.y;

  if (Math.abs(deltaX / bounds.width) >= Math.abs(deltaY / bounds.height)) {
    return deltaX >= 0 ? 'right' : 'left';
  }

  return deltaY >= 0 ? 'bottom' : 'top';
}

function anchoredBoundaryPoint(node: UmlNode, anchor: EdgeAnchor): Point {
  const center = centerOf(node);

  switch (anchor) {
    case 'left':
      return boundaryPoint(node, { x: center.x - node.width, y: center.y });
    case 'right':
      return boundaryPoint(node, { x: center.x + node.width, y: center.y });
    case 'top':
      return boundaryPoint(node, { x: center.x, y: center.y - node.height });
    case 'bottom':
      return boundaryPoint(node, { x: center.x, y: center.y + node.height });
  }
}

function boundaryPoint(node: UmlNode, toward: Point): Point {
  const shapeBounds = connectionBounds(node);
  const center = {
    x: shapeBounds.x + shapeBounds.width / 2,
    y: shapeBounds.y + shapeBounds.height / 2
  };
  const deltaX = toward.x - center.x;
  const deltaY = toward.y - center.y;

  if (deltaX === 0 && deltaY === 0) {
    return center;
  }

  if (isEllipseConnectionNode(node)) {
    return ellipseBoundaryPoint(shapeBounds, toward);
  }

  if (isDiamondConnectionNode(node)) {
    return diamondBoundaryPoint(shapeBounds, toward);
  }

  return rectangleBoundaryPoint(shapeBounds, toward);
}

function connectionBounds(node: UmlNode): { x: number; y: number; width: number; height: number } {
  if (node.kind === 'actor') {
    return { x: node.x + 18, y: node.y + 5, width: 52, height: 99 };
  }

  if (isCircleConnectionNode(node)) {
    const inset = 8;

    return {
      x: node.x + inset,
      y: node.y + inset,
      width: Math.max(1, node.width - inset * 2),
      height: Math.max(1, node.height - inset * 2)
    };
  }

  if (isDiamondConnectionNode(node)) {
    const inset = 2;

    return {
      x: node.x + inset,
      y: node.y + inset,
      width: Math.max(1, node.width - inset * 2),
      height: Math.max(1, node.height - inset * 2)
    };
  }

  return { x: node.x, y: node.y, width: node.width, height: node.height };
}

function isCircleConnectionNode(node: UmlNode): boolean {
  return node.kind === 'initialNode' || node.kind === 'finalNode' || node.kind === 'flowFinalNode' || node.kind === 'pseudostate' || node.kind === 'providedInterface' || node.kind === 'requiredInterface';
}

function isEllipseConnectionNode(node: UmlNode): boolean {
  return node.kind === 'useCase' || isCircleConnectionNode(node);
}

function isDiamondConnectionNode(node: UmlNode): boolean {
  return node.kind === 'decisionNode' || node.kind === 'mergeNode';
}

function ellipseBoundaryPoint(bounds: { x: number; y: number; width: number; height: number }, toward: Point): Point {
  const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  const radiusX = bounds.width / 2;
  const radiusY = bounds.height / 2;
  const deltaX = toward.x - center.x;
  const deltaY = toward.y - center.y;
  const scale = 1 / Math.sqrt((deltaX * deltaX) / (radiusX * radiusX) + (deltaY * deltaY) / (radiusY * radiusY));

  return {
    x: center.x + deltaX * scale,
    y: center.y + deltaY * scale
  };
}

function diamondBoundaryPoint(bounds: { x: number; y: number; width: number; height: number }, toward: Point): Point {
  const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  const deltaX = toward.x - center.x;
  const deltaY = toward.y - center.y;
  const scale = 1 / ((Math.abs(deltaX) / (bounds.width / 2)) + (Math.abs(deltaY) / (bounds.height / 2)));

  return {
    x: center.x + deltaX * scale,
    y: center.y + deltaY * scale
  };
}

function rectangleBoundaryPoint(bounds: { x: number; y: number; width: number; height: number }, toward: Point): Point {
  const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  const deltaX = toward.x - center.x;
  const deltaY = toward.y - center.y;
  const halfWidth = bounds.width / 2;
  const halfHeight = bounds.height / 2;
  const scale = Math.min(Math.abs(halfWidth / deltaX) || Number.POSITIVE_INFINITY, Math.abs(halfHeight / deltaY) || Number.POSITIVE_INFINITY);

  return {
    x: center.x + deltaX * scale,
    y: center.y + deltaY * scale
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

function DiagramNode({ node, selected, selectedOwnedElementId, showMessageStartLine, onMessageStartLine, onPointerDown, onPointerMove, onPointerUp, onResizeStart, onOwnedElementSelect, onContextMenu }: { node: UmlNode; selected: boolean; selectedOwnedElementId: string | undefined; showMessageStartLine?: boolean; onMessageStartLine?: (event: React.PointerEvent<SVGElement>) => void; onPointerDown: (event: React.PointerEvent<SVGGElement>) => void; onPointerMove: (event: React.PointerEvent<SVGElement>) => void; onPointerUp: (event: React.PointerEvent<SVGGElement>) => void; onResizeStart: (event: React.PointerEvent<SVGGElement>) => void; onOwnedElementSelect: (elementId: string) => void; onContextMenu: (event: React.MouseEvent<SVGGElement>) => void }) {
  const className = selected ? 'node selected' : 'node';
  const ownedElements = node.ownedElements ?? [];
  const attributeElements = ownedElements.filter((element) => element.kind !== 'operation');
  const methodElements = ownedElements.filter((element) => element.kind === 'operation');
  const classCompartmentNode = usesClassCompartments(node.kind);
  const nodeHeight = classCompartmentNode && ownedElements.length > 0 ? Math.max(node.height, classCompartmentHeight(attributeElements.length, methodElements.length)) : node.height;
  const title = displayNodeName(node);
  const pointerHandlers = {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onClick: (event: React.MouseEvent<SVGGElement>) => event.stopPropagation(),
    onContextMenu
  };

  const useCaseNode = renderUseCaseDiagramNode({ node, className, title, pointerHandlers, onResizeStart });

  if (useCaseNode) {
    return withResizeHandle(useCaseNode, node, nodeHeight, onResizeStart);
  }

  const activityNode = renderActivityDiagramNode({ node, className, title, pointerHandlers });

  if (activityNode) {
    return withResizeHandle(activityNode, node, nodeHeight, onResizeStart);
  }

  if (node.kind === 'initialNode' || node.kind === 'pseudostate') {
    const radius = Math.max(4, Math.min(node.width, node.height) / 2 - 8);

    return withResizeHandle((
      <g className={className} transform={`translate(${node.x} ${node.y})`} {...pointerHandlers}>
        <circle cx={node.width / 2} cy={node.height / 2} r={radius} className="filled" />
      </g>
    ), node, nodeHeight, onResizeStart);
  }

  if (node.kind === 'decisionNode') {
    return withResizeHandle((
      <g className={className} transform={`translate(${node.x} ${node.y})`} {...pointerHandlers}>
        <path d={`M ${node.width / 2} 2 L ${node.width - 2} ${node.height / 2} L ${node.width / 2} ${node.height - 2} L 2 ${node.height / 2} Z`} />
        <text x={node.width / 2} y={node.height / 2 + 5} textAnchor="middle">{title}</text>
      </g>
    ), node, nodeHeight, onResizeStart);
  }

  if (node.kind === 'lifeline') {
    return withResizeHandle((
      <g className={className} transform={`translate(${node.x} ${node.y})`} {...pointerHandlers}>
        <rect width={node.width} height="44" rx="4" />
        <line x1={node.width / 2} y1="44" x2={node.width / 2} y2={node.height} strokeDasharray="6 6" />
        {showMessageStartLine && onMessageStartLine ? <rect className="lifeline-message-start-zone" x={node.width / 2 - 10} y="44" width="20" height={Math.max(1, node.height - 44)} onPointerDown={onMessageStartLine} /> : null}
        <text x={node.width / 2} y="28" textAnchor="middle">{title}</text>
      </g>
    ), node, nodeHeight, onResizeStart);
  }

  if (node.kind === 'combinedFragment') {
    const operator = title.replace(/\d+$/, '') || 'loop';
    const showSeparator = /^alt|par$/i.test(operator);

    return withResizeHandle((
      <g className={className} transform={`translate(${node.x} ${node.y})`} {...pointerHandlers}>
        <rect className="combined-fragment-frame" width={node.width} height={node.height} rx="2" />
        <path className="combined-fragment-operator" d="M0 0 H72 L92 20 V34 H0 Z" />
        <text x="12" y="22" textAnchor="start">{operator}</text>
        {showSeparator ? <line className="operand-separator" x1="0" y1={node.height / 2} x2={node.width} y2={node.height / 2} strokeDasharray="8 5" /> : null}
      </g>
    ), node, nodeHeight, onResizeStart);
  }

  if (node.kind === 'component') {
    return withResizeHandle((
      <g className={className} transform={`translate(${node.x} ${node.y})`} {...pointerHandlers}>
        <rect width={node.width} height={nodeHeight} rx="5" />
        <text className="compartment-label" x={node.width / 2} y="24" textAnchor="middle">«component»</text>
        <text x={node.width / 2} y="46" textAnchor="middle">{title}</text>
        <g className="component-icon" transform={`translate(${node.width - 34} 12)`}>
          <rect x="8" y="0" width="20" height="20" rx="2" />
          <rect x="0" y="4" width="10" height="5" rx="1" />
          <rect x="0" y="12" width="10" height="5" rx="1" />
        </g>
        {ownedElements.map((element, index) => (
          <OwnedElementText key={element.id} element={element} y={74 + index * 18} nodeWidth={node.width} selected={selectedOwnedElementId === element.id} onSelect={() => onOwnedElementSelect(element.id)} />
        ))}
      </g>
    ), node, nodeHeight, onResizeStart);
  }

  if (node.kind === 'port') {
    return withResizeHandle((
      <g className={className} transform={`translate(${node.x} ${node.y})`} {...pointerHandlers}>
        <rect className="port-node" width={node.width} height={node.height} rx="2" />
      </g>
    ), node, nodeHeight, onResizeStart);
  }

  if (node.kind === 'providedInterface') {
    const centerY = node.height / 2;
    const radius = Math.max(4, Math.min(node.height / 2 - 5, node.width / 3));
    const circleX = node.width - radius - 4;
    const stemStartX = 0;

    return withResizeHandle((
      <g className={className} transform={`translate(${node.x} ${node.y})`} {...pointerHandlers}>
        <rect className="node-hit-area" x="-8" y="-8" width={node.width + 16} height={node.height + 16} rx="6" />
        <line x1={stemStartX} y1={centerY} x2={circleX - radius} y2={centerY} />
        <circle cx={circleX} cy={centerY} r={radius} />
        <text x={node.width / 2} y={node.height - 5} textAnchor="middle">{title}</text>
      </g>
    ), node, nodeHeight, onResizeStart);
  }

  if (node.kind === 'requiredInterface') {
    const centerY = node.height / 2;
    const radius = Math.max(4, Math.min(node.height / 2 - 5, node.width / 3));
    const socketX = node.width - radius - 4;
    const stemStartX = 0;

    return withResizeHandle((
      <g className={className} transform={`translate(${node.x} ${node.y})`} {...pointerHandlers}>
        <rect className="node-hit-area" x="-8" y="-8" width={node.width + 16} height={node.height + 16} rx="6" />
        <line x1={stemStartX} y1={centerY} x2={socketX - radius} y2={centerY} />
        <path className="required-interface-socket" d={`M ${socketX} ${centerY - radius} A ${radius} ${radius} 0 0 0 ${socketX} ${centerY + radius}`} />
        <text x={node.width / 2} y={node.height - 5} textAnchor="middle">{title}</text>
      </g>
    ), node, nodeHeight, onResizeStart);
  }

  if (node.kind === 'package') {
    const tabWidth = Math.min(92, Math.max(54, node.width * 0.42));
    const tabHeight = 22;

    return withResizeHandle((
      <g className={className} transform={`translate(${node.x} ${node.y})`} {...pointerHandlers}>
        <path className="package-shape" d={`M 0 ${tabHeight} V 6 H ${tabWidth} L ${tabWidth + 12} ${tabHeight} H ${node.width} V ${nodeHeight} H 0 Z`} />
        <text x="10" y="19" textAnchor="start">{title}</text>
        {ownedElements.map((element, index) => (
          <OwnedElementText key={element.id} element={element} y={52 + index * 18} nodeWidth={node.width} selected={selectedOwnedElementId === element.id} onSelect={() => onOwnedElementSelect(element.id)} />
        ))}
      </g>
    ), node, nodeHeight, onResizeStart);
  }

  if (node.kind === 'node' || node.kind === 'device') {
    const depth = 12;
    const label = node.kind === 'device' ? '«device»' : '«node»';

    return withResizeHandle((
      <g className={className} transform={`translate(${node.x} ${node.y})`} {...pointerHandlers}>
        <path className="deployment-node-shape" d={`M 0 ${depth} L ${depth} 0 H ${node.width} V ${nodeHeight - depth} L ${node.width - depth} ${nodeHeight} H 0 Z`} />
        <path className="deployment-node-depth" d={`M 0 ${depth} H ${node.width - depth} L ${node.width} 0 M ${node.width - depth} ${depth} V ${nodeHeight}`} />
        <text className="compartment-label" x={node.width / 2} y="28" textAnchor="middle">{label}</text>
        <text x={node.width / 2} y="50" textAnchor="middle">{title}</text>
        {ownedElements.map((element, index) => (
          <OwnedElementText key={element.id} element={element} y={76 + index * 18} nodeWidth={node.width} selected={selectedOwnedElementId === element.id} onSelect={() => onOwnedElementSelect(element.id)} />
        ))}
      </g>
    ), node, nodeHeight, onResizeStart);
  }

  if (node.kind === 'executionEnvironment') {
    return withResizeHandle((
      <g className={className} transform={`translate(${node.x} ${node.y})`} {...pointerHandlers}>
        <rect width={node.width} height={nodeHeight} rx="5" />
        <text className="compartment-label" x={node.width / 2} y="24" textAnchor="middle">«executionEnvironment»</text>
        <text x={node.width / 2} y="46" textAnchor="middle">{title}</text>
        {ownedElements.map((element, index) => (
          <OwnedElementText key={element.id} element={element} y={72 + index * 18} nodeWidth={node.width} selected={selectedOwnedElementId === element.id} onSelect={() => onOwnedElementSelect(element.id)} />
        ))}
      </g>
    ), node, nodeHeight, onResizeStart);
  }

  if (node.kind === 'state') {
    return withResizeHandle((
      <g className={className} transform={`translate(${node.x} ${node.y})`} {...pointerHandlers}>
        <rect width={node.width} height={nodeHeight} rx="14" />
        <text x={node.width / 2} y="26" textAnchor="middle">{title}</text>
        {ownedElements.length > 0 ? <line x1="0" y1="38" x2={node.width} y2="38" /> : null}
        {ownedElements.map((element, index) => (
          <OwnedElementText key={element.id} element={element} y={60 + index * 18} nodeWidth={node.width} selected={selectedOwnedElementId === element.id} onSelect={() => onOwnedElementSelect(element.id)} />
        ))}
      </g>
    ), node, nodeHeight, onResizeStart);
  }

  if (node.kind === 'artifact') {
    const foldSize = 18;

    return withResizeHandle((
      <g className={className} transform={`translate(${node.x} ${node.y})`} {...pointerHandlers}>
        <path d={`M 0 0 H ${node.width - foldSize} L ${node.width} ${foldSize} V ${nodeHeight} H 0 Z`} />
        <path className="artifact-fold" d={`M ${node.width - foldSize} 0 V ${foldSize} H ${node.width}`} />
        <text className="compartment-label" x={node.width / 2} y="24" textAnchor="middle">«artifact»</text>
        <text x={node.width / 2} y="44" textAnchor="middle">{title}</text>
        {ownedElements.map((element, index) => (
          <OwnedElementText key={element.id} element={element} y={70 + index * 18} nodeWidth={node.width} selected={selectedOwnedElementId === element.id} onSelect={() => onOwnedElementSelect(element.id)} />
        ))}
      </g>
    ), node, nodeHeight, onResizeStart);
  }

  return withResizeHandle((
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
  ), node, nodeHeight, onResizeStart);
}

function withResizeHandle(nodeContent: React.ReactNode, node: UmlNode, nodeHeight: number, onResizeStart: (event: React.PointerEvent<SVGGElement>) => void): React.ReactNode {
  const handlePosition = resizeHandlePosition(node, nodeHeight);

  return (
    <>
      {nodeContent}
      <g className="resize-handle" transform={`translate(${handlePosition.x} ${handlePosition.y})`} onPointerDown={onResizeStart}>
        <rect width="16" height="16" rx="2" />
        <path d="M5 12 L12 5 M9 12 L12 9" />
      </g>
    </>
  );
}

function resizeHandlePosition(node: UmlNode, nodeHeight: number): Point {
  if (node.kind === 'lifeline') {
    return { x: node.x + node.width / 2 - 8, y: node.y + nodeHeight - 8 };
  }

  if (node.kind === 'forkNode' || node.kind === 'joinNode') {
    return { x: node.x + node.width - 8, y: node.y + nodeHeight / 2 - 8 };
  }

  return { x: node.x + node.width - 16, y: node.y + nodeHeight - 16 };
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