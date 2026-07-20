import { describe, expect, it } from 'vitest';
import { connectorLabels, diagramLabels, messages, notationHints, toolLabels } from '../app/i18n.js';
import { diagramDefinitions } from './diagramRegistry.js';
import { getUmlConnectorNotation, isInteractionMessageKind } from './umlNotation.js';
import { addOwnedElement, addPaletteNode, connectNodes, createDiagramDocument, moveNode, renameNode, renameOwnedElement, updateEdgeAnchor, updateEdgeMultiplicity, updateEdgeRelationship, updateEdgeRoute } from './editorModel.js';

describe('UML 2.5.1 diagram registry', () => {
  it('registers the Papyrus diagram families used by the GUI', () => {
    expect(diagramDefinitions.map((diagram) => diagram.kind)).toEqual([
      'class',
      'profile',
      'package',
      'object',
      'compositeStructure',
      'component',
      'deployment',
      'useCase',
      'sequence',
      'communication',
      'activity',
      'stateMachine',
      'timing'
    ]);
  });

  it('keeps each diagram tied to a Papyrus reference id and palette/connector tools', () => {
    for (const definition of diagramDefinitions) {
      expect(definition.papyrusDiagramId).toMatch(/^PapyrusUML/);
      expect(definition.uml251Scope.length).toBeGreaterThan(10);
      expect(definition.palette.length).toBeGreaterThan(0);
      expect(definition.connectors.length).toBeGreaterThan(0);
    }
  });

  it('uses UML use case diagram tools and relationships', () => {
    const useCaseDefinition = diagramDefinitions.find((diagram) => diagram.kind === 'useCase');

    expect(useCaseDefinition?.palette.map((tool) => tool.kind)).toEqual(['actor', 'useCase', 'subject']);
    expect(useCaseDefinition?.connectors.map((connector) => connector.kind)).toEqual(['association', 'include', 'extend', 'generalization']);
  });

  it('uses UML activity diagram nodes and flows', () => {
    const activityDefinition = diagramDefinitions.find((diagram) => diagram.kind === 'activity');

    expect(activityDefinition?.palette.map((tool) => tool.kind)).toEqual([
      'initialNode',
      'action',
      'objectNode',
      'decisionNode',
      'mergeNode',
      'forkNode',
      'joinNode',
      'finalNode',
      'flowFinalNode'
    ]);
    expect(activityDefinition?.connectors.map((connector) => connector.kind)).toEqual(['controlFlow', 'objectFlow']);
  });

  it('uses UML component diagram component ports, interfaces, and connectors', () => {
    const componentDefinition = diagramDefinitions.find((diagram) => diagram.kind === 'component');

    expect(componentDefinition?.palette.map((tool) => tool.kind)).toEqual(['component', 'port', 'artifact']);
    expect(componentDefinition?.connectors.map((connector) => connector.kind)).toEqual(['assemblyConnector', 'delegationConnector', 'dependency', 'realization']);
  });

  it('uses UML communication diagram participants, links, and message sorts', () => {
    const communicationDefinition = diagramDefinitions.find((diagram) => diagram.kind === 'communication');

    expect(communicationDefinition?.palette.map((tool) => tool.kind)).toEqual(['lifeline', 'actor']);
    expect(communicationDefinition?.connectors.map((connector) => connector.kind)).toEqual([
      'connector',
      'message',
      'asyncMessage',
      'replyMessage'
    ]);
  });
});

describe('GUI localization', () => {
  it('supports English and Korean labels for every registered diagram', () => {
    for (const definition of diagramDefinitions) {
      expect(diagramLabels.en[definition.kind]).toBeTruthy();
      expect(diagramLabels.ko[definition.kind]).toBeTruthy();
      expect(notationHints.en[definition.kind]).toBeTruthy();
      expect(notationHints.ko[definition.kind]).toBeTruthy();
    }

    expect(messages.ko.properties).toBe('속성');
    expect(toolLabels.ko.class).toBe('클래스');
    expect(connectorLabels.ko.association).toBe('연관');
  });
});

