import type { RelationshipKind } from './diagramRegistry.js';

export interface UmlConnectorNotation {
  dashed: boolean;
  marker: 'none' | 'openArrow' | 'filledArrow' | 'hollowTriangle';
  stereotype?: string;
  objectToken?: boolean;
}

export function getUmlConnectorNotation(kind: RelationshipKind): UmlConnectorNotation {
  switch (kind) {
    case 'association':
    case 'connector':
    case 'assemblyConnector':
      return { dashed: false, marker: 'none' };
    case 'delegationConnector':
      return { dashed: true, marker: 'none' };
    case 'generalization':
      return { dashed: false, marker: 'hollowTriangle' };
    case 'realization':
      return { dashed: true, marker: 'hollowTriangle' };
    case 'include':
      return { dashed: true, marker: 'openArrow', stereotype: 'include' };
    case 'extend':
      return { dashed: true, marker: 'openArrow', stereotype: 'extend' };
    case 'dependency':
    case 'packageImport':
    case 'deployment':
      return { dashed: true, marker: 'openArrow' };
    case 'message':
      // UML synchCall: solid line with filled arrowhead
      return { dashed: false, marker: 'filledArrow' };
    case 'asyncMessage':
      // UML asynchCall / asynchSignal: solid line with open arrowhead
      return { dashed: false, marker: 'openArrow' };
    case 'replyMessage':
      // UML reply: dashed line with open arrowhead
      return { dashed: true, marker: 'openArrow' };
    case 'controlFlow':
    case 'transition':
      return { dashed: false, marker: 'openArrow' };
    case 'objectFlow':
      return { dashed: false, marker: 'openArrow', objectToken: true };
  }
}

export function isInteractionMessageKind(kind: RelationshipKind): boolean {
  return kind === 'message' || kind === 'asyncMessage' || kind === 'replyMessage';
}
