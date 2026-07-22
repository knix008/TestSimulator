import { describe, expect, it } from 'vitest';
import {
  assemblyConnectorPolyline,
  createInterfacePairBetweenComponents,
  dragPairedInterfaceJoint,
  facingSidesBetweenComponents,
  isAssemblyPair,
  isPairedInterface,
  pairedAssemblyLayout,
  pairedStemPathData,
  pickInterfacePairEndpointAtPoint,
  refineInterfacePairTargetId,
  swapPairedInterfaceRoles,
  updateInterfacePairRoute
} from './componentInterface.js';
import type { UmlDiagramDocument, UmlNode } from './editorModel.js';

function component(id: string, x: number, y: number): UmlNode {
  return {
    id,
    kind: 'component',
    name: id,
    umlType: 'uml:Component',
    ownedElements: [],
    x,
    y,
    width: 160,
    height: 100
  };
}

function port(id: string, parentComponentId: string, x: number, y: number): UmlNode {
  return {
    id,
    kind: 'port',
    name: id,
    umlType: 'uml:Port',
    ownedElements: [],
    parentComponentId,
    x,
    y,
    width: 26,
    height: 26
  };
}

describe('component interface pair and assembly', () => {
  it('picks opposing faces between two side-by-side components', () => {
    const left = component('a', 40, 40);
    const right = component('b', 320, 60);
    const facing = facingSidesBetweenComponents(left, right);

    expect(facing.sourceSide).toBe('right');
    expect(facing.targetSide).toBe('left');
    expect(facing.sourceStem).toBeGreaterThanOrEqual(36);
    expect(facing.targetStem).toBeGreaterThanOrEqual(36);
  });

  it('creates a paired provided/required that share one joint', () => {
    const document: UmlDiagramDocument = {
      id: 'd1',
      kind: 'component',
      name: 'Component',
      nodes: [component('a', 40, 40), component('b', 320, 120)],
      edges: []
    };

    const next = createInterfacePairBetweenComponents(document, 'a', 'b');
    const provided = next.nodes.find((node) => node.kind === 'providedInterface');
    const required = next.nodes.find((node) => node.kind === 'requiredInterface');

    expect(provided).toBeDefined();
    expect(required).toBeDefined();
    expect(isPairedInterface(provided!)).toBe(true);
    expect(isPairedInterface(required!)).toBe(true);
    expect(provided!.interfacePartnerId).toBe(required!.id);
    expect(required!.interfacePartnerId).toBe(provided!.id);
    expect(provided!.jointX).toBe(required!.jointX);
    expect(provided!.jointY).toBe(required!.jointY);
    expect(next.edges).toHaveLength(0);
  });

  it('places ball then socket along provided→required (line → O → ) → line)', () => {
    const joint = { x: 200, y: 100 };
    const providedAttach = { x: 100, y: 100 };
    const requiredAttach = { x: 300, y: 100 };
    const layout = pairedAssemblyLayout(joint, providedAttach, requiredAttach);
    expect(layout.ball.x).toBeLessThan(layout.socket.x);
    expect(layout.ball.x).toBeLessThan(joint.x);
    expect(layout.socket.x).toBeGreaterThan(joint.x);

    const reversed = pairedAssemblyLayout(joint, requiredAttach, providedAttach);
    expect(reversed.ball.x).toBeGreaterThan(reversed.socket.x);
  });

  it('assigns ball to source and socket to target from connect direction', () => {
    const document: UmlDiagramDocument = {
      id: 'd1',
      kind: 'component',
      name: 'Component',
      nodes: [component('a', 40, 40), component('b', 320, 40)],
      edges: []
    };
    const ab = createInterfacePairBetweenComponents(document, 'a', 'b');
    const providedAb = ab.nodes.find((node) => node.kind === 'providedInterface')!;
    const requiredAb = ab.nodes.find((node) => node.kind === 'requiredInterface')!;
    expect(providedAb.parentComponentId).toBe('a');
    expect(requiredAb.parentComponentId).toBe('b');

    const ba = createInterfacePairBetweenComponents(document, 'b', 'a');
    const providedBa = ba.nodes.find((node) => node.kind === 'providedInterface')!;
    const requiredBa = ba.nodes.find((node) => node.kind === 'requiredInterface')!;
    expect(providedBa.parentComponentId).toBe('b');
    expect(requiredBa.parentComponentId).toBe('a');
  });

  it('creates a pair from component to port', () => {
    const document: UmlDiagramDocument = {
      id: 'd1',
      kind: 'component',
      name: 'Component',
      nodes: [
        component('a', 40, 40),
        component('b', 320, 40),
        port('port-b', 'b', 307, 77)
      ],
      edges: []
    };
    const next = createInterfacePairBetweenComponents(document, 'a', 'port-b');
    const provided = next.nodes.find((node) => node.kind === 'providedInterface')!;
    const required = next.nodes.find((node) => node.kind === 'requiredInterface')!;
    expect(provided.parentComponentId).toBe('a');
    expect(provided.parentPortId).toBeUndefined();
    expect(required.parentComponentId).toBe('b');
    expect(required.parentPortId).toBe('port-b');
  });

  it('creates a pair between two ports', () => {
    const document: UmlDiagramDocument = {
      id: 'd1',
      kind: 'component',
      name: 'Component',
      nodes: [
        component('a', 40, 40),
        component('b', 320, 40),
        port('port-a', 'a', 187, 77),
        port('port-b', 'b', 307, 77)
      ],
      edges: []
    };
    const next = createInterfacePairBetweenComponents(document, 'port-a', 'port-b');
    const provided = next.nodes.find((node) => node.kind === 'providedInterface')!;
    const required = next.nodes.find((node) => node.kind === 'requiredInterface')!;
    expect(provided.parentPortId).toBe('port-a');
    expect(required.parentPortId).toBe('port-b');
    expect(provided.parentComponentId).toBe('a');
    expect(required.parentComponentId).toBe('b');
  });

  it('prefers a port over its parent component at the drop point', () => {
    const document: UmlDiagramDocument = {
      id: 'd1',
      kind: 'component',
      name: 'Component',
      nodes: [
        component('a', 40, 40),
        component('b', 320, 40),
        port('port-a', 'a', 187, 77),
        port('port-b', 'b', 307, 77)
      ],
      edges: []
    };
    const hit = pickInterfacePairEndpointAtPoint(document, { x: 320, y: 90 }, 'port-a');
    expect(hit).toBe('port-b');
    expect(refineInterfacePairTargetId(document, 'b', { x: 320, y: 90 })).toBe('port-b');
  });

  it('swaps ball and socket roles on a paired connection', () => {
    let document: UmlDiagramDocument = {
      id: 'd1',
      kind: 'component',
      name: 'Component',
      nodes: [component('a', 40, 40), component('b', 320, 40)],
      edges: []
    };
    document = createInterfacePairBetweenComponents(document, 'a', 'b');
    const provided = document.nodes.find((node) => node.kind === 'providedInterface')!;
    document = swapPairedInterfaceRoles(document, provided.id);
    const onA = document.nodes.find((node) => node.parentComponentId === 'a')!;
    const onB = document.nodes.find((node) => node.parentComponentId === 'b')!;
    expect(onA.kind).toBe('requiredInterface');
    expect(onB.kind).toBe('providedInterface');
  });

  it('updates pair route style on both interfaces', () => {
    let document: UmlDiagramDocument = {
      id: 'd1',
      kind: 'component',
      name: 'Component',
      nodes: [component('a', 40, 40), component('b', 320, 120)],
      edges: []
    };
    document = createInterfacePairBetweenComponents(document, 'a', 'b');
    const provided = document.nodes.find((node) => node.kind === 'providedInterface')!;
    document = updateInterfacePairRoute(document, provided.id, 'orthogonal');
    const nextProvided = document.nodes.find((node) => node.id === provided.id)!;
    const nextRequired = document.nodes.find((node) => node.id === provided.interfacePartnerId)!;
    expect(nextProvided.pairRoute).toBe('orthogonal');
    expect(nextRequired.pairRoute).toBe('orthogonal');
    expect(pairedStemPathData(
      { x: nextProvided.stemAttachX!, y: nextProvided.stemAttachY! },
      { x: nextProvided.jointX!, y: nextProvided.jointY! },
      'orthogonal'
    )).toContain(' L ');
  });

  it('keeps ball and socket stuck together while dragging the joint', () => {
    let document: UmlDiagramDocument = {
      id: 'd1',
      kind: 'component',
      name: 'Component',
      nodes: [component('a', 40, 40), component('b', 320, 120)],
      edges: []
    };
    document = createInterfacePairBetweenComponents(document, 'a', 'b');
    const provided = document.nodes.find((node) => node.kind === 'providedInterface')!;

    document = dragPairedInterfaceJoint(document, provided.id, { x: 240, y: 200 });
    const nextProvided = document.nodes.find((node) => node.id === provided.id)!;
    const nextRequired = document.nodes.find((node) => node.id === provided.interfacePartnerId)!;

    expect(nextProvided.jointX).toBe(nextRequired.jointX);
    expect(nextProvided.jointY).toBe(nextRequired.jointY);
    expect(nextProvided.jointX).toBe(240);
    expect(nextProvided.jointY).toBe(200);
  });

  it('builds an assembly polyline that bends at the ball and socket', () => {
    const provided: UmlNode = {
      id: 'pi',
      kind: 'providedInterface',
      name: 'P',
      umlType: 'uml:Interface',
      ownedElements: [],
      parentComponentId: 'a',
      attachmentSide: 'right',
      x: 200,
      y: 70,
      width: 56,
      height: 24
    };
    const required: UmlNode = {
      id: 'ri',
      kind: 'requiredInterface',
      name: 'R',
      umlType: 'uml:Interface',
      ownedElements: [],
      parentComponentId: 'b',
      attachmentSide: 'left',
      x: 280,
      y: 140,
      width: 56,
      height: 24
    };

    const points = assemblyConnectorPolyline(provided, required);
    expect(points).toBeDefined();
    expect(points!.length).toBeGreaterThanOrEqual(2);
    expect(points![0]).toEqual({ x: provided.x + provided.width - 6 - 4, y: provided.y + provided.height / 2 });
    expect(points![points!.length - 1]).toEqual({ x: required.x + 6 + 4, y: required.y + required.height / 2 });
  });

  it('accepts opposite interfaces even when parent ids are inferred from nearby components', () => {
    const a = component('a', 40, 40);
    const b = component('b', 320, 40);
    const provided: UmlNode = {
      id: 'pi',
      kind: 'providedInterface',
      name: 'P',
      umlType: 'uml:Interface',
      ownedElements: [],
      x: 200,
      y: 78,
      width: 56,
      height: 24
    };
    const required: UmlNode = {
      id: 'ri',
      kind: 'requiredInterface',
      name: 'R',
      umlType: 'uml:Interface',
      ownedElements: [],
      x: 264,
      y: 78,
      width: 56,
      height: 24
    };

    expect(isAssemblyPair(provided, required, [a, b, provided, required])).toBe(true);
    expect(isAssemblyPair(provided, provided, [a, b, provided])).toBe(false);
  });
});