describe('UML editor model', () => {
  it('creates nodes from a diagram palette and renames them', () => {
    const document = createDiagramDocument('class');
    const classTool = diagramDefinitions[0].palette[1];
    const withClass = addPaletteNode(document, classTool, 120, 160);
    const renamed = renameNode(withClass, withClass.nodes[0].id, 'Order');

    expect(renamed.nodes[0]).toMatchObject({
      kind: 'class',
      name: 'Order',
      umlType: 'uml:Class',
      x: 120,
      y: 160
    });
  });

  it('moves nodes and stores node-owned UML elements for the tree and properties view', () => {
    const document = createDiagramDocument('class');
    const classTool = diagramDefinitions[0].palette[1];
    const withClass = addPaletteNode(document, classTool, 120, 160);
    const moved = moveNode(withClass, withClass.nodes[0].id, 240, 96);
    const withAttribute = addOwnedElement(moved, moved.nodes[0].id, 'attribute');
    const renamedAttribute = renameOwnedElement(withAttribute, withAttribute.nodes[0].id, withAttribute.nodes[0].ownedElements[0].id, 'id');

    expect(renamedAttribute.nodes[0]).toMatchObject({ x: 240, y: 96 });
    expect(renamedAttribute.nodes[0].ownedElements[0]).toMatchObject({
      kind: 'attribute',
      name: 'id',
      umlType: 'uml:Property'
    });
  });

  it('grows node height when owned UML elements are added', () => {
    const document = createDiagramDocument('class');
    const classTool = diagramDefinitions[0].palette[1];
    const withClass = addPaletteNode(document, classTool, 120, 160);
    const initialHeight = withClass.nodes[0].height;
    const withAttribute = addOwnedElement(withClass, withClass.nodes[0].id, 'attribute');
    const withOperation = addOwnedElement(withAttribute, withAttribute.nodes[0].id, 'operation');

    expect(withAttribute.nodes[0].height).toBeGreaterThan(initialHeight);
    expect(withOperation.nodes[0].height).toBeGreaterThan(withAttribute.nodes[0].height);
  });

  it('connects shapes and edits relationship type and line style', () => {
    const document = createDiagramDocument('class');
    const definition = diagramDefinitions[0];
    const classTool = definition.palette[1];
    const withSource = addPaletteNode(document, classTool, 120, 160);
    const withTarget = addPaletteNode(withSource, classTool, 420, 220);
    const connected = connectNodes(withTarget, definition.connectors[0], withTarget.nodes[0].id, withTarget.nodes[1].id);
    const withMultiplicity = updateEdgeMultiplicity(connected, connected.edges[0].id, 'target', '0..*');
    const withSourceAnchor = updateEdgeAnchor(withMultiplicity, withMultiplicity.edges[0].id, 'source', 'bottom');
    const withAnchors = updateEdgeAnchor(withSourceAnchor, withSourceAnchor.edges[0].id, 'target', 'top');
    const rerouted = updateEdgeRoute(withAnchors, withAnchors.edges[0].id, 'orthogonal');
    const generalized = updateEdgeRelationship(rerouted, rerouted.edges[0].id, definition.connectors[1]);

    expect(generalized.edges[0]).toMatchObject({
      kind: 'generalization',
      name: 'Generalization1',
      umlType: 'uml:Generalization',
      sourceId: withTarget.nodes[0].id,
      targetId: withTarget.nodes[1].id,
      route: 'orthogonal',
      sourceAnchor: 'bottom',
      targetAnchor: 'top',
      sourceMultiplicity: '1',
      targetMultiplicity: '0..*'
    });
  });
});

describe('UML connector notation', () => {
  it('uses UML line conventions for core relationships', () => {
    expect(getUmlConnectorNotation('association')).toEqual({ dashed: false, marker: 'none' });
    expect(getUmlConnectorNotation('generalization')).toEqual({ dashed: false, marker: 'hollowTriangle' });
    expect(getUmlConnectorNotation('dependency')).toEqual({ dashed: true, marker: 'openArrow' });
    expect(getUmlConnectorNotation('realization')).toEqual({ dashed: true, marker: 'hollowTriangle' });
    expect(getUmlConnectorNotation('include')).toEqual({ dashed: true, marker: 'openArrow', stereotype: 'include' });
    expect(getUmlConnectorNotation('extend')).toEqual({ dashed: true, marker: 'openArrow', stereotype: 'extend' });
    expect(getUmlConnectorNotation('controlFlow')).toEqual({ dashed: false, marker: 'openArrow' });
    expect(getUmlConnectorNotation('objectFlow')).toEqual({ dashed: false, marker: 'openArrow', objectToken: true });
    expect(getUmlConnectorNotation('assemblyConnector')).toEqual({ dashed: false, marker: 'none' });
    expect(getUmlConnectorNotation('delegationConnector')).toEqual({ dashed: true, marker: 'none' });
    expect(getUmlConnectorNotation('message')).toEqual({ dashed: false, marker: 'filledArrow' });
    expect(getUmlConnectorNotation('asyncMessage')).toEqual({ dashed: false, marker: 'openArrow' });
    expect(getUmlConnectorNotation('replyMessage')).toEqual({ dashed: true, marker: 'openArrow' });
    expect(isInteractionMessageKind('message')).toBe(true);
    expect(isInteractionMessageKind('asyncMessage')).toBe(true);
    expect(isInteractionMessageKind('replyMessage')).toBe(true);
    expect(isInteractionMessageKind('connector')).toBe(false);
  });
});

describe('UML communication diagram model', () => {
  it('assigns sequence numbers and auto-creates links for messages', () => {
    const document = createDiagramDocument('communication');
    const definition = diagramDefinitions.find((diagram) => diagram.kind === 'communication')!;
    const participant = definition.palette[0];
    const withSource = addPaletteNode(document, participant, 80, 80);
    const withTarget = addPaletteNode(withSource, participant, 320, 80);
    const connected = connectNodes(withTarget, definition.connectors[1], withTarget.nodes[0].id, withTarget.nodes[1].id);

    expect(connected.edges.some((edge) => edge.kind === 'connector')).toBe(true);
    const message = connected.edges.find((edge) => edge.kind === 'message');
    expect(message?.sequenceNumber).toBe('1');
    expect(message?.directed).toBe(true);

    const withReply = connectNodes(connected, definition.connectors[3], withTarget.nodes[1].id, withTarget.nodes[0].id);
    const reply = withReply.edges.find((edge) => edge.kind === 'replyMessage');
    expect(reply?.sequenceNumber).toBe('2');
  });
});