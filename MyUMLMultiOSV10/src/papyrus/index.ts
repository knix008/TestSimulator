export { getPapyrusCompanionPaths, type PapyrusProjectPaths } from './paths.js';
export { loadPapyrusProject, type PapyrusProject } from './project.js';
export {
  detectPapyrusNamespaces,
  parsePapyrusXml,
  serializeUnchanged,
  type PapyrusNamespaces,
  type PapyrusXmlDocument
} from './xmlDocument.js';
export { diagramDefinitions, getDiagramDefinition, type ConnectorTool, type DiagramDefinition, type DiagramKind, type PaletteTool, type RelationshipKind, type UmlElementKind } from '../uml/diagramRegistry.js';
export { addOwnedElement, addPaletteNode, connectNodes, createDiagramDocument, moveNode, renameEdge, renameNode, renameOwnedElement, updateEdgeMultiplicity, updateEdgeRelationship, updateEdgeRoute, updateOwnedElementKind, type EdgeRoute, type UmlDiagramDocument, type UmlEdge, type UmlNode, type UmlOwnedElement, type UmlOwnedElementKind } from '../uml/editorModel.js';
export { getUmlConnectorNotation, type UmlConnectorNotation } from '../uml/umlNotation.js';