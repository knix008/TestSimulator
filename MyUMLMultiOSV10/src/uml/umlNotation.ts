import type { RelationshipKind } from './diagramRegistry.js';

export interface UmlConnectorNotation {
  dashed: boolean;
  marker: 'none' | 'openArrow' | 'hollowTriangle';
  stereotype?: string;
}

export function getUmlConnectorNotation(kind: RelationshipKind): UmlConnectorNotation {
  switch (kind) {
    case 'association':
    case 'connector':
      return { dashed: false, marker: 'none' };
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
    case 'controlFlow':
    case 'objectFlow':
    case 'transition':
      return { dashed: false, marker: 'openArrow' };
  }
}