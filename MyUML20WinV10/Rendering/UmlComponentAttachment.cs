using MyUML20WinV10.Models;

namespace MyUML20WinV10.Rendering;

public static class UmlComponentAttachment
{
    public const float SnapDistance = 96f;

    public static bool IsAttachable(UmlNodePresentation presentation) =>
        presentation is UmlNodePresentation.Port
            or UmlNodePresentation.ProvidedInterface
            or UmlNodePresentation.RequiredInterface;

    public static bool IsComponent(UmlProject project, UmlDiagramNode node) =>
        project.FindElement(node.ModelElementId) is UmlComponent;

    public static PointF GetEdgePoint(RectangleF bounds, UmlComponentAttachmentEdge edge, float t)
    {
        t = Math.Clamp(t, 0.05f, 0.95f);
        return edge switch
        {
            UmlComponentAttachmentEdge.Left => new(bounds.Left, bounds.Top + bounds.Height * t),
            UmlComponentAttachmentEdge.Right => new(bounds.Right, bounds.Top + bounds.Height * t),
            UmlComponentAttachmentEdge.Top => new(bounds.Left + bounds.Width * t, bounds.Top),
            UmlComponentAttachmentEdge.Bottom => new(bounds.Left + bounds.Width * t, bounds.Bottom),
            _ => new(bounds.Left + bounds.Width / 2f, bounds.Top + bounds.Height / 2f),
        };
    }

    public static bool TryFindNearestComponent(
        UmlProject project,
        UmlDiagram diagram,
        PointF hint,
        out UmlDiagramNode? component,
        out UmlComponentAttachmentEdge edge,
        out float t)
    {
        component = null;
        edge = UmlComponentAttachmentEdge.None;
        t = 0.5f;

        UmlDiagramNode? best = null;
        var bestDist = float.MaxValue;
        UmlComponentAttachmentEdge bestEdge = UmlComponentAttachmentEdge.None;
        var bestT = 0.5f;

        foreach (var node in diagram.Nodes)
        {
            if (!IsComponent(project, node))
                continue;

            var bounds = node.Bounds;
            var expanded = new RectangleF(
                bounds.X - SnapDistance,
                bounds.Y - SnapDistance,
                bounds.Width + SnapDistance * 2f,
                bounds.Height + SnapDistance * 2f);
            if (!expanded.Contains(hint))
                continue;

            if (!TryResolveEdge(bounds, hint, out var candidateEdge, out var candidateT, out var dist))
                continue;

            if (dist >= bestDist)
                continue;

            bestDist = dist;
            best = node;
            bestEdge = candidateEdge;
            bestT = candidateT;
        }

        if (best is null)
            return false;

        component = best;
        edge = bestEdge;
        t = bestT;
        return true;
    }

    public static bool TryAttach(
        UmlProject project,
        UmlDiagram diagram,
        UmlDiagramNode attachable,
        PointF hint)
    {
        if (!TryFindNearestComponent(project, diagram, hint, out var component, out var edge, out var t))
            return false;

        attachable.AttachedComponentNodeId = component!.Id;
        attachable.AttachmentEdge = edge;
        attachable.AttachmentT = t;
        if (!UmlComponentInterfaceGeometry.IsLinePresentation(attachable.Presentation))
            ApplyPosition(diagram, attachable);
        return true;
    }

    public static bool IsAttached(UmlDiagramNode attachable) =>
        attachable.AttachedComponentNodeId is not null
        && attachable.AttachmentEdge != UmlComponentAttachmentEdge.None;

    /// <summary>부착된 Port/Provided/Required를 포인터에 가장 가까운 컴포넌트 모서리로 이동합니다.</summary>
    public static bool TrySlideAlongAttachedEdge(UmlDiagram diagram, UmlDiagramNode attachable, PointF pointer)
    {
        if (!IsAttached(attachable))
            return false;

        var component = diagram.FindNode(attachable.AttachedComponentNodeId!.Value);
        if (component is null)
            return false;

        if (!TryResolveEdge(component.Bounds, pointer, out var edge, out var t, out _))
            return false;

        attachable.AttachmentEdge = edge;
        attachable.AttachmentT = t;
        ApplyPosition(diagram, attachable);
        return true;
    }

    public static void SyncAttachedPosition(UmlDiagram diagram, UmlDiagramNode attachable)
    {
        if (IsAttached(attachable))
            ApplyPosition(diagram, attachable);
    }

    public static void ApplyPosition(UmlDiagram diagram, UmlDiagramNode attachable)
    {
        if (attachable.AttachedComponentNodeId is null
            || attachable.AttachmentEdge == UmlComponentAttachmentEdge.None)
            return;

        if (UmlComponentInterfaceGeometry.IsLinePresentation(attachable.Presentation))
        {
            UmlComponentInterfaceGeometry.ApplyAttachedPort(diagram, attachable);
            return;
        }

        var component = diagram.FindNode(attachable.AttachedComponentNodeId.Value);
        if (component is null)
            return;

        var rect = ComputeAttachedBounds(
            component.Bounds,
            attachable.Presentation,
            attachable.Width,
            attachable.Height,
            attachable.AttachmentEdge,
            attachable.AttachmentT);

        attachable.X = rect.X;
        attachable.Y = rect.Y;
    }

