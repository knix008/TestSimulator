export { getPapyrusCompanionPaths } from './paths.js';
export { loadPapyrusProject } from './project.js';
export { detectPapyrusNamespaces, parsePapyrusXml, serializeUnchanged } from './xmlDocument.js';
export { diagramDefinitions, getDiagramDefinition } from '../uml/diagramRegistry.js';
export { addOwnedElement, addPaletteNode, connectNodes, createDiagramDocument, moveNode, renameEdge, renameNode, renameOwnedElement, updateEdgeMultiplicity, updateEdgeRelationship, updateEdgeRoute, updateOwnedElementKind } from '../uml/editorModel.js';
export { getUmlConnectorNotation } from '../uml/umlNotation.js';
