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
import { addOwnedElement, addPaletteNode, connectNodes, createDiagramDocument, moveNode, renameEdge, renameEdgeSequenceNumber, renameNode, renameOwnedElement, updateEdgeAnchor, updateEdgeEndpoint, updateEdgeMultiplicity, updateEdgeOrthogonalElbow, updateEdgeRelationship, updateEdgeRoute, updateOwnedElementKind, type EdgeAnchor, type EdgeRoute, type UmlDiagramDocument, type UmlEdge, type UmlNode, type UmlOwnedElement, type UmlOwnedElementKind } from '../uml/editorModel.js';
import {
  attachInterfaceToComponent,
  attachInterfaceToPort,
  assemblyConnectorPolyline,
  createInterfaceOnComponent,
  createInterfacePairBetweenComponents,
  dragInterfaceOnComponent,
  dragPairedInterfaceJoint,
  findComponentForInterface,
  pickInterfacePairEndpointAtPoint,
  refineInterfacePairTargetId,
  INTERFACE_GLYPH_RADIUS,
  interfaceAttachmentSide,
  interfaceEdgeOffset,
  interfaceGlyphCenter,
  interfaceStemLength,
  interfaceStemResizeHandlePosition,
  isAssemblyPair,
  isInterfaceKind,
  isInterfaceNode,
  isPairedInterface,
  layoutInterfaceOnComponent,
  reflowInterfaceAfterComponentChange,
  reflowPairedInterface,
  replaceNode,
  resizeInterfaceStem,
  resizeInterfaceStemByPointer,
  resolveInterfacePortAttachment,
  sideAndOffsetFromPoint,
  swapPairedInterfaceRoles,
  updateInterfacePairRoute
} from '../uml/componentInterface.js';
import { computeBridgeCrossings, polylinePathWithBridges, sampleQuadraticPoints, type EdgePolyline } from '../uml/edgeBridges.js';
import { routeOrthogonalAvoidingObstacles, straightCrossesObstacles } from '../uml/orthogonalRouting.js';
import { getUmlConnectorNotation, isInteractionMessageKind } from '../uml/umlNotation.js';
import { renderActivityDiagramNode } from './diagrams/activityDiagram.js';
import { assemblyConnectorPathData, renderProvidedInterfaceNode, renderRequiredInterfaceNode } from './diagrams/componentInterfaces.js';
import { renderUseCaseDiagramNode } from './diagrams/useCaseDiagram.js';
import { communicationDiagramLabels, connectorLabels, diagramLabels, diagramScopes, messages, notationHints, type Locale, toolLabels } from './i18n.js';

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
const componentInterfaceNotationTools: PaletteTool[] = [
  { kind: 'providedInterface', label: 'Provided Interface', umlType: 'uml:Interface', defaultName: 'ProvidedInterface' },
  { kind: 'requiredInterface', label: 'Required Interface', umlType: 'uml:Interface', defaultName: 'RequiredInterface' }
];
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

interface ProjectOpenDetail {
  project?: SavedProjectFile;
  filePath?: string;
  format?: 'my-uml-multi-os-project';
  version?: 1;
  projectName?: string;
  documents?: UmlDiagramDocument[];
  activeDocumentId?: string;
}

interface ProjectOpenEvent extends Event {
  detail?: ProjectOpenDetail | SavedProjectFile;
}

interface ProjectFileHandle {
  createWritable: () => Promise<{ write: (contents: string | Blob) => Promise<void>; close: () => Promise<void> }>;
}

type SaveFilePickerWindow = typeof globalThis & {
  showSaveFilePicker?: (options: {
    suggestedName?: string;
    startIn?: FileSystemHandle | 'desktop' | 'documents' | 'downloads';
    types?: Array<{ description: string; accept: Record<string, string[]> }>;
  }) => Promise<ProjectFileHandle & { getParent?: () => Promise<FileSystemHandle> }>;
  showOpenFilePicker?: (options: {
    multiple?: boolean;
    startIn?: FileSystemHandle | 'desktop' | 'documents' | 'downloads';
    types?: Array<{ description: string; accept: Record<string, string[]> }>;
  }) => Promise<Array<ProjectFileHandle & { getFile: () => Promise<File> }>>;
  myUmlDesktop?: {
    openProject: () => Promise<{ filePath: string; contents: string } | null>;
    saveProject: (payload: {
      suggestedName: string;
      contents: string;
      existingPath?: string;
    }) => Promise<{ filePath: string } | null>;
    saveImage: (payload: {
      suggestedName: string;
      format: ImageExportFormat;
      dataBase64: string;
    }) => Promise<{ filePath: string } | null>;
  };
};