    public static void SyncAttachedNodes(UmlDiagram diagram, Guid componentNodeId)
    {
        foreach (var node in diagram.Nodes)
        {
            if (node.AttachedComponentNodeId == componentNodeId)
                ApplyPosition(diagram, node);
        }
    }

    public static void RefreshAttachmentFromBounds(UmlProject project, UmlDiagram diagram, UmlDiagramNode attachable)
    {
        if (!IsAttachable(attachable.Presentation))
            return;

        var center = new PointF(attachable.X + attachable.Width / 2f, attachable.Y + attachable.Height / 2f);
        if (!TryFindNearestComponent(project, diagram, center, out var component, out var edge, out var t))
            return;

        attachable.AttachedComponentNodeId = component!.Id;
        attachable.AttachmentEdge = edge;
        attachable.AttachmentT = t;
        ApplyPosition(diagram, attachable);
    }

    public static RectangleF ComputeAttachedBounds(
        RectangleF componentBounds,
        UmlNodePresentation presentation,
        float nodeWidth,
        float nodeHeight,
        UmlComponentAttachmentEdge edge,
        float t)
    {
        var anchor = GetEdgePoint(componentBounds, edge, t);

        if (presentation == UmlNodePresentation.Port)
        {
            var half = nodeWidth / 2f;
            return new RectangleF(anchor.X - half, anchor.Y - half, nodeWidth, nodeHeight);
        }

        var w = nodeWidth;
        var h = nodeHeight;
        var horizontal = edge is UmlComponentAttachmentEdge.Left or UmlComponentAttachmentEdge.Right;

        if (horizontal)
        {
            if (presentation == UmlNodePresentation.RequiredInterface)
                return new RectangleF(anchor.X - w, anchor.Y - h / 2f, w, h);

            var x = edge == UmlComponentAttachmentEdge.Right
                ? anchor.X
                : anchor.X - w;
            return new RectangleF(x, anchor.Y - h / 2f, w, h);
        }

        if (presentation == UmlNodePresentation.RequiredInterface)
        {
            var xReq = anchor.X - h / 2f;
            var yReq = edge == UmlComponentAttachmentEdge.Bottom
                ? anchor.Y
                : anchor.Y - w;
            return new RectangleF(xReq, yReq, h, w);
        }

        var xVert = anchor.X - h / 2f;
        var yVert = edge == UmlComponentAttachmentEdge.Bottom
            ? anchor.Y
            : anchor.Y - w;
        return new RectangleF(xVert, yVert, h, w);
    }

    public static PointF? GetAttachmentAnchor(UmlDiagram diagram, UmlDiagramNode attachable)
    {
        if (attachable.AttachedComponentNodeId is null
            || attachable.AttachmentEdge == UmlComponentAttachmentEdge.None)
            return null;

        var component = diagram.FindNode(attachable.AttachedComponentNodeId.Value);
        if (component is null)
            return null;

        return GetEdgePoint(component.Bounds, attachable.AttachmentEdge, attachable.AttachmentT);
    }

    private static bool TryResolveEdge(
        RectangleF bounds,
        PointF hint,
        out UmlComponentAttachmentEdge edge,
        out float t,
        out float distance)
    {
        var dLeft = MathF.Abs(hint.X - bounds.Left);
        var dRight = MathF.Abs(hint.X - bounds.Right);
        var dTop = MathF.Abs(hint.Y - bounds.Top);
        var dBottom = MathF.Abs(hint.Y - bounds.Bottom);
        var minD = MathF.Min(MathF.Min(dLeft, dRight), MathF.Min(dTop, dBottom));

        if (minD == dRight)
        {
            edge = UmlComponentAttachmentEdge.Right;
            t = bounds.Height > 0.01f ? (hint.Y - bounds.Top) / bounds.Height : 0.5f;
            distance = dRight;
        }
        else if (minD == dLeft)
        {
            edge = UmlComponentAttachmentEdge.Left;
            t = bounds.Height > 0.01f ? (hint.Y - bounds.Top) / bounds.Height : 0.5f;
            distance = dLeft;
        }
        else if (minD == dTop)
        {
            edge = UmlComponentAttachmentEdge.Top;
            t = bounds.Width > 0.01f ? (hint.X - bounds.Left) / bounds.Width : 0.5f;
            distance = dTop;
        }
        else
        {
            edge = UmlComponentAttachmentEdge.Bottom;
            t = bounds.Width > 0.01f ? (hint.X - bounds.Left) / bounds.Width : 0.5f;
            distance = dBottom;
        }

        t = Math.Clamp(t, 0.05f, 0.95f);
        return true;
    }
}
