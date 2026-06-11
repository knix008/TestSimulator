namespace MyUML20WinV10.Models;

public static class UmlDiagramCatalog
{
    public static string GetDiagramKindDisplayName(UmlDiagramKind kind) => kind switch
    {
        UmlDiagramKind.ClassDiagram => "Class",
        UmlDiagramKind.UseCaseDiagram => "Use Case",
        UmlDiagramKind.SequenceDiagram => "Sequence",
        UmlDiagramKind.StateMachineDiagram => "State Machine",
        UmlDiagramKind.ActivityDiagram => "Activity",
        UmlDiagramKind.ComponentDiagram => "Component",
        UmlDiagramKind.PackageDiagram => "Package",
        UmlDiagramKind.ObjectDiagram => "Object",
        UmlDiagramKind.CommunicationDiagram => "Communication",
        UmlDiagramKind.DeploymentDiagram => "Deployment",
        UmlDiagramKind.ProfileDiagram => "Profile",
        UmlDiagramKind.TimingDiagram => "Timing",
        UmlDiagramKind.CompositeStructureDiagram => "Composite Structure",
        UmlDiagramKind.InteractionOverviewDiagram => "Interaction Overview",
        _ => kind.ToString(),
    };

    public static string GetDiagramKindShortName(UmlDiagramKind kind) => kind switch
    {
        UmlDiagramKind.ClassDiagram => "CD",
        UmlDiagramKind.UseCaseDiagram => "UC",
        UmlDiagramKind.SequenceDiagram => "SD",
        UmlDiagramKind.StateMachineDiagram => "SM",
        UmlDiagramKind.ActivityDiagram => "AD",
        UmlDiagramKind.ComponentDiagram => "CMP",
        UmlDiagramKind.PackageDiagram => "PKG",
        UmlDiagramKind.ObjectDiagram => "OBJ",
        UmlDiagramKind.CommunicationDiagram => "COMM",
        UmlDiagramKind.DeploymentDiagram => "DEP",
        UmlDiagramKind.ProfileDiagram => "PRF",
        UmlDiagramKind.TimingDiagram => "TIM",
        UmlDiagramKind.CompositeStructureDiagram => "CST",
        UmlDiagramKind.InteractionOverviewDiagram => "IOV",
        _ => "DG",
    };

    public static string GetDiagramTreeLabel(UmlDiagram diagram) =>
        $"[{GetDiagramKindShortName(diagram.Kind)}] {diagram.Name}";

    public static IEnumerable<(UmlDiagramNode DiagramNode, UmlElement Element)> GetDiagramElements(
        UmlProject project,
        UmlDiagram diagram)
    {
        foreach (var diagramNode in diagram.Nodes)
        {
            var element = project.FindElement(diagramNode.ModelElementId);
            if (element is not null)
                yield return (diagramNode, element);
        }
    }

    public static IEnumerable<(UmlDiagramEdge DiagramEdge, UmlRelationship Relationship)> GetDiagramRelationships(
        UmlProject project,
        UmlDiagram diagram)
    {
        foreach (var diagramEdge in diagram.Edges)
        {
            if (project.FindRelationship(diagramEdge.ModelElementId) is { } relationship)
                yield return (diagramEdge, relationship);
        }
    }

    public static string GetElementTreeLabel(UmlElement element) => element switch
    {
        UmlClassifier classifier => classifier.DisplayLabel,
        UmlActor => $"Actor {(element as UmlNamedElement)?.Name ?? element.DisplayLabel}",
        UmlUseCase => $"Use Case {(element as UmlNamedElement)?.Name ?? element.DisplayLabel}",
        UmlSystemBoundary => $"System {(element as UmlNamedElement)?.Name ?? element.DisplayLabel}",
        UmlNote => $"Note {(element as UmlNamedElement)?.Name ?? element.DisplayLabel}",
        UmlBehaviorNode behavior => GetBehaviorNodeLabel(behavior),
        UmlComponent component => $"Component {component.Name}",
        UmlComponentInterface iface => iface.InterfaceKind switch
        {
            UmlComponentInterfaceKind.Provided => $"Provided {iface.Name}",
            _ => $"Required {iface.Name}",
        },
        UmlComponentPort port => $"Port {port.Name}",
        UmlObjectInstance objectInstance => $"Object {objectInstance.Name} : {objectInstance.TypeName}",
        UmlDeploymentHost host => $"Node {host.Name}",
        UmlArtifact artifact => $"Artifact {artifact.Name}",
        _ => element.DisplayLabel,
    };

    public static string GetRelationshipTreeLabel(UmlProject project, UmlDiagram diagram, UmlDiagramEdge edge, UmlRelationship relationship)
    {
        var source = ResolveEndpointName(project, diagram, edge.SourceNodeId);
        var target = ResolveEndpointName(project, diagram, edge.TargetNodeId);
        var kind = relationship.DisplayLabel;
        return string.IsNullOrEmpty(source) || string.IsNullOrEmpty(target)
            ? kind
            : $"{kind}: {source} → {target}";
    }

    private static string GetBehaviorNodeLabel(UmlBehaviorNode behavior) => behavior.Kind switch
    {
        UmlBehaviorNodeKind.State => $"State {behavior.Name}",
        UmlBehaviorNodeKind.InitialState => "Initial State",
        UmlBehaviorNodeKind.FinalState => "Final State",
        UmlBehaviorNodeKind.Action => $"Action {behavior.Name}",
        UmlBehaviorNodeKind.InitialNode => "Initial Node",
        UmlBehaviorNodeKind.ActivityFinalNode => "Activity Final",
        UmlBehaviorNodeKind.Decision => $"Decision {behavior.Name}",
        UmlBehaviorNodeKind.Merge => $"Merge {behavior.Name}",
        UmlBehaviorNodeKind.Fork => "Fork",
        UmlBehaviorNodeKind.Join => "Join",
        UmlBehaviorNodeKind.FlowFinalNode => "Flow Final",
        UmlBehaviorNodeKind.Choice => $"Choice {behavior.Name}",
        UmlBehaviorNodeKind.Junction => "Junction",
        UmlBehaviorNodeKind.ShallowHistory => "Shallow History",
        UmlBehaviorNodeKind.DeepHistory => "Deep History",
        UmlBehaviorNodeKind.Lifeline => behavior.ParentLifelineId.HasValue
            ? $"Part {behavior.DecompositionRole ?? $":{behavior.Name}"}"
            : $"Lifeline {behavior.Name}",
        UmlBehaviorNodeKind.Activation => "Activation",
        UmlBehaviorNodeKind.ObjectNode => $"Object {behavior.Name}",
        UmlBehaviorNodeKind.Swimlane => $"Swimlane {behavior.Name}",
        UmlBehaviorNodeKind.CombinedFragment =>
            behavior.CombinedFragmentKind switch
            {
                UmlCombinedFragmentKind.Ref =>
                    $"ref {behavior.ReferencedDiagramName ?? "Diagram"}",
                UmlCombinedFragmentKind.InteractionOccurrence =>
                    $"sd {behavior.ReferencedDiagramName ?? "Interaction"}",
                UmlCombinedFragmentKind.Break =>
                    string.IsNullOrWhiteSpace(behavior.Guard) ? "break" : $"break [{behavior.Guard}]",
                _ => string.IsNullOrWhiteSpace(behavior.Guard)
                    ? behavior.CombinedFragmentKind?.ToString().ToLowerInvariant() ?? "fragment"
                    : $"{behavior.CombinedFragmentKind?.ToString().ToLowerInvariant()} [{behavior.Guard}]",
            },
        UmlBehaviorNodeKind.SequenceEndpoint => $"Endpoint {behavior.Name}",
        UmlBehaviorNodeKind.Gate => $"Gate {behavior.Name}",
        UmlBehaviorNodeKind.ExpansionRegion =>
            $"{behavior.ExpansionKind?.ToString().ToLowerInvariant() ?? "iterative"} {behavior.Name}",
        UmlBehaviorNodeKind.InterruptibleRegion => $"Interruptible {behavior.Name}",
        UmlBehaviorNodeKind.NaryAssociationHub => "N-ary Hub",
        UmlBehaviorNodeKind.StateInvariant => $"Invariant {behavior.Name}",
        UmlBehaviorNodeKind.Continuation => $"Continuation {behavior.Name}",
        UmlBehaviorNodeKind.CompositeState => $"Composite {behavior.Name}",
        UmlBehaviorNodeKind.OrthogonalRegion => $"Orthogonal {behavior.Name}",
        UmlBehaviorNodeKind.EntryPoint => "Entry Point",
        UmlBehaviorNodeKind.ExitPoint => "Exit Point",
        UmlBehaviorNodeKind.TerminateState => "Terminate",
        UmlBehaviorNodeKind.SubmachineState => $"Submachine {behavior.Name}",
        UmlBehaviorNodeKind.ActivityContainer => $"Container {behavior.Name}",
        UmlBehaviorNodeKind.DataStore => $"DataStore {behavior.Name}",
        UmlBehaviorNodeKind.InputPin => "Input Pin",
        UmlBehaviorNodeKind.OutputPin => "Output Pin",
        UmlBehaviorNodeKind.ExceptionHandler => $"Handler {behavior.Name}",
        UmlBehaviorNodeKind.TimingLifeline => $"Timing {behavior.Name}",
        UmlBehaviorNodeKind.TimingState => $"State {behavior.Name}",
        UmlBehaviorNodeKind.InteractionUse =>
            $"ref {behavior.ReferencedDiagramName ?? behavior.Name}",
        _ => behavior.Name,
    };

    public static bool TryOrientNoteLink(
        UmlDiagramNode first,
        UmlDiagramNode second,
        out UmlDiagramNode noteNode,
        out UmlDiagramNode annotatedNode)
    {
        if (first.Presentation == UmlNodePresentation.Note && second.Presentation != UmlNodePresentation.Note)
        {
            noteNode = first;
            annotatedNode = second;
            return true;
        }

        if (second.Presentation == UmlNodePresentation.Note && first.Presentation != UmlNodePresentation.Note)
        {
            noteNode = second;
            annotatedNode = first;
            return true;
        }

        noteNode = first;
        annotatedNode = second;
        return false;
    }

    private static string ResolveEndpointName(UmlProject project, UmlDiagram diagram, Guid diagramNodeId)
    {
        var diagramNode = diagram.FindNode(diagramNodeId);
        if (diagramNode is null)
            return string.Empty;

        return project.FindElement(diagramNode.ModelElementId) is UmlNamedElement named
            ? named.Name
            : string.Empty;
    }
}
