import type { DiagramDefinition } from '../diagramRegistry.js';

export const useCaseDiagramDefinition: DiagramDefinition = {
  kind: 'useCase',
  label: 'Use Case Diagram',
  uml251Scope: 'Actors, use cases, subject boundaries, include, extend, associations, generalizations',
  papyrusDiagramId: 'PapyrusUMLUseCaseDiagram',
  notationHint: 'Use case diagrams combine UML Actor and UseCase elements with subject boundary notation and association/include/extend/generalization edges.',
  palette: [
    { kind: 'actor', label: 'Actor', umlType: 'uml:Actor', defaultName: 'Actor' },
    { kind: 'useCase', label: 'Use Case', umlType: 'uml:UseCase', defaultName: 'UseCase' },
    { kind: 'subject', label: 'Subject Boundary', umlType: 'uml:Class', defaultName: 'Subject' }
  ],
  connectors: [
    { kind: 'association', label: 'Association', umlType: 'uml:Association', defaultName: 'Association', directed: false },
    { kind: 'include', label: 'Include', umlType: 'uml:Include', defaultName: 'Include', directed: true },
    { kind: 'extend', label: 'Extend', umlType: 'uml:Extend', defaultName: 'Extend', directed: true },
    { kind: 'generalization', label: 'Generalization', umlType: 'uml:Generalization', defaultName: 'Generalization', directed: true }
  ]
};