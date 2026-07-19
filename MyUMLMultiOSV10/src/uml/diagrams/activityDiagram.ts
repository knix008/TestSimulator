import type { DiagramDefinition } from '../diagramRegistry.js';

export const activityDiagramDefinition: DiagramDefinition = {
  kind: 'activity',
  label: 'Activity Diagram',
  uml251Scope: 'Activities, actions, object nodes, control nodes, object flows, control flows',
  papyrusDiagramId: 'PapyrusUMLActivityDiagram',
  notationHint: 'Activity diagrams update UML ActivityNode elements and notation edges together.',
  palette: [
    { kind: 'initialNode', label: 'Initial Node', umlType: 'uml:InitialNode', defaultName: 'Initial' },
    { kind: 'action', label: 'Action', umlType: 'uml:OpaqueAction', defaultName: 'Action' },
    { kind: 'objectNode', label: 'Object Node', umlType: 'uml:CentralBufferNode', defaultName: 'Object' },
    { kind: 'decisionNode', label: 'Decision Node', umlType: 'uml:DecisionNode', defaultName: 'Decision' },
    { kind: 'mergeNode', label: 'Merge Node', umlType: 'uml:MergeNode', defaultName: 'Merge' },
    { kind: 'forkNode', label: 'Fork Node', umlType: 'uml:ForkNode', defaultName: 'Fork' },
    { kind: 'joinNode', label: 'Join Node', umlType: 'uml:JoinNode', defaultName: 'Join' },
    { kind: 'finalNode', label: 'Activity Final', umlType: 'uml:ActivityFinalNode', defaultName: 'Final' },
    { kind: 'flowFinalNode', label: 'Flow Final', umlType: 'uml:FlowFinalNode', defaultName: 'FlowFinal' }
  ],
  connectors: [
    { kind: 'controlFlow', label: 'Control Flow', umlType: 'uml:ControlFlow', defaultName: 'ControlFlow', directed: true },
    { kind: 'objectFlow', label: 'Object Flow', umlType: 'uml:ObjectFlow', defaultName: 'ObjectFlow', directed: true }
  ]
};