using MyUML20WinV10.Models;

namespace MyUML20WinV10.Rendering;

/// <summary>Provided/Required 인터페이스 — 포트(컴포넌트 쪽)와 바깥 끝(소켓·원) 두 점으로 선 형태를 정의합니다.</summary>
public static class UmlComponentInterfaceGeometry
{
    public const float MinStemLength = 10f;
    public const float MaxStemLength = 240f;
    public const int PortEndpointHandle = 0;
    public const int OutwardEndpointHandle = 1;
    private const float EndpointScreenHitRadius = 36f;

    public readonly record struct Layout(
        PointF PortCenter,
        PointF OutwardCenter,
        UmlComponentNotation.InterfaceOutwardSide OutwardSide,
        RectangleF LabelBounds);

    public static bool IsLinePresentation(UmlNodePresentation presentation) =>
        presentation is UmlNodePresentation.ProvidedInterface or UmlNodePresentation.RequiredInterface;

    public static Layout Resolve(UmlProject project, UmlDiagram? diagram, UmlDiagramNode node)
    {
        var bounds = node.Bounds;
        var presentation = node.Presentation;
        var portCenter = ResolvePortCenter(diagram, node, bounds);
        var outwardCenter = ResolveOutwardCenter(node, bounds, portCenter, presentation);
        var dx = outwardCenter.X - portCenter.X;
        var dy = outwardCenter.Y - portCenter.Y;
        var outwardSide = UmlComponentNotation.DirectionToOutwardSide(dx, dy);
        var label = ComputeLabelBounds(bounds, presentation, portCenter, outwardCenter, outwardSide);
        return new Layout(portCenter, outwardCenter, outwardSide, label);
    }

    public static PointF GetOutwardStemEndpoint(Layout layout, UmlNodePresentation presentation)
    {
        if (presentation == UmlNodePresentation.RequiredInterface)
            return UmlComponentNotation.GetSocketStemEndpoint(layout.OutwardCenter, layout.OutwardSide);

        return UmlComponentNotation.GetCircleEdgeToward(layout.OutwardCenter, layout.PortCenter);
    }

    public static PointF GetDefaultOutwardCenter(PointF port, UmlComponentAttachmentEdge edge)
    {
        var stem = Math.Max(MinStemLength, UmlComponentNotation.InterfaceStemLength);
        return edge switch
        {
            UmlComponentAttachmentEdge.Left => new(port.X - stem, port.Y),
            UmlComponentAttachmentEdge.Right => new(port.X + stem, port.Y),
            UmlComponentAttachmentEdge.Top => new(port.X, port.Y - stem),
            UmlComponentAttachmentEdge.Bottom => new(port.X, port.Y + stem),
            _ => new(port.X + stem, port.Y),
        };
    }

    public static bool TryBuildLayoutFromHints(
        UmlProject project,
        UmlDiagram diagram,
        UmlNodePresentation presentation,
        PointF portHint,
        PointF dragEnd,
        float minDrag,
        out Layout layout)
    {
        layout = default;
        if (!IsLinePresentation(presentation))
            return false;

        if (!UmlComponentAttachment.TryFindNearestComponent(project, diagram, portHint, out var component, out var edge, out var t))
            return false;

        var port = UmlComponentAttachment.GetEdgePoint(component!.Bounds, edge, t);
        var outward = Distance(portHint, dragEnd) >= minDrag
            ? ClampOutward(port, dragEnd)
            : GetDefaultOutwardCenter(port, edge);
        var outwardSide = UmlComponentNotation.DirectionToOutwardSide(outward.X - port.X, outward.Y - port.Y);
        var label = ComputeLabelBounds(RectangleF.Empty, presentation, port, outward, outwardSide);
        layout = new Layout(port, outward, outwardSide, label);
        return true;
    }

    public static bool TryInitializeAttached(
        UmlProject project,
        UmlDiagram diagram,
        UmlDiagramNode node,
        PointF portHint,
        PointF dragEnd,
        float minDrag)
    {
        if (!IsLinePresentation(node.Presentation))
            return false;

        if (!UmlComponentAttachment.TryAttach(project, diagram, node, portHint))
            return false;

        var component = diagram.FindNode(node.AttachedComponentNodeId!.Value);
        if (component is null)
            return false;

        var port = UmlComponentAttachment.GetEdgePoint(
            component.Bounds, node.AttachmentEdge, node.AttachmentT);
        var outward = Distance(portHint, dragEnd) >= minDrag
            ? ClampOutward(port, dragEnd)
            : GetDefaultOutwardCenter(port, node.AttachmentEdge);
        node.InterfaceOutwardX = outward.X;
        node.InterfaceOutwardY = outward.Y;
        ApplyAttachedPort(diagram, node);
        return true;
    }

    public static void EnsureOutwardStored(UmlDiagram? diagram, UmlDiagramNode node)
    {
        if (node.InterfaceOutwardX is not null && node.InterfaceOutwardY is not null)
            return;

        var layout = Resolve(null!, diagram, node);
        node.InterfaceOutwardX = layout.OutwardCenter.X;
        node.InterfaceOutwardY = layout.OutwardCenter.Y;
    }

    public static void SetOutwardEndpoint(UmlDiagram? diagram, UmlDiagramNode node, PointF outward)
    {
        var layout = Resolve(null!, diagram, node);
        var port = layout.PortCenter;
        outward = ClampOutward(port, outward);
        var outwardSide = UmlComponentNotation.DirectionToOutwardSide(outward.X - port.X, outward.Y - port.Y);
        var label = ComputeLabelBounds(node.Bounds, node.Presentation, port, outward, outwardSide);
        node.InterfaceOutwardX = outward.X;
        node.InterfaceOutwardY = outward.Y;
        SyncNodeBoundsFromLayout(node, new Layout(port, outward, outwardSide, label));
    }

    public static void SyncNodeBoundsFromLayout(UmlDiagramNode node, Layout layout)
    {
        var halfPort = UmlComponentNotation.InterfacePortSize / 2f;
        var r = UmlComponentNotation.InterfaceCircleRadius;
        var stemEnd = GetOutwardStemEndpoint(layout, node.Presentation);

        var minX = Math.Min(layout.PortCenter.X, Math.Min(layout.OutwardCenter.X, stemEnd.X)) - halfPort - r;
        var maxX = Math.Max(layout.PortCenter.X, Math.Max(layout.OutwardCenter.X, stemEnd.X)) + halfPort + r;
        var minY = Math.Min(layout.PortCenter.Y, Math.Min(layout.OutwardCenter.Y, stemEnd.Y)) - halfPort - r;
        var maxY = Math.Max(layout.PortCenter.Y, Math.Max(layout.OutwardCenter.Y, stemEnd.Y)) + halfPort + r;

        if (!layout.LabelBounds.IsEmpty)
        {
            minX = Math.Min(minX, layout.LabelBounds.Left);
            maxX = Math.Max(maxX, layout.LabelBounds.Right);
            minY = Math.Min(minY, layout.LabelBounds.Top);
            maxY = Math.Max(maxY, layout.LabelBounds.Bottom);
        }

        const float pad = 4f;
        node.X = minX - pad;
        node.Y = minY - pad;
        node.Width = Math.Max(UmlComponentNotation.MinInterfaceWidth, maxX - minX + pad * 2f);
        node.Height = Math.Max(UmlComponentNotation.MinInterfaceHeight, maxY - minY + pad * 2f);
    }

    public static void ApplyAttachedPort(UmlDiagram diagram, UmlDiagramNode node)
    {
        if (!IsLinePresentation(node.Presentation) || !UmlComponentAttachment.IsAttached(node))
            return;

        var component = diagram.FindNode(node.AttachedComponentNodeId!.Value);
        if (component is null)
            return;

        var port = UmlComponentAttachment.GetEdgePoint(
            component.Bounds, node.AttachmentEdge, node.AttachmentT);
        var outward = node.InterfaceOutwardX is float ox && node.InterfaceOutwardY is float oy
            ? new PointF(ox, oy)
            : ResolveOutwardCenter(node, node.Bounds, port, node.Presentation);
        node.InterfaceOutwardX ??= outward.X;
        node.InterfaceOutwardY ??= outward.Y;
        outward = new PointF(node.InterfaceOutwardX.Value, node.InterfaceOutwardY.Value);
        var outwardSide = UmlComponentNotation.DirectionToOutwardSide(outward.X - port.X, outward.Y - port.Y);
        var label = ComputeLabelBounds(node.Bounds, node.Presentation, port, outward, outwardSide);
        SyncNodeBoundsFromLayout(node, new Layout(port, outward, outwardSide, label));
    }

    public static int HitTestEndpointHandle(
        UmlProject project,
        UmlDiagram? diagram,
        UmlDiagramNode node,
        PointF location,
        float zoom)
    {
        if (!IsLinePresentation(node.Presentation))
            return -1;

        var layout = Resolve(project, diagram, node);
        var hitRadius = EndpointScreenHitRadius / Math.Max(0.1f, zoom);
        var portScore = PortEndpointHitDistance(location, layout.PortCenter);
        var outwardScore = OutwardEndpointHitDistance(location, layout, node.Presentation);
        var hitPort = portScore <= hitRadius;
        var hitOutward = outwardScore <= hitRadius;
        if (hitPort && hitOutward)
            return portScore <= outwardScore ? PortEndpointHandle : OutwardEndpointHandle;
        if (hitPort)
            return PortEndpointHandle;
        if (hitOutward)
            return OutwardEndpointHandle;

        return -1;
    }

    private static float PortEndpointHitDistance(PointF location, PointF portCenter)
    {
        var half = UmlComponentNotation.InterfacePortSize / 2f;
        var portRect = new RectangleF(
            portCenter.X - half,
            portCenter.Y - half,
            UmlComponentNotation.InterfacePortSize,
            UmlComponentNotation.InterfacePortSize);
        if (portRect.Contains(location))
            return 0f;

        return Distance(location, portCenter);
    }

    private static float OutwardEndpointHitDistance(
        PointF location,
        Layout layout,
        UmlNodePresentation presentation)
    {
        var r = UmlComponentNotation.InterfaceCircleRadius;
        var dCenter = Distance(location, layout.OutwardCenter);
        if (dCenter <= r)
            return 0f;

        var stemEnd = GetOutwardStemEndpoint(layout, presentation);
        var dStem = Distance(location, stemEnd);
        var opening = UmlComponentNotation.GetSocketStemEndpoint(layout.OutwardCenter, layout.OutwardSide);
        var dOpening = Distance(location, opening);
        return Math.Min(dCenter - r, Math.Min(dStem, dOpening));
    }

    public static bool HitTestLine(UmlProject project, UmlDiagram? diagram, UmlDiagramNode node, PointF location, float zoom)
    {
        if (!IsLinePresentation(node.Presentation))
            return false;

        var layout = Resolve(project, diagram, node);
        var threshold = Math.Max(10f, UmlNodeSilhouette.MinHitSize) / zoom;
        var halfPort = UmlComponentNotation.InterfacePortSize / 2f;
        var portRect = new RectangleF(
            layout.PortCenter.X - halfPort,
            layout.PortCenter.Y - halfPort,
            UmlComponentNotation.InterfacePortSize,
            UmlComponentNotation.InterfacePortSize);
        if (portRect.Contains(location))
            return true;

        var r = UmlComponentNotation.InterfaceCircleRadius;
        if (Distance(location, layout.OutwardCenter) <= r + threshold)
            return true;

        var stemEnd = GetOutwardStemEndpoint(layout, node.Presentation);
        var stemStart = UmlComponentNotation.OffsetFromPort(
            layout.PortCenter, layout.OutwardCenter, layout.PortCenter, halfPort);
        if (DistanceToSegment(location, stemStart, stemEnd) <= threshold)
            return true;

        if (!layout.LabelBounds.IsEmpty && layout.LabelBounds.Contains(location))
            return true;

        return false;
    }

    public static IReadOnlyList<(int Index, PointF Point)> GetEndpointHandles(
        UmlProject project,
        UmlDiagram? diagram,
        UmlDiagramNode node)
    {
        var layout = Resolve(project, diagram, node);
        return
        [
            (PortEndpointHandle, layout.PortCenter),
            (OutwardEndpointHandle, layout.OutwardCenter),
        ];
    }

    private static PointF ResolvePortCenter(UmlDiagram? diagram, UmlDiagramNode node, RectangleF bounds)
    {
        var anchor = diagram is not null ? UmlComponentAttachment.GetAttachmentAnchor(diagram, node) : null;
        if (anchor is PointF portAnchor)
            return portAnchor;

        var defaultSide = node.Presentation == UmlNodePresentation.RequiredInterface
            ? UmlComponentNotation.InterfaceOutwardSide.Left
            : UmlComponentNotation.InterfaceOutwardSide.Right;
        var outward = defaultSide;
        var portSide = UmlComponentNotation.GetOppositeSide(outward);
        return UmlComponentNotation.GetInterfacePortCenter(bounds, portSide, null);
    }

    private static PointF ResolveOutwardCenter(
        UmlDiagramNode node,
        RectangleF bounds,
        PointF portCenter,
        UmlNodePresentation presentation)
    {
        if (node.InterfaceOutwardX is float ox && node.InterfaceOutwardY is float oy)
            return new PointF(ox, oy);

        if (node.AttachmentEdge != UmlComponentAttachmentEdge.None)
            return GetDefaultOutwardCenter(portCenter, node.AttachmentEdge);

        var defaultOutward = presentation == UmlNodePresentation.RequiredInterface
            ? UmlComponentNotation.InterfaceOutwardSide.Left
            : UmlComponentNotation.InterfaceOutwardSide.Right;
        var dx = portCenter.X - bounds.Left;
        var dy = portCenter.Y - bounds.Top;
        var outwardSide = defaultOutward;
        if (dx < bounds.Width * 0.25f)
            outwardSide = UmlComponentNotation.InterfaceOutwardSide.Left;
        else if (dx > bounds.Width * 0.75f)
            outwardSide = UmlComponentNotation.InterfaceOutwardSide.Right;
        else if (dy < bounds.Height * 0.5f)
            outwardSide = UmlComponentNotation.InterfaceOutwardSide.Top;
        else
            outwardSide = UmlComponentNotation.InterfaceOutwardSide.Bottom;

        return UmlComponentNotation.GetOutwardEndpointCenter(bounds, outwardSide);
    }

    private static RectangleF ComputeLabelBounds(
        RectangleF bounds,
        UmlNodePresentation presentation,
        PointF portCenter,
        PointF outwardCenter,
        UmlComponentNotation.InterfaceOutwardSide outwardSide)
    {
        var stemMid = new PointF(
            (portCenter.X + outwardCenter.X) / 2f,
            (portCenter.Y + outwardCenter.Y) / 2f);
        var dx = outwardCenter.X - portCenter.X;
        var dy = outwardCenter.Y - portCenter.Y;
        var len = MathF.Sqrt(dx * dx + dy * dy);
        float perpX = 0f;
        float perpY = -14f;
        if (len > 0.001f)
        {
            perpX = -dy / len * 14f;
            perpY = dx / len * 14f;
        }

        var labelCenter = new PointF(stemMid.X + perpX, stemMid.Y + perpY);
        var w = presentation == UmlNodePresentation.RequiredInterface ? 56f : 48f;
        var h = 16f;
        return new RectangleF(labelCenter.X - w / 2f, labelCenter.Y - h / 2f, w, h);
    }

    private static PointF ClampOutward(PointF port, PointF outward)
    {
        var dx = outward.X - port.X;
        var dy = outward.Y - port.Y;
        var len = MathF.Sqrt(dx * dx + dy * dy);
        if (len < 0.001f)
            return new PointF(port.X + MinStemLength, port.Y);

        var clamped = Math.Clamp(len, MinStemLength, MaxStemLength);
        return new PointF(port.X + dx / len * clamped, port.Y + dy / len * clamped);
    }

    private static float Distance(PointF a, PointF b)
    {
        var dx = a.X - b.X;
        var dy = a.Y - b.Y;
        return MathF.Sqrt(dx * dx + dy * dy);
    }

    private static float DistanceToSegment(PointF p, PointF a, PointF b)
    {
        var dx = b.X - a.X;
        var dy = b.Y - a.Y;
        if (MathF.Abs(dx) < 0.001f && MathF.Abs(dy) < 0.001f)
            return Distance(p, a);

        var t = ((p.X - a.X) * dx + (p.Y - a.Y) * dy) / (dx * dx + dy * dy);
        t = Math.Clamp(t, 0f, 1f);
        var proj = new PointF(a.X + t * dx, a.Y + t * dy);
        return Distance(p, proj);
    }
}
