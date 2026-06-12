using MyUML20WinV10.Models;

namespace MyUML20WinV10.Rendering;

/// <summary>컴포넌트 다이어그램에서 Assembly/Dependency ↔ Required/Provided 연결 규칙.</summary>
public static class UmlComponentInterfaceLink
{
    public static bool IsLinkTool(UmlToolMode mode) =>
        mode is UmlToolMode.CreateAssembly or UmlToolMode.CreateDependency;

    public static bool AppliesTo(UmlDiagramKind diagramKind, UmlToolMode mode) =>
        diagramKind == UmlDiagramKind.ComponentDiagram && IsLinkTool(mode);

    public static bool CanSelectSource(UmlDiagramNode node) =>
        node.Presentation == UmlNodePresentation.RequiredInterface;

    public static bool CanSelectTarget(UmlDiagramNode source, UmlDiagramNode target) =>
        source.Presentation == UmlNodePresentation.RequiredInterface
        && target.Presentation == UmlNodePresentation.ProvidedInterface
        && source.Id != target.Id;

    public static bool IsInterfaceLink(UmlDiagramNode? source, UmlDiagramNode? target) =>
        source?.Presentation == UmlNodePresentation.RequiredInterface
        && target?.Presentation == UmlNodePresentation.ProvidedInterface;

    public static bool IsInterfaceDependency(
        UmlProject project,
        UmlDiagramEdge edge,
        UmlDiagramNode source,
        UmlDiagramNode target) =>
        project.FindRelationship(edge.ModelElementId) is UmlDependency
        && IsInterfaceLink(source, target);

    public static bool HasOutwardAssemblyLink(UmlProject project, UmlDiagram diagram, UmlDiagramNode node) =>
        node.Presentation switch
        {
            UmlNodePresentation.RequiredInterface =>
                diagram.Edges.Any(e =>
                    e.SourceNodeId == node.Id
                    && project.FindRelationship(e.ModelElementId) is UmlAssembly),
            UmlNodePresentation.ProvidedInterface =>
                diagram.Edges.Any(e =>
                    e.TargetNodeId == node.Id
                    && project.FindRelationship(e.ModelElementId) is UmlAssembly),
            _ => false,
        };

    public static void ApplyRelationshipMetadata(
        UmlProject project,
        UmlRelationship relationship,
        UmlDiagramNode sourceNode,
        UmlDiagramNode targetNode)
    {
        if (!IsInterfaceLink(sourceNode, targetNode))
            return;

        var providedName = (project.FindElement(targetNode.ModelElementId) as UmlComponentInterface)?.Name;
        var requiredName = (project.FindElement(sourceNode.ModelElementId) as UmlComponentInterface)?.Name;

        switch (relationship)
        {
            case UmlAssembly assembly:
                assembly.SourceIsRequirer = true;
                assembly.InterfaceName = providedName ?? requiredName;
                break;
            case UmlDependency dependency:
                if (string.IsNullOrWhiteSpace(dependency.Name))
                    dependency.Name = providedName;
                break;
        }
    }
}
