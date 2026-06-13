using MyUML20WinV10.Models;
using MyUML20WinV10.Rendering;

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

    public static UmlDiagramNode AttachInterface(
        UmlDiagram diagram,
        Guid modelElementId,
        UmlNodePresentation presentation,
        UmlDiagramNode component,
        UmlComponentAttachmentEdge edge,
        float t)
    {
        var node = AddNode(
            diagram,
            modelElementId,
            presentation,
            0,
            0,
            UmlComponentNotation.MinInterfaceWidth,
            UmlComponentNotation.MinInterfaceHeight);
        AttachLineToComponent(diagram, node, component, edge, t);
        return node;
    }

    public static UmlDiagramNode AttachPort(
        UmlDiagram diagram,
        Guid modelElementId,
        UmlDiagramNode component,
        UmlComponentAttachmentEdge edge,
        float t)
    {
        var size = UmlComponentNotation.DefaultPortNodeSize;
        var node = AddNode(diagram, modelElementId, UmlNodePresentation.Port, 0, 0, size, size);
        AttachPortToComponent(diagram, node, component, edge, t);
        return node;
    }

    public static void AttachLineToComponent(
        UmlDiagram diagram,
        UmlDiagramNode attachable,
        UmlDiagramNode component,
        UmlComponentAttachmentEdge edge,
        float t)
    {
        attachable.AttachedComponentNodeId = component.Id;
        attachable.AttachmentEdge = edge;
        attachable.AttachmentT = t;

        var port = UmlComponentAttachment.GetEdgePoint(component.Bounds, edge, t);
        var outward = UmlComponentInterfaceGeometry.GetDefaultOutwardCenter(port, edge);
        attachable.InterfaceOutwardX = outward.X;
        attachable.InterfaceOutwardY = outward.Y;
        UmlComponentInterfaceGeometry.ApplyAttachedPort(diagram, attachable);
    }

    public static void AttachPortToComponent(
        UmlDiagram diagram,
        UmlDiagramNode attachable,
        UmlDiagramNode component,
        UmlComponentAttachmentEdge edge,
        float t)
    {
        attachable.AttachedComponentNodeId = component.Id;
        attachable.AttachmentEdge = edge;
        attachable.AttachmentT = t;
        UmlComponentAttachment.ApplyPosition(diagram, attachable);
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