const lastProjectDirectoryStorageKey = 'my-uml-multi-os.last-project-directory';
const lastImageDirectoryStorageKey = 'my-uml-multi-os.last-image-directory';
const directoryHandleImageKey = 'last-image-directory';

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
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const saveProjectRef = useRef<() => Promise<boolean>>(async () => false);
  const [selectedTool, setSelectedTool] = useState<PaletteTool | undefined>();
  const [selectedConnector, setSelectedConnector] = useState<ConnectorTool | undefined>();
  const [pendingSourceNodeId, setPendingSourceNodeId] = useState<string | undefined>();
  const [selectedNodeId, setSelectedNodeId] = useState<string | undefined>();
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | undefined>();
  const [selectedOwnedElement, setSelectedOwnedElement] = useState<{ nodeId: string; elementId: string } | undefined>();
  const [projectSelected, setProjectSelected] = useState(false);
  const [diagramSelectedId, setDiagramSelectedId] = useState<string | undefined>(() => initialProject.activeDocumentId || undefined);
  const [collapsedDiagramIds, setCollapsedDiagramIds] = useState<Set<string>>(() => new Set(initialProject.documents.map((doc) => doc.id)));
  const [connectorPreviewPoint, setConnectorPreviewPoint] = useState<Point | undefined>();
  const [canvasZooms, setCanvasZooms] = useState<Record<string, number>>({});
  const [canvasPans, setCanvasPans] = useState<Record<string, Point>>({});
  const [locale, setLocale] = useState<Locale>('ko');
  const [theme, setTheme] = useState<Theme>('light');
  const [aboutOpen, setAboutOpen] = useState(false);
  const [diagramChooserOpen, setDiagramChooserOpen] = useState(false);
  const [imageExportOpen, setImageExportOpen] = useState(false);
  const [imageExportFormat, setImageExportFormat] = useState<ImageExportFormat>('png');
  const [imageExportTransparent, setImageExportTransparent] = useState(false);
  const [imageExportError, setImageExportError] = useState<string | undefined>();
  const [contextMenu, setContextMenu] = useState<ContextMenuState | undefined>();
  const [inspectorSplit, setInspectorSplit] = useState(0.5);
  const [paletteSplit, setPaletteSplit] = useState(0.55);
  const [treePanelCollapsed, setTreePanelCollapsed] = useState(false);
  const [propertiesPanelCollapsed, setPropertiesPanelCollapsed] = useState(false);
  const [paletteToolsCollapsed, setPaletteToolsCollapsed] = useState(false);
  const [connectorsCollapsed, setConnectorsCollapsed] = useState(false);
  const [paletteWidth, setPaletteWidth] = useState(200);
  const [inspectorWidth, setInspectorWidth] = useState(280);
  const [workspaceResizing, setWorkspaceResizing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const projectFileHandleRef = useRef<ProjectFileHandle | undefined>(undefined);
  const projectFilePathRef = useRef<string | undefined>(undefined);
  const canvasRef = useRef<SVGSVGElement>(null);
  const inspectorRef = useRef<HTMLElement>(null);
  const paletteRef = useRef<HTMLElement>(null);
  const workspaceRef = useRef<HTMLElement>(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState<ReadonlySet<string>>(new Set());
  const [boxSelectRect, setBoxSelectRect] = useState<{ x: number; y: number; width: number; height: number } | undefined>();
  const [edgeEndpointDragPreview, setEdgeEndpointDragPreview] = useState<{ edgeId: string; endpoint: 'source' | 'target'; point: Point } | undefined>();
  const dragStateRef = useRef<{
    nodeId: string;
    startClientX: number;
    startClientY: number;
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
    moved: boolean;
    attachmentSide?: EdgeAnchor;
    interfaceDrag?: {
      pointerX: number;
      pointerY: number;
      stemLength: number;
      edgeOffset: number;
      side: EdgeAnchor;
      componentId: string;
    };
    coMovedNodes?: { id: string; startX: number; startY: number }[];
  } | undefined>(undefined);
  const boxSelectRef = useRef<{ startClientX: number; startClientY: number; startCanvasX: number; startCanvasY: number; moved: boolean } | undefined>(undefined);
  const resizeStateRef = useRef<{ nodeId: string; nodeKind: UmlElementKind; startClientX: number; startClientY: number; startWidth: number; startHeight: number; minWidth: number; minHeight: number; mode?: 'default' | 'lifeline-span' | 'lifeline-width' } | undefined>(undefined);
  const connectorDragStateRef = useRef<{ sourceId: string; startClientX: number; startClientY: number; moved: boolean; sequenceY?: number; startedFromLine?: boolean } | undefined>(undefined);
  const messageReorderStateRef = useRef<{ edgeId: string; startClientY: number; startSequenceY: number } | undefined>(undefined);
  const activationResizeStateRef = useRef<{ edgeId: string; end: 'source' | 'target'; startClientY: number; startHeight: number } | undefined>(undefined);
  const operandSeparatorDragStateRef = useRef<{ nodeId: string; startClientY: number; startSeparatorY: number } | undefined>(undefined);
  const communicationEdgeDragStateRef = useRef<{ edgeId: string; startClientX: number; startClientY: number; startOffset: number; normalX: number; normalY: number } | undefined>(undefined);
  const edgeEndpointDragStateRef = useRef<{ edgeId: string; endpoint: 'source' | 'target'; startClientX: number; startClientY: number; moved: boolean } | undefined>(undefined);
  const edgeLabelDragStateRef = useRef<{ edgeId: string; startClientX: number; startClientY: number; startOffsetX: number; startOffsetY: number } | undefined>(undefined);
  const multiplicityLabelDragStateRef = useRef<{ edgeId: string; endpoint: 'source' | 'target'; startClientX: number; startClientY: number; startOffsetX: number; startOffsetY: number } | undefined>(undefined);
  const orthogonalSegmentDragStateRef = useRef<{ edgeId: string; axis: 'x' | 'y'; startClientX: number; startClientY: number; startDx: number; startDy: number } | undefined>(undefined);
  const pendingConnectorRef = useRef<ConnectorTool | undefined>(undefined);
  const pendingSourceNodeIdRef = useRef<string | undefined>(undefined);
  const treeRevealRequestRef = useRef<string | undefined>(undefined);

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
  const canvasPan = document ? canvasPans[document.id] ?? { x: 0, y: 0 } : { x: 0, y: 0 };
  const effectiveImageExportFormat = imageExportTransparent && !transparentImageExportFormats.includes(imageExportFormat) ? 'png' : imageExportFormat;
  const canDeleteDiagram = documents.length > 0;
  const hasSelection = Boolean(projectSelected || selectedDiagram || selectedNode || selectedEdge || selectedOwnedElementValue || selectedNodeIds.size > 0);
  const canDeleteSelectedDiagram = canDeleteDiagram && hasSelection;
  const canUndo = undoStack.length > 0;
  const canRedo = redoStack.length > 0;
  const activeConnector = selectedConnector ?? pendingConnectorRef.current;
  const activeMode = activeConnector ? connectorToolLabel(locale, activeConnector, document.kind) : selectedTool ? paletteToolLabel(locale, selectedTool, document.kind) : text.pointer;
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
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void saveProject();
      }
    }

    globalThis.addEventListener('keydown', handleKeyDown);
    return () => globalThis.removeEventListener('keydown', handleKeyDown);
  });

  useEffect(() => {
    function handleProjectOpen(event: ProjectOpenEvent) {
      const detail = event.detail;
      if (!detail) {
        return;
      }

      const project = 'project' in detail && detail.project ? detail.project : detail as SavedProjectFile;
      if (project.format !== 'my-uml-multi-os-project' || project.version !== 1) {
        return;
      }

      const filePath = 'filePath' in detail && typeof detail.filePath === 'string' ? detail.filePath : undefined;
      applyProjectFile(project, filePath);
    }

    globalThis.addEventListener('my-uml-open-project', handleProjectOpen as EventListener);
    return () => globalThis.removeEventListener('my-uml-open-project', handleProjectOpen as EventListener);
  }, []);

  useEffect(() => {
    const documentId = treeRevealRequestRef.current;
    if (!documentId || treePanelCollapsed || diagramSelectedId !== documentId) {
      return;
    }

    treeRevealRequestRef.current = undefined;
    const element = globalThis.document.querySelector(`[data-tree-diagram-id="${CSS.escape(documentId)}"]`);
    if (element instanceof HTMLElement) {
      element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }, [diagramSelectedId, treePanelCollapsed, documents]);

  saveProjectRef.current = saveProject;

  useEffect(() => {
    (globalThis as Record<string, unknown>).__myuml_has_unsaved_changes = () => hasUnsavedChanges;
    (globalThis as Record<string, unknown>).__myuml_save_project = () => saveProjectRef.current();
  });

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
    setHasUnsavedChanges(true);
  }

  function restoreProjectSnapshot(snapshot: ProjectSnapshot) {
    const restoredIds = new Set(snapshot.documents.map((candidate) => candidate.id));

    setProjectName(snapshot.projectName);
    setDocuments(snapshot.documents);
    setActiveDocumentId(snapshot.activeDocumentId);
    setOpenDocumentIds((current) => {
      const kept = current.filter((documentId) => restoredIds.has(documentId));
      if (snapshot.activeDocumentId && !kept.includes(snapshot.activeDocumentId)) {
        return [...kept, snapshot.activeDocumentId];
      }
      return kept;
    });
    resetSelection();
    if (snapshot.activeDocumentId) {
      setDiagramSelectedId(snapshot.activeDocumentId);
      setTreePanelCollapsed(false);
      treeRevealRequestRef.current = snapshot.activeDocumentId;
    }
    persistProjectFile(createProjectFile(snapshot.documents, snapshot.activeDocumentId, locale, snapshot.projectName));
  }

  function undoProjectChange() {
    setUndoStack((current) => {
      if (current.length === 0) {
        return current;
      }

      const previous = current[current.length - 1];
      setRedoStack((redoCurrent) => [...redoCurrent.slice(-99), { projectName, documents, activeDocumentId }]);
      restoreProjectSnapshot(previous);
      return current.slice(0, -1);
    });
  }

  function redoProjectChange() {
    setRedoStack((current) => {
      if (current.length === 0) {
        return current;
      }

      const next = current[current.length - 1];
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
    setDiagramSelectedId(nextDocument.id);
    setTreePanelCollapsed(false);
    treeRevealRequestRef.current = nextDocument.id;
  }

  function activateDocument(documentId: string) {
    setActiveDocumentId(documentId);
    setOpenDocumentIds((current) => (current.includes(documentId) ? current : [...current, documentId]));
    resetSelection();
    setDiagramSelectedId(documentId);
    setTreePanelCollapsed(false);
    treeRevealRequestRef.current = documentId;
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
    activationResizeStateRef.current = undefined;
    operandSeparatorDragStateRef.current = undefined;
    communicationEdgeDragStateRef.current = undefined;
    edgeEndpointDragStateRef.current = undefined;
    edgeLabelDragStateRef.current = undefined;
    multiplicityLabelDragStateRef.current = undefined;
    orthogonalSegmentDragStateRef.current = undefined;
    setEdgeEndpointDragPreview(undefined);
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
    projectFileHandleRef.current = undefined;
    projectFilePathRef.current = undefined;
    persistProjectFile(nextProject);
    resetSelection();
    setHasUnsavedChanges(false);
  }

  async function saveProject(): Promise<boolean> {
    const projectFile = createProjectFile(documents, activeDocumentId, locale, projectName);
    const serializedProject = JSON.stringify(projectFile, null, 2);
    const suggestedName = `${sanitizeFileName(projectName || document.name || 'my-uml-project')}.umlprj`;

    persistProjectFile(projectFile);

    const fileSystemWindow = globalThis as SaveFilePickerWindow;
    const desktop = fileSystemWindow.myUmlDesktop;

    if (desktop?.saveProject) {
      try {
        const result = await desktop.saveProject({
          suggestedName,
          contents: serializedProject,
          existingPath: projectFilePathRef.current
        });
        if (result?.filePath) {
          projectFilePathRef.current = result.filePath;
          projectFileHandleRef.current = undefined;
          rememberLastDirectory(result.filePath, 'project');
          setHasUnsavedChanges(false);
          return true;
        }
      } catch {
        // ignore dialog / IO failures
      }
      return false;
    }

    if (projectFileHandleRef.current) {
      await writeProjectToFileHandle(projectFileHandleRef.current, serializedProject);
      setHasUnsavedChanges(false);
      return true;
    }

    if (fileSystemWindow.showSaveFilePicker) {
      try {
        const fileHandle = await fileSystemWindow.showSaveFilePicker({
          suggestedName,
          startIn: await readStoredDirectoryHandle('project') ?? await readStoredDirectoryHandle('image') ?? 'documents',
          types: [{ description: 'MyUML project', accept: { 'application/json': ['.umlprj', '.json'] } }]
        });

        await writeProjectToFileHandle(fileHandle, serializedProject);
        projectFileHandleRef.current = fileHandle;
        await rememberDirectoryHandleFromFile(fileHandle, 'project');
        setHasUnsavedChanges(false);
        return true;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return false;
        }
      }
    }

    downloadProjectFile(serializedProject, suggestedName);
    setHasUnsavedChanges(false);
    return true;
  }

  async function saveDiagramImage() {
    const svg = canvasRef.current;

    if (!svg) {
      return;
    }

    try {
      setImageExportError(undefined);
      const format = imageExportTransparent && !transparentImageExportFormats.includes(imageExportFormat) ? 'png' : imageExportFormat;
      const extension = format === 'jpeg' ? 'jpg' : format;
      const suggestedName = `${sanitizeFileName(document.name || 'diagram')}.${extension}`;
      const { canvas, backgroundColor } = await rasterizeDiagramSvg(svg, { transparent: imageExportTransparent });
      const blob = format === 'gif'
        ? encodeGif(canvas, imageExportTransparent)
        : await encodeCanvas(canvas, imageExportMimeTypes[format], format === 'jpeg' ? 0.92 : 0.96, backgroundColor);

      const fileSystemWindow = globalThis as SaveFilePickerWindow;
      const desktop = fileSystemWindow.myUmlDesktop;

      if (desktop?.saveImage) {
        const dataBase64 = await blobToBase64(blob);
        const result = await desktop.saveImage({ suggestedName, format, dataBase64 });
        if (result?.filePath) {
          rememberLastDirectory(result.filePath, 'image');
          setImageExportOpen(false);
        }
        return;
      }

      if (fileSystemWindow.showSaveFilePicker) {
        try {
          const fileHandle = await fileSystemWindow.showSaveFilePicker({
            suggestedName,
            startIn: await readStoredDirectoryHandle('image') ?? await readStoredDirectoryHandle('project') ?? 'documents',
            types: [{
              description: `${format.toUpperCase()} image`,
              accept: { [imageExportMimeTypes[format]]: [`.${extension}`] }
            }]
          });
          const writable = await fileHandle.createWritable();
          await writable.write(blob);
          await writable.close();
          await rememberDirectoryHandleFromFile(fileHandle, 'image');
          setImageExportOpen(false);
          return;
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') {
            return;
          }
        }
      }

      downloadBlob(blob, suggestedName);
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

  async function chooseAndOpenProject() {
    const fileSystemWindow = globalThis as SaveFilePickerWindow;
    const desktop = fileSystemWindow.myUmlDesktop;

    if (desktop?.openProject) {
      try {
        const result = await desktop.openProject();
        if (!result) {
          return;
        }
        const parsed = JSON.parse(result.contents) as SavedProjectFile;
        if (parsed.format !== 'my-uml-multi-os-project' || parsed.version !== 1) {
          throw new Error('Unsupported MyUML project file.');
        }
        applyProjectFile(parsed, result.filePath);
        rememberLastDirectory(result.filePath, 'project');
      } catch (error) {
        if (error instanceof Error) {
          globalThis.alert(error.message);
        }
      }
      return;
    }

    if (fileSystemWindow.showOpenFilePicker) {
      try {
        const [fileHandle] = await fileSystemWindow.showOpenFilePicker({
          multiple: false,
          startIn: await readStoredDirectoryHandle('project') ?? await readStoredDirectoryHandle('image') ?? 'documents',
          types: [{ description: 'MyUML project', accept: { 'application/json': ['.umlprj', '.json'] } }]
        });
        const file = await fileHandle.getFile();
        projectFileHandleRef.current = fileHandle;
        await rememberDirectoryHandleFromFile(fileHandle, 'project');
        await openProject(file, undefined);
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
      }
    }

    fileInputRef.current?.click();
  }

  async function openProject(file: File | undefined, filePath?: string) {
    if (!file) {
      return;
    }

    const parsed = JSON.parse(await file.text()) as SavedProjectFile;

    if (parsed.format !== 'my-uml-multi-os-project' || parsed.version !== 1) {
      throw new Error('Unsupported MyUML project file.');
    }

    applyProjectFile(parsed, filePath);
  }

  function applyProjectFile(projectFile: SavedProjectFile, filePath?: string) {
    const normalizedProject = normalizeProjectFile(projectFile, locale);

    pushUndoSnapshot();
    setHasUnsavedChanges(false);
    setProjectName(normalizedProject.projectName ?? 'My UML Project');
    setDocuments(normalizedProject.documents);
    setActiveDocumentId(normalizedProject.activeDocumentId || undefined);
    setOpenDocumentIds(normalizedProject.activeDocumentId ? [normalizedProject.activeDocumentId] : []);
    setCollapsedDiagramIds(new Set(normalizedProject.documents.map((doc) => doc.id)));
    projectFileHandleRef.current = filePath ? undefined : projectFileHandleRef.current;
    projectFilePathRef.current = filePath;
    if (filePath) {
      rememberLastDirectory(filePath, 'project');
    }
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
    activationResizeStateRef.current = undefined;
    operandSeparatorDragStateRef.current = undefined;
    resizeStateRef.current = undefined;
    dragStateRef.current = undefined;
    boxSelectRef.current = undefined;
    setPendingSourceNodeId(undefined);
    setConnectorPreviewPoint(undefined);
    setSelectedNodeId(undefined);
    setSelectedEdgeId(undefined);
    setSelectedOwnedElement(undefined);
    setSelectedNodeIds(new Set());
    setBoxSelectRect(undefined);
    setProjectSelected(false);
    setDiagramSelectedId(undefined);
    setContextMenu(undefined);
  }

  function handleCanvasPointerDown(event: React.PointerEvent<SVGSVGElement>) {
    if (selectedTool || selectedConnector || pendingConnectorRef.current || !canvasRef.current) {
      return;
    }
    const point = clientToCanvasPoint(event.clientX, event.clientY);

    if (!point) {
      return;
    }

    boxSelectRef.current = {
      startClientX: event.clientX,
      startClientY: event.clientY,
      startCanvasX: point.x,
      startCanvasY: point.y,
      moved: false
    };
  }

  function addNodeAtCanvas(event: React.MouseEvent<SVGSVGElement>) {
    setContextMenu(undefined);

    if (!selectedTool) {
      if (boxSelectRef.current?.moved) {
        boxSelectRef.current = undefined;
        return;
      }
      clearCanvasSelection();
      return;
    }

    const point = clientToCanvasPoint(event.clientX, event.clientY);

    if (!point) {
      return;
    }

    const x = Math.round(point.x - 70);
    const y = Math.round(point.y - 32);
    const nextDocument = attachComponentSurfaceNode(addPaletteNode(document, selectedTool, Math.max(24, x), Math.max(24, y)));

    updateActiveDocument(() => nextDocument);
    setSelectedNodeId(nextDocument.nodes[nextDocument.nodes.length - 1].id);
    setSelectedEdgeId(undefined);
    setSelectedOwnedElement(undefined);
    setSelectedTool(undefined);
  }

  function addNodeFromContext(tool: PaletteTool, x: number, y: number) {
    const nextDocument = attachComponentSurfaceNode(addPaletteNode(document, tool, Math.max(24, Math.round(x - 70)), Math.max(24, Math.round(y - 32))));

    updateActiveDocument(() => nextDocument);
    setSelectedNodeId(nextDocument.nodes[nextDocument.nodes.length - 1].id);
    setSelectedEdgeId(undefined);
    setSelectedOwnedElement(undefined);
    setContextMenu(undefined);
  }

  function addComponentSurfaceNodeFromContext(componentId: string, kind: 'port' | 'providedInterface' | 'requiredInterface') {
    const component = document.nodes.find((node) => node.id === componentId);
    const tool = componentSurfaceTool(kind);

    if (!component || !tool) {
      setContextMenu(undefined);
      return;
    }

    const count = document.nodes.filter((node) => node.kind === kind).length;
    const withNode = addPaletteNode(document, tool, component.x + component.width, component.y + 48 + count * 36);
    const created = withNode.nodes[withNode.nodes.length - 1];
    const nextDocument = isInterfaceKind(kind)
      ? replaceNode(withNode, createInterfaceOnComponent(created, component, 'right', 48 + count * 36))
      : attachComponentSurfaceNode(withNode);

    updateActiveDocument(() => nextDocument);
    setSelectedNodeId(nextDocument.nodes[nextDocument.nodes.length - 1].id);
    setSelectedEdgeId(undefined);
    setSelectedOwnedElement(undefined);
    setContextMenu(undefined);
  }

  function addInterfaceToPortFromContext(portId: string, kind: 'providedInterface' | 'requiredInterface') {
    const port = document.nodes.find((node) => node.id === portId && node.kind === 'port');
    const tool = componentSurfaceTool(kind);

    if (!port || !tool) {
      setContextMenu(undefined);
      return;
    }

    const component = findComponentForInterface(document.nodes, port)
      ?? (port.parentComponentId
        ? document.nodes.find((node) => node.id === port.parentComponentId && node.kind === 'component')
        : undefined);

    if (!component) {
      setContextMenu(undefined);
      return;
    }

    const withNode = addPaletteNode(document, tool, component.x + component.width, component.y + 48);
    const created = withNode.nodes[withNode.nodes.length - 1];
    const placed = attachInterfaceToPort(created, component, port);
    const nextDocument = replaceNode(withNode, placed);

    updateActiveDocument(() => nextDocument);
    setSelectedNodeId(placed.id);
    setSelectedEdgeId(undefined);
    setSelectedOwnedElement(undefined);
    setContextMenu(undefined);
  }

  function componentSurfaceTool(kind: 'port' | 'providedInterface' | 'requiredInterface'): PaletteTool | undefined {
    return definition.palette.find((candidate) => candidate.kind === kind) ?? componentInterfaceNotationTools.find((candidate) => candidate.kind === kind);
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

    const point = clientToCanvasPoint(event.clientX, event.clientY);

    if (!point) {
      return;
    }

    const x = Math.round(point.x - 62);
    const y = Math.round(point.y - 22);
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

  function completeConnector(sourceId: string, targetId: string, dropPoint?: { x: number; y: number }) {
    const connector = selectedConnector ?? pendingConnectorRef.current;

    if (!connector) {
      return;
    }

    const source = document.nodes.find((node) => node.id === sourceId);
    const target = document.nodes.find((node) => node.id === targetId);

    if (document.kind === 'sequence' && isInteractionMessageKind(connector.kind) && (source?.kind !== 'lifeline' || target?.kind !== 'lifeline')) {
      return;
    }

    if (document.kind === 'communication' && !isCommunicationParticipant(source?.kind)) {
      return;
    }

    if (document.kind === 'communication' && isInteractionMessageKind(connector.kind) && !isCommunicationParticipant(target?.kind)) {
      return;
    }

    if (document.kind === 'communication' && isCommunicationLinkEdge(connector.kind) && !isCommunicationParticipant(target?.kind)) {
      return;
    }

    if (connector.kind === 'interfacePair') {
      // Component/port → component/port: draw provided + required only (no assembly edge).
      // Prefer ports when the drop lands on a component near a port (port→port).
      const point = dropPoint ?? connectorPreviewPoint;
      const refinedTargetId = refineInterfacePairTargetId(document, targetId, point);
      const refinedTarget = document.nodes.find((node) => node.id === refinedTargetId) ?? target;
      const sourceOk = source?.kind === 'component' || source?.kind === 'port';
      const targetOk = refinedTarget?.kind === 'component' || refinedTarget?.kind === 'port';
      if (sourceOk && targetOk && source && refinedTarget && source.id !== refinedTarget.id) {
        const nextDocument = createInterfacePairBetweenComponents(document, source.id, refinedTarget.id);
        if (nextDocument === document) {
          return;
        }
        const createdProvided = [...nextDocument.nodes].reverse().find((node) => node.kind === 'providedInterface');
        updateActiveDocument(() => nextDocument);
        clearConnectorState();
        setSelectedConnector(undefined);
        setSelectedTool(undefined);
        setSelectedNodeId(createdProvided?.id);
        setSelectedEdgeId(undefined);
        setSelectedOwnedElement(undefined);
        return;
      }
      return;
    }

    if (connector.kind === 'assemblyConnector') {
      // Assembly Connector is a separate tool: only link existing provided ↔ required.
      if (!source || !target || !isAssemblyPair(source, target, document.nodes)) {
        return;
      }
    }

    const requestedSequenceY = connectorDragStateRef.current?.sequenceY ?? connectorPreviewPoint?.y ?? (source && target ? Math.max(source.y, target.y) + 72 : undefined);
    const sequenceDocument = document.kind === 'sequence' && isInteractionMessageKind(connector.kind) && source && target && requestedSequenceY !== undefined
      ? extendLifelinesForMessage(document, sourceId, targetId, requestedSequenceY)
      : document;
    const sequenceSource = sequenceDocument.nodes.find((node) => node.id === sourceId);
    const sequenceTarget = sequenceDocument.nodes.find((node) => node.id === targetId);
    const sequenceY = sequenceDocument.kind === 'sequence' && isInteractionMessageKind(connector.kind) && sequenceSource && sequenceTarget && requestedSequenceY !== undefined
      ? clampLifelineMessageY(sequenceSource, sequenceTarget, requestedSequenceY)
      : connectorPreviewPoint?.y;
    const connectedDocument = connectNodes(sequenceDocument, connector, sourceId, targetId, { sequenceY });
    const nextEdge = connectedDocument.edges[connectedDocument.edges.length - 1];
    const sourcePoint = connectorDragStateRef.current
      ? clientToCanvasPoint(connectorDragStateRef.current.startClientX, connectorDragStateRef.current.startClientY)
      : undefined;
    const positionedDocument = nextEdge && source && target && !isInteractionMessageKind(nextEdge.kind)
      ? applyCreatedEdgeEndpointPositions(connectedDocument, nextEdge.id, source, target, sourcePoint, dropPoint ?? connectorPreviewPoint)
      : connectedDocument;
    const nextDocument = positionedDocument.kind === 'sequence' && nextEdge && isInteractionMessageKind(nextEdge.kind)
      ? spaceSequenceMessagesAfterInsert(positionedDocument, nextEdge.id)
      : positionedDocument;

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

      if (document.kind === 'sequence' && isInteractionMessageKind(selectedConnector.kind) && sourceNode?.kind !== 'lifeline') {
        return;
      }

      if (document.kind === 'communication' && (isInteractionMessageKind(selectedConnector.kind) || isCommunicationLinkEdge(selectedConnector.kind)) && !isCommunicationParticipant(sourceNode?.kind)) {
        return;
      }

      pendingConnectorRef.current = selectedConnector;
      pendingSourceNodeIdRef.current = nodeId;
      setPendingSourceNodeId(nodeId);
      setSelectedNodeId(nodeId);
      setSelectedEdgeId(undefined);
      setSelectedOwnedElement(undefined);
      setConnectorPreviewPoint(initialConnectorPreviewPoint(sourceNode, document.kind));
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
    setSelectedConnector(undefined);
    setSelectedTool(undefined);
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

  function moveNodeLayer(nodeId: string, direction: 'front' | 'back') {
    updateActiveDocument((current) => reorderNodeLayer(current, nodeId, direction));
    setSelectedNodeId(nodeId);
    setSelectedEdgeId(undefined);
    setSelectedOwnedElement(undefined);
    setSelectedNodeIds(new Set([nodeId]));
    setContextMenu(undefined);
  }

  function deleteNode(nodeId: string) {
    updateActiveDocument((current) => {
      const target = current.nodes.find((node) => node.id === nodeId);
      const partnerId = target && isPairedInterface(target) ? target.interfacePartnerId : undefined;
      const removeIds = new Set([nodeId, ...(partnerId ? [partnerId] : [])]);
      return {
        ...current,
        nodes: current.nodes.filter((node) => !removeIds.has(node.id)),
        edges: current.edges.filter((edge) => !removeIds.has(edge.sourceId) && !removeIds.has(edge.targetId))
      };
    });
    resetSelection();
  }

  function deleteMultipleNodes(nodeIds: ReadonlySet<string>) {
    updateActiveDocument((current) => {
      const removeIds = new Set(nodeIds);
      for (const id of nodeIds) {
        const node = current.nodes.find((candidate) => candidate.id === id);
        if (node && isPairedInterface(node)) {
          removeIds.add(node.interfacePartnerId);
        }
      }
      return {
        ...current,
        nodes: current.nodes.filter((node) => !removeIds.has(node.id)),
        edges: current.edges.filter((edge) => !removeIds.has(edge.sourceId) && !removeIds.has(edge.targetId))
      };
    });
    setSelectedNodeIds(new Set());
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

    const messageIndex = document.edges.slice(0, document.edges.findIndex((candidate) => candidate.id === edgeId)).filter((candidate) => isInteractionMessageKind(candidate.kind)).length;
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

    if (selectedNodeIds.size > 0) {
      deleteMultipleNodes(selectedNodeIds);
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
      canvasX: (event.clientX - bounds.left - canvasPan.x) / canvasZoom,
      canvasY: (event.clientY - bounds.top - canvasPan.y) / canvasZoom
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

      if (document.kind === 'sequence' && isInteractionMessageKind(activeConnector.kind) && node.kind !== 'lifeline') {
        return;
      }

      if (document.kind === 'communication' && (isInteractionMessageKind(activeConnector.kind) || isCommunicationLinkEdge(activeConnector.kind)) && !isCommunicationParticipant(node.kind)) {
        return;
      }

      if (pendingSourceNodeIdValue) {
        updatePendingSequenceMessageY(event, node);
        completeConnector(pendingSourceNodeIdValue, node.id, pointerToCanvasPoint(event));
        return;
      }

      pendingConnectorRef.current = activeConnector;
      pendingSourceNodeIdRef.current = node.id;
      const startPoint = pointerToCanvasPoint(event) ?? initialConnectorPreviewPoint(node, document.kind);
      const sequenceY = document.kind === 'sequence' && node.kind === 'lifeline' ? clampLifelineMessageY(node, node, startPoint.y) : undefined;
      connectorDragStateRef.current = { sourceId: node.id, startClientX: event.clientX, startClientY: event.clientY, moved: false, sequenceY };
      setPendingSourceNodeId(node.id);
      setSelectedNodeId(node.id);
      setSelectedEdgeId(undefined);
      setSelectedOwnedElement(undefined);
      setConnectorPreviewPoint(sequenceY === undefined ? initialConnectorPreviewPoint(node, document.kind) : { x: initialConnectorPreviewPoint(node, document.kind).x, y: sequenceY });
      return;
    }

    const isInMultiSelect = selectedNodeIds.has(node.id) && selectedNodeIds.size > 1;

    if (!isInMultiSelect) {
      selectNode(node.id);
      setSelectedNodeIds(new Set());
    }

    const coMovedNodes = isInMultiSelect
      ? [...selectedNodeIds]
          .filter((id) => id !== node.id)
          .map((id) => {
            const n = document.nodes.find((n) => n.id === id);
            return n ? { id, startX: n.x, startY: n.y } : null;
          })
          .filter((n): n is { id: string; startX: number; startY: number } => n !== null)
      : undefined;

    const attachmentSide = isInterfaceNode(node)
      ? interfaceAttachmentSide(node)
      : undefined;
    const parentComponent = isInterfaceNode(node) ? findComponentForInterface(document.nodes, node) : undefined;
    const startPoint = pointerToCanvasPoint(event);
    const interfaceDrag = isInterfaceNode(node) && parentComponent && startPoint
      ? {
          pointerX: startPoint.x,
          pointerY: startPoint.y,
          stemLength: interfaceStemLength(node),
          edgeOffset: interfaceEdgeOffset(node, parentComponent),
          side: attachmentSide ?? 'right',
          componentId: parentComponent.id
        }
      : undefined;

    pushUndoSnapshot();
    dragStateRef.current = {
      nodeId: node.id,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: node.x,
      startY: node.y,
      startWidth: node.width,
      startHeight: node.height,
      moved: false,
      attachmentSide,
      interfaceDrag,
      coMovedNodes
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleCanvasPointerMove(event: React.PointerEvent<SVGElement>) {
    const resizeState = resizeStateRef.current;

    if (resizeState) {
      if (document.kind === 'component' && isInterfaceKind(resizeState.nodeKind)) {
        const point = clientToCanvasPoint(event.clientX, event.clientY);
        if (point) {
          updateActiveDocumentLive((current) => resizeComponentInterfaceByPointer(current, resizeState.nodeId, point));
        }
        return;
      }
      if (resizeState.mode === 'lifeline-span' && resizeState.nodeKind === 'lifeline') {
        const minHeight = Math.max(
          resizeState.minHeight,
          minimumLifelineSpanHeight(document, resizeState.nodeId)
        );
        const nextHeight = Math.max(
          minHeight,
          Math.round(resizeState.startHeight + (event.clientY - resizeState.startClientY) / canvasZoom)
        );
        updateActiveDocumentLive((current) => ({
          ...current,
          nodes: current.nodes.map((node) => (node.id === resizeState.nodeId ? { ...node, height: nextHeight } : node))
        }));
        return;
      }
      if (resizeState.mode === 'lifeline-width' && resizeState.nodeKind === 'lifeline') {
        const nextWidth = Math.max(
          resizeState.minWidth,
          Math.round(resizeState.startWidth + (event.clientX - resizeState.startClientX) / canvasZoom)
        );
        updateActiveDocumentLive((current) => ({
          ...current,
          nodes: current.nodes.map((node) => (node.id === resizeState.nodeId ? { ...node, width: nextWidth } : node))
        }));
        return;
      }
      const nextSize = resizeNodeSize(
        resizeState.nodeKind,
        resizeState.startWidth,
        resizeState.startHeight,
        (event.clientX - resizeState.startClientX) / canvasZoom,
        (event.clientY - resizeState.startClientY) / canvasZoom,
        { width: resizeState.minWidth, height: resizeState.minHeight }
      );
      updateActiveDocumentLive((current) => {
        const resized = resizeComponentDiagramNode(current, resizeState.nodeId, resizeState.startWidth, resizeState.startHeight, nextSize.width, nextSize.height);
        return clampCombinedFragmentSeparators(resized, resizeState.nodeId);
      });
      return;
    }

    const operandSeparatorDragState = operandSeparatorDragStateRef.current;

    if (operandSeparatorDragState) {
      const nextY = Math.round(
        operandSeparatorDragState.startSeparatorY + (event.clientY - operandSeparatorDragState.startClientY) / canvasZoom
      );
      updateActiveDocumentLive((current) => moveOperandSeparator(current, operandSeparatorDragState.nodeId, nextY));
      return;
    }

    const messageReorderState = messageReorderStateRef.current;

    if (messageReorderState) {
      const nextY = messageReorderState.startSequenceY + (event.clientY - messageReorderState.startClientY) / canvasZoom;
      updateActiveDocument((current) => moveSequenceMessage(current, messageReorderState.edgeId, nextY));
      return;
    }

    const activationResizeState = activationResizeStateRef.current;

    if (activationResizeState) {
      const nextHeight = Math.max(
        20,
        Math.round(activationResizeState.startHeight + (event.clientY - activationResizeState.startClientY) / canvasZoom)
      );
      updateActiveDocumentLive((current) => resizeSequenceActivation(current, activationResizeState.edgeId, activationResizeState.end, nextHeight));
      return;
    }

    const communicationEdgeDragState = communicationEdgeDragStateRef.current;

    if (communicationEdgeDragState) {
      const deltaX = (event.clientX - communicationEdgeDragState.startClientX) / canvasZoom;
      const deltaY = (event.clientY - communicationEdgeDragState.startClientY) / canvasZoom;
      const nextOffset = communicationEdgeDragState.startOffset + deltaX * communicationEdgeDragState.normalX + deltaY * communicationEdgeDragState.normalY;

      updateActiveDocumentLive((current) => moveCommunicationEdgeOffset(current, communicationEdgeDragState.edgeId, nextOffset));
      return;
    }

    const edgeEndpointDragState = edgeEndpointDragStateRef.current;

    if (edgeEndpointDragState) {
      const point = clientToCanvasPoint(event.clientX, event.clientY);
      if (!point) {
        return;
      }
      if (Math.hypot(event.clientX - edgeEndpointDragState.startClientX, event.clientY - edgeEndpointDragState.startClientY) > 4) {
        edgeEndpointDragState.moved = true;
      }
      setEdgeEndpointDragPreview({ edgeId: edgeEndpointDragState.edgeId, endpoint: edgeEndpointDragState.endpoint, point });
      return;
    }

    const orthogonalSegmentDragState = orthogonalSegmentDragStateRef.current;

    if (orthogonalSegmentDragState) {
      const deltaX = (event.clientX - orthogonalSegmentDragState.startClientX) / canvasZoom;
      const deltaY = (event.clientY - orthogonalSegmentDragState.startClientY) / canvasZoom;
      const nextElbow = {
        dx: clamp(Math.round(orthogonalSegmentDragState.startDx + (orthogonalSegmentDragState.axis === 'x' ? deltaX : 0)), -480, 480),
        dy: clamp(Math.round(orthogonalSegmentDragState.startDy + (orthogonalSegmentDragState.axis === 'y' ? deltaY : 0)), -480, 480)
      };
      updateActiveDocumentLive((current) => updateEdgeOrthogonalElbow(current, orthogonalSegmentDragState.edgeId, nextElbow));
      return;
    }

    const edgeLabelDragState = edgeLabelDragStateRef.current;

    if (edgeLabelDragState) {
      updateActiveDocumentLive((current) => moveEdgeLabelOffset(
        current,
        edgeLabelDragState.edgeId,
        edgeLabelDragState.startOffsetX + (event.clientX - edgeLabelDragState.startClientX) / canvasZoom,
        edgeLabelDragState.startOffsetY + (event.clientY - edgeLabelDragState.startClientY) / canvasZoom
      ));
      return;
    }

    const multiplicityLabelDragState = multiplicityLabelDragStateRef.current;

    if (multiplicityLabelDragState) {
      updateActiveDocumentLive((current) => moveEdgeMultiplicityOffset(
        current,
        multiplicityLabelDragState.edgeId,
        multiplicityLabelDragState.endpoint,
        multiplicityLabelDragState.startOffsetX + (event.clientX - multiplicityLabelDragState.startClientX) / canvasZoom,
        multiplicityLabelDragState.startOffsetY + (event.clientY - multiplicityLabelDragState.startClientY) / canvasZoom
      ));
      return;
    }

    const dragState = dragStateRef.current;

    if (!dragState) {
      const boxSelect = boxSelectRef.current;
      if (boxSelect && !resizeState && !messageReorderStateRef.current && canvasRef.current) {
        const dx = event.clientX - boxSelect.startClientX;
        const dy = event.clientY - boxSelect.startClientY;
        if (Math.hypot(dx, dy) > 5) {
          boxSelect.moved = true;
          const point = clientToCanvasPoint(event.clientX, event.clientY);

          if (!point) {
            return;
          }

          const curX = point.x;
          const curY = point.y;
          setBoxSelectRect({
            x: Math.min(boxSelect.startCanvasX, curX),
            y: Math.min(boxSelect.startCanvasY, curY),
            width: Math.abs(curX - boxSelect.startCanvasX),
            height: Math.abs(curY - boxSelect.startCanvasY)
          });
        }
        return;
      }

      if ((selectedConnector || pendingConnectorRef.current) && pendingSourceNodeIdRef.current && canvasRef.current) {
        const point = clientToCanvasPoint(event.clientX, event.clientY);
        const connectorDragState = connectorDragStateRef.current;

        if (connectorDragState && Math.hypot(event.clientX - connectorDragState.startClientX, event.clientY - connectorDragState.startClientY) > 5) {
          connectorDragState.moved = true;
        }

        if (!point) {
          return;
        }

        const previewY = point.y;

        if (connectorDragState) {
          connectorDragState.sequenceY = previewY;
        }

        setConnectorPreviewPoint({
          x: point.x,
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
    const pointer = clientToCanvasPoint(event.clientX, event.clientY);

    const applyMove = (current: UmlDiagramDocument) => {
      if (dragState.interfaceDrag && pointer) {
        return moveInterfaceDiagramNode(current, dragState.nodeId, pointer, dragState.interfaceDrag);
      }

      if (dragState.coMovedNodes && dragState.coMovedNodes.length > 0) {
        const moveDX = nextX - dragState.startX;
        const moveDY = nextY - dragState.startY;
        let result = moveComponentDiagramNode(current, dragState.nodeId, nextX, nextY);
        for (const coNode of dragState.coMovedNodes) {
          result = moveComponentDiagramNode(result, coNode.id, Math.max(0, coNode.startX + moveDX), Math.max(0, coNode.startY + moveDY));
        }
        return result;
      }

      return moveComponentDiagramNode(current, dragState.nodeId, nextX, nextY);
    };

    // Live updates during drag; undo snapshot was taken on pointer-down.
    updateActiveDocumentLive(applyMove);
  }

  function pointerToCanvasPoint(event: React.PointerEvent<SVGElement>): Point | undefined {
    if (!canvasRef.current) {
      return undefined;
    }

    return clientToCanvasPoint(event.clientX, event.clientY);
  }

  function clientToCanvasPoint(clientX: number, clientY: number): Point | undefined {
    if (!canvasRef.current) {
      return undefined;
    }

    const bounds = canvasRef.current.getBoundingClientRect();

    return {
      x: (clientX - bounds.left - canvasPan.x) / canvasZoom,
      y: (clientY - bounds.top - canvasPan.y) / canvasZoom
    };
  }

  function handleNodePointerUp(event: React.PointerEvent<SVGGElement>, node: UmlNode) {
    event.stopPropagation();

    if (!selectedConnector && !pendingConnectorRef.current) {
      const drag = dragStateRef.current;
      if (drag?.coMovedNodes && !drag.moved) {
        selectNode(node.id);
        setSelectedNodeIds(new Set());
      }
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
      completeConnector(pendingSourceNodeIdValue, node.id, pointerToCanvasPoint(event));
      return;
    }

    connectorDragStateRef.current = undefined;
  }

  function handleCanvasWheel(event: React.WheelEvent<SVGSVGElement>) {
    event.preventDefault();
    setContextMenu(undefined);
    updateCanvasZoom(event.deltaY < 0 ? 0.1 : -0.1);
  }

  function handleCanvasPointerUp(event: React.PointerEvent<SVGSVGElement>) {
    const edgeEndpointDragState = edgeEndpointDragStateRef.current;

    if (edgeEndpointDragState) {
      const point = pointerToCanvasPoint(event);
      const edge = document.edges.find((candidate) => candidate.id === edgeEndpointDragState.edgeId);
      const hit = point && edge ? findEdgeEndpointDropNode(document, edge, edgeEndpointDragState.endpoint, point) : undefined;

      if (hit && edge && point) {
        const endpointAnchor = edgeAnchorFromNodePoint(hit, point);
        updateActiveDocument((current) => updateEdgeAnchor(
          updateEdgeEndpoint(current, edgeEndpointDragState.edgeId, edgeEndpointDragState.endpoint, hit.id),
          edgeEndpointDragState.edgeId,
          edgeEndpointDragState.endpoint,
          endpointAnchor.anchor,
          endpointAnchor.offset
        ));
        setSelectedNodeId(undefined);
        setSelectedEdgeId(edgeEndpointDragState.edgeId);
        setSelectedOwnedElement(undefined);
      }

      edgeEndpointDragStateRef.current = undefined;
      setEdgeEndpointDragPreview(undefined);
      stopDragging();
      return;
    }

    const pendingSourceNodeIdValue = pendingSourceNodeIdRef.current;
    const activeConnector = selectedConnector ?? pendingConnectorRef.current;

    if (activeConnector && pendingSourceNodeIdValue && document.kind === 'communication') {
      const point = pointerToCanvasPoint(event);
      if (point) {
        const hit = [...document.nodes].reverse().find((node) =>
          isCommunicationParticipant(node.kind)
          && point.x >= node.x
          && point.x <= node.x + node.width
          && point.y >= node.y
          && point.y <= node.y + node.height
          && node.id !== pendingSourceNodeIdValue
        );
        if (hit) {
          completeConnector(pendingSourceNodeIdValue, hit.id);
          return;
        }
      }
    }

    // Component pair / assembly: complete on component/port under the pointer when the drag ends on empty gap.
    if (
      (activeConnector?.kind === 'interfacePair' || activeConnector?.kind === 'assemblyConnector')
      && pendingSourceNodeIdValue
      && document.kind === 'component'
    ) {
      const point = pointerToCanvasPoint(event);
      if (point) {
        const source = document.nodes.find((node) => node.id === pendingSourceNodeIdValue);
        if (activeConnector.kind === 'interfacePair' && (source?.kind === 'component' || source?.kind === 'port')) {
          const hitId = pickInterfacePairEndpointAtPoint(document, point, pendingSourceNodeIdValue);
          if (hitId) {
            completeConnector(pendingSourceNodeIdValue, hitId, point);
            return;
          }
        }
        const hit = [...document.nodes].reverse().find((node) => {
          if (node.id === pendingSourceNodeIdValue) {
            return false;
          }
          const inBounds = point.x >= node.x - 8
            && point.x <= node.x + node.width + 8
            && point.y >= node.y - 8
            && point.y <= node.y + node.height + 8;
          if (!inBounds) {
            return false;
          }
          if (activeConnector.kind === 'assemblyConnector' && source && isAssemblyPair(source, node, document.nodes)) {
            return true;
          }
          return false;
        });
        if (hit) {
          completeConnector(pendingSourceNodeIdValue, hit.id);
          return;
        }
      }
    }

    stopDragging();
  }

  function stopDragging() {
    dragStateRef.current = undefined;
    resizeStateRef.current = undefined;
    messageReorderStateRef.current = undefined;
    activationResizeStateRef.current = undefined;
    operandSeparatorDragStateRef.current = undefined;
    communicationEdgeDragStateRef.current = undefined;
    edgeEndpointDragStateRef.current = undefined;
    edgeLabelDragStateRef.current = undefined;
    orthogonalSegmentDragStateRef.current = undefined;
    setEdgeEndpointDragPreview(undefined);

    const boxSelect = boxSelectRef.current;
    if (boxSelect?.moved) {
      if (boxSelectRect) {
        const ids = new Set(
          document.nodes
            .filter((node) => nodeIntersectsRect(node, boxSelectRect))
            .map((node) => node.id)
        );
        setSelectedNodeIds(ids);
        setSelectedNodeId(undefined);
        setSelectedEdgeId(undefined);
      }
      setBoxSelectRect(undefined);
    } else {
      boxSelectRef.current = undefined;
      setBoxSelectRect(undefined);
    }

    if (connectorDragStateRef.current?.moved) {
      pendingSourceNodeIdRef.current = undefined;
      pendingConnectorRef.current = undefined;
      setPendingSourceNodeId(undefined);
      setConnectorPreviewPoint(undefined);
    }

    connectorDragStateRef.current = undefined;
  }

  function beginMessageFromLifelineLine(event: React.PointerEvent<SVGElement>, node: UmlNode) {
    const pendingSourceNodeIdValue = pendingSourceNodeIdRef.current;
    const activeConnector = selectedConnector ?? pendingConnectorRef.current;
    const messageConnector = (activeConnector && isInteractionMessageKind(activeConnector.kind) ? activeConnector : undefined)
      ?? definition.connectors.find((connector) => connector.kind === 'message');

    if (document.kind !== 'sequence' || node.kind !== 'lifeline' || !messageConnector || !isInteractionMessageKind(messageConnector.kind)) {
      return;
    }

    event.stopPropagation();
    const startPoint = pointerToCanvasPoint(event) ?? initialConnectorPreviewPoint(node, document.kind);
    const sequenceY = clampLifelineMessageY(node, node, startPoint.y);

    if (activeConnector && !isInteractionMessageKind(activeConnector.kind)) {
      return;
    }

    if (pendingSourceNodeIdValue && activeConnector && isInteractionMessageKind(activeConnector.kind)) {
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
    setConnectorPreviewPoint({ x: initialConnectorPreviewPoint(node, document.kind).x, y: sequenceY });
  }

  function updatePendingSequenceMessageY(event: React.PointerEvent<SVGElement>, target: UmlNode) {
    const connector = selectedConnector ?? pendingConnectorRef.current;

    if (document.kind !== 'sequence' || !connector || !isInteractionMessageKind(connector.kind) || target.kind !== 'lifeline') {
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

    setConnectorPreviewPoint({ x: initialConnectorPreviewPoint(target, document.kind).x, y: point.y });
  }

  function startNodeResize(event: React.PointerEvent<SVGGElement>, node: UmlNode, mode: 'default' | 'lifeline-span' | 'lifeline-width' = 'default') {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
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
    const minSize = minimumResizableNodeSize(node.kind, node.ownedElements, document.kind);
    const minHeight = mode === 'lifeline-span'
      ? Math.max(minSize.height, minimumLifelineSpanHeight(document, node.id))
      : minSize.height;
    resizeStateRef.current = {
      nodeId: node.id,
      nodeKind: node.kind,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startWidth: node.width,
      startHeight: node.height,
      minWidth: minSize.width,
      minHeight,
      mode
    };
  }

  function startOrthogonalSegmentDrag(event: React.PointerEvent<SVGGElement>, edge: UmlEdge, axis: 'x' | 'y') {
    if (selectedConnector || edge.route !== 'orthogonal') {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setContextMenu(undefined);
    pendingSourceNodeIdRef.current = undefined;
    connectorDragStateRef.current = undefined;
    setPendingSourceNodeId(undefined);
    setConnectorPreviewPoint(undefined);
    setSelectedNodeId(undefined);
    setSelectedEdgeId(edge.id);
    setSelectedOwnedElement(undefined);
    pushUndoSnapshot();
    orthogonalSegmentDragStateRef.current = {
      edgeId: edge.id,
      axis,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startDx: edge.orthogonalElbow?.dx ?? 0,
      startDy: edge.orthogonalElbow?.dy ?? 0
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function startMessageReorder(event: React.PointerEvent<SVGGElement>, edge: UmlEdge) {
    if (selectedConnector) {
      return;
    }

    if (document.kind === 'communication' && (isInteractionMessageKind(edge.kind) || isCommunicationLinkEdge(edge.kind))) {
      const drag = communicationEdgeDragBasis(document, edge, event.clientX, event.clientY);

      if (!drag) {
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
      communicationEdgeDragStateRef.current = drag;
      pushUndoSnapshot();
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

    if (document.kind !== 'sequence' || !isInteractionMessageKind(edge.kind)) {
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

  function startEdgeLabelDrag(event: React.PointerEvent<SVGTextElement>, edge: UmlEdge) {
    if (selectedConnector) {
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
    pushUndoSnapshot();
    edgeLabelDragStateRef.current = {
      edgeId: edge.id,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startOffsetX: edge.labelOffset?.x ?? 0,
      startOffsetY: edge.labelOffset?.y ?? 0
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function startMultiplicityLabelDrag(event: React.PointerEvent<SVGTextElement>, edge: UmlEdge, endpoint: 'source' | 'target') {
    if (selectedConnector) {
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
    pushUndoSnapshot();
    const startOffset = endpoint === 'source' ? edge.sourceMultiplicityOffset : edge.targetMultiplicityOffset;
    multiplicityLabelDragStateRef.current = {
      edgeId: edge.id,
      endpoint,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startOffsetX: startOffset?.x ?? 0,
      startOffsetY: startOffset?.y ?? 0
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function startOperandSeparatorDrag(event: React.PointerEvent<SVGGElement>, node: UmlNode) {
    if (selectedConnector || node.kind !== 'combinedFragment' || !combinedFragmentShowsSeparator(node.name)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setContextMenu(undefined);
    pendingSourceNodeIdRef.current = undefined;
    connectorDragStateRef.current = undefined;
    dragStateRef.current = undefined;
    resizeStateRef.current = undefined;
    setPendingSourceNodeId(undefined);
    setConnectorPreviewPoint(undefined);
    setSelectedNodeId(node.id);
    setSelectedEdgeId(undefined);
    setSelectedOwnedElement(undefined);
    pushUndoSnapshot();
    operandSeparatorDragStateRef.current = {
      nodeId: node.id,
      startClientY: event.clientY,
      startSeparatorY: operandSeparatorYForNode(node)
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function startActivationResize(event: React.PointerEvent<SVGGElement>, edge: UmlEdge, end: 'source' | 'target') {
    if (selectedConnector || document.kind !== 'sequence' || !isInteractionMessageKind(edge.kind)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setContextMenu(undefined);
    pendingSourceNodeIdRef.current = undefined;
    connectorDragStateRef.current = undefined;
    messageReorderStateRef.current = undefined;
    setPendingSourceNodeId(undefined);
    setConnectorPreviewPoint(undefined);
    setSelectedNodeId(undefined);
    setSelectedEdgeId(edge.id);
    setSelectedOwnedElement(undefined);
    pushUndoSnapshot();
    const startHeight = end === 'target' && edge.sourceId === edge.targetId
      ? Math.max(activationHeightForEdge(edge, 'target'), 54)
      : activationHeightForEdge(edge, end);
    activationResizeStateRef.current = {
      edgeId: edge.id,
      end,
      startClientY: event.clientY,
      startHeight
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function startEdgeEndpointDrag(event: React.PointerEvent<SVGGElement>, edge: UmlEdge, endpoint: 'source' | 'target') {
    if (selectedConnector) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setContextMenu(undefined);
    pendingSourceNodeIdRef.current = undefined;
    pendingConnectorRef.current = undefined;
    connectorDragStateRef.current = undefined;
    messageReorderStateRef.current = undefined;
    activationResizeStateRef.current = undefined;
    setPendingSourceNodeId(undefined);
    setConnectorPreviewPoint(undefined);
    setSelectedNodeId(undefined);
    setSelectedEdgeId(edge.id);
    setSelectedOwnedElement(undefined);
    edgeEndpointDragStateRef.current = {
      edgeId: edge.id,
      endpoint,
      startClientX: event.clientX,
      startClientY: event.clientY,
      moved: false
    };
    const point = pointerToCanvasPoint(event);
    if (point) {
      setEdgeEndpointDragPreview({ edgeId: edge.id, endpoint, point });
    }
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
    setCanvasPans((current) => ({ ...current, [document.id]: centeredCanvasPan(document, canvasRef.current) }));
  }

  function refreshApplication() {
    globalThis.location.reload();
  }

  function findNodeName(nodeId: string): string {
    return document.nodes.find((node) => node.id === nodeId)?.name ?? nodeId;
  }

  const paletteBothCollapsed = paletteToolsCollapsed && connectorsCollapsed;
  const inspectorBothCollapsed = treePanelCollapsed && propertiesPanelCollapsed;
  const effectivePaletteWidth = paletteBothCollapsed ? 48 : paletteWidth;
  const effectiveInspectorWidth = inspectorBothCollapsed ? 48 : inspectorWidth;

  function startPaletteResize(event: React.MouseEvent<HTMLDivElement>) {
    event.preventDefault();
    const workspace = workspaceRef.current;
    if (!workspace) {
      return;
    }

    setWorkspaceResizing(true);
    const onMove = (moveEvent: MouseEvent) => {
      const rect = workspace.getBoundingClientRect();
      const nextWidth = Math.round(moveEvent.clientX - rect.left);
      setPaletteWidth(Math.max(160, Math.min(420, nextWidth)));
      if (paletteToolsCollapsed && connectorsCollapsed) {
        setPaletteToolsCollapsed(false);
        setConnectorsCollapsed(false);
      }
    };
    const onUp = () => {
      setWorkspaceResizing(false);
      window.document.removeEventListener('mousemove', onMove);
      window.document.removeEventListener('mouseup', onUp);
    };
    window.document.addEventListener('mousemove', onMove);
    window.document.addEventListener('mouseup', onUp);
  }

  function startInspectorResize(event: React.MouseEvent<HTMLDivElement>) {
    event.preventDefault();
    const workspace = workspaceRef.current;
    if (!workspace) {
      return;
    }

    setWorkspaceResizing(true);
    const onMove = (moveEvent: MouseEvent) => {
      const rect = workspace.getBoundingClientRect();
      const nextWidth = Math.round(rect.right - moveEvent.clientX);
      setInspectorWidth(Math.max(200, Math.min(520, nextWidth)));
      if (treePanelCollapsed && propertiesPanelCollapsed) {
        setTreePanelCollapsed(false);
        setPropertiesPanelCollapsed(false);
      }
    };
    const onUp = () => {
      setWorkspaceResizing(false);
      window.document.removeEventListener('mousemove', onMove);
      window.document.removeEventListener('mouseup', onUp);
    };
    window.document.addEventListener('mousemove', onMove);
    window.document.addEventListener('mouseup', onUp);
  }

  function startInspectorSplitResize(event: React.MouseEvent<HTMLDivElement>) {
    event.preventDefault();
    const inspector = inspectorRef.current;
    if (!inspector) {
      return;
    }

    setWorkspaceResizing(true);
    const onMove = (moveEvent: MouseEvent) => {
      const rect = inspector.getBoundingClientRect();
      if (rect.height <= 0) {
        return;
      }
      setInspectorSplit(Math.max(0.15, Math.min(0.85, (moveEvent.clientY - rect.top) / rect.height)));
    };
    const onUp = () => {
      setWorkspaceResizing(false);
      window.document.removeEventListener('mousemove', onMove);
      window.document.removeEventListener('mouseup', onUp);
    };
    window.document.addEventListener('mousemove', onMove);
    window.document.addEventListener('mouseup', onUp);
  }

  function startPaletteSplitResize(event: React.MouseEvent<HTMLDivElement>) {
    event.preventDefault();
    const palette = paletteRef.current;
    if (!palette) {
      return;
    }

    setWorkspaceResizing(true);
    const onMove = (moveEvent: MouseEvent) => {
      const rect = palette.getBoundingClientRect();
      if (rect.height <= 0) {
        return;
      }
      setPaletteSplit(Math.max(0.2, Math.min(0.8, (moveEvent.clientY - rect.top) / rect.height)));
    };
    const onUp = () => {
      setWorkspaceResizing(false);
      window.document.removeEventListener('mousemove', onMove);
      window.document.removeEventListener('mouseup', onUp);
    };
    window.document.addEventListener('mousemove', onMove);
    window.document.addEventListener('mouseup', onUp);
  }

  return (
    <main className="shell" data-theme={theme} lang={locale} onClick={() => setContextMenu(undefined)}>
      <header className="topbar">
        {text.eyebrow ? <div><span className="eyebrow">{text.eyebrow}</span></div> : null}
        <div className="top-actions" aria-label={text.projectActions}>
          <input ref={fileInputRef} className="file-input" type="file" accept=".umlprj,.json,application/json" onChange={(event) => { void openProject(event.currentTarget.files?.[0]).catch((error) => { if (error instanceof Error) globalThis.alert(error.message); }); event.currentTarget.value = ''; }} />
          <button type="button" title={text.newProject} aria-label={text.newProject} onClick={createNewProject} className="text-button">
            <FilePlus2 size={18} />
            <span>{text.newProject}</span>
          </button>
          <button type="button" title={text.openProject} aria-label={text.openProject} onClick={() => { void chooseAndOpenProject(); }} className="text-button">
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
          <button type="button" title={text.deleteSelected} aria-label={text.deleteSelected} onClick={deleteSelection} className="icon-button" disabled={!canDeleteSelectedDiagram}>
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

      <section
        ref={workspaceRef}
        className={`workspace${paletteBothCollapsed ? ' palette-both-collapsed' : ''}${inspectorBothCollapsed ? ' inspector-both-collapsed' : ''}${workspaceResizing ? ' workspace-resizing' : ''}`}
        style={{ gridTemplateColumns: `${effectivePaletteWidth}px 6px minmax(0, 1fr) 6px ${effectiveInspectorWidth}px` }}
      >
        <aside
          ref={paletteRef}
          className={`palette${paletteBothCollapsed ? ' palette-both-collapsed' : ''}`}
          aria-label={text.palette}
        >
          {hasActiveDocument ? (
            <>
              <section
                className={`palette-section${paletteToolsCollapsed ? ' collapsed' : ''}`}
                style={{
                  flex: paletteToolsCollapsed
                    ? '0 0 auto'
                    : connectorsCollapsed
                      ? '1 1 0'
                      : `${paletteSplit} 1 0`
                }}
              >
                <div className="panel-heading">
                  <button
                    type="button"
                    className="panel-collapse-toggle"
                    title={paletteToolsCollapsed ? text.expandPanel : text.collapsePanel}
                    aria-label={paletteToolsCollapsed ? text.expandPanel : text.collapsePanel}
                    aria-expanded={!paletteToolsCollapsed}
                    onClick={() => setPaletteToolsCollapsed((value) => !value)}
                  >
                    {paletteToolsCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                  </button>
                  <PackagePlus size={18} />
                  <span>{text.palette}</span>
                </div>
                {!paletteToolsCollapsed ? (
                  <div className="panel-scroll-body">
                    <button type="button" title={text.pointer} aria-label={text.pointer} onClick={activatePointer} className={!selectedTool && !activeConnector ? 'tool active' : 'tool'}>
                      <MousePointer2 size={16} />
                      <span>{text.pointer}</span>
                    </button>
                    {definition.palette.map((tool) => (
                      <button key={`${definition.kind}-${tool.kind}-${tool.label}`} type="button" className={selectedTool?.label === tool.label ? 'tool active' : 'tool'} onClick={() => { setSelectedTool(tool); setSelectedConnector(undefined); clearConnectorState(); }}>
                        <ToolIcon kind={tool.kind} label={tool.label} size={16} />
                        <span>{paletteToolLabel(locale, tool, document.kind)}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </section>

              {!paletteToolsCollapsed && !connectorsCollapsed ? (
                <div
                  className="palette-divider"
                  role="separator"
                  aria-orientation="horizontal"
                  aria-label={`${text.palette} / ${text.connectors}`}
                  onMouseDown={startPaletteSplitResize}
                />
              ) : null}

              <section
                className={`palette-section connectors-section${connectorsCollapsed ? ' collapsed' : ''}`}
                style={{
                  flex: connectorsCollapsed
                    ? '0 0 auto'
                    : paletteToolsCollapsed
                      ? '1 1 0'
                      : `${1 - paletteSplit} 1 0`
                }}
              >
                <div className="panel-heading connector-heading">
                  <button
                    type="button"
                    className="panel-collapse-toggle"
                    title={connectorsCollapsed ? text.expandPanel : text.collapsePanel}
                    aria-label={connectorsCollapsed ? text.expandPanel : text.collapsePanel}
                    aria-expanded={!connectorsCollapsed}
                    onClick={() => setConnectorsCollapsed((value) => !value)}
                  >
                    {connectorsCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                  </button>
                  <ArrowRight size={18} />
                  <span>{text.connectors}</span>
                </div>
                {!connectorsCollapsed ? (
                  <div className="panel-scroll-body">
                    {document.kind === 'component' ? componentInterfaceNotationTools.map((tool) => (
                      <button key={`${definition.kind}-${tool.kind}-${tool.label}`} type="button" className={selectedTool?.label === tool.label ? 'tool active' : 'tool'} onClick={() => { setSelectedTool(tool); setSelectedConnector(undefined); clearConnectorState(); }}>
                        <ToolIcon kind={tool.kind} label={tool.label} size={16} />
                        <span>{paletteToolLabel(locale, tool)}</span>
                      </button>
                    )) : null}
                    {definition.connectors.map((connector) => (
                      <button key={`${definition.kind}-${connector.kind}-${connector.label}`} type="button" className={selectedConnector?.label === connector.label ? 'tool active' : 'tool'} onClick={() => { clearConnectorState(); setSelectedConnector(connector); setSelectedTool(undefined); }}>
                        <ConnectorIcon kind={connector.kind} size={16} />
                        <span>{connectorToolLabel(locale, connector, document.kind)}</span>
                      </button>
                    ))}
                    {activeConnector ? <p className="mode-hint">{pendingSourceNodeId ? text.connectTarget : text.connectSource}</p> : null}
                  </div>
                ) : null}
              </section>
            </>
          ) : null}
        </aside>

        <div
          className="workspace-divider"
          role="separator"
          aria-orientation="vertical"
          aria-label={text.palette}
          onMouseDown={startPaletteResize}
        />

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
              </div>

              <svg ref={canvasRef} className={canvasClassName} role="application" aria-label={`${document.name} ${text.canvasSuffix}`} onClick={addNodeAtCanvas} onContextMenu={openCanvasContextMenu} onWheel={handleCanvasWheel} onPointerDown={handleCanvasPointerDown} onPointerMove={handleCanvasPointerMove} onPointerUp={handleCanvasPointerUp} onPointerLeave={stopDragging} onDragOver={handleCanvasDragOver} onDrop={handleCanvasDrop}>
                <defs>
                  <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
                    <path className="grid-line" d="M 24 0 L 0 0 0 24" fill="none" strokeWidth="1" />
                  </pattern>
                  <marker id="line-arrow" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto" markerUnits="strokeWidth">
                    <path d="M2 2 L10 6 L2 10" className="arrow-marker" />
                  </marker>
                  <marker id="filled-arrow" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto" markerUnits="strokeWidth">
                    <path d="M2 2 L10 6 L2 10 Z" className="filled-arrow-marker" />
                  </marker>
                  <marker id="triangle-arrow" markerWidth="14" markerHeight="14" refX="12" refY="7" orient="auto" markerUnits="strokeWidth">
                    <path d="M2 2 L12 7 L2 12 Z" className="hollow-arrow-marker" />
                  </marker>
                </defs>
                <rect width="100%" height="100%" fill="url(#grid)" />
                <g transform={`translate(${canvasPan.x} ${canvasPan.y}) scale(${canvasZoom})`}>
                  {(() => {
                    // Paint order: background → underlay (fragments) → edges → foreground
                    // so package fills and combined-fragment frames do not cover connectors/messages.
                    const backgroundNodes = document.nodes.filter((node) => isDiagramBackgroundNode(node.kind));
                    const underlayNodes = document.nodes.filter((node) => isDiagramUnderlayNode(node.kind));
                    const foregroundNodes = document.nodes.filter((node) => !isDiagramBackgroundNode(node.kind) && !isDiagramUnderlayNode(node.kind));
                    const renderNode = (node: UmlNode) => {
                      const partnerId = isPairedInterface(node) ? node.interfacePartnerId : undefined;
                      // Paired "연결" is one visual unit: highlight both stems + ball/socket together.
                      const selected = node.id === selectedNodeId
                        || node.id === pendingSourceNodeId
                        || selectedNodeIds.has(node.id)
                        || (!!partnerId && (
                          partnerId === selectedNodeId
                          || partnerId === pendingSourceNodeId
                          || selectedNodeIds.has(partnerId)
                        ));
                      return (
                        <DiagramNode
                          key={node.id}
                          node={node}
                          partnerNode={partnerId ? document.nodes.find((candidate) => candidate.id === partnerId) : undefined}
                          selected={selected}
                          selectedOwnedElementId={selectedOwnedElement?.nodeId === node.id ? selectedOwnedElement.elementId : undefined}
                          showMessageStartLine={document.kind === 'sequence' && node.kind === 'lifeline' && !!activeConnector && isInteractionMessageKind(activeConnector.kind)}
                          surfaceAttachment={isInterfaceNode(node) ? interfaceAttachmentSide(node) : undefined}
                          diagramKind={document.kind}
                          onMessageStartLine={(event) => beginMessageFromLifelineLine(event, node)}
                          onPointerDown={(event) => handleNodePointerDown(event, node)}
                          onPointerMove={handleCanvasPointerMove}
                          onPointerUp={(event) => handleNodePointerUp(event, node)}
                          onResizeStart={(event, mode) => startNodeResize(event, node, mode)}
                          onOwnedElementSelect={(elementId) => selectOwnedElement(node.id, elementId)}
                          onContextMenu={(event: React.MouseEvent<SVGGElement>) => openNodeContextMenu(event, node.id)}
                        />
                      );
                    };

                    const edgePolylines: EdgePolyline[] = document.edges.flatMap((edge, edgeIndex) => {
                      const messageIndex = document.kind === 'sequence' && isInteractionMessageKind(edge.kind)
                        ? document.edges.slice(0, edgeIndex).filter((candidate) => isInteractionMessageKind(candidate.kind)).length
                        : edgeIndex;
                      const points = resolveEdgePolylinePoints(edge, messageIndex, document.kind, document.nodes, document.edges);
                      if (!points || points.length < 2) {
                        return [];
                      }
                      return [{ id: edge.id, points, endpointNodeIds: [edge.sourceId, edge.targetId] }];
                    });
                    const bridgesByEdgeId = computeBridgeCrossings(edgePolylines);
                    // Sequence: paint lifelines under messages so activation bars sit above the dashed lifespan and stay selectable.
                    const sequencePaintOrder = document.kind === 'sequence';
                    const edgeElements = document.edges.map((edge, edgeIndex) => (
                      <DiagramEdge
                        key={edge.id}
                        edge={edge}
                        edgeIndex={document.kind === 'sequence' && isInteractionMessageKind(edge.kind) ? document.edges.slice(0, edgeIndex).filter((candidate) => isInteractionMessageKind(candidate.kind)).length : edgeIndex}
                        diagramKind={document.kind}
                        nodes={document.nodes}
                        edges={document.edges}
                        bridgeCrossings={bridgesByEdgeId.get(edge.id) ?? []}
                        selected={edge.id === selectedEdgeId}
                        onSelect={() => selectEdge(edge.id)}
                        onPointerDown={(event) => startMessageReorder(event, edge)}
                        onOrthogonalSegmentPointerDown={(event, axis) => startOrthogonalSegmentDrag(event, edge, axis)}
                        onActivationResizeStart={(event, end) => startActivationResize(event, edge, end)}
                        onLabelPointerDown={(event) => startEdgeLabelDrag(event, edge)}
                        onMultiplicityPointerDown={(event, endpoint) => startMultiplicityLabelDrag(event, edge, endpoint)}
                        onPointerMove={handleCanvasPointerMove}
                        onPointerUp={(event) => handleCanvasPointerUp(event as React.PointerEvent<SVGSVGElement>)}
                        onContextMenu={(event: React.MouseEvent<SVGGElement>) => openEdgeContextMenu(event, edge.id)}
                      />
                    ));
                    const endpointHandleOverlays = document.edges.map((edge, edgeIndex) => {
                      const effectiveEdgeIndex = document.kind === 'sequence' && isInteractionMessageKind(edge.kind)
                        ? document.edges.slice(0, edgeIndex).filter((candidate) => isInteractionMessageKind(candidate.kind)).length
                        : edgeIndex;
                      return (
                        <EdgeEndpointHandles
                          key={`endpoint-handles-${edge.id}`}
                          edge={edge}
                          edgeIndex={effectiveEdgeIndex}
                          diagramKind={document.kind}
                          nodes={document.nodes}
                          edges={document.edges}
                          visible={edge.id === selectedEdgeId || edgeEndpointDragPreview?.edgeId === edge.id}
                          endpointDragPreview={edgeEndpointDragPreview?.edgeId === edge.id ? edgeEndpointDragPreview : undefined}
                          onEndpointPointerDown={(event, endpoint) => startEdgeEndpointDrag(event, edge, endpoint)}
                          onPointerMove={handleCanvasPointerMove}
                          onPointerUp={(event) => handleCanvasPointerUp(event as React.PointerEvent<SVGSVGElement>)}
                        />
                      );
                    });
                    const edgeEndpointPreview = edgeEndpointDragPreview ? (
                      <EdgeEndpointPreview
                        preview={edgeEndpointDragPreview}
                        diagramKind={document.kind}
                        nodes={document.nodes}
                        edges={document.edges}
                      />
                    ) : null;
                    const connectorPreview = activeConnector && pendingSourceNodeId && connectorPreviewPoint
                      ? <ConnectorPreview source={document.nodes.find((node) => node.id === pendingSourceNodeId)} target={connectorPreviewPoint} connector={activeConnector} diagramKind={document.kind} />
                      : null;

                    return (
                      <>
                        {backgroundNodes.map(renderNode)}
                        {underlayNodes.map(renderNode)}
                        {sequencePaintOrder ? foregroundNodes.map(renderNode) : null}
                        {edgeElements}
                        {connectorPreview}
                        {sequencePaintOrder ? null : foregroundNodes.map(renderNode)}
                        {edgeEndpointPreview}
                        {endpointHandleOverlays}
                        {document.nodes
                          .filter((node) => node.kind === 'combinedFragment' && node.id === selectedNodeId && combinedFragmentShowsSeparator(node.name))
                          .map((node) => {
                            const separatorY = operandSeparatorYForNode(node);
                            return (
                              <g
                                key={`operand-separator-${node.id}`}
                                className="operand-separator-overlay"
                                transform={`translate(${node.x} ${node.y + separatorY})`}
                                onPointerDown={(event) => startOperandSeparatorDrag(event, node)}
                                onPointerMove={handleCanvasPointerMove}
                                onPointerUp={(event) => handleCanvasPointerUp(event as React.PointerEvent<SVGSVGElement>)}
                              >
                                <line className="operand-separator-hit" x1="0" y1="0" x2={node.width} y2="0" />
                                <line className="operand-separator" x1="0" y1="0" x2={node.width} y2="0" strokeDasharray="8 5" />
                                <rect className="operand-separator-handle" x={node.width / 2 - 12} y="-7" width="24" height="14" rx="3" />
                                <path className="operand-separator-handle-grip" d={`M ${node.width / 2 - 6} -3 H ${node.width / 2 + 6} M ${node.width / 2 - 6} 3 H ${node.width / 2 + 6}`} />
                              </g>
                            );
                          })}
                      </>
                    );
                  })()}
                  {boxSelectRect ? (
                    <rect className="box-select" x={boxSelectRect.x} y={boxSelectRect.y} width={boxSelectRect.width} height={boxSelectRect.height} pointerEvents="none" />
                  ) : null}
                </g>
              </svg>
            </>
          ) : <div className="empty-canvas" />}
        </section>

        <div
          className="workspace-divider"
          role="separator"
          aria-orientation="vertical"
          aria-label={text.modelTree}
          onMouseDown={startInspectorResize}
        />

        <aside className={`inspector${treePanelCollapsed && propertiesPanelCollapsed ? ' inspector-both-collapsed' : ''}`} aria-label={text.properties} ref={inspectorRef}>
          <section
            className={`tree-panel${treePanelCollapsed ? ' collapsed' : ''}`}
            aria-label={text.modelTree}
            style={{
              flex: treePanelCollapsed
                ? '0 0 auto'
                : propertiesPanelCollapsed
                  ? '1 1 0'
                  : `${inspectorSplit} 1 0`
            }}
          >
            <div className="panel-heading">
              <button
                type="button"
                className="panel-collapse-toggle"
                title={treePanelCollapsed ? text.expandPanel : text.collapsePanel}
                aria-label={treePanelCollapsed ? text.expandPanel : text.collapsePanel}
                aria-expanded={!treePanelCollapsed}
                onClick={() => setTreePanelCollapsed((value) => !value)}
              >
                {treePanelCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
              </button>
              <ListTree size={18} />
              <span>{text.modelTree}</span>
            </div>
            {!treePanelCollapsed ? (
            <div className="panel-scroll-body">
              <button type="button" className={projectSelected ? 'tree-item tree-root active' : 'tree-item tree-root'} onClick={selectProjectFromTree} onContextMenu={openProjectContextMenu}>
                <Package size={16} />
                <span>{projectName || 'My UML Project'}</span>
              </button>
              {documents.map((candidate) => {
                const collapsed = collapsedDiagramIds.has(candidate.id);

                return (
                <div key={candidate.id} className="tree-branch">
                  <button type="button" data-tree-diagram-id={candidate.id} className={diagramSelectedId === candidate.id ? 'tree-item tree-level-1 active' : 'tree-item tree-level-1'} onClick={() => selectDiagramFromTree(candidate.id)} onContextMenu={(event) => openDiagramContextMenu(event, candidate.id)}>
                    <span role="button" tabIndex={0} aria-label={collapsed ? 'Expand diagram' : 'Collapse diagram'} className="tree-toggle" onClick={(event) => { event.stopPropagation(); toggleDiagramTree(candidate.id); }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); toggleDiagramTree(candidate.id); } }}>
                      {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                    </span>
                    <DiagramIcon kind={candidate.kind} size={15} />
                    <span>{candidate.name}</span>
                  </button>
                  {!collapsed ? (
                    candidate.nodes.map((node) => (
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
                    ))
                  ) : null}
                </div>
                );
              })}
            </div>
            ) : null}
          </section>

          {!treePanelCollapsed && !propertiesPanelCollapsed ? (
          <div
            className="inspector-divider"
            role="separator"
            aria-orientation="horizontal"
            aria-label={`${text.modelTree} / ${text.properties}`}
            onMouseDown={startInspectorSplitResize}
          />
          ) : null}

          <section
            className={`properties${propertiesPanelCollapsed ? ' collapsed' : ''}`}
            aria-label={text.properties}
            style={{
              flex: propertiesPanelCollapsed
                ? '0 0 auto'
                : treePanelCollapsed
                  ? '1 1 0'
                  : `${1 - inspectorSplit} 1 0`
            }}
          >
            <div className="panel-heading">
              <button
                type="button"
                className="panel-collapse-toggle"
                title={propertiesPanelCollapsed ? text.expandPanel : text.collapsePanel}
                aria-label={propertiesPanelCollapsed ? text.expandPanel : text.collapsePanel}
                aria-expanded={!propertiesPanelCollapsed}
                onClick={() => setPropertiesPanelCollapsed((value) => !value)}
              >
                {propertiesPanelCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
              </button>
              <Braces size={18} />
              <span>{text.properties}</span>
            </div>
            {!propertiesPanelCollapsed ? (
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
                <label>
                  {text.umlType}
                  <input value={selectedOwnedElementValue.umlType} readOnly />
                </label>
              </>
            ) : selectedNode ? (
              <>
                <label>
                  {text.name}
                  <input value={selectedNode.name} onChange={(event) => updateActiveDocument((current) => renameNode(current, selectedNode.id, event.target.value))} />
                </label>
                <label>
                  {text.umlType}
                  <input value={selectedNode.umlType} readOnly />
                </label>
                {isPairedInterface(selectedNode) ? (
                  <>
                    <label>
                      {text.lineStyle}
                      <select value={selectedNode.pairRoute ?? 'straight'} onChange={(event) => updateActiveDocument((current) => updateInterfacePairRoute(current, selectedNode.id, event.target.value as EdgeRoute))}>
                        <option value="straight">{text.straight}</option>
                        <option value="orthogonal">{text.orthogonal}</option>
                        <option value="curve">{text.curve}</option>
                      </select>
                    </label>
                    <div className="element-actions">
                      <button type="button" className="text-button" onClick={() => updateActiveDocument((current) => swapPairedInterfaceRoles(current, selectedNode.id))}>
                        {text.swapInterfacePair}
                      </button>
                    </div>
                  </>
                ) : null}
              </>
            ) : selectedEdge ? (
              <>
                <label>
                  {text.name}
                  <input value={selectedEdge.name} onChange={(event) => updateActiveDocument((current) => renameEdge(current, selectedEdge.id, event.target.value))} />
                </label>
                <label>
                  {text.umlType}
                  <input value={selectedEdge.umlType} readOnly />
                </label>
                <label>
                  {text.source}
                  <select value={selectedEdge.sourceId} onChange={(event) => updateActiveDocument((current) => updateEdgeEndpoint(current, selectedEdge.id, 'source', event.target.value))}>
                    {document.nodes.map((node) => (
                      <option key={node.id} value={node.id} disabled={node.id === selectedEdge.targetId && !isInteractionMessageKind(selectedEdge.kind)}>{node.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  {text.target}
                  <select value={selectedEdge.targetId} onChange={(event) => updateActiveDocument((current) => updateEdgeEndpoint(current, selectedEdge.id, 'target', event.target.value))}>
                    {document.nodes.map((node) => (
                      <option key={node.id} value={node.id} disabled={node.id === selectedEdge.sourceId && !isInteractionMessageKind(selectedEdge.kind)}>{node.name}</option>
                    ))}
                  </select>
                </label>
                {document.kind === 'communication' && isInteractionMessageKind(selectedEdge.kind) ? (
                  <label>
                    {communicationDiagramLabels[locale].sequenceNumber}
                    <input value={selectedEdge.sequenceNumber ?? ''} onChange={(event) => updateActiveDocument((current) => renameEdgeSequenceNumber(current, selectedEdge.id, event.target.value))} />
                  </label>
                ) : null}
                <label>
                  {text.relationship}
                  <select value={selectedEdge.kind} onChange={(event) => updateActiveDocument((current) => updateEdgeRelationship(current, selectedEdge.id, definition.connectors.find((connector) => connector.kind === event.target.value) ?? definition.connectors[0]))}>
                    {definition.connectors.filter((connector) => connector.kind !== 'interfacePair').map((connector) => (
                      <option key={connector.kind} value={connector.kind}>{connectorToolLabel(locale, connector, document.kind)}</option>
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
                {selectedEdge.route === 'orthogonal' ? (
                  <>
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
                  </>
                ) : null}
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
            ) : null}
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
                  <span>{paletteToolLabel(locale, tool, document.kind)}</span>
                </button>
              ))}
              <div className="context-menu-heading">{text.connectors}</div>
              {document.kind === 'component' ? componentInterfaceNotationTools.map((tool) => (
                <button key={`context-${definition.kind}-${tool.kind}-${tool.label}`} type="button" role="menuitem" onClick={() => addNodeFromContext(tool, contextMenu.canvasX, contextMenu.canvasY)}>
                  <ToolIcon kind={tool.kind} label={tool.label} size={14} />
                  <span>{paletteToolLabel(locale, tool)}</span>
                </button>
              )) : null}
              {definition.connectors.map((connector) => (
                <button key={`context-${definition.kind}-${connector.kind}-${connector.label}`} type="button" role="menuitem" onClick={() => { setSelectedConnector(connector); setSelectedTool(undefined); pendingSourceNodeIdRef.current = undefined; setPendingSourceNodeId(undefined); setConnectorPreviewPoint(undefined); setContextMenu(undefined); }}>
                  <ConnectorIcon kind={connector.kind} size={14} />
                  <span>{connectorToolLabel(locale, connector, document.kind)}</span>
                </button>
              ))}
              {selectedNodeId || selectedEdgeId || selectedOwnedElement || selectedNodeIds.size > 0 ? <button type="button" role="menuitem" className="danger-menu-item" onClick={deleteSelection}>{text.deleteSelected}</button> : null}
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
              <button type="button" role="menuitem" onClick={() => moveNodeLayer(contextMenu.nodeId, 'front')}>{text.bringToFront}</button>
              <button type="button" role="menuitem" onClick={() => moveNodeLayer(contextMenu.nodeId, 'back')}>{text.sendToBack}</button>
              {document.kind === 'component' && document.nodes.find((node) => node.id === contextMenu.nodeId)?.kind === 'component' ? (
                <>
                  <div className="context-menu-heading">{text.addElement}</div>
                  {(['port', 'providedInterface', 'requiredInterface'] as const).map((kind) => {
                    const tool = componentSurfaceTool(kind);

                    return tool ? (
                      <button key={`component-surface-${kind}`} type="button" role="menuitem" onClick={() => addComponentSurfaceNodeFromContext(contextMenu.nodeId, kind)}>
                        <ToolIcon kind={tool.kind} label={tool.label} size={14} />
                        <span>{paletteToolLabel(locale, tool)}</span>
                      </button>
                    ) : null;
                  })}
                </>
              ) : null}
              {document.kind === 'component' && document.nodes.find((node) => node.id === contextMenu.nodeId)?.kind === 'port' ? (
                <>
                  <div className="context-menu-heading">{text.addElement}</div>
                  {(['providedInterface', 'requiredInterface'] as const).map((kind) => {
                    const tool = componentSurfaceTool(kind);

                    return tool ? (
                      <button key={`port-interface-${kind}`} type="button" role="menuitem" onClick={() => addInterfaceToPortFromContext(contextMenu.nodeId, kind)}>
                        <ToolIcon kind={tool.kind} label={tool.label} size={14} />
                        <span>{paletteToolLabel(locale, tool)}</span>
                      </button>
                    ) : null;
                  })}
                </>
              ) : null}
              {(() => {
                const contextNode = document.nodes.find((node) => node.id === contextMenu.nodeId) ?? document.nodes[0];
                const ownedKinds = ownedElementKindsForNode(contextNode);
                if (ownedKinds.length === 0) {
                  return null;
                }
                return (
                  <>
                    <div className="context-menu-heading">{text.ownedElements}</div>
                    {ownedKinds.map((kind) => (
                      <button key={`owned-${kind}`} type="button" role="menuitem" onClick={() => addElementToNode(contextMenu.nodeId, kind)}>{ownedElementLabels[locale][kind]}</button>
                    ))}
                  </>
                );
              })()}
              {(() => {
                const contextNode = document.nodes.find((node) => node.id === contextMenu.nodeId);
                if (!contextNode || !isPairedInterface(contextNode)) {
                  return null;
                }
                return (
                  <>
                    <div className="context-menu-heading">{text.lineStyle}</div>
                    <button type="button" role="menuitem" onClick={() => { updateActiveDocument((current) => updateInterfacePairRoute(current, contextMenu.nodeId, 'straight')); setContextMenu(undefined); }}>{text.straight}</button>
                    <button type="button" role="menuitem" onClick={() => { updateActiveDocument((current) => updateInterfacePairRoute(current, contextMenu.nodeId, 'orthogonal')); setContextMenu(undefined); }}>{text.orthogonal}</button>
                    <button type="button" role="menuitem" onClick={() => { updateActiveDocument((current) => updateInterfacePairRoute(current, contextMenu.nodeId, 'curve')); setContextMenu(undefined); }}>{text.curve}</button>
                    <button type="button" role="menuitem" onClick={() => { updateActiveDocument((current) => swapPairedInterfaceRoles(current, contextMenu.nodeId)); setContextMenu(undefined); }}>{text.swapInterfacePair}</button>
                  </>
                );
              })()}
              <button type="button" role="menuitem" className="danger-menu-item" onClick={() => {
                if (selectedNodeIds.has(contextMenu.nodeId) && selectedNodeIds.size > 1) {
                  deleteMultipleNodes(selectedNodeIds);
                } else {
                  deleteNode(contextMenu.nodeId);
                }
              }}>{text.deleteSelected}</button>
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
              {document.kind === 'sequence' && (() => { const edge = document.edges.find((candidate) => candidate.id === contextMenu.edgeId); return edge ? isInteractionMessageKind(edge.kind) : false; })() ? <button type="button" role="menuitem" onClick={() => wrapMessageWithLoop(contextMenu.edgeId)}>{text.wrapWithLoop}</button> : null}
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
  const nodes = (Array.isArray(document.nodes) ? document.nodes : []).map((node, nodeIndex) => normalizeNode(node, definition.palette, nodeIndex, document.kind));
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = (Array.isArray(document.edges) ? document.edges : [])
    .map((edge, edgeIndex) => normalizeEdge(edge, definition.connectors, edgeIndex, document.kind))
    .filter((edge): edge is UmlEdge => edge !== undefined && nodeIds.has(edge.sourceId) && nodeIds.has(edge.targetId));

  const normalized: UmlDiagramDocument = {
    id: nonEmptyString(document.id, `diagram-${index + 1}`),
    kind: document.kind,
    name: nonEmptyString(document.name, diagramLabels[locale][document.kind]),
    nodes,
    edges
  };

  return document.kind === 'component' ? migrateComponentInterfaces(normalized) : normalized;
}

/** Glue PI/RI stems to component faces and backfill attachmentSide/edgeOffset. */
function migrateComponentInterfaces(document: UmlDiagramDocument): UmlDiagramDocument {
  let next = ensureSurfaceNodeOwnership(document);
  for (const node of next.nodes) {
    if (!isInterfaceNode(node)) {
      continue;
    }
    const component = findComponentForInterface(next.nodes, node);
    if (!component) {
      continue;
    }
    if (isPairedInterface(node)) {
      const port = node.parentPortId
        ? next.nodes.find((candidate) => candidate.id === node.parentPortId && candidate.kind === 'port')
        : undefined;
      next = replaceNode(next, reflowPairedInterface(node, component, port));
      continue;
    }
    next = replaceNode(next, attachInterfaceToComponent(node, component, node.attachmentSide));
  }
  return next;
}

function normalizeNode(node: UmlNode, palette: PaletteTool[], index: number, diagramKind: DiagramKind): UmlNode {
  const fallbackKind = palette[0]?.kind ?? 'class';
  const migratedKind = migrateLegacyElementKind(node, diagramKind);
  const kind = isUmlElementKind(migratedKind) ? migratedKind : fallbackKind;
  const tool = palette.find((candidate) => candidate.kind === kind) ?? allPaletteTools().find((candidate) => candidate.kind === kind);
  const size = defaultSavedNodeSize(kind);
  const ownedElements = (Array.isArray(node.ownedElements) ? node.ownedElements : []).map((element, elementIndex) => normalizeOwnedElement(element, elementIndex));
  const minimumSize = minimumResizableNodeSize(kind, ownedElements, diagramKind);
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
    height,
    parentComponentId: typeof node.parentComponentId === 'string' && node.parentComponentId ? node.parentComponentId : undefined,
    parentPortId: typeof node.parentPortId === 'string' && node.parentPortId ? node.parentPortId : undefined,
    attachmentSide: isEdgeAnchor(node.attachmentSide) ? node.attachmentSide : undefined,
    edgeOffset: typeof node.edgeOffset === 'number' && Number.isFinite(node.edgeOffset) ? node.edgeOffset : undefined,
    interfaceElbow: isOrthogonalElbow(node.interfaceElbow) ? { dx: node.interfaceElbow.dx, dy: node.interfaceElbow.dy } : undefined,
    interfacePartnerId: typeof node.interfacePartnerId === 'string' && node.interfacePartnerId ? node.interfacePartnerId : undefined,
    stemAttachX: typeof node.stemAttachX === 'number' && Number.isFinite(node.stemAttachX) ? node.stemAttachX : undefined,
    stemAttachY: typeof node.stemAttachY === 'number' && Number.isFinite(node.stemAttachY) ? node.stemAttachY : undefined,
    jointX: typeof node.jointX === 'number' && Number.isFinite(node.jointX) ? node.jointX : undefined,
    jointY: typeof node.jointY === 'number' && Number.isFinite(node.jointY) ? node.jointY : undefined,
    pairRoute: isEdgeRoute(node.pairRoute) ? node.pairRoute : undefined,
    operandSeparatorY: typeof node.operandSeparatorY === 'number' && Number.isFinite(node.operandSeparatorY)
      ? Math.round(node.operandSeparatorY)
      : undefined
  };
}

function migrateLegacyElementKind(node: UmlNode, diagramKind: DiagramKind): string | undefined {
  // State Machine Final historically reused Activity finalNode.
  if (diagramKind === 'stateMachine' && node.kind === 'finalNode') {
    return 'finalState';
  }
  // Timing StateInvariant historically reused SM state.
  if (diagramKind === 'timing' && node.kind === 'state') {
    return 'stateInvariant';
  }
  if (node.kind === 'finalNode' && node.umlType === 'uml:FinalState') {
    return 'finalState';
  }
  if (node.kind === 'state' && node.umlType === 'uml:StateInvariant') {
    return 'stateInvariant';
  }
  return node.kind;
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

function isPointLike(value: unknown): value is Point {
  return typeof value === 'object'
    && value !== null
    && typeof (value as Point).x === 'number'
    && Number.isFinite((value as Point).x)
    && typeof (value as Point).y === 'number'
    && Number.isFinite((value as Point).y);
}

function normalizeEdge(edge: UmlEdge, connectors: ConnectorTool[], index: number, diagramKind?: DiagramKind): UmlEdge | undefined {
  const migratedKind = migrateLegacyRelationshipKind(edge, diagramKind);
  // interfacePair is a gesture tool only — it must never persist as an edge.
  if (migratedKind === 'interfacePair') {
    return undefined;
  }
  const connector = connectors.find((candidate) => candidate.kind === migratedKind)
    ?? allConnectorTools().find((candidate) => candidate.kind === migratedKind)
    ?? connectors[0];

  if (!connector || connector.kind === 'interfacePair' || !nonEmptyString(edge.sourceId, '') || !nonEmptyString(edge.targetId, '')) {
    return undefined;
  }

  const multiplicityDefault = defaultSavedMultiplicity(connector.kind);
  const sourceMultiplicity = multiplicityDefault === undefined
    ? undefined
    : (typeof edge.sourceMultiplicity === 'string' ? edge.sourceMultiplicity : multiplicityDefault);
  const targetMultiplicity = multiplicityDefault === undefined
    ? undefined
    : (typeof edge.targetMultiplicity === 'string' ? edge.targetMultiplicity : multiplicityDefault);

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
    sourceAnchorOffset: normalizeEdgeAnchorOffset(edge.sourceAnchorOffset),
    targetAnchorOffset: normalizeEdgeAnchorOffset(edge.targetAnchorOffset),
    sourceMultiplicity,
    targetMultiplicity,
    sourceMultiplicityOffset: isPointLike(edge.sourceMultiplicityOffset) ? { x: edge.sourceMultiplicityOffset.x, y: edge.sourceMultiplicityOffset.y } : undefined,
    targetMultiplicityOffset: isPointLike(edge.targetMultiplicityOffset) ? { x: edge.targetMultiplicityOffset.x, y: edge.targetMultiplicityOffset.y } : undefined,
    sequenceY: typeof edge.sequenceY === 'number' && Number.isFinite(edge.sequenceY) ? edge.sequenceY : undefined,
    sourceActivationHeight: typeof edge.sourceActivationHeight === 'number' && Number.isFinite(edge.sourceActivationHeight)
      ? Math.max(20, Math.round(edge.sourceActivationHeight))
      : undefined,
    targetActivationHeight: typeof edge.targetActivationHeight === 'number' && Number.isFinite(edge.targetActivationHeight)
      ? Math.max(20, Math.round(edge.targetActivationHeight))
      : undefined,
    offset: typeof edge.offset === 'number' && Number.isFinite(edge.offset) ? edge.offset : undefined,
    labelOffset: isPointLike(edge.labelOffset) ? { x: edge.labelOffset.x, y: edge.labelOffset.y } : undefined,
    orthogonalElbow: isOrthogonalElbow(edge.orthogonalElbow) ? { dx: edge.orthogonalElbow.dx, dy: edge.orthogonalElbow.dy } : undefined,
    sequenceNumber: typeof edge.sequenceNumber === 'string' && edge.sequenceNumber.trim() ? edge.sequenceNumber.trim() : undefined
  };
}

function isOrthogonalElbow(value: unknown): value is { dx: number; dy: number } {
  return typeof value === 'object'
    && value !== null
    && typeof (value as { dx?: unknown }).dx === 'number'
    && Number.isFinite((value as { dx: number }).dx)
    && typeof (value as { dy?: unknown }).dy === 'number'
    && Number.isFinite((value as { dy: number }).dy);
}

function migrateLegacyRelationshipKind(edge: UmlEdge, diagramKind?: DiagramKind): RelationshipKind {
  if (diagramKind === 'communication' && edge.kind === 'connector') {
    return 'link';
  }
  // Object-diagram Link historically reused association.
  if (diagramKind === 'object' && edge.kind === 'association') {
    return 'link';
  }
  if (edge.kind === 'dependency' && edge.umlType === 'uml:Extension') {
    return 'extension';
  }
  if (edge.kind === 'dependency' && edge.umlType === 'uml:DurationConstraint') {
    return 'durationConstraint';
  }
  return edge.kind;
}

function attachComponentSurfaceNode(document: UmlDiagramDocument, nodeId?: string): UmlDiagramDocument {
  return attachComponentSurfaceNodeWithOptions(document, nodeId);
}

function attachComponentSurfaceNodeWithOptions(document: UmlDiagramDocument, nodeId?: string, options: {
  pinnedComponentId?: string;
  preferredSide?: EdgeAnchor;
} = {}): UmlDiagramDocument {
  if (document.kind !== 'component') {
    return document;
  }

  const targetNode = nodeId ? document.nodes.find((node) => node.id === nodeId) : document.nodes[document.nodes.length - 1];

  if (!targetNode || !isComponentSurfaceNode(targetNode.kind)) {
    return document;
  }

  if (isInterfaceNode(targetNode)) {
    const component = options.pinnedComponentId
      ? document.nodes.find((node) => node.id === options.pinnedComponentId && node.kind === 'component')
      : findComponentForInterface(document.nodes, targetNode);

    if (!component) {
      return document;
    }

    return replaceNode(document, attachInterfaceToComponent(targetNode, component, options.preferredSide));
  }

  const component = options.pinnedComponentId
    ? document.nodes.find((node) => node.id === options.pinnedComponentId && node.kind === 'component')
    : nearestComponentForSurfaceNode(document.nodes, targetNode);

  if (!component) {
    return document;
  }

  const withPort = replaceNode(document, { ...snapPortToComponentSurface(targetNode, component), parentComponentId: component.id });
  return reflowInterfacesForPort(withPort, targetNode.id);
}

function reflowInterfacesForPort(document: UmlDiagramDocument, portId: string): UmlDiagramDocument {
  const port = document.nodes.find((node) => node.id === portId && node.kind === 'port');
  if (!port) {
    return document;
  }

  const component = findComponentForInterface(document.nodes, port)
    ?? (port.parentComponentId
      ? document.nodes.find((node) => node.id === port.parentComponentId && node.kind === 'component')
      : undefined);
  if (!component) {
    return document;
  }

  let next = document;
  for (const node of document.nodes) {
    if (!isInterfaceNode(node) || node.parentPortId !== portId) {
      continue;
    }
    next = replaceNode(next, isPairedInterface(node)
      ? reflowPairedInterface(node, component, port)
      : attachInterfaceToPort(node, component, port));
  }

  return next;
}

function isComponentSurfaceNode(kind: UmlElementKind): boolean {
  return kind === 'port' || kind === 'providedInterface' || kind === 'requiredInterface';
}

function ensureSurfaceNodeOwnership(document: UmlDiagramDocument): UmlDiagramDocument {
  const needsParent = document.nodes.some((node) => isComponentSurfaceNode(node.kind) && !node.parentComponentId);
  if (!needsParent) {
    return document;
  }

  return {
    ...document,
    nodes: document.nodes.map((node) => {
      if (!isComponentSurfaceNode(node.kind) || node.parentComponentId) {
        return node;
      }
      const component = nearestComponentForSurfaceNode(document.nodes, node);
      return component ? { ...node, parentComponentId: component.id } : node;
    })
  };
}

function moveInterfaceDiagramNode(
  document: UmlDiagramDocument,
  nodeId: string,
  pointer: Point,
  dragStart: { pointerX: number; pointerY: number; stemLength: number; edgeOffset: number; side: EdgeAnchor; componentId: string }
): UmlDiagramDocument {
  const node = document.nodes.find((candidate) => candidate.id === nodeId);
  if (!node || !isInterfaceNode(node)) {
    return document;
  }

  // Paired "연결": ball and socket share one joint and move together at any angle.
  if (isPairedInterface(node)) {
    return dragPairedInterfaceJoint(document, nodeId, pointer);
  }

  const component = document.nodes.find((candidate) => candidate.id === dragStart.componentId && candidate.kind === 'component');
  if (!component) {
    return document;
  }

  const moved = dragInterfaceOnComponent(node, component, pointer, dragStart);
  return replaceNode(document, resolveInterfacePortAttachment(moved, component, document.nodes, pointer));
}

function moveComponentDiagramNode(document: UmlDiagramDocument, nodeId: string, x: number, y: number): UmlDiagramDocument {
  if (document.kind !== 'component') {
    return moveNode(document, nodeId, x, y);
  }

  const document0 = ensureSurfaceNodeOwnership(document);
  const movingNode = document0.nodes.find((node) => node.id === nodeId);
  if (!movingNode) {
    return document0;
  }

  if (isInterfaceNode(movingNode)) {
    const component = findComponentForInterface(document0.nodes, movingNode);
    if (!component) {
      return moveNode(document0, nodeId, x, y);
    }
    const attached = attachInterfaceToComponent({ ...movingNode, x, y }, component);
    return replaceNode(document0, resolveInterfacePortAttachment(attached, component, document0.nodes));
  }

  const deltaX = x - movingNode.x;
  const deltaY = y - movingNode.y;

  if (movingNode.kind === 'component') {
    const movedSurfaceNodeIds: string[] = [];
    const movedDocument = {
      ...document0,
      nodes: document0.nodes.map((node) => {
        if (node.id === nodeId) {
          return { ...node, x, y };
        }
        if (isComponentSurfaceNode(node.kind) && node.parentComponentId === nodeId) {
          movedSurfaceNodeIds.push(node.id);
          // Paired joints stay in world space; only the attach point is reflowed later.
          if (isInterfaceNode(node) && isPairedInterface(node)) {
            return node;
          }
          return { ...node, x: Math.max(0, Math.round(node.x + deltaX)), y: Math.max(0, Math.round(node.y + deltaY)) };
        }
        return node;
      })
    };

    const reflowed = movedSurfaceNodeIds.reduce((doc, id) => {
      const surface = doc.nodes.find((node) => node.id === id);
      const component = doc.nodes.find((node) => node.id === nodeId && node.kind === 'component');
      if (!surface || !component) {
        return doc;
      }
      if (isInterfaceNode(surface)) {
        if (isPairedInterface(surface)) {
          const port = surface.parentPortId
            ? doc.nodes.find((candidate) => candidate.id === surface.parentPortId && candidate.kind === 'port')
            : undefined;
          return replaceNode(doc, reflowPairedInterface(surface, component, port));
        }
        if (surface.parentPortId) {
          const port = doc.nodes.find((candidate) => candidate.id === surface.parentPortId && candidate.kind === 'port');
          if (port) {
            return replaceNode(doc, attachInterfaceToPort(surface, component, port));
          }
        }
        return replaceNode(doc, layoutInterfaceOnComponent(surface, component));
      }
      return attachComponentSurfaceNodeWithOptions(doc, id, { pinnedComponentId: nodeId });
    }, movedDocument);

    return reflowed;
  }

  if (movingNode.kind === 'port') {
    const movedDocument = {
      ...document0,
      nodes: document0.nodes.map((node) => (node.id === nodeId ? { ...node, x, y } : node))
    };
    return attachComponentSurfaceNodeWithOptions(movedDocument, nodeId);
  }

  return moveNode(document0, nodeId, x, y);
}

function resizeComponentInterfaceByPointer(document: UmlDiagramDocument, nodeId: string, pointer: { x: number; y: number }): UmlDiagramDocument {
  const resizingNode = document.nodes.find((node) => node.id === nodeId);
  if (!resizingNode || !isInterfaceNode(resizingNode)) {
    return document;
  }

  if (isPairedInterface(resizingNode)) {
    return dragPairedInterfaceJoint(document, nodeId, pointer);
  }

  const component = findComponentForInterface(document.nodes, resizingNode);
  if (!component) {
    return document;
  }

  const port = resizingNode.parentPortId
    ? document.nodes.find((node) => node.id === resizingNode.parentPortId && node.kind === 'port')
    : undefined;
  return replaceNode(document, resizeInterfaceStemByPointer(resizingNode, component, pointer, port));
}

function resizeComponentDiagramNode(document: UmlDiagramDocument, nodeId: string, _startWidth: number, _startHeight: number, width: number, height: number): UmlDiagramDocument {
  const resizingNode = document.nodes.find((node) => node.id === nodeId);
  if (!resizingNode) {
    return document;
  }

  if (document.kind === 'component' && isInterfaceNode(resizingNode)) {
    const component = findComponentForInterface(document.nodes, resizingNode);
    if (!component) {
      return document;
    }
    const resized = resizeInterfaceStem(resizingNode, component, width, height);
    if (resized.parentPortId) {
      const port = document.nodes.find((node) => node.id === resized.parentPortId && node.kind === 'port');
      if (port) {
        return replaceNode(document, attachInterfaceToPort(resized, component, port));
      }
    }
    return replaceNode(document, resized);
  }

  if (document.kind !== 'component' || resizingNode.kind !== 'component') {
    return {
      ...document,
      nodes: document.nodes.map((node) => (node.id === nodeId ? { ...node, width, height } : node))
    };
  }

  const resizedComponent = { ...resizingNode, width, height };
  const resizedNodes = document.nodes.map((node) => {
    if (node.id === nodeId) {
      return resizedComponent;
    }
    if (!isComponentSurfaceNode(node.kind) || node.parentComponentId !== nodeId) {
      return node;
    }
    if (isInterfaceNode(node)) {
      return reflowInterfaceAfterComponentChange(node, resizingNode, resizedComponent);
    }
    return snapPortToComponentSurface(node, resizedComponent);
  });

  const withResized = { ...document, nodes: resizedNodes };
  return resizedNodes
    .filter((node) => node.kind === 'port' && node.parentComponentId === nodeId)
    .reduce((doc, port) => reflowInterfacesForPort(doc, port.id), withResized);
}

function reorderNodeLayer(document: UmlDiagramDocument, nodeId: string, direction: 'front' | 'back'): UmlDiagramDocument {
  const nodeIndex = document.nodes.findIndex((node) => node.id === nodeId);
  if (nodeIndex < 0) {
    return document;
  }
  const nodes = [...document.nodes];
  const [node] = nodes.splice(nodeIndex, 1);
  if (direction === 'front') {
    nodes.push(node);
  } else {
    nodes.unshift(node);
  }
  return { ...document, nodes };
}

function nearestComponentForSurfaceNode(nodes: UmlNode[], node: UmlNode): UmlNode | undefined {
  return findComponentForInterface(nodes, node);
}

function snapPortToComponentSurface(node: UmlNode, component: UmlNode): UmlNode {
  const nodeCenter = { x: node.x + node.width / 2, y: node.y + node.height / 2 };
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
      parentComponentId: component.id,
      x: Math.round(edge === 'left' ? component.x - node.width / 2 : component.x + component.width - node.width / 2),
      y: Math.round(clamp(node.y, component.y, component.y + component.height - node.height))
    };
  }

  return {
    ...node,
    parentComponentId: component.id,
    x: Math.round(clamp(node.x, component.x, component.x + component.width - node.width)),
    y: Math.round(edge === 'top' ? component.y - node.height / 2 : component.y + component.height - node.height / 2)
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
  return diagramDefinitions.flatMap((definition) => definition.palette).concat(componentInterfaceNotationTools);
}

function allConnectorTools(): ConnectorTool[] {
  return diagramDefinitions.flatMap((definition) => definition.connectors);
}

/** Packages / subjects sit behind edges so connector lines stay visible. */
function isDiagramBackgroundNode(kind: UmlElementKind): boolean {
  return kind === 'package' || kind === 'subject';
}

/** Combined fragments frame messages; paint under edges so messages stay selectable. */
function isDiagramUnderlayNode(kind: UmlElementKind): boolean {
  return kind === 'combinedFragment';
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

function normalizeEdgeAnchorOffset(offset: unknown): number | undefined {
  return typeof offset === 'number' && Number.isFinite(offset) ? clamp(offset, 0, 1) : undefined;
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
      return { width: 88, height: 132 };
    case 'useCase':
      return { width: 136, height: 68 };
    case 'port':
      return { width: 26, height: 26 };
    case 'providedInterface':
    case 'requiredInterface':
      return { width: 56, height: 24 };
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
    case 'finalState':
    case 'pseudostate':
      return { width: 54, height: 54 };
    case 'stateInvariant':
      return { width: 132, height: 48 };
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

function minimumResizableNodeSize(kind: UmlElementKind, ownedElements: UmlOwnedElement[] = [], diagramKind?: DiagramKind): { width: number; height: number } {
  switch (kind) {
    case 'port':
      return { width: 14, height: 14 };
    case 'actor':
      return { width: 44, height: 66 };
    case 'initialNode':
    case 'finalNode':
    case 'flowFinalNode':
    case 'finalState':
    case 'pseudostate':
      return { width: 28, height: 28 };
    case 'stateInvariant':
      return { width: 72, height: 28 };
    case 'forkNode':
    case 'joinNode':
      return { width: 28, height: 8 };
    case 'decisionNode':
    case 'mergeNode':
      return { width: 32, height: 32 };
    case 'providedInterface':
    case 'requiredInterface':
      return { width: 24, height: 24 };
    case 'lifeline':
      if (diagramKind === 'communication') {
        return { width: 64, height: 32 };
      }
      return { width: 64, height: 96 };
    case 'combinedFragment':
    case 'subject':
      return { width: 120, height: 80 };
    case 'class':
    case 'interface':
    case 'dataType':
    case 'enumeration':
      return {
        width: Math.max(96, classCompartmentMinimumWidth(ownedElements)),
        height: Math.max(72, compartmentMinimumHeight(ownedElements))
      };
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
    const size = Math.max(minimumSize.width, minimumSize.height, Math.round(Math.max(requestedWidth, requestedHeight)));
    return { width: size, height: size };
  }

  return {
    width: Math.max(minimumSize.width, Math.round(requestedWidth)),
    height: Math.max(minimumSize.height, Math.round(requestedHeight))
  };
}

function isSquareResizableNode(kind: UmlElementKind): boolean {
  return kind === 'initialNode' || kind === 'finalNode' || kind === 'flowFinalNode' || kind === 'finalState' || kind === 'pseudostate' || kind === 'decisionNode' || kind === 'mergeNode' || kind === 'port';
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
  return kind === 'association' || kind === 'connector' ? '1' : undefined;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Fixed print colors for image export — independent of the UI theme. */
const DIAGRAM_EXPORT_COLORS = {
  canvas: '#ffffff',
  nodeFill: '#ffffff',
  nodeStroke: '#111111',
  text: '#111111',
  muted: '#555555',
  grid: '#e6e6e6'
} as const;

async function rasterizeDiagramSvg(svg: SVGSVGElement, options: { transparent: boolean }): Promise<{ canvas: HTMLCanvasElement; backgroundColor: string }> {
  const crop = getDiagramExportBounds(svg);
  const width = Math.max(1, Math.ceil(crop.width));
  const height = Math.max(1, Math.ceil(crop.height));
  const scale = 2;
  const backgroundColor = DIAGRAM_EXPORT_COLORS.canvas;
  const clone = prepareDiagramSvgCloneForExport(svg);
  const defs = clone.querySelector('defs');
  const gridRect = clone.querySelector('rect[fill="url(#grid)"]');
  const style = globalThis.document.createElementNS('http://www.w3.org/2000/svg', 'style');

  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  clone.setAttribute('viewBox', `${crop.x} ${crop.y} ${width} ${height}`);
  style.textContent = createExportSvgCss(options.transparent ? 'transparent' : backgroundColor);

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

/** Strip editor chrome so export matches the on-screen diagram. */
function prepareDiagramSvgCloneForExport(svg: SVGSVGElement): SVGSVGElement {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const removeSelectors = [
    '.selected',
    '.preview-edge',
    '.box-select',
    '.node-hit-area',
    '.resize-handle',
    '.orthogonal-seg-hit',
    '.edge-endpoint-handle',
    '.assembly-hit',
    '.edge-hit',
    '.lifeline-message-start-zone',
    '.operand-separator-overlay',
    '.activation-resize-handle',
    '.group-frame-hit',
    '.group-title-hit'
  ];

  clone.querySelectorAll(removeSelectors.join(',')).forEach((element) => {
    if (element.classList.contains('selected')) {
      element.classList.remove('selected');
      return;
    }
    element.remove();
  });

  return clone;
}

function getDiagramExportBounds(svg: SVGSVGElement): { x: number; y: number; width: number; height: number } {
  const svgBounds = svg.getBoundingClientRect();
  const exportElements = Array.from(svg.querySelectorAll<SVGGraphicsElement>('.node, .edge:not(.preview-edge)'))
    .filter((element) => !element.classList.contains('preview-edge'));
  const elementBounds = exportElements
    .map((element) => {
      // Prefer visual content bounds; fall back to the group if needed.
      const visual = Array.from(element.querySelectorAll<SVGGraphicsElement>('rect, ellipse, circle, path, line, text, polyline, polygon'))
        .filter((candidate) => {
          const className = candidate.getAttribute('class') ?? '';
          return !className.includes('node-hit-area')
            && !className.includes('resize-handle')
            && !className.includes('orthogonal-seg-hit')
            && !className.includes('assembly-hit')
            && !className.includes('edge-hit')
            && !className.includes('lifeline-message-start-zone')
            && !className.includes('group-frame-hit')
            && !className.includes('group-title-hit');
        });
      const rects = (visual.length > 0 ? visual : [element])
        .map((candidate) => candidate.getBoundingClientRect())
        .filter((bounds) => bounds.width > 0 || bounds.height > 0);
      if (rects.length === 0) {
        return undefined;
      }
      return {
        left: Math.min(...rects.map((bounds) => bounds.left)),
        top: Math.min(...rects.map((bounds) => bounds.top)),
        right: Math.max(...rects.map((bounds) => bounds.right)),
        bottom: Math.max(...rects.map((bounds) => bounds.bottom))
      };
    })
    .filter((bounds): bounds is { left: number; top: number; right: number; bottom: number } => Boolean(bounds));
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

function createExportSvgCss(backgroundColor: string): string {
  const canvas = backgroundColor === 'transparent' ? DIAGRAM_EXPORT_COLORS.canvas : backgroundColor;
  const { nodeFill, nodeStroke, text, muted, grid } = DIAGRAM_EXPORT_COLORS;
  const font = "Bahnschrift, 'Aptos Display', 'Segoe UI', sans-serif";

  // Print-style diagram colors only — never the UI theme.
  return `
    .grid-line { stroke: ${grid}; fill: none; }
    .node rect, .node ellipse, .node circle, .node path { fill: ${nodeFill}; stroke: ${nodeStroke}; stroke-width: 1.4; }
    .node line { stroke: ${nodeStroke}; stroke-width: 1.2; fill: none; }
    .node .filled, .node .activity-bar-node { fill: ${nodeStroke}; }
    .node .activity-control-marker { fill: none; stroke: ${nodeStroke}; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
    .node .activity-flow-final { fill: none; stroke: ${nodeStroke}; stroke-width: 2; }
    .node .actor-figure circle, .node .actor-figure path { fill: none; stroke: ${nodeStroke}; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
    .node .combined-fragment-frame { fill: rgba(255, 255, 255, 0.01); }
    .node .combined-fragment-operator { fill: ${nodeFill}; }
    .node .operand-separator { stroke: ${nodeStroke}; stroke-width: 1.2; fill: none; }
    .node .component-icon rect { fill: ${canvas}; }
    .node .port-node { fill: ${nodeFill}; }
    .node .required-interface-socket { fill: none; stroke: ${nodeStroke}; stroke-width: 1.8; }
    .node .provided-interface-ball { fill: ${nodeFill}; stroke: ${nodeStroke}; stroke-width: 1.4; }
    .node .interface-elbow, .node .interface-stem { fill: none; stroke: ${nodeStroke}; stroke-width: 1.2; }
    .node .package-shape, .node .subject-boundary { fill: none; stroke: ${nodeStroke}; stroke-width: 1.4; }
    .node .group-frame-hit, .node .group-title-hit { fill: none; stroke: none; }
    .node .deployment-node-shape { fill: ${nodeFill}; }
    .node .deployment-node-depth, .node .artifact-fold { fill: none; }
    .node text { fill: ${text}; font-family: ${font}; font-size: 13px; }
    .node .compartment-label { fill: ${muted}; font-size: 12px; font-weight: 800; }
    .owned-element-shape rect { fill: transparent; stroke: transparent; stroke-width: 0; }
    .edge path { fill: none; stroke: ${nodeStroke}; stroke-width: 1.7; }
    .edge .activation-bar { fill: ${nodeFill}; stroke: ${nodeStroke}; stroke-width: 1.4; }
    .edge .object-flow-token { fill: ${canvas}; stroke: ${nodeStroke}; stroke-width: 1.7; }
    .edge .assembly-line { fill: none; stroke: ${nodeStroke}; stroke-width: 1.5; opacity: 0.85; }
    .edge text { fill: ${text}; font-family: ${font}; font-size: 12px; paint-order: stroke; stroke: ${canvas}; stroke-width: 4px; }
    .arrow-marker { fill: none; stroke: ${nodeStroke}; stroke-width: 1.4; }
    .filled-arrow-marker { fill: ${nodeStroke}; stroke: ${nodeStroke}; stroke-width: 1.4; }
    .hollow-arrow-marker { fill: ${canvas}; stroke: ${nodeStroke}; stroke-width: 1.4; }
  `;
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

async function writeProjectToFileHandle(fileHandle: ProjectFileHandle, serializedProject: string) {
  const writable = await fileHandle.createWritable();

  await writable.write(serializedProject);
  await writable.close();
}

function rememberLastDirectory(filePath: string, kind: 'project' | 'image' = 'project') {
  const index = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  if (index <= 0) {
    return;
  }
  try {
    const directory = filePath.slice(0, index);
    const key = kind === 'image' ? lastImageDirectoryStorageKey : lastProjectDirectoryStorageKey;
    globalThis.localStorage?.setItem(key, directory);
  } catch {
    // ignore
  }
}

const directoryHandleDbName = 'my-uml-multi-os-fs';
const directoryHandleStore = 'handles';
const directoryHandleProjectKey = 'last-project-directory';

async function openDirectoryHandleDb(): Promise<IDBDatabase | undefined> {
  if (!globalThis.indexedDB) {
    return undefined;
  }

  return new Promise((resolve, reject) => {
    const request = globalThis.indexedDB.open(directoryHandleDbName, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(directoryHandleStore)) {
        db.createObjectStore(directoryHandleStore);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function directoryHandleStorageKey(kind: 'project' | 'image'): string {
  return kind === 'image' ? directoryHandleImageKey : directoryHandleProjectKey;
}

async function readStoredDirectoryHandle(kind: 'project' | 'image' = 'project'): Promise<FileSystemHandle | undefined> {
  try {
    const db = await openDirectoryHandleDb();
    if (!db) {
      return undefined;
    }
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(directoryHandleStore, 'readonly');
      const request = transaction.objectStore(directoryHandleStore).get(directoryHandleStorageKey(kind));
      request.onsuccess = () => resolve(request.result as FileSystemHandle | undefined);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return undefined;
  }
}

async function writeStoredDirectoryHandle(handle: FileSystemHandle, kind: 'project' | 'image' = 'project') {
  try {
    const db = await openDirectoryHandleDb();
    if (!db) {
      return;
    }
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(directoryHandleStore, 'readwrite');
      transaction.objectStore(directoryHandleStore).put(handle, directoryHandleStorageKey(kind));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } catch {
    // ignore
  }
}

async function rememberDirectoryHandleFromFile(
  fileHandle: ProjectFileHandle & { getParent?: () => Promise<FileSystemHandle> },
  kind: 'project' | 'image' = 'project'
) {
  if (typeof fileHandle.getParent !== 'function') {
    return;
  }
  try {
    const parent = await fileHandle.getParent();
    await writeStoredDirectoryHandle(parent, kind);
  } catch {
    // ignore
  }
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return globalThis.btoa(binary);
}

function downloadProjectFile(serializedProject: string, filename: string) {
  downloadBlob(new Blob([serializedProject], { type: 'application/json' }), filename);
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
  finalState: CircleDot,
  state: ToggleLeft,
  stateInvariant: ToggleLeft,
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

  if (kind === 'initialNode' || kind === 'finalNode' || kind === 'flowFinalNode' || kind === 'finalState' || kind === 'decisionNode' || kind === 'mergeNode' || kind === 'forkNode' || kind === 'joinNode') {
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

/** Fragments that draw a dashed operand divider (alt / par). */
function combinedFragmentShowsSeparator(name: string | undefined): boolean {
  const operator = combinedFragmentOperator(name);
  return operator === 'alt' || operator === 'par';
}

const OPERAND_SEPARATOR_TOP_MARGIN = 40;
const OPERAND_SEPARATOR_BOTTOM_MARGIN = 20;

function operandSeparatorBounds(height: number): { min: number; max: number } {
  const min = OPERAND_SEPARATOR_TOP_MARGIN;
  const max = Math.max(min, height - OPERAND_SEPARATOR_BOTTOM_MARGIN);
  return { min, max };
}

function operandSeparatorYForNode(node: UmlNode): number {
  const { min, max } = operandSeparatorBounds(node.height);
  const fallback = Math.round(node.height / 2);
  const raw = typeof node.operandSeparatorY === 'number' && Number.isFinite(node.operandSeparatorY)
    ? node.operandSeparatorY
    : fallback;
  return clamp(Math.round(raw), min, max);
}

function moveOperandSeparator(document: UmlDiagramDocument, nodeId: string, separatorY: number): UmlDiagramDocument {
  return {
    ...document,
    nodes: document.nodes.map((node) => {
      if (node.id !== nodeId || node.kind !== 'combinedFragment') {
        return node;
      }
      const { min, max } = operandSeparatorBounds(node.height);
      return { ...node, operandSeparatorY: clamp(Math.round(separatorY), min, max) };
    })
  };
}

function clampCombinedFragmentSeparators(document: UmlDiagramDocument, nodeId?: string): UmlDiagramDocument {
  return {
    ...document,
    nodes: document.nodes.map((node) => {
      if (node.kind !== 'combinedFragment') {
        return node;
      }
      if (nodeId && node.id !== nodeId) {
        return node;
      }
      if (!combinedFragmentShowsSeparator(node.name) || node.operandSeparatorY === undefined) {
        return node;
      }
      const nextY = operandSeparatorYForNode(node);
      return nextY === node.operandSeparatorY ? node : { ...node, operandSeparatorY: nextY };
    })
  };
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

  if (kind === 'finalNode' || kind === 'finalState') {
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

function paletteToolLabel(locale: Locale, tool: PaletteTool, diagramKind?: DiagramKind): string {
  if (diagramKind === 'communication' && tool.kind === 'lifeline') {
    return communicationDiagramLabels[locale].participant;
  }
  if (diagramKind === 'communication' && tool.kind === 'actor') {
    return communicationDiagramLabels[locale].actor;
  }
  return tool.kind === 'combinedFragment' ? tool.label : toolLabels[locale][tool.kind] ?? tool.label;
}

function connectorToolLabel(locale: Locale, connector: ConnectorTool, diagramKind?: DiagramKind): string {
  if (diagramKind === 'communication') {
    if (isCommunicationLinkEdge(connector.kind)) return communicationDiagramLabels[locale].link;
    if (connector.kind === 'message') return communicationDiagramLabels[locale].message;
    if (connector.kind === 'asyncMessage') return communicationDiagramLabels[locale].asyncMessage;
    if (connector.kind === 'replyMessage') return communicationDiagramLabels[locale].replyMessage;
  }
  if (diagramKind === 'component' && connector.kind === 'interfacePair') {
    return locale === 'ko' ? '연결' : 'Interface Pair';
  }
  return connectorLabels[locale][connector.kind] ?? connector.label;
}

function isCommunicationParticipant(kind: UmlElementKind | undefined): boolean {
  return kind === 'lifeline' || kind === 'actor';
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

  if (kind === 'interfacePair') {
    return (
      <svg width={size + 12} height={size} viewBox="0 0 28 16" aria-hidden="true" className="connector-glyph">
        <line x1="2" y1="8" x2="8" y2="8" />
        <circle cx="12" cy="8" r="3.5" />
        <path d="M18 4 A4 4 0 0 1 18 12" />
        <line x1="22" y1="8" x2="26" y2="8" />
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
      {notation.marker === 'filledArrow' ? <path d="M19 4 L25 8 L19 12 Z" /> : null}
      {notation.marker === 'hollowTriangle' ? <path d="M18 3 L26 8 L18 13 Z" /> : null}
    </svg>
  );
}

function ObjectFlowToken({ source, target }: { source: Point; target: Point }) {
  const centerX = (source.x + target.x) / 2;
  const centerY = (source.y + target.y) / 2;

  return <rect className="object-flow-token" x={centerX - 5} y={centerY - 5} width="10" height="10" transform={`rotate(45 ${centerX} ${centerY})`} />;
}


function interfaceGlyphRadius(): number {
  return INTERFACE_GLYPH_RADIUS;
}

function interfaceNodeConnectionPoint(node: UmlNode, toward: Point, _allNodes: UmlNode[]): Point {
  const glyphCenter = interfaceGlyphCenter(node);
  if (node.kind === 'requiredInterface') {
    return glyphCenter;
  }
  // providedInterface: point on ball surface facing toward
  const r = interfaceGlyphRadius();
  const dx = toward.x - glyphCenter.x;
  const dy = toward.y - glyphCenter.y;
  const dist = Math.hypot(dx, dy);
  if (dist === 0) return glyphCenter;
  return { x: glyphCenter.x + r * dx / dist, y: glyphCenter.y + r * dy / dist };
}

function nodeIntersectsRect(node: UmlNode, rect: { x: number; y: number; width: number; height: number }): boolean {
  return (
    node.x < rect.x + rect.width &&
    node.x + node.width > rect.x &&
    node.y < rect.y + rect.height &&
    node.y + node.height > rect.y
  );
}

function resolveEdgePolylinePoints(
  edge: UmlEdge,
  edgeIndex: number,
  diagramKind: DiagramKind,
  nodes: UmlNode[],
  edges: UmlEdge[]
): Point[] | undefined {
  const source = nodes.find((node) => node.id === edge.sourceId);
  const target = nodes.find((node) => node.id === edge.targetId);
  if (!source || !target) {
    return undefined;
  }

  const geometry = resolveEdgeGeometry(edge, edgeIndex, diagramKind, nodes, edges, source, target);
  if (!geometry) {
    return undefined;
  }

  if (geometry.sequenceMessagePoints?.selfCall) {
    const start = geometry.sequenceMessagePoints.source;
    const end = geometry.sequenceMessagePoints.target;
    return [start, { x: start.x + 58, y: start.y }, { x: start.x + 58, y: end.y }, end];
  }
  if (geometry.communicationMessagePoints?.selfCall) {
    return sampleQuadraticPoints(geometry.effectiveSrc, geometry.effectiveTgt, 8);
  }
  if (geometry.orthogonalPoints) {
    return geometry.orthogonalPoints;
  }
  if (edge.route === 'curve') {
    return sampleQuadraticPoints(geometry.effectiveSrc, geometry.effectiveTgt);
  }
  return [geometry.effectiveSrc, geometry.effectiveTgt];
}

function resolveEdgeGeometry(
  edge: UmlEdge,
  edgeIndex: number,
  diagramKind: DiagramKind,
  nodes: UmlNode[],
  edges: UmlEdge[] | undefined,
  source: UmlNode,
  target: UmlNode
) {
  const sourceCenter = centerOf(source);
  const targetCenter = centerOf(target);
  const sequenceMessagePoints = getSequenceMessagePoints(diagramKind, edge, source, target, edgeIndex);
  const peerPosition = edges ? communicationMessagePeerPosition(edges, edge) : { index: edgeIndex, count: 1 };
  const communicationMessagePoints = !sequenceMessagePoints && diagramKind === 'communication' && isInteractionMessageKind(edge.kind)
    ? getCommunicationMessagePoints(edge, source, target, peerPosition)
    : undefined;
  const useEndpointAnchors = edge.route === 'orthogonal' || Boolean(edge.sourceAnchor || edge.targetAnchor);
  const sourceAnchor = useEndpointAnchors ? edge.sourceAnchor ?? (edge.route === 'orthogonal' ? connectionSideToward(source, targetCenter) : undefined) : undefined;
  const targetAnchor = useEndpointAnchors ? edge.targetAnchor ?? (edge.route === 'orthogonal' ? connectionSideToward(target, sourceCenter) : undefined) : undefined;
  let sourcePoint = sequenceMessagePoints?.source ?? communicationMessagePoints?.source ?? connectionPoint(source, targetCenter, sourceAnchor, useEndpointAnchors, edge.sourceAnchorOffset);
  let targetPoint = sequenceMessagePoints?.target ?? communicationMessagePoints?.target ?? connectionPoint(target, sourceCenter, targetAnchor, useEndpointAnchors, edge.targetAnchorOffset);

  if (!sequenceMessagePoints && !communicationMessagePoints && edge.kind !== 'assemblyConnector') {
    if (source.kind === 'providedInterface' || source.kind === 'requiredInterface') {
      sourcePoint = interfaceNodeConnectionPoint(source, targetCenter, nodes);
    }
    if (target.kind === 'providedInterface' || target.kind === 'requiredInterface') {
      targetPoint = interfaceNodeConnectionPoint(target, sourceCenter, nodes);
    }
  }

  let effectiveSrc = sourcePoint;
  let effectiveTgt = targetPoint;
  let showAssemblyLink = true;
  let assemblyLinkPath: string | undefined;
  if (edge.kind === 'assemblyConnector') {
    effectiveSrc = interfaceGlyphCenter(source);
    effectiveTgt = interfaceGlyphCenter(target);
    const assemblyPoints = assemblyConnectorPolyline(source, target, edge.orthogonalElbow) ?? [effectiveSrc, effectiveTgt];
    assemblyLinkPath = assemblyConnectorPathData(source, target, edge.orthogonalElbow);
    showAssemblyLink = Boolean(assemblyLinkPath);
    return {
      sourceCenter,
      targetCenter,
      sourcePoint,
      targetPoint,
      effectiveSrc,
      effectiveTgt,
      sourceAnchor,
      targetAnchor,
      sequenceMessagePoints,
      communicationMessagePoints,
      orthogonalPoints: assemblyPoints,
      showAssemblyLink,
      assemblyLinkPath
    };
  }

  const routingObstacles = !sequenceMessagePoints && !communicationMessagePoints
    ? nodes
      .filter((node) => node.id !== source.id && node.id !== target.id && !isRoutingIgnoredNode(node))
      .map((node) => connectionBounds(node))
    : [];
  const shouldRouteAroundObstacles = !sequenceMessagePoints && !communicationMessagePoints && (
    edge.route === 'orthogonal'
    || (routingObstacles.length > 0 && straightCrossesObstacles(effectiveSrc, effectiveTgt, routingObstacles))
  );
  const orthogonalPoints = shouldRouteAroundObstacles
    ? routeOrthogonalAvoidingObstacles({
      source: effectiveSrc,
      target: effectiveTgt,
      sourceAnchor: sourceAnchor ?? connectionSideToward(source, targetCenter),
      targetAnchor: targetAnchor ?? connectionSideToward(target, sourceCenter),
      elbow: edge.route === 'orthogonal' ? edge.orthogonalElbow : undefined,
      obstacles: routingObstacles
    })
    : undefined;

  return {
    sourceCenter,
    targetCenter,
    sourcePoint,
    targetPoint,
    effectiveSrc,
    effectiveTgt,
    sourceAnchor,
    targetAnchor,
    sequenceMessagePoints,
    communicationMessagePoints,
    orthogonalPoints,
    showAssemblyLink,
    assemblyLinkPath
  };
}

function DiagramEdge({ edge, edgeIndex, diagramKind, nodes, edges, bridgeCrossings, selected, onSelect, onPointerDown, onOrthogonalSegmentPointerDown, onActivationResizeStart, onLabelPointerDown, onMultiplicityPointerDown, onPointerMove, onPointerUp, onContextMenu }: { edge: UmlEdge; edgeIndex: number; diagramKind: DiagramKind; nodes: UmlNode[]; edges?: UmlEdge[]; bridgeCrossings: Point[]; selected: boolean; onSelect: () => void; onPointerDown: (event: React.PointerEvent<SVGGElement>) => void; onOrthogonalSegmentPointerDown: (event: React.PointerEvent<SVGGElement>, axis: 'x' | 'y') => void; onActivationResizeStart: (event: React.PointerEvent<SVGGElement>, end: 'source' | 'target') => void; onLabelPointerDown: (event: React.PointerEvent<SVGTextElement>) => void; onMultiplicityPointerDown: (event: React.PointerEvent<SVGTextElement>, endpoint: 'source' | 'target') => void; onPointerMove: (event: React.PointerEvent<SVGElement>) => void; onPointerUp: (event: React.PointerEvent<SVGGElement>) => void; onContextMenu: (event: React.MouseEvent<SVGGElement>) => void }) {
  const source = nodes.find((node) => node.id === edge.sourceId);
  const target = nodes.find((node) => node.id === edge.targetId);

  if (!source || !target) {
    return null;
  }

  const className = selected ? 'edge selected' : 'edge';
  const notation = getUmlConnectorNotation(edge.kind);
  const geometry = resolveEdgeGeometry(edge, edgeIndex, diagramKind, nodes, edges, source, target);
  if (!geometry) {
    return null;
  }

  const {
    effectiveSrc,
    effectiveTgt,
    sourcePoint,
    targetPoint,
    sourceAnchor,
    targetAnchor,
    sequenceMessagePoints,
    communicationMessagePoints,
    orthogonalPoints,
    showAssemblyLink,
    assemblyLinkPath
  } = geometry;

  const markerEnd = notation.marker === 'hollowTriangle'
    ? 'url(#triangle-arrow)'
    : notation.marker === 'filledArrow'
      ? 'url(#filled-arrow)'
      : notation.marker === 'openArrow'
        ? 'url(#line-arrow)'
        : undefined;
  const showMultiplicity = supportsMultiplicity(edge.kind);
  const label = notation.stereotype
    ? `«${notation.stereotype}»`
    : diagramKind === 'communication' && isInteractionMessageKind(edge.kind)
      ? communicationMessageLabel(edge)
      : edge.kind === 'assemblyConnector'
        ? ''
        : edge.name;
  const sourceMultiplicityPoint = pointBetween(effectiveSrc, effectiveTgt, 0.18, -12);
  const targetMultiplicityPoint = pointBetween(effectiveSrc, effectiveTgt, 0.82, -12);
  const effectiveSourceMultiplicityPoint = {
    x: sourceMultiplicityPoint.x + (edge.sourceMultiplicityOffset?.x ?? 0),
    y: sourceMultiplicityPoint.y + (edge.sourceMultiplicityOffset?.y ?? 0)
  };
  const effectiveTargetMultiplicityPoint = {
    x: targetMultiplicityPoint.x + (edge.targetMultiplicityOffset?.x ?? 0),
    y: targetMultiplicityPoint.y + (edge.targetMultiplicityOffset?.y ?? 0)
  };
  const sourceActivation = sequenceMessagePoints && !sequenceMessagePoints.selfCall
    ? getSequenceActivationRect(source, sequenceMessagePoints.source, activationHeightForEdge(edge, 'source'))
    : undefined;
  const targetActivationHeight = sequenceMessagePoints?.selfCall
    ? Math.max(
      activationHeightForEdge(edge, 'target'),
      Math.round(sequenceMessagePoints.target.y - sequenceMessagePoints.source.y) + 20
    )
    : activationHeightForEdge(edge, 'target');
  const targetActivation = sequenceMessagePoints
    ? getSequenceActivationRect(
      target,
      sequenceMessagePoints.selfCall ? sequenceMessagePoints.source : sequenceMessagePoints.target,
      targetActivationHeight
    )
    : undefined;
  const polylinePoints = resolveEdgePolylinePoints(edge, edgeIndex, diagramKind, nodes, edges ?? []);
  const basePathData = (
    sequenceMessagePoints?.selfCall
      ? selfMessagePath(sequenceMessagePoints.source, sequenceMessagePoints.target)
      : communicationMessagePoints?.selfCall
        ? communicationMessagePoints.path
        : orthogonalPoints
          ? pointsToPath(orthogonalPoints)
          : edgePath(edge.route, effectiveSrc, effectiveTgt, sourceAnchor, targetAnchor)
  ) || `M ${effectiveSrc.x} ${effectiveSrc.y} L ${effectiveTgt.x} ${effectiveTgt.y}`;
  const pathData = polylinePoints && bridgeCrossings.length > 0 && !sequenceMessagePoints?.selfCall && !communicationMessagePoints?.selfCall
    ? polylinePathWithBridges(polylinePoints, bridgeCrossings)
    : basePathData;
  const orthogonalSegments = orthogonalPoints ? movableOrthogonalSegments(orthogonalPoints) : [];
  const labelPoint = sequenceMessagePoints?.selfCall
    ? { x: sequenceMessagePoints.source.x + 42, y: sequenceMessagePoints.source.y - 8 }
    : communicationMessagePoints?.labelPoint
      ?? (orthogonalPoints && orthogonalPoints.length > 0
        ? orthogonalLabelPoint(orthogonalPoints)
        : { x: (effectiveSrc.x + effectiveTgt.x) / 2, y: (effectiveSrc.y + effectiveTgt.y) / 2 - 8 });
  const effectiveLabelPoint = {
    x: labelPoint.x + (edge.labelOffset?.x ?? 0),
    y: labelPoint.y + (edge.labelOffset?.y ?? 0)
  };

  return (
    <g className={className} onPointerDown={onPointerDown} onClick={(event) => { event.stopPropagation(); onSelect(); }} onContextMenu={onContextMenu}>
      {sourceActivation ? <rect className="activation-bar" x={sourceActivation.x} y={sourceActivation.y} width={sourceActivation.width} height={sourceActivation.height} rx="2" /> : null}
      {targetActivation ? <rect className="activation-bar" x={targetActivation.x} y={targetActivation.y} width={targetActivation.width} height={targetActivation.height} rx="2" /> : null}
      {/* Wide invisible hit stroke — never painted when selected. */}
      <path className={edge.kind === 'assemblyConnector' ? 'assembly-hit edge-hit' : 'edge-hit'} d={pathData} />
      {edge.kind === 'assemblyConnector'
        ? (showAssemblyLink && assemblyLinkPath ? <path className="assembly-line" d={assemblyLinkPath} /> : null)
        : <path className="edge-line" d={pathData} markerEnd={markerEnd} strokeDasharray={notation.dashed ? '8 5' : undefined} />}
      {orthogonalSegments.map((segment, index) => (
        <path
          key={`ortho-seg-${index}`}
          className={`orthogonal-seg-hit ${segment.axis === 'x' ? 'orthogonal-seg-vertical' : 'orthogonal-seg-horizontal'}`}
          d={`M ${segment.start.x} ${segment.start.y} L ${segment.end.x} ${segment.end.y}`}
          onPointerDown={(event) => onOrthogonalSegmentPointerDown(event, segment.axis)}
        />
      ))}
      {selected && sourceActivation ? (
        <g
          className="activation-resize-handle"
          transform={`translate(${sourceActivation.x + sourceActivation.width / 2 - 8} ${sourceActivation.y + sourceActivation.height - 6})`}
          onPointerDown={(event) => onActivationResizeStart(event, 'source')}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          <rect width="16" height="10" rx="2" />
          <path d="M4 3 H12 M4 7 H12" />
        </g>
      ) : null}
      {selected && targetActivation ? (
        <g
          className="activation-resize-handle"
          transform={`translate(${targetActivation.x + targetActivation.width / 2 - 8} ${targetActivation.y + targetActivation.height - 6})`}
          onPointerDown={(event) => onActivationResizeStart(event, 'target')}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          <rect width="16" height="10" rx="2" />
          <path d="M4 3 H12 M4 7 H12" />
        </g>
      ) : null}
      {notation.objectToken ? <ObjectFlowToken source={sourcePoint} target={targetPoint} /> : null}
      <text className="edge-label" x={effectiveLabelPoint.x} y={effectiveLabelPoint.y} textAnchor="middle" onPointerDown={onLabelPointerDown}>{label}</text>
      {showMultiplicity && edge.sourceMultiplicity ? <text className="multiplicity" x={effectiveSourceMultiplicityPoint.x} y={effectiveSourceMultiplicityPoint.y} textAnchor="middle" onPointerDown={(event) => onMultiplicityPointerDown(event, 'source')}>{edge.sourceMultiplicity}</text> : null}
      {showMultiplicity && edge.targetMultiplicity ? <text className="multiplicity" x={effectiveTargetMultiplicityPoint.x} y={effectiveTargetMultiplicityPoint.y} textAnchor="middle" onPointerDown={(event) => onMultiplicityPointerDown(event, 'target')}>{edge.targetMultiplicity}</text> : null}
    </g>
  );
}

function EdgeEndpointPreview({ preview, diagramKind, nodes, edges }: { preview: { edgeId: string; endpoint: 'source' | 'target'; point: Point }; diagramKind: DiagramKind; nodes: UmlNode[]; edges: UmlEdge[] }) {
  const edge = edges.find((candidate) => candidate.id === preview.edgeId);
  if (!edge) {
    return null;
  }

  const hitNode = [...nodes].reverse().find((node) => node.kind !== 'subject' && pointInNodeConnectionBounds(preview.point, node, 8));
  const endpointPosition = hitNode ? edgeAnchorFromNodePoint(hitNode, preview.point) : undefined;
  const previewEdge: UmlEdge = hitNode && endpointPosition
    ? {
        ...edge,
        sourceId: preview.endpoint === 'source' ? hitNode.id : edge.sourceId,
        targetId: preview.endpoint === 'target' ? hitNode.id : edge.targetId,
        sourceAnchor: preview.endpoint === 'source' ? endpointPosition.anchor : edge.sourceAnchor,
        targetAnchor: preview.endpoint === 'target' ? endpointPosition.anchor : edge.targetAnchor,
        sourceAnchorOffset: preview.endpoint === 'source' ? endpointPosition.offset : edge.sourceAnchorOffset,
        targetAnchorOffset: preview.endpoint === 'target' ? endpointPosition.offset : edge.targetAnchorOffset
      }
    : edge;

  const edgeIndex = diagramKind === 'sequence' && isInteractionMessageKind(edge.kind)
    ? edges.slice(0, edges.findIndex((candidate) => candidate.id === edge.id)).filter((candidate) => isInteractionMessageKind(candidate.kind)).length
    : edges.findIndex((candidate) => candidate.id === edge.id);
  const previewEdges = edges.map((candidate) => candidate.id === edge.id ? previewEdge : candidate);
  const points = resolveEdgePolylinePoints(previewEdge, edgeIndex, diagramKind, nodes, previewEdges);
  if (!points || points.length < 2) {
    return null;
  }

  const previewPoints = [...points];
  if (!hitNode && preview.endpoint === 'source') {
    previewPoints[0] = preview.point;
  } else if (!hitNode) {
    previewPoints[previewPoints.length - 1] = preview.point;
  }

  const notation = getUmlConnectorNotation(edge.kind);
  const markerEnd = notation.marker === 'hollowTriangle'
    ? 'url(#triangle-arrow)'
    : notation.marker === 'filledArrow'
      ? 'url(#filled-arrow)'
      : notation.marker === 'openArrow'
        ? 'url(#line-arrow)'
        : undefined;

  return (
    <g className="preview-edge endpoint-preview-edge">
      <path d={pointsToPath(previewPoints)} markerEnd={markerEnd} strokeDasharray={notation.dashed ? '8 5' : undefined} />
    </g>
  );
}

function EdgeEndpointHandles({ edge, edgeIndex, diagramKind, nodes, edges, visible, endpointDragPreview, onEndpointPointerDown, onPointerMove, onPointerUp }: { edge: UmlEdge; edgeIndex: number; diagramKind: DiagramKind; nodes: UmlNode[]; edges: UmlEdge[]; visible: boolean; endpointDragPreview?: { endpoint: 'source' | 'target'; point: Point }; onEndpointPointerDown: (event: React.PointerEvent<SVGGElement>, endpoint: 'source' | 'target') => void; onPointerMove: (event: React.PointerEvent<SVGElement>) => void; onPointerUp: (event: React.PointerEvent<SVGGElement>) => void }) {
  const source = nodes.find((node) => node.id === edge.sourceId);
  const target = nodes.find((node) => node.id === edge.targetId);

  if (!source || !target) {
    return null;
  }

  const geometry = resolveEdgeGeometry(edge, edgeIndex, diagramKind, nodes, edges, source, target);
  if (!geometry) {
    return null;
  }

  const sourceHandlePoint = endpointDragPreview?.endpoint === 'source' ? endpointDragPreview.point : geometry.effectiveSrc;
  const targetHandlePoint = endpointDragPreview?.endpoint === 'target' ? endpointDragPreview.point : geometry.effectiveTgt;
  const sourceClassName = visible ? 'edge-endpoint-handle source-endpoint-handle visible' : 'edge-endpoint-handle source-endpoint-handle';
  const targetClassName = visible ? 'edge-endpoint-handle target-endpoint-handle visible' : 'edge-endpoint-handle target-endpoint-handle';

  return (
    <g className="edge endpoint-overlay">
      <g
        className={sourceClassName}
        transform={`translate(${sourceHandlePoint.x - 9} ${sourceHandlePoint.y - 9})`}
        onPointerDown={(event) => onEndpointPointerDown(event, 'source')}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <rect width="18" height="18" rx="4" />
      </g>
      <g
        className={targetClassName}
        transform={`translate(${targetHandlePoint.x - 9} ${targetHandlePoint.y - 9})`}
        onPointerDown={(event) => onEndpointPointerDown(event, 'target')}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <circle cx="9" cy="9" r="9" />
      </g>
    </g>
  );
}

function communicationMessageLabel(edge: UmlEdge): string {
  const number = edge.sequenceNumber?.trim();
  const name = edge.name?.trim();
  if (number && name) {
    return `${number}: ${name}`;
  }
  if (number) {
    return `${number}:`;
  }
  return name || edge.name;
}

function communicationMessagePeerPosition(edges: UmlEdge[], edge: UmlEdge): { index: number; count: number } {
  const peers = edges.filter((candidate) =>
    isInteractionMessageKind(candidate.kind)
    && (
      (candidate.sourceId === edge.sourceId && candidate.targetId === edge.targetId)
      || (candidate.sourceId === edge.targetId && candidate.targetId === edge.sourceId)
    )
  );
  const index = peers.findIndex((candidate) => candidate.id === edge.id);

  return { index: Math.max(0, index), count: Math.max(1, peers.length) };
}

function findEdgeEndpointDropNode(document: UmlDiagramDocument, edge: UmlEdge, endpoint: 'source' | 'target', point: Point): UmlNode | undefined {
  return [...document.nodes].reverse().find((node) => isValidEdgeEndpointNode(document, edge, endpoint, node) && pointInNodeConnectionBounds(point, node, 8));
}

function applyCreatedEdgeEndpointPositions(document: UmlDiagramDocument, edgeId: string, source: UmlNode, target: UmlNode, sourcePoint?: Point, targetPoint?: Point): UmlDiagramDocument {
  let nextDocument = document;

  if (sourcePoint && pointInNodeConnectionBounds(sourcePoint, source, 8)) {
    const sourceEndpoint = edgeAnchorFromNodePoint(source, sourcePoint);
    nextDocument = updateEdgeAnchor(nextDocument, edgeId, 'source', sourceEndpoint.anchor, sourceEndpoint.offset);
  }

  if (targetPoint && pointInNodeConnectionBounds(targetPoint, target, 8)) {
    const targetEndpoint = edgeAnchorFromNodePoint(target, targetPoint);
    nextDocument = updateEdgeAnchor(nextDocument, edgeId, 'target', targetEndpoint.anchor, targetEndpoint.offset);
  }

  return nextDocument;
}

function edgeAnchorFromNodePoint(node: UmlNode, point: Point): { anchor: EdgeAnchor; offset: number } {
  const bounds = connectionBounds(node);
  const distances: Array<{ anchor: EdgeAnchor; distance: number }> = [
    { anchor: 'left', distance: Math.abs(point.x - bounds.x) },
    { anchor: 'right', distance: Math.abs(point.x - (bounds.x + bounds.width)) },
    { anchor: 'top', distance: Math.abs(point.y - bounds.y) },
    { anchor: 'bottom', distance: Math.abs(point.y - (bounds.y + bounds.height)) }
  ];
  const anchor = distances.reduce((nearest, candidate) => (candidate.distance < nearest.distance ? candidate : nearest)).anchor;
  const offset = anchor === 'left' || anchor === 'right'
    ? (point.y - bounds.y) / bounds.height
    : (point.x - bounds.x) / bounds.width;

  return { anchor, offset: clamp(offset, 0, 1) };
}

function isValidEdgeEndpointNode(document: UmlDiagramDocument, edge: UmlEdge, endpoint: 'source' | 'target', node: UmlNode): boolean {
  if (node.kind === 'subject') {
    return false;
  }

  const otherNodeId = endpoint === 'source' ? edge.targetId : edge.sourceId;
  const otherNode = document.nodes.find((candidate) => candidate.id === otherNodeId);

  if (node.id === otherNodeId && !isInteractionMessageKind(edge.kind)) {
    return false;
  }

  if (document.kind === 'sequence' && isInteractionMessageKind(edge.kind)) {
    return node.kind === 'lifeline';
  }

  if (document.kind === 'communication' && (isInteractionMessageKind(edge.kind) || isCommunicationLinkEdge(edge.kind))) {
    return isCommunicationParticipant(node.kind);
  }

  if (document.kind === 'component' && edge.kind === 'assemblyConnector') {
    return Boolean(otherNode && isAssemblyPair(endpoint === 'source' ? node : otherNode, endpoint === 'target' ? node : otherNode, document.nodes));
  }

  return true;
}

function pointInNodeConnectionBounds(point: Point, node: UmlNode, padding = 0): boolean {
  const bounds = connectionBounds(node);
  return point.x >= bounds.x - padding
    && point.x <= bounds.x + bounds.width + padding
    && point.y >= bounds.y - padding
    && point.y <= bounds.y + bounds.height + padding;
}

function getCommunicationMessagePoints(edge: UmlEdge, source: UmlNode, target: UmlNode, peerPosition: { index: number; count: number }): {
  source: Point;
  target: Point;
  selfCall: boolean;
  path?: string;
  labelPoint?: Point;
} {
  const offset = communicationMessageParallelOffset(peerPosition.index, peerPosition.count) + (edge.offset ?? 0);

  if (source.id === target.id) {
    const baseX = source.x + source.width;
    const baseY = source.y + source.height / 2;
    const loop = 28 + Math.abs(offset);
    const start = { x: baseX, y: baseY - 8 + offset };
    const end = { x: baseX, y: baseY + 8 + offset };
    return {
      source: start,
      target: end,
      selfCall: true,
      path: `M ${start.x} ${start.y} C ${start.x + loop} ${start.y - 4}, ${end.x + loop} ${end.y + 4}, ${end.x} ${end.y}`,
      labelPoint: { x: baseX + loop + 8, y: baseY + offset - 4 }
    };
  }

  const sourceCenter = centerOf(source);
  const targetCenter = centerOf(target);
  const rawSource = connectionPoint(source, targetCenter);
  const rawTarget = connectionPoint(target, sourceCenter);
  const shiftedSource = offsetPointAlong(rawSource, rawTarget, offset);
  const shiftedTarget = offsetPointAlong(rawTarget, rawSource, -offset);

  return {
    source: shiftedSource,
    target: shiftedTarget,
    selfCall: false,
    labelPoint: {
      x: (shiftedSource.x + shiftedTarget.x) / 2,
      y: (shiftedSource.y + shiftedTarget.y) / 2 - 10 - Math.abs(offset) * 0.15
    }
  };
}

function communicationMessageParallelOffset(peerIndex: number, peerCount: number): number {
  if (peerCount <= 1) {
    return 0;
  }

  return (peerIndex - (peerCount - 1) / 2) * 28;
}

function communicationEdgeDragBasis(document: UmlDiagramDocument, edge: UmlEdge, clientX: number, clientY: number): { edgeId: string; startClientX: number; startClientY: number; startOffset: number; normalX: number; normalY: number } | undefined {
  const source = document.nodes.find((node) => node.id === edge.sourceId);
  const target = document.nodes.find((node) => node.id === edge.targetId);

  if (!source || !target) {
    return undefined;
  }

  const sourceCenter = centerOf(source);
  const targetCenter = centerOf(target);
  const dx = targetCenter.x - sourceCenter.x;
  const dy = targetCenter.y - sourceCenter.y;
  const length = Math.hypot(dx, dy) || 1;

  return {
    edgeId: edge.id,
    startClientX: clientX,
    startClientY: clientY,
    startOffset: edge.offset ?? 0,
    normalX: -dy / length,
    normalY: dx / length
  };
}

function moveCommunicationEdgeOffset(document: UmlDiagramDocument, edgeId: string, offset: number): UmlDiagramDocument {
  if (document.kind !== 'communication') {
    return document;
  }

  return {
    ...document,
    edges: document.edges.map((edge) => (edge.id === edgeId ? { ...edge, offset: clamp(Math.round(offset), -220, 220) } : edge))
  };
}

function moveEdgeLabelOffset(document: UmlDiagramDocument, edgeId: string, x: number, y: number): UmlDiagramDocument {
  return {
    ...document,
    edges: document.edges.map((edge) => (edge.id === edgeId ? { ...edge, labelOffset: { x: Math.round(x), y: Math.round(y) } } : edge))
  };
}

function moveEdgeMultiplicityOffset(document: UmlDiagramDocument, edgeId: string, endpoint: 'source' | 'target', x: number, y: number): UmlDiagramDocument {
  const offset = { x: Math.round(x), y: Math.round(y) };

  return {
    ...document,
    edges: document.edges.map((edge) => edge.id === edgeId
      ? {
          ...edge,
          sourceMultiplicityOffset: endpoint === 'source' ? offset : edge.sourceMultiplicityOffset,
          targetMultiplicityOffset: endpoint === 'target' ? offset : edge.targetMultiplicityOffset
        }
      : edge)
  };
}

function offsetPointAlong(point: Point, toward: Point, perpendicularOffset: number): Point {
  const dx = toward.x - point.x;
  const dy = toward.y - point.y;
  const length = Math.hypot(dx, dy) || 1;
  return {
    x: point.x + (-dy / length) * perpendicularOffset,
    y: point.y + (dx / length) * perpendicularOffset
  };
}

function moveSequenceMessage(document: UmlDiagramDocument, edgeId: string, nextY: number): UmlDiagramDocument {
  if (document.kind !== 'sequence') {
    return document;
  }

  const edge = document.edges.find((candidate) => candidate.id === edgeId);

  if (!edge || !isInteractionMessageKind(edge.kind)) {
    return document;
  }

  const extendedDocument = extendLifelinesForMessage(document, edge.sourceId, edge.targetId, nextY);
  const extendedEdge = extendedDocument.edges.find((candidate) => candidate.id === edgeId) ?? edge;
  const clampedY = clampSequenceMessageY(extendedDocument, extendedEdge, nextY);
  const movedEdges = extendedDocument.edges.map((candidate) => (candidate.id === edgeId ? { ...candidate, sequenceY: clampedY } : candidate));
  const movedDocument = { ...extendedDocument, edges: movedEdges };
  const originalIndexes = new Map(document.edges.map((candidate, index) => [candidate.id, index]));
  const sortedMessages = movedEdges
    .filter((candidate) => isInteractionMessageKind(candidate.kind))
    .sort((left, right) => sequenceYForEdge(movedDocument, left) - sequenceYForEdge(movedDocument, right) || (originalIndexes.get(left.id) ?? 0) - (originalIndexes.get(right.id) ?? 0));
  let messageIndex = 0;

  return {
    ...extendedDocument,
    edges: movedEdges.map((candidate) => (isInteractionMessageKind(candidate.kind) ? sortedMessages[messageIndex++] : candidate))
  };
}

function spaceSequenceMessagesAfterInsert(document: UmlDiagramDocument, insertedEdgeId: string): UmlDiagramDocument {
  if (document.kind !== 'sequence') {
    return document;
  }

  const insertedEdge = document.edges.find((edge) => edge.id === insertedEdgeId);

  if (!insertedEdge || !isInteractionMessageKind(insertedEdge.kind)) {
    return document;
  }

  const minimumGap = 42;
  const originalIndexes = new Map(document.edges.map((edge, index) => [edge.id, index]));
  const sortedMessages = document.edges
    .filter((edge) => isInteractionMessageKind(edge.kind))
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
      if (!isInteractionMessageKind(edge.kind)) {
        return edge;
      }

      const sortedMessage = sortedMessages[messageIndex++];
      return { ...sortedMessage, sequenceY: adjustedYByEdgeId.get(sortedMessage.id) ?? sortedMessage.sequenceY };
    })
  };

  return spacedDocument.edges.reduce(
    (current, edge) => isInteractionMessageKind(edge.kind) && edge.sequenceY !== undefined ? extendLifelinesForMessage(current, edge.sourceId, edge.targetId, edge.sequenceY) : current,
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
  return Math.max(0, edges.filter((edge) => isInteractionMessageKind(edge.kind)).findIndex((edge) => edge.id === edgeId));
}

function ConnectorPreview({ source, target, connector, diagramKind }: { source: UmlNode | undefined; target: Point; connector: ConnectorTool; diagramKind: DiagramKind }) {
  if (!source) {
    return null;
  }

  const notation = getUmlConnectorNotation(connector.kind);
  const sequencePreview = diagramKind === 'sequence' && isInteractionMessageKind(connector.kind) && source.kind === 'lifeline';
  const previewY = sequencePreview ? clampLifelineMessageY(source, source, target.y) : target.y;
  const sourcePoint = sequencePreview ? lifelineLinePoint(source, previewY) : connectionPoint(source, target);
  const targetPoint = sequencePreview ? { x: target.x, y: sourcePoint.y } : target;
  const markerEnd = notation.marker === 'hollowTriangle'
    ? 'url(#triangle-arrow)'
    : notation.marker === 'filledArrow'
      ? 'url(#filled-arrow)'
      : notation.marker === 'openArrow'
        ? 'url(#line-arrow)'
        : undefined;

  return (
    <g className="edge preview-edge">
      <path className="edge-line" d={edgePath('straight', sourcePoint, targetPoint)} markerEnd={markerEnd} strokeDasharray={notation.dashed ? '8 5' : undefined} />
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
  if (diagramKind !== 'sequence' || !isInteractionMessageKind(edge.kind) || source.kind !== 'lifeline' || target.kind !== 'lifeline') {
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

/** Shortest sequence lifeline height that still covers its messages. */
function minimumLifelineSpanHeight(document: UmlDiagramDocument, lifelineId: string): number {
  const lifeline = document.nodes.find((node) => node.id === lifelineId && node.kind === 'lifeline');
  if (!lifeline) {
    return 96;
  }

  let lowest = lifeline.y + 96;
  for (const edge of document.edges) {
    if (!isInteractionMessageKind(edge.kind)) {
      continue;
    }
    if (edge.sourceId !== lifelineId && edge.targetId !== lifelineId) {
      continue;
    }
    const messageY = sequenceYForEdge(document, edge);
    const sourceExtent = messageY + activationHeightForEdge(edge, 'source');
    const targetExtent = messageY + activationHeightForEdge(edge, 'target');
    const extent = edge.sourceId === edge.targetId
      ? Math.max(messageY + 48, targetExtent)
      : Math.max(
        edge.sourceId === lifelineId ? sourceExtent : messageY + 28,
        edge.targetId === lifelineId ? targetExtent : messageY + 28
      );
    lowest = Math.max(lowest, extent);
  }

  return Math.max(96, Math.round(lowest - lifeline.y));
}

function selfMessagePath(source: Point, target: Point): string {
  const loopX = source.x + 58;

  return `M ${source.x} ${source.y} L ${loopX} ${source.y} L ${loopX} ${target.y} L ${target.x} ${target.y}`;
}

const DEFAULT_ACTIVATION_HEIGHT = 40;

function activationHeightForEdge(edge: UmlEdge, end: 'source' | 'target'): number {
  const stored = end === 'source' ? edge.sourceActivationHeight : edge.targetActivationHeight;
  if (typeof stored === 'number' && Number.isFinite(stored)) {
    return Math.max(20, Math.round(stored));
  }
  return DEFAULT_ACTIVATION_HEIGHT;
}

function getSequenceActivationRect(lifeline: UmlNode, messagePoint: Point, height: number): { x: number; y: number; width: number; height: number } {
  const width = 14;
  const y = Math.max(lifeline.y + 44, messagePoint.y);
  const maxHeight = Math.max(20, lifeline.y + lifeline.height - y);

  return {
    x: messagePoint.x - width / 2,
    y,
    width,
    height: Math.min(Math.max(20, Math.round(height)), maxHeight)
  };
}

function resizeSequenceActivation(
  document: UmlDiagramDocument,
  edgeId: string,
  end: 'source' | 'target',
  height: number
): UmlDiagramDocument {
  if (document.kind !== 'sequence') {
    return document;
  }

  const edge = document.edges.find((candidate) => candidate.id === edgeId);
  if (!edge || !isInteractionMessageKind(edge.kind)) {
    return document;
  }

  const lifelineId = end === 'source' ? edge.sourceId : edge.targetId;
  const lifeline = document.nodes.find((node) => node.id === lifelineId && node.kind === 'lifeline');
  if (!lifeline) {
    return document;
  }

  const messageY = sequenceYForEdge(document, edge);
  const topY = Math.max(lifeline.y + 44, messageY);
  const nextHeight = Math.max(20, Math.round(height));
  const requiredBottom = topY + nextHeight;
  const withHeight = {
    ...document,
    edges: document.edges.map((candidate) => (
      candidate.id === edgeId
        ? {
          ...candidate,
          ...(end === 'source'
            ? { sourceActivationHeight: nextHeight }
            : { targetActivationHeight: nextHeight })
        }
        : candidate
    ))
  };

  return {
    ...withHeight,
    nodes: withHeight.nodes.map((node) => (
      node.id === lifelineId
        ? { ...node, height: Math.max(node.height, Math.round(requiredBottom - node.y + 8)) }
        : node
    ))
  };
}

function edgePath(route: EdgeRoute, source: Point, target: Point, sourceAnchor?: EdgeAnchor, targetAnchor?: EdgeAnchor, elbow?: { dx: number; dy: number }): string {
  if (route === 'orthogonal') {
    return pointsToPath(routeOrthogonalAvoidingObstacles({
      source,
      target,
      sourceAnchor,
      targetAnchor,
      elbow,
      obstacles: []
    }));
  }

  if (route === 'curve') {
    const controlX = (source.x + target.x) / 2;
    const controlY = Math.min(source.y, target.y) - 80;
    return `M ${source.x} ${source.y} Q ${controlX} ${controlY} ${target.x} ${target.y}`;
  }

  return `M ${source.x} ${source.y} L ${target.x} ${target.y}`;
}

function isRoutingIgnoredNode(node: UmlNode): boolean {
  // Surface decorations and background grouping frames should not force detours for edges.
  return node.kind === 'port'
    || node.kind === 'providedInterface'
    || node.kind === 'requiredInterface'
    || node.kind === 'subject'
    || node.kind === 'package';
}

function movableOrthogonalSegments(points: Point[]): Array<{ start: Point; end: Point; axis: 'x' | 'y' }> {
  if (points.length < 4) {
    return [];
  }

  // Skip the source stub (0→1) and target stub (n-2→n-1); drag only bend-to-bend spans.
  const segments: Array<{ start: Point; end: Point; axis: 'x' | 'y' }> = [];
  for (let index = 1; index < points.length - 2; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    if (Math.hypot(dx, dy) < 8) {
      continue;
    }
    if (Math.abs(dx) >= Math.abs(dy)) {
      segments.push({ start, end, axis: 'y' });
    } else {
      segments.push({ start, end, axis: 'x' });
    }
  }

  return segments;
}

function orthogonalLabelPoint(points: Point[]): Point {
  const midIndex = Math.max(0, Math.floor((points.length - 1) / 2));
  const start = points[midIndex];
  const end = points[Math.min(points.length - 1, midIndex + 1)];
  return {
    x: (start.x + end.x) / 2,
    y: (start.y + end.y) / 2 - 8
  };
}

function pointsToPath(points: Point[]): string {
  const uniquePoints = points.filter((point, index) => index === 0 || point.x !== points[index - 1].x || point.y !== points[index - 1].y);
  if (uniquePoints.length === 0) {
    return '';
  }
  const [start, ...segments] = uniquePoints;

  return `M ${start.x} ${start.y}${segments.map((point) => ` L ${point.x} ${point.y}`).join('')}`;
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

function initialConnectorPreviewPoint(node: UmlNode, diagramKind?: DiagramKind): Point {
  const center = centerOf(node);

  // Sequence lifelines extend downward; communication participants are compact rectangles.
  if (node.kind === 'lifeline' && diagramKind !== 'communication') {
    return { x: center.x + 88, y: Math.max(node.y + 72, center.y) };
  }

  return { x: center.x + Math.max(48, node.width / 2 + 24), y: center.y };
}

function connectionPoint(node: UmlNode, toward: Point, anchor?: EdgeAnchor, flexibleAnchor = false, anchorOffset?: number): Point {
  if (!anchor) {
    return boundaryPoint(node, toward);
  }

  return anchoredBoundaryPoint(node, anchor, flexibleAnchor ? toward : undefined, anchorOffset);
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

function anchoredBoundaryPoint(node: UmlNode, anchor: EdgeAnchor, toward?: Point, anchorOffset?: number): Point {
  const bounds = connectionBounds(node);
  const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };

  if (anchorOffset !== undefined) {
    const offset = clamp(anchorOffset, 0, 1);
    const point = anchor === 'left' || anchor === 'right'
      ? {
          x: anchor === 'left' ? bounds.x : bounds.x + bounds.width,
          y: bounds.y + bounds.height * offset
        }
      : {
          x: bounds.x + bounds.width * offset,
          y: anchor === 'top' ? bounds.y : bounds.y + bounds.height
        };

    if (!isEllipseConnectionNode(node) && !isDiamondConnectionNode(node)) {
      return point;
    }

    return boundaryPoint(node, point);
  }

  if (toward) {
    const point = anchor === 'left' || anchor === 'right'
      ? {
          x: anchor === 'left' ? bounds.x : bounds.x + bounds.width,
          y: clamp(toward.y, bounds.y, bounds.y + bounds.height)
        }
      : {
          x: clamp(toward.x, bounds.x, bounds.x + bounds.width),
          y: anchor === 'top' ? bounds.y : bounds.y + bounds.height
        };

    if (!isEllipseConnectionNode(node) && !isDiamondConnectionNode(node)) {
      return point;
    }

    return boundaryPoint(node, point);
  }

  switch (anchor) {
    case 'left':
      return boundaryPoint(node, { x: center.x - bounds.width, y: center.y });
    case 'right':
      return boundaryPoint(node, { x: center.x + bounds.width, y: center.y });
    case 'top':
      return boundaryPoint(node, { x: center.x, y: center.y - bounds.height });
    case 'bottom':
      return boundaryPoint(node, { x: center.x, y: center.y + bounds.height });
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
    // Stick-figure body occupies most of the actor box; scale with node size.
    return {
      x: node.x + node.width * 0.2,
      y: node.y + node.height * 0.04,
      width: Math.max(1, node.width * 0.6),
      height: Math.max(1, node.height * 0.75)
    };
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
  return node.kind === 'initialNode' || node.kind === 'finalNode' || node.kind === 'flowFinalNode' || node.kind === 'finalState' || node.kind === 'pseudostate';
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
      return true;
    default:
      return false;
  }
}

function isCommunicationLinkEdge(kind: RelationshipKind): boolean {
  return kind === 'link' || kind === 'connector';
}

function DiagramNode({ node, partnerNode, selected, selectedOwnedElementId, showMessageStartLine, surfaceAttachment, diagramKind, onMessageStartLine, onPointerDown, onPointerMove, onPointerUp, onResizeStart, onOwnedElementSelect, onContextMenu }: { node: UmlNode; partnerNode?: UmlNode; selected: boolean; selectedOwnedElementId: string | undefined; showMessageStartLine?: boolean; surfaceAttachment?: EdgeAnchor; diagramKind?: DiagramKind; onMessageStartLine?: (event: React.PointerEvent<SVGElement>) => void; onPointerDown: (event: React.PointerEvent<SVGGElement>) => void; onPointerMove: (event: React.PointerEvent<SVGElement>) => void; onPointerUp: (event: React.PointerEvent<SVGGElement>) => void; onResizeStart: (event: React.PointerEvent<SVGGElement>, mode?: 'default' | 'lifeline-span' | 'lifeline-width') => void; onOwnedElementSelect: (elementId: string) => void; onContextMenu: (event: React.MouseEvent<SVGGElement>) => void }) {
  const className = selected ? 'node selected' : 'node';
  const ownedElements = node.ownedElements ?? [];
  const attributeElements = ownedElements.filter((element) => element.kind !== 'operation');
  const methodElements = ownedElements.filter((element) => element.kind === 'operation');
  const hasAttributeElements = attributeElements.length > 0;
  const hasMethodElements = methodElements.length > 0;
  const methodCompartmentTop = hasAttributeElements ? classSectionBottom(attributeElements.length) : 42;
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
    return withResizeHandle(useCaseNode, node, nodeHeight, onResizeStart, diagramKind, onPointerMove, onPointerUp);
  }

  const activityNode = renderActivityDiagramNode({ node, className, title, pointerHandlers });

  if (activityNode) {
    return withResizeHandle(activityNode, node, nodeHeight, onResizeStart, diagramKind, onPointerMove, onPointerUp);
  }

  if (node.kind === 'initialNode' || node.kind === 'pseudostate') {
    const radius = Math.max(4, Math.min(node.width, node.height) / 2 - 8);

    return withResizeHandle((
      <g className={className} transform={`translate(${node.x} ${node.y})`} {...pointerHandlers}>
        <circle cx={node.width / 2} cy={node.height / 2} r={radius} className="filled" />
      </g>
    ), node, nodeHeight, onResizeStart, diagramKind, onPointerMove, onPointerUp);
  }

  if (node.kind === 'decisionNode') {
    return withResizeHandle((
      <g className={className} transform={`translate(${node.x} ${node.y})`} {...pointerHandlers}>
        <path d={`M ${node.width / 2} 2 L ${node.width - 2} ${node.height / 2} L ${node.width / 2} ${node.height - 2} L 2 ${node.height / 2} Z`} />
        <text x={node.width / 2} y={node.height / 2 + 5} textAnchor="middle">{title}</text>
      </g>
    ), node, nodeHeight, onResizeStart, diagramKind, onPointerMove, onPointerUp);
  }

  if (node.kind === 'lifeline') {
    if (diagramKind === 'communication') {
      return withResizeHandle((
        <g className={className} transform={`translate(${node.x} ${node.y})`} {...pointerHandlers}>
          <rect width={node.width} height={nodeHeight} rx="4" />
          <text x={node.width / 2} y={nodeHeight / 2 + 5} textAnchor="middle">{title}</text>
        </g>
      ), node, nodeHeight, onResizeStart, diagramKind, onPointerMove, onPointerUp);
    }
    const spanLength = Math.max(1, node.height - 44);
    return (
      <>
        <g className={className} transform={`translate(${node.x} ${node.y})`} {...pointerHandlers}>
          <rect width={node.width} height="44" rx="4" />
          <line x1={node.width / 2} y1="44" x2={node.width / 2} y2={node.height} strokeDasharray="6 6" pointerEvents="none" />
          {showMessageStartLine && onMessageStartLine ? <rect className="lifeline-message-start-zone" x={node.width / 2 - 10} y="44" width="20" height={spanLength} onPointerDown={onMessageStartLine} /> : null}
          <text x={node.width / 2} y="28" textAnchor="middle">{title}</text>
        </g>
        {selected ? (
          <>
            <g
              className="resize-handle lifeline-width-handle"
              transform={`translate(${node.x + node.width - 16} ${node.y + 28})`}
              onPointerDown={(event) => onResizeStart(event, 'lifeline-width')}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
            >
              <rect width="16" height="16" rx="2" />
              <path d="M5 12 L12 5 M9 12 L12 9" />
            </g>
            <g
              className="resize-handle lifeline-span-handle"
              transform={`translate(${node.x + node.width / 2 - 12} ${node.y + node.height - 8})`}
              onPointerDown={(event) => onResizeStart(event, 'lifeline-span')}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
            >
              <rect width="24" height="14" rx="3" />
              <path d="M6 5 H18 M6 9 H18" />
            </g>
          </>
        ) : null}
      </>
    );
  }

  if (node.kind === 'combinedFragment') {
    const operator = title.replace(/\d+$/, '') || 'loop';
    const showSeparator = combinedFragmentShowsSeparator(node.name);
    const separatorY = operandSeparatorYForNode(node);

    return withResizeHandle((
      <g className={className} transform={`translate(${node.x} ${node.y})`} {...pointerHandlers}>
        <rect className="combined-fragment-frame" width={node.width} height={node.height} rx="2" />
        <path className="combined-fragment-operator" d="M0 0 H72 L92 20 V34 H0 Z" />
        <text x="12" y="22" textAnchor="start">{operator}</text>
        {showSeparator ? <line className="operand-separator" x1="0" y1={separatorY} x2={node.width} y2={separatorY} strokeDasharray="8 5" /> : null}
      </g>
    ), node, nodeHeight, onResizeStart, diagramKind, onPointerMove, onPointerUp);
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
    ), node, nodeHeight, onResizeStart, diagramKind, onPointerMove, onPointerUp);
  }

  if (node.kind === 'port') {
    return withResizeHandle((
      <g className={className} transform={`translate(${node.x} ${node.y})`} {...pointerHandlers}>
        <rect className="node-hit-area" x="-8" y="-8" width={node.width + 16} height={node.height + 16} rx="6" />
        <rect className="port-node" width={node.width} height={node.height} rx="2" />
      </g>
    ), node, nodeHeight, onResizeStart, diagramKind, onPointerMove, onPointerUp);
  }

  if (node.kind === 'providedInterface') {
    return renderProvidedInterfaceNode({
      node,
      partnerNode,
      className,
      side: surfaceAttachment,
      pointerHandlers,
      onResizeStart: (event) => onResizeStart(event, 'default'),
      withResizeHandle: (content, resizeNode, height, resizeStart) =>
        withResizeHandle(content, resizeNode, height, (event) => resizeStart(event), diagramKind, onPointerMove, onPointerUp)
    });
  }

  if (node.kind === 'requiredInterface') {
    return renderRequiredInterfaceNode({
      node,
      partnerNode,
      className,
      side: surfaceAttachment,
      pointerHandlers,
      onResizeStart: (event) => onResizeStart(event, 'default'),
      withResizeHandle: (content, resizeNode, height, resizeStart) =>
        withResizeHandle(content, resizeNode, height, (event) => resizeStart(event), diagramKind, onPointerMove, onPointerUp)
    });
  }

  if (node.kind === 'package') {
    const tabWidth = Math.min(92, Math.max(54, node.width * 0.42));
    const tabHeight = 22;
    const packagePath = `M 0 ${tabHeight} V 6 H ${tabWidth} L ${tabWidth + 12} ${tabHeight} H ${node.width} V ${nodeHeight} H 0 Z`;

    return withResizeHandle((
      <g className={className} transform={`translate(${node.x} ${node.y})`} {...pointerHandlers}>
        {/* Wide invisible stroke so the package frame is easy to grab without covering nested nodes. */}
        <path className="group-frame-hit" d={packagePath} />
        <path className="package-shape" d={packagePath} />
        <rect className="group-title-hit" x="0" y="0" width={tabWidth + 12} height={tabHeight + 2} rx="2" />
        <text className="group-title" x="10" y="19" textAnchor="start">{title}</text>
        {ownedElements.map((element, index) => (
          <OwnedElementText key={element.id} element={element} y={52 + index * 18} nodeWidth={node.width} selected={selectedOwnedElementId === element.id} onSelect={() => onOwnedElementSelect(element.id)} />
        ))}
      </g>
    ), node, nodeHeight, onResizeStart, diagramKind, onPointerMove, onPointerUp);
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
    ), node, nodeHeight, onResizeStart, diagramKind, onPointerMove, onPointerUp);
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
    ), node, nodeHeight, onResizeStart, diagramKind, onPointerMove, onPointerUp);
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
    ), node, nodeHeight, onResizeStart, diagramKind, onPointerMove, onPointerUp);
  }

  if (node.kind === 'stateInvariant') {
    const constraintLabel = title ? `{${title}}` : '{}';
    return withResizeHandle((
      <g className={className} transform={`translate(${node.x} ${node.y})`} {...pointerHandlers}>
        <rect width={node.width} height={nodeHeight} rx="8" />
        <text className="compartment-label" x={node.width / 2} y="14" textAnchor="middle">«stateInvariant»</text>
        <text x={node.width / 2} y={nodeHeight / 2 + 10} textAnchor="middle">{constraintLabel}</text>
      </g>
    ), node, nodeHeight, onResizeStart, diagramKind, onPointerMove, onPointerUp);
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
    ), node, nodeHeight, onResizeStart, diagramKind, onPointerMove, onPointerUp);
  }

  return withResizeHandle((
    <g className={className} transform={`translate(${node.x} ${node.y})`} {...pointerHandlers}>
      <rect width={node.width} height={nodeHeight} rx="5" />
      <line x1="0" y1="30" x2={node.width} y2="30" />
      <text x={node.width / 2} y="21" textAnchor="middle">{title}</text>
      {classCompartmentNode ? (
        <>
          {hasAttributeElements ? (
            <>
              <line x1="0" y1="42" x2={node.width} y2="42" />
              {attributeElements.map((element, index) => (
                <OwnedElementText key={element.id} element={element} y={60 + index * 18} nodeWidth={node.width} selected={selectedOwnedElementId === element.id} onSelect={() => onOwnedElementSelect(element.id)} />
              ))}
            </>
          ) : null}
          {hasMethodElements ? (
            <>
              <line x1="0" y1={methodCompartmentTop} x2={node.width} y2={methodCompartmentTop} />
              {methodElements.map((element, index) => (
                <OwnedElementText key={element.id} element={element} y={methodCompartmentTop + 18 + index * 18} nodeWidth={node.width} selected={selectedOwnedElementId === element.id} onSelect={() => onOwnedElementSelect(element.id)} />
              ))}
            </>
          ) : null}
        </>
      ) : (
        ownedElements.map((element, index) => (
          <OwnedElementText key={element.id} element={element} y={54 + index * 18} nodeWidth={node.width} selected={selectedOwnedElementId === element.id} onSelect={() => onOwnedElementSelect(element.id)} />
        ))
      )}
    </g>
  ), node, nodeHeight, onResizeStart, diagramKind, onPointerMove, onPointerUp);
}

function withResizeHandle(
  nodeContent: React.ReactNode,
  node: UmlNode,
  nodeHeight: number,
  onResizeStart: (event: React.PointerEvent<SVGGElement>, mode?: 'default' | 'lifeline-span' | 'lifeline-width') => void,
  diagramKind?: DiagramKind,
  onPointerMove?: (event: React.PointerEvent<SVGElement>) => void,
  onPointerUp?: (event: React.PointerEvent<SVGGElement>) => void
): React.ReactNode {
  const handlePosition = resizeHandlePosition(node, nodeHeight, diagramKind);
  const side = isInterfaceNode(node) ? interfaceAttachmentSide(node) : undefined;
  const cursor = side === 'left' || side === 'right' ? 'ew-resize' : side === 'top' || side === 'bottom' ? 'ns-resize' : undefined;

  return (
    <>
      {nodeContent}
      <g
        className="resize-handle"
        style={cursor ? { cursor } : undefined}
        transform={`translate(${handlePosition.x} ${handlePosition.y})`}
        onPointerDown={(event) => onResizeStart(event, 'default')}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <rect width="16" height="16" rx="2" />
        <path d="M5 12 L12 5 M9 12 L12 9" />
      </g>
    </>
  );
}

function resizeHandlePosition(node: UmlNode, nodeHeight: number, diagramKind?: DiagramKind): Point {
  if (isInterfaceNode(node)) {
    return interfaceStemResizeHandlePosition(node);
  }

  if (node.kind === 'lifeline' && diagramKind !== 'communication') {
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

function classSectionBottom(itemCount: number, sectionTop = 42): number {
  return sectionTop + 12 + itemCount * 18;
}

function classCompartmentMinimumWidth(ownedElements: UmlOwnedElement[]): number {
  if (ownedElements.length === 0) {
    return 96;
  }

  const attributeElements = ownedElements.filter((element) => element.kind !== 'operation');
  const methodElements = ownedElements.filter((element) => element.kind === 'operation');
  const visibleTexts = [
    ...attributeElements.map((element) => formatOwnedElement(element.kind, element.name)),
    ...methodElements.map((element) => formatOwnedElement(element.kind, element.name))
  ];

  return Math.max(...visibleTexts.map(estimatedCompartmentTextWidth));
}

function estimatedCompartmentTextWidth(text: string): number {
  return Math.ceil(text.length * 7.2 + 28);
}

function classCompartmentHeight(attributeCount: number, methodCount: number): number {
  let height = 72;

  if (attributeCount > 0) {
    height = classSectionBottom(attributeCount);
  }

  if (methodCount > 0) {
    height = classSectionBottom(methodCount, attributeCount > 0 ? height : 42);
  }

  return height;
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

function centeredCanvasPan(document: UmlDiagramDocument, canvas: SVGSVGElement | null): Point {
  if (!canvas || document.nodes.length === 0) {
    return { x: 0, y: 0 };
  }

  const bounds = canvas.getBoundingClientRect();
  const minX = Math.min(...document.nodes.map((node) => node.x));
  const minY = Math.min(...document.nodes.map((node) => node.y));
  const maxX = Math.max(...document.nodes.map((node) => node.x + node.width));
  const maxY = Math.max(...document.nodes.map((node) => node.y + node.height));

  return {
    x: Math.round(bounds.width / 2 - (minX + maxX) / 2),
    y: Math.round(bounds.height / 2 - (minY + maxY) / 2)
  };
}

function ownedElementKindsForNode(node: UmlNode): UmlOwnedElementKind[] {
  switch (node.kind) {
    case 'class':
    case 'interface':
    case 'dataType':
    case 'stereotype':
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
      return [];
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