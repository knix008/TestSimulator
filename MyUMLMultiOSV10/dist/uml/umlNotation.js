export function getUmlConnectorNotation(kind) {
    switch (kind) {
        case 'association':
        case 'connector':
        case 'link':
        case 'interfacePair':
        case 'assemblyConnector':
            return { dashed: false, marker: 'none' };
        case 'delegationConnector':
            return { dashed: true, marker: 'none' };
        case 'generalization':
            return { dashed: false, marker: 'hollowTriangle' };
        case 'realization':
            return { dashed: true, marker: 'hollowTriangle' };
        case 'extension':
            // UML Extension: solid line with filled arrowhead (stereotype → metaclass)
            return { dashed: false, marker: 'filledArrow' };
        case 'include':
            return { dashed: true, marker: 'openArrow', stereotype: 'include' };
        case 'extend':
            return { dashed: true, marker: 'openArrow', stereotype: 'extend' };
        case 'dependency':
            return { dashed: true, marker: 'openArrow' };
        case 'packageImport':
            return { dashed: true, marker: 'openArrow', stereotype: 'import' };
        case 'deployment':
            return { dashed: true, marker: 'openArrow', stereotype: 'deploy' };
        case 'durationConstraint':
            return { dashed: true, marker: 'none', stereotype: 'duration' };
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
export function isInteractionMessageKind(kind) {
    return kind === 'message' || kind === 'asyncMessage' || kind === 'replyMessage';
}
/** Undirected participant links on communication / object diagrams. */
export function isInstanceLinkKind(kind) {
    return kind === 'link';
}
