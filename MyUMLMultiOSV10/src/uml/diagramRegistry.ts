import { useCaseDiagramDefinition } from './diagrams/useCaseDiagram.js';
import { activityDiagramDefinition } from './diagrams/activityDiagram.js';

export type DiagramKind =
  | 'class'
  | 'profile'
  | 'package'
  | 'object'
  | 'compositeStructure'
  | 'component'
  | 'deployment'
  | 'useCase'
  | 'sequence'
  | 'communication'
  | 'activity'
  | 'stateMachine'
  | 'timing';

export type UmlElementKind =
  | 'package'
  | 'class'
  | 'interface'
  | 'dataType'
  | 'enumeration'
  | 'profile'
  | 'stereotype'
  | 'instanceSpecification'
  | 'component'
  | 'artifact'
  | 'node'
  | 'device'
  | 'executionEnvironment'
  | 'actor'
  | 'useCase'
  | 'subject'
  | 'lifeline'
  | 'message'
  | 'combinedFragment'
  | 'action'
  | 'decisionNode'
  | 'mergeNode'
  | 'forkNode'
  | 'joinNode'
  | 'objectNode'
  | 'initialNode'
  | 'finalNode'
  | 'flowFinalNode'
  | 'state'
  | 'pseudostate'
  | 'timeObservation';

export type RelationshipKind =
  | 'association'
  | 'generalization'
  | 'dependency'
  | 'packageImport'
  | 'realization'
  | 'include'
  | 'extend'
  | 'connector'
  | 'deployment'
  | 'message'
  | 'controlFlow'
  | 'objectFlow'
  | 'transition';

export interface PaletteTool {
  kind: UmlElementKind;
  label: string;
  umlType: string;
  defaultName: string;
}

export interface ConnectorTool {
  kind: RelationshipKind;
  label: string;
  umlType: string;
  defaultName: string;
  directed: boolean;
}

export interface DiagramDefinition {
  kind: DiagramKind;
  label: string;
  uml251Scope: string;
  papyrusDiagramId: string;
  notationHint: string;
  palette: PaletteTool[];
  connectors: ConnectorTool[];
}

export const diagramDefinitions: DiagramDefinition[] = [
  {
    kind: 'class',
    label: 'Class Diagram',
    uml251Scope: 'Classes, packages, classifiers, attributes, operations, associations, generalizations',
    papyrusDiagramId: 'PapyrusUMLClassDiagram',
    notationHint: 'Papyrus stores classes as UML packagedElement entries and views as notation nodes/edges.',
    palette: [
      tool('package', 'Package', 'uml:Package', 'Package'),
      tool('class', 'Class', 'uml:Class', 'Class'),
      tool('interface', 'Interface', 'uml:Interface', 'Interface'),
      tool('dataType', 'Data Type', 'uml:DataType', 'DataType'),
      tool('enumeration', 'Enumeration', 'uml:Enumeration', 'Enumeration')
    ],
    connectors: [connector('association', 'Association', 'uml:Association', 'Association', false), connector('generalization', 'Generalization', 'uml:Generalization', 'Generalization', true), connector('dependency', 'Dependency', 'uml:Dependency', 'Dependency', true), connector('realization', 'Realization', 'uml:InterfaceRealization', 'Realization', true)]
  },
  {
    kind: 'profile',
    label: 'Profile Diagram',
    uml251Scope: 'Profiles, stereotypes, metaclass extensions, tagged values',
    papyrusDiagramId: 'PapyrusUMLProfileDiagram',
    notationHint: 'Profile diagrams persist profile and stereotype elements in UML XMI with extension relations.',
    palette: [tool('profile', 'Profile', 'uml:Profile', 'Profile'), tool('stereotype', 'Stereotype', 'uml:Stereotype', 'Stereotype'), tool('class', 'Metaclass', 'uml:Class', 'Metaclass')],
    connectors: [connector('dependency', 'Extension', 'uml:Extension', 'Extension', true), connector('generalization', 'Generalization', 'uml:Generalization', 'Generalization', true)]
  },
  {
    kind: 'package',
    label: 'Package Diagram',
    uml251Scope: 'Packages, package imports, dependencies, model organization',
    papyrusDiagramId: 'PapyrusUMLPackageDiagram',
    notationHint: 'Package diagrams share UML package elements with class diagrams but use package-focused notation views.',
    palette: [tool('package', 'Package', 'uml:Package', 'Package'), tool('class', 'Class', 'uml:Class', 'Class'), tool('interface', 'Interface', 'uml:Interface', 'Interface')],
    connectors: [connector('dependency', 'Dependency', 'uml:Dependency', 'Dependency', true), connector('packageImport', 'Package Import', 'uml:PackageImport', 'PackageImport', true)]
  },
  {
    kind: 'object',
    label: 'Object Diagram',
    uml251Scope: 'Instance specifications, slots, links',
    papyrusDiagramId: 'PapyrusUMLObjectDiagram',
    notationHint: 'Object diagrams use UML InstanceSpecification elements and notation links.',
    palette: [tool('instanceSpecification', 'Object', 'uml:InstanceSpecification', 'object'), tool('class', 'Classifier', 'uml:Class', 'Classifier')],
    connectors: [connector('association', 'Link', 'uml:Association', 'Link', false), connector('dependency', 'Dependency', 'uml:Dependency', 'Dependency', true)]
  },
  {
    kind: 'compositeStructure',
    label: 'Composite Structure',
    uml251Scope: 'Structured classifiers, parts, ports, connectors',
    papyrusDiagramId: 'PapyrusUMLCompositeStructureDiagram',
    notationHint: 'Composite structure diagrams combine classifier-owned properties with connector notation.',
    palette: [tool('class', 'Structured Classifier', 'uml:Class', 'StructuredClassifier'), tool('interface', 'Port Type', 'uml:Interface', 'PortType')],
    connectors: [connector('connector', 'Connector', 'uml:Connector', 'Connector', false), connector('dependency', 'Dependency', 'uml:Dependency', 'Dependency', true)]
  },
  {
    kind: 'component',
    label: 'Component Diagram',
    uml251Scope: 'Components, provided/required interfaces, dependencies, artifacts',
    papyrusDiagramId: 'PapyrusUMLComponentDiagram',
    notationHint: 'Papyrus persists components as UML Component elements and interface usages as relationships.',
    palette: [tool('component', 'Component', 'uml:Component', 'Component'), tool('interface', 'Interface', 'uml:Interface', 'Interface'), tool('artifact', 'Artifact', 'uml:Artifact', 'Artifact')],
    connectors: [connector('dependency', 'Dependency', 'uml:Dependency', 'Dependency', true), connector('realization', 'Realization', 'uml:InterfaceRealization', 'Realization', true)]
  },
  {
    kind: 'deployment',
    label: 'Deployment Diagram',
    uml251Scope: 'Nodes, devices, execution environments, artifacts, deployments',
    papyrusDiagramId: 'PapyrusUMLDeploymentDiagram',
    notationHint: 'Deployment diagrams map UML Node and Artifact elements to nested notation views.',
    palette: [tool('node', 'Node', 'uml:Node', 'Node'), tool('device', 'Device', 'uml:Device', 'Device'), tool('executionEnvironment', 'Execution Environment', 'uml:ExecutionEnvironment', 'ExecutionEnvironment'), tool('artifact', 'Artifact', 'uml:Artifact', 'Artifact')],
    connectors: [connector('deployment', 'Deployment', 'uml:Deployment', 'Deployment', true), connector('dependency', 'Dependency', 'uml:Dependency', 'Dependency', true)]
  },
  useCaseDiagramDefinition,
  {
    kind: 'sequence',
    label: 'Sequence Diagram',
    uml251Scope: 'Interactions, lifelines, messages, executions, combined fragments',
    papyrusDiagramId: 'PapyrusUMLSequenceDiagram',
    notationHint: 'Sequence diagrams persist UML Interaction content and lifeline/message notation separately.',
    palette: [
      tool('lifeline', 'Lifeline', 'uml:Lifeline', 'Lifeline'),
      tool('combinedFragment', 'Loop', 'uml:CombinedFragment', 'loop'),
      tool('combinedFragment', 'Alt', 'uml:CombinedFragment', 'alt'),
      tool('combinedFragment', 'Opt', 'uml:CombinedFragment', 'opt'),
      tool('combinedFragment', 'Par', 'uml:CombinedFragment', 'par')
    ],
    connectors: [connector('message', 'Message', 'uml:Message', 'Message', true)]
  },
  {
    kind: 'communication',
    label: 'Communication Diagram',
    uml251Scope: 'Interactions, lifelines, connectors, numbered messages',
    papyrusDiagramId: 'PapyrusUMLCommunicationDiagram',
    notationHint: 'Communication diagrams share Interaction elements with sequence diagrams but use graph-style notation.',
    palette: [tool('lifeline', 'Participant', 'uml:Lifeline', 'Participant')],
    connectors: [connector('message', 'Message', 'uml:Message', 'Message', true), connector('connector', 'Connector', 'uml:Connector', 'Connector', false)]
  },
  activityDiagramDefinition,
  {
    kind: 'stateMachine',
    label: 'State Machine',
    uml251Scope: 'State machines, regions, states, pseudostates, transitions',
    papyrusDiagramId: 'PapyrusUMLStateMachineDiagram',
    notationHint: 'State machine diagrams persist UML StateMachine/Region contents and transition notation.',
    palette: [tool('pseudostate', 'Initial', 'uml:Pseudostate', 'Initial'), tool('state', 'State', 'uml:State', 'State'), tool('finalNode', 'Final', 'uml:FinalState', 'Final')],
    connectors: [connector('transition', 'Transition', 'uml:Transition', 'Transition', true)]
  },
  {
    kind: 'timing',
    label: 'Timing Diagram',
    uml251Scope: 'Lifelines, states over time, time observations, duration constraints',
    papyrusDiagramId: 'PapyrusUMLTimingDiagram',
    notationHint: 'Timing diagrams are Interaction-based diagrams with timeline notation and time observations.',
    palette: [tool('lifeline', 'Lifeline', 'uml:Lifeline', 'Lifeline'), tool('state', 'State Invariant', 'uml:StateInvariant', 'StateInvariant'), tool('timeObservation', 'Time Observation', 'uml:TimeObservation', 'TimeObservation')],
    connectors: [connector('message', 'Time Message', 'uml:Message', 'TimeMessage', true), connector('dependency', 'Duration Constraint', 'uml:DurationConstraint', 'DurationConstraint', true)]
  }
];

export function getDiagramDefinition(kind: DiagramKind): DiagramDefinition {
  const definition = diagramDefinitions.find((diagram) => diagram.kind === kind);

  if (!definition) {
    throw new Error(`Unsupported UML diagram kind: ${kind}`);
  }

  return definition;
}

function tool(kind: UmlElementKind, label: string, umlType: string, defaultName: string): PaletteTool {
  return { kind, label, umlType, defaultName };
}

function connector(kind: RelationshipKind, label: string, umlType: string, defaultName: string, directed: boolean): ConnectorTool {
  return { kind, label, umlType, defaultName, directed };
}