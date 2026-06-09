namespace MyUML20WinV10.Models;

public static class UmlDiagramCatalog
{
    public static string GetDiagramKindShortName(UmlDiagramKind kind) => kind switch
    {
        UmlDiagramKind.ClassDiagram => "CD",
        UmlDiagramKind.UseCaseDiagram => "UC",
        UmlDiagramKind.SequenceDiagram => "SD",
        UmlDiagramKind.StateMachineDiagram => "SM",
        UmlDiagramKind.ActivityDiagram => "AD",
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
        UmlBehaviorNodeKind.Lifeline => $"Lifeline {behavior.Name}",
        UmlBehaviorNodeKind.Activation => "Activation",
        UmlBehaviorNodeKind.CombinedFragment =>
            string.IsNullOrWhiteSpace(behavior.Guard)
                ? behavior.CombinedFragmentKind?.ToString().ToLowerInvariant() ?? "fragment"
                : $"{behavior.CombinedFragmentKind?.ToString().ToLowerInvariant()} [{behavior.Guard}]",
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
