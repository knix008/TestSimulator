/** UML 2.5 communication (interaction) diagram: participants, links, numbered messages. */
export const communicationDiagramDefinition = {
    kind: 'communication',
    label: 'Communication Diagram',
    uml251Scope: 'Interactions, lifelines as participant rectangles, actors, links, numbered messages (synch/asynch/reply)',
    papyrusDiagramId: 'PapyrusUMLCommunicationDiagram',
    notationHint: 'Communication diagrams show participants as rectangles (or actors) connected by undirected links; messages are directed arrows labeled with sequence numbers (1:, 1.1:, 2:).',
    palette: [
        { kind: 'lifeline', label: 'Participant', umlType: 'uml:Lifeline', defaultName: 'Participant' },
        { kind: 'actor', label: 'Actor', umlType: 'uml:Actor', defaultName: 'Actor' }
    ],
    connectors: [
        { kind: 'link', label: 'Link', umlType: 'uml:InstanceSpecification', defaultName: 'Link', directed: false },
        { kind: 'message', label: 'Sync Message', umlType: 'uml:Message', defaultName: 'message', directed: true },
        { kind: 'asyncMessage', label: 'Async Message', umlType: 'uml:Message', defaultName: 'asyncMessage', directed: true },
        { kind: 'replyMessage', label: 'Reply Message', umlType: 'uml:Message', defaultName: 'reply', directed: true }
    ]
};
