using MyUML20WinV10.Models;

namespace MyUML20WinV10.Templates;

internal static class UmlTemplateBuilder
{
    public static UmlDiagramNode AddNode(
        UmlDiagram diagram,
        Guid modelElementId,
        UmlNodePresentation presentation,
        float x,
        float y,
        float width,
        float height)
    {
        var node = new UmlDiagramNode
        {
            ModelElementId = modelElementId,
            Presentation = presentation,
            X = x,
            Y = y,
            Width = width,
            Height = height,
        };
        diagram.Nodes.Add(node);
        return node;
    }

    public static void AddEdge(UmlDiagram diagram, Guid modelElementId, UmlDiagramNode source, UmlDiagramNode target) =>
        diagram.Edges.Add(new UmlDiagramEdge
        {
            ModelElementId = modelElementId,
            SourceNodeId = source.Id,
            TargetNodeId = target.Id,
        });

    public static void AddSequenceEdge(
        UmlDiagram diagram,
        Guid modelElementId,
        UmlDiagramNode source,
        UmlDiagramNode target,
        float sequenceY) =>
        diagram.Edges.Add(new UmlDiagramEdge
        {
            ModelElementId = modelElementId,
            SourceNodeId = source.Id,
            TargetNodeId = target.Id,
            SequenceY = sequenceY,
        });
}
