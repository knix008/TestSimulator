using System.Drawing.Drawing2D;
using MyUML20WinV10.Models;

namespace MyUML20WinV10.Rendering;

public static class UmlNodeSilhouette
{
    public const float ResizeHandleRadius = 4.5f;
    public const float ResizeHandleHitRadius = 8f;

    private const float RoundedNodeRadius = 12f;
    private const float InterfaceCornerRadius = 8f;

    public static IReadOnlyList<(int Index, PointF Point)> GetResizeHandles(UmlProject project, UmlDiagramNode node)
    {
        var bounds = UmlNodeConnectionGeometry.GetLayoutBounds(project, node);
        var center = GetShapeCenter(bounds);
        using var path = BuildSilhouettePath(project, node, bounds);

        var handles = new List<(int Index, PointF Point)>(8);
        for (var i = 0; i < 8; i++)
        {
            if (!IsHandleEnabled(project, node, i))
                continue;

            var angle = HandleIndexToAngle(i);
            var point = GetBoundaryPoint(path, center, angle) ?? GetRectHandlePoint(bounds, i);
            handles.Add((i, point));
        }

        return handles;
    }

    public static int HitTestResizeHandle(UmlProject project, UmlDiagramNode node, PointF location)
    {
        var hitRadius = ResizeHandleHitRadius;
        foreach (var (index, point) in GetResizeHandles(project, node))
        {
            var dx = location.X - point.X;
            var dy = location.Y - point.Y;
            if (dx * dx + dy * dy <= hitRadius * hitRadius)
                return index;
        }

        return -1;
    }

    public static bool IsContainerPresentation(UmlNodePresentation presentation) =>
        presentation is UmlNodePresentation.Package or UmlNodePresentation.SystemBoundary;

    public static bool HitTestNode(UmlProject project, UmlDiagramNode node, PointF location, float zoom)
    {
        var bounds = UmlNodeConnectionGeometry.GetLayoutBounds(project, node);
        var borderThreshold = Math.Max(6f, MinHitSize) / zoom;

        if (node.Presentation == UmlNodePresentation.Behavior
            && project.FindElement(node.ModelElementId) is UmlBehaviorNode { Kind: UmlBehaviorNodeKind.Lifeline })
            return HitTestLifeline(bounds, location);

        if (UmlCombinedFragmentRenderer.IsCombinedFragment(project, node))
            return HitTestCombinedFragment(bounds, location, borderThreshold);

        if (node.Presentation == UmlNodePresentation.Behavior
            && project.FindElement(node.ModelElementId) is UmlBehaviorNode { Kind: UmlBehaviorNodeKind.ExpansionRegion or UmlBehaviorNodeKind.InterruptibleRegion })
            return HitTestCombinedFragment(bounds, location, borderThreshold);

        return node.Presentation switch
        {
            UmlNodePresentation.Package => HitTestPackage(bounds, location, borderThreshold),
            UmlNodePresentation.SystemBoundary => HitTestBorder(bounds, location, borderThreshold),
            _ => HitTestFilledShape(project, node, bounds, location, zoom),
        };
    }

    private static bool HitTestCombinedFragment(RectangleF bounds, PointF location, float borderThreshold)
    {
        var tabHeight = UmlCombinedFragmentRenderer.TabHeight;
        var tab = new RectangleF(bounds.X, bounds.Y, bounds.Width, tabHeight);
        if (tab.Contains(location))
            return true;

        var body = new RectangleF(bounds.X, bounds.Y + tabHeight, bounds.Width, Math.Max(1f, bounds.Height - tabHeight));
        return HitTestBorder(body, location, borderThreshold);
    }

    private static bool HitTestLifeline(RectangleF bounds, PointF location)
    {
        var headerHeight = UmlSequenceLayout.HeaderHeight - 4f;
        var header = new RectangleF(bounds.Left + 2f, bounds.Top + 2f, bounds.Width - 4f, headerHeight);
        if (header.Contains(location))
            return true;

        var body = new RectangleF(bounds.Left, header.Bottom, bounds.Width, Math.Max(1f, bounds.Bottom - header.Bottom));
        return body.Contains(location);
    }

    public const float MinHitSize = 8f;

    private static bool HitTestFilledShape(
        UmlProject project,
        UmlDiagramNode node,
        RectangleF bounds,
        PointF location,
        float zoom)
    {
        var minW = Math.Max(bounds.Width, MinHitSize / zoom);
        var minH = Math.Max(bounds.Height, MinHitSize / zoom);
        var hit = new RectangleF(bounds.X, bounds.Y, minW, minH);
        if (!hit.Contains(location))
            return false;

        using var path = BuildSilhouettePath(project, node, bounds);
        using var pen = new Pen(Color.Black, Math.Max(6f, MinHitSize) / zoom);

        if (path.IsVisible(location) || path.IsOutlineVisible(location, pen))
            return true;

        // Fallback: path.IsVisible can be unreliable without a Graphics context in GDI+.
        // If the point is inside the original shape bounds, accept it as a hit for filled shapes.
        return bounds.Contains(location);
    }

    private static bool HitTestPackage(RectangleF bounds, PointF location, float borderThreshold)
    {
        if (UmlPackageNotation.GetTabBounds(bounds).Contains(location))
            return true;

        return HitTestBorder(UmlPackageNotation.GetBodyBounds(bounds), location, borderThreshold);
    }

    private static bool HitTestBorder(RectangleF bounds, PointF location, float borderThreshold)
    {
        if (!bounds.Contains(location))
            return false;

        var distLeft = location.X - bounds.Left;
        var distRight = bounds.Right - location.X;
        var distTop = location.Y - bounds.Top;
        var distBottom = bounds.Bottom - location.Y;
        var minDist = Math.Min(Math.Min(distLeft, distRight), Math.Min(distTop, distBottom));
        return minDist <= borderThreshold;
    }

    public static void DrawResizeHandles(Graphics g, UmlProject project, UmlDiagramNode node)
    {
        using var fill = new SolidBrush(Color.White);
        using var pen = new Pen(Color.FromArgb(30, 136, 229), 1.5f);

        foreach (var (_, point) in GetResizeHandles(project, node))
        {
            var r = ResizeHandleRadius;
            g.FillEllipse(fill, point.X - r, point.Y - r, r * 2f, r * 2f);
            g.DrawEllipse(pen, point.X - r, point.Y - r, r * 2f, r * 2f);
        }
    }

    public static void DrawOutline(Graphics g, Pen pen, UmlProject project, UmlDiagramNode node)
    {
        var bounds = UmlNodeConnectionGeometry.GetLayoutBounds(project, node);

        if (node.Presentation == UmlNodePresentation.Classifier
            && project.FindClassifier(node.ModelElementId) is UmlInterface { UseCircleNotation: true })
        {
            var circle = UmlCircleNodeGeometry.GetInterfaceCircleBounds(bounds);
            g.DrawEllipse(pen, circle.X, circle.Y, circle.Width, circle.Height);
            return;
        }

        if (node.Presentation == UmlNodePresentation.UseCase)
        {
            g.DrawEllipse(pen, bounds.X, bounds.Y, bounds.Width, bounds.Height);
            return;
        }

        if (node.Presentation == UmlNodePresentation.Actor)
        {
            DrawActorOutline(g, pen, bounds);
            return;
        }

        if (node.Presentation == UmlNodePresentation.Behavior
            && project.FindElement(node.ModelElementId) is UmlBehaviorNode behaviorNode)
        {
            switch (behaviorNode.Kind)
            {
                case UmlBehaviorNodeKind.InitialState:
                case UmlBehaviorNodeKind.InitialNode:
                case UmlBehaviorNodeKind.Junction:
                    DrawCircleOutline(g, pen, bounds);
                    return;
                case UmlBehaviorNodeKind.ShallowHistory:
                case UmlBehaviorNodeKind.DeepHistory:
                    DrawCircleOutline(g, pen, bounds);
                    return;
                case UmlBehaviorNodeKind.FinalState:
                case UmlBehaviorNodeKind.ActivityFinalNode:
                    DrawFinalStateOutline(g, pen, bounds);
                    return;
                case UmlBehaviorNodeKind.FlowFinalNode:
                    DrawFlowFinalOutline(g, pen, bounds);
                    return;
                case UmlBehaviorNodeKind.EntryPoint:
                case UmlBehaviorNodeKind.ExitPoint:
                    DrawCircleOutline(g, pen, bounds);
                    return;
                case UmlBehaviorNodeKind.TerminateState:
                    DrawTerminateOutline(g, pen, bounds);
                    return;
                case UmlBehaviorNodeKind.CombinedFragment:
                {
                    var tabHeight = UmlCombinedFragmentRenderer.TabHeight;
                    var tabWidth = UmlCombinedFragmentRenderer.EstimateTabWidth(bounds);
                    UmlCombinedFragmentRenderer.DrawFrameOutline(g, pen, bounds, tabHeight, tabWidth);
                    return;
                }
                case UmlBehaviorNodeKind.Lifeline:
                    DrawLifelineOutline(g, pen, bounds);
                    return;
                case UmlBehaviorNodeKind.CompositeState:
                    DrawCompositeStateOutline(g, pen, bounds);
                    return;
                case UmlBehaviorNodeKind.OrthogonalRegion:
                    DrawOrthogonalRegionOutline(g, pen, bounds);
                    return;
                case UmlBehaviorNodeKind.SubmachineState:
                    DrawSubmachineStateOutline(g, pen, bounds);
                    return;
                case UmlBehaviorNodeKind.StateInvariant:
                case UmlBehaviorNodeKind.Continuation:
                    DrawSemiOvalOutline(g, pen, bounds);
                    return;
                case UmlBehaviorNodeKind.ActivityContainer:
                    DrawRoundedStateOutline(g, pen, bounds, 18f);
                    return;
                case UmlBehaviorNodeKind.SequenceEndpoint:
                {
                    var circle = UmlCircleNodeGeometry.GetCircleBounds(bounds);
                    g.DrawEllipse(pen, circle.X, circle.Y, circle.Width, circle.Height);
                    return;
                }
                case UmlBehaviorNodeKind.ExpansionRegion:
                case UmlBehaviorNodeKind.InterruptibleRegion:
                {
                    var tabHeight = UmlActivityRegionRenderer.TabHeight;
                    var tabWidth = Math.Min(bounds.Width - 8f, bounds.Width * 0.34f);
                    using var framePath = new GraphicsPath();
                    UmlActivityRegionRenderer.AppendFramePath(framePath, bounds, tabHeight, tabWidth);
                    g.DrawPath(pen, framePath);
                    return;
                }
            }
        }

        if (node.Presentation is UmlNodePresentation.ProvidedInterface or UmlNodePresentation.RequiredInterface)
        {
            UmlComponentNotation.DrawInterfaceSelectionOutline(g, pen, node.Presentation, bounds);
            return;
        }

        using var path = BuildSilhouettePath(project, node, bounds);
        if (path.PointCount > 0)
            g.DrawPath(pen, path);
    }

    private static void DrawRoundedStateOutline(Graphics g, Pen pen, RectangleF bounds, float radius)
    {
        using var path = CreateRoundedRectanglePath(bounds, radius);
        g.DrawPath(pen, path);
    }

    private static void DrawCompositeStateOutline(Graphics g, Pen pen, RectangleF bounds)
    {
        DrawRoundedStateOutline(g, pen, bounds, UmlStateNotation.CornerRadius);
        using var innerPen = new Pen(pen.Color, pen.Width) { DashStyle = DashStyle.Dash };
        var inset = new RectangleF(bounds.X + 8f, bounds.Y + 20f, Math.Max(12f, bounds.Width - 16f), Math.Max(12f, bounds.Height - 28f));
        g.DrawRectangle(innerPen, inset.X, inset.Y, inset.Width, inset.Height);
    }

    private static void DrawOrthogonalRegionOutline(Graphics g, Pen pen, RectangleF bounds)
    {
        DrawRoundedStateOutline(g, pen, bounds, UmlStateNotation.CornerRadius);
        var dividerX = bounds.Left + bounds.Width / 2f;
        g.DrawLine(pen, dividerX, bounds.Top + 18f, dividerX, bounds.Bottom - 5f);
    }

    private static void DrawSubmachineStateOutline(Graphics g, Pen pen, RectangleF bounds) =>
        DrawRoundedStateOutline(g, pen, bounds, UmlStateNotation.CornerRadius);

    private static void DrawSemiOvalOutline(Graphics g, Pen pen, RectangleF bounds)
    {
        using var path = new GraphicsPath();
        AddSemiOvalPath(path, bounds);
        g.DrawPath(pen, path);
    }

    private static void AddSemiOvalPath(GraphicsPath path, RectangleF bounds)
    {
        var arc = new RectangleF(bounds.X, bounds.Y, bounds.Width, bounds.Height * 2f);
        path.AddArc(arc.X, arc.Y, arc.Width, arc.Height, 0, 180);
        path.AddLine(bounds.Right, bounds.Top + bounds.Height / 2f, bounds.Left, bounds.Top + bounds.Height / 2f);
        path.CloseFigure();
    }

    private static void DrawCircleOutline(Graphics g, Pen pen, RectangleF bounds)
    {
        var circle = UmlCircleNodeGeometry.GetCircleBounds(bounds);
        g.DrawEllipse(pen, circle.X, circle.Y, circle.Width, circle.Height);
    }

    private static void DrawFlowFinalOutline(Graphics g, Pen pen, RectangleF bounds)
    {
        var circle = UmlCircleNodeGeometry.GetCircleBounds(bounds);
        g.DrawEllipse(pen, circle.X, circle.Y, circle.Width, circle.Height);
        UmlCircleNodeGeometry.DrawCross(g, circle, pen);
    }

    private static void DrawTerminateOutline(Graphics g, Pen pen, RectangleF bounds) =>
        DrawFlowFinalOutline(g, pen, bounds);

    private static void DrawFinalStateOutline(Graphics g, Pen pen, RectangleF bounds)
    {
        var circle = UmlCircleNodeGeometry.GetCircleBounds(bounds);
        g.DrawEllipse(pen, circle.X, circle.Y, circle.Width, circle.Height);
        g.DrawEllipse(
            pen,
            circle.X + circle.Width * 0.25f,
            circle.Y + circle.Height * 0.25f,
            circle.Width * 0.5f,
            circle.Height * 0.5f);
    }

    private static void DrawActorOutline(Graphics g, Pen pen, RectangleF bounds)
    {
        UmlActorGeometry.DrawStickFigure(g, pen, bounds);
    }

    private static void DrawLifelineOutline(Graphics g, Pen pen, RectangleF bounds)
    {
        var headerHeight = UmlSequenceLayout.HeaderHeight - 4f;
        var header = new RectangleF(bounds.Left + 2f, bounds.Top + 2f, bounds.Width - 4f, headerHeight);
        g.DrawRectangle(pen, header.X, header.Y, header.Width, header.Height);

        using var dashPen = new Pen(pen.Color, pen.Width)
        {
            DashStyle = DashStyle.Dash,
        };
        var cx = bounds.Left + bounds.Width / 2f;
        g.DrawLine(dashPen, cx, header.Bottom, cx, bounds.Bottom - 2f);
    }

    private static GraphicsPath CreateRoundedRectanglePath(RectangleF bounds, float radius)
    {
        var path = new GraphicsPath();
        if (bounds.Width <= 0f || bounds.Height <= 0f)
            return path;

        var r = Math.Min(radius, Math.Min(bounds.Width, bounds.Height) / 2f);
        var d = r * 2f;
        path.AddArc(bounds.Left, bounds.Top, d, d, 180, 90);
        path.AddArc(bounds.Right - d, bounds.Top, d, d, 270, 90);
        path.AddArc(bounds.Right - d, bounds.Bottom - d, d, d, 0, 90);
        path.AddArc(bounds.Left, bounds.Bottom - d, d, d, 90, 90);
        path.CloseFigure();
        return path;
    }

    private static GraphicsPath BuildSilhouettePath(UmlProject project, UmlDiagramNode node, RectangleF bounds)
    {
        var path = new GraphicsPath();

        switch (node.Presentation)
        {
            case UmlNodePresentation.Classifier:
                AddClassifierPath(path, project, node, bounds);
                break;
            case UmlNodePresentation.Actor:
                AddActorPath(path, bounds);
                break;
            case UmlNodePresentation.UseCase:
                path.AddEllipse(bounds);
                break;
            case UmlNodePresentation.SystemBoundary:
                path.AddRectangle(bounds);
                break;
            case UmlNodePresentation.Package:
                AddPackagePath(path, bounds);
                break;
            case UmlNodePresentation.Note:
                path.AddRectangle(bounds);
                break;
            case UmlNodePresentation.Behavior:
                AddBehaviorPath(path, project, node, bounds);
                break;
            case UmlNodePresentation.Component:
                path.AddRectangle(bounds);
                break;
            case UmlNodePresentation.ProvidedInterface:
            case UmlNodePresentation.RequiredInterface:
                UmlComponentNotation.AddInterfacePath(path, node.Presentation, bounds);
                break;
            case UmlNodePresentation.Port:
                path.AddRectangle(bounds);
                break;
            case UmlNodePresentation.ObjectInstance:
                UmlObjectNotation.AddSilhouettePath(path, bounds);
                break;
            case UmlNodePresentation.DeploymentHost:
                UmlDeploymentNotation.AddHostSilhouettePath(path, bounds);
                break;
            case UmlNodePresentation.Artifact:
                UmlDeploymentNotation.AddArtifactSilhouettePath(path, bounds);
                break;
        }

        return path;
    }

    private static void AddClassifierPath(GraphicsPath path, UmlProject project, UmlDiagramNode node, RectangleF bounds)
    {
        var classifier = project.FindClassifier(node.ModelElementId);
        if (classifier is UmlInterface iface && iface.UseCircleNotation)
        {
            var diameter = Math.Min(bounds.Width, bounds.Height * 0.55f);
            var circle = new RectangleF(
                bounds.Left + (bounds.Width - diameter) / 2f,
                bounds.Top + 4f,
                diameter,
                diameter);
            path.AddEllipse(circle);
            return;
        }

        if (classifier is UmlInterface)
        {
            path.AddPath(CreateInterfacePath(bounds), false);
            return;
        }

        path.AddRectangle(bounds);
    }

    private static GraphicsPath CreateInterfacePath(RectangleF bounds)
    {
        var r = InterfaceCornerRadius;
        var left = bounds.Left;
        var top = bounds.Top;
        var right = bounds.Right;
        var bottom = bounds.Bottom;
        var path = new GraphicsPath();
        path.AddArc(right - r * 2f, top, r * 2f, r * 2f, 270, 90);
        path.AddArc(right - r * 2f, bottom - r * 2f, r * 2f, r * 2f, 0, 90);
        path.AddLine(right - r, bottom, left, bottom);
        path.AddLine(left, bottom, left, top);
        path.AddLine(left, top, right - r, top);
        path.CloseFigure();
        return path;
    }

    private static void AddActorPath(GraphicsPath path, RectangleF bounds) =>
        UmlActorGeometry.AddStickFigurePath(path, bounds);

    private static void AddPackagePath(GraphicsPath path, RectangleF bounds)
    {
        using var silhouette = UmlPackageNotation.CreateSilhouettePath(bounds);
        path.AddPath(silhouette, connect: false);
    }

    private static void AddBehaviorPath(GraphicsPath path, UmlProject project, UmlDiagramNode node, RectangleF bounds)
    {
        if (project.FindElement(node.ModelElementId) is not UmlBehaviorNode behaviorNode)
        {
            path.AddRectangle(bounds);
            return;
        }

        switch (behaviorNode.Kind)
        {
            case UmlBehaviorNodeKind.State:
            case UmlBehaviorNodeKind.Action:
                UmlStateNotation.AddRoundedStatePath(path, bounds, RoundedNodeRadius);
                break;
            case UmlBehaviorNodeKind.StateInvariant:
            case UmlBehaviorNodeKind.Continuation:
                AddSemiOvalPath(path, bounds);
                break;
            case UmlBehaviorNodeKind.CompositeState:
                UmlStateNotation.AddCompositeStatePath(path, bounds);
                break;
            case UmlBehaviorNodeKind.OrthogonalRegion:
                UmlStateNotation.AddOrthogonalRegionPath(path, bounds);
                break;
            case UmlBehaviorNodeKind.SubmachineState:
                UmlStateNotation.AddSubmachineStatePath(path, bounds);
                break;
            case UmlBehaviorNodeKind.ActivityContainer:
                UmlStateNotation.AddRoundedStatePath(path, bounds, 18f);
                break;
            case UmlBehaviorNodeKind.InitialState:
            case UmlBehaviorNodeKind.InitialNode:
            case UmlBehaviorNodeKind.FinalState:
            case UmlBehaviorNodeKind.ActivityFinalNode:
                path.AddEllipse(UmlCircleNodeGeometry.GetCircleBounds(bounds));
                break;
            case UmlBehaviorNodeKind.Decision:
            case UmlBehaviorNodeKind.Merge:
            case UmlBehaviorNodeKind.Choice:
            case UmlBehaviorNodeKind.NaryAssociationHub:
                AddDiamondPath(path, bounds);
                break;
            case UmlBehaviorNodeKind.FlowFinalNode:
            case UmlBehaviorNodeKind.Junction:
            case UmlBehaviorNodeKind.ShallowHistory:
            case UmlBehaviorNodeKind.DeepHistory:
            case UmlBehaviorNodeKind.EntryPoint:
            case UmlBehaviorNodeKind.ExitPoint:
            case UmlBehaviorNodeKind.TerminateState:
                path.AddEllipse(UmlCircleNodeGeometry.GetCircleBounds(bounds));
                break;
            case UmlBehaviorNodeKind.Fork:
            case UmlBehaviorNodeKind.Join:
                path.AddRectangle(UmlNodeConnectionGeometry.GetForkJoinBarBounds(bounds));
                break;
            case UmlBehaviorNodeKind.CombinedFragment:
            {
                var tabHeight = UmlCombinedFragmentRenderer.TabHeight;
                var tabWidth = UmlCombinedFragmentRenderer.EstimateTabWidth(bounds);
                UmlCombinedFragmentRenderer.AppendFramePath(path, bounds, tabHeight, tabWidth);
                break;
            }
            case UmlBehaviorNodeKind.Lifeline:
                {
                    var headerHeight = UmlSequenceLayout.HeaderHeight - 4f;
                    path.AddRectangle(new RectangleF(bounds.Left + 2f, bounds.Top + 2f, bounds.Width - 4f, headerHeight));
                    break;
                }
            case UmlBehaviorNodeKind.SequenceEndpoint:
                path.AddEllipse(UmlCircleNodeGeometry.GetCircleBounds(bounds));
                break;
            case UmlBehaviorNodeKind.Gate:
                path.AddRectangle(bounds);
                break;
            case UmlBehaviorNodeKind.ExpansionRegion:
            case UmlBehaviorNodeKind.InterruptibleRegion:
            {
                var tabHeight = UmlActivityRegionRenderer.TabHeight;
                var tabWidth = Math.Min(bounds.Width - 8f, bounds.Width * 0.34f);
                UmlActivityRegionRenderer.AppendFramePath(path, bounds, tabHeight, tabWidth);
                break;
            }
            default:
                path.AddRectangle(bounds);
                break;
        }
    }

    private static void AddDiamondPath(GraphicsPath path, RectangleF bounds)
    {
        var cx = bounds.Left + bounds.Width / 2f;
        var cy = bounds.Top + bounds.Height / 2f;
        path.AddPolygon(
        [
            new PointF(cx, bounds.Top),
            new PointF(bounds.Right, cy),
            new PointF(cx, bounds.Bottom),
            new PointF(bounds.Left, cy),
        ]);
    }

    private static bool IsHandleEnabled(UmlProject project, UmlDiagramNode node, int handleIndex)
    {
        if (node.Presentation == UmlNodePresentation.Behavior
            && project.FindElement(node.ModelElementId) is UmlBehaviorNode behaviorNode)
        {
            if (behaviorNode.Kind is UmlBehaviorNodeKind.Fork or UmlBehaviorNodeKind.Join)
                return handleIndex is 1 or 3 or 5 or 7;

            if (UmlCircleNodeGeometry.UsesFixedCircleSize(behaviorNode.Kind))
                return false;
        }

        return true;
    }

    private static float HandleIndexToAngle(int index) => index switch
    {
        0 => -135f,
        1 => -90f,
        2 => -45f,
        3 => 0f,
        4 => 45f,
        5 => 90f,
        6 => 135f,
        7 => 180f,
        _ => 0f,
    };

    private static PointF GetShapeCenter(RectangleF bounds) =>
        new(bounds.Left + bounds.Width / 2f, bounds.Top + bounds.Height / 2f);

    private static PointF GetRectHandlePoint(RectangleF rect, int index) => index switch
    {
        0 => new PointF(rect.Left, rect.Top),
        1 => new PointF(rect.Left + rect.Width / 2f, rect.Top),
        2 => new PointF(rect.Right, rect.Top),
        3 => new PointF(rect.Right, rect.Top + rect.Height / 2f),
        4 => new PointF(rect.Right, rect.Bottom),
        5 => new PointF(rect.Left + rect.Width / 2f, rect.Bottom),
        6 => new PointF(rect.Left, rect.Bottom),
        _ => new PointF(rect.Left, rect.Top + rect.Height / 2f),
    };

    private static PointF? GetBoundaryPoint(GraphicsPath path, PointF center, float angleDeg)
    {
        var rad = angleDeg * MathF.PI / 180f;
        var target = new PointF(
            center.X + MathF.Cos(rad) * 10_000f,
            center.Y + MathF.Sin(rad) * 10_000f);
        return RayIntersectPath(path, center, target);
    }

    private static PointF? RayIntersectPath(GraphicsPath path, PointF origin, PointF target)
    {
        var dirX = target.X - origin.X;
        var dirY = target.Y - origin.Y;
        var length = MathF.Sqrt(dirX * dirX + dirY * dirY);
        if (length < 0.001f)
            return null;

        dirX /= length;
        dirY /= length;

        using var flat = (GraphicsPath)path.Clone();
        using var identity = new Matrix();
        flat.Flatten(identity, 0.25f);
        var points = flat.PathPoints;
        var types = flat.PathTypes;
        if (points.Length < 2)
            return null;

        PointF? best = null;
        var bestDistance = -1f;
        var previous = points[0];
        var subpathStart = 0;

        for (var i = 1; i < points.Length; i++)
        {
            var isLine = (types[i] & (byte)PathPointType.PathTypeMask) is (byte)PathPointType.Line or (byte)PathPointType.Bezier;
            if (isLine)
            {
                var hit = RaySegmentIntersect(origin, dirX, dirY, previous, points[i]);
                if (hit is PointF point)
                    TryUpdateBest(ref best, ref bestDistance, origin, point);
            }

            previous = points[i];
            if ((types[i] & (byte)PathPointType.CloseSubpath) != 0)
            {
                var closeHit = RaySegmentIntersect(origin, dirX, dirY, points[i], points[subpathStart]);
                if (closeHit is PointF closePoint)
                    TryUpdateBest(ref best, ref bestDistance, origin, closePoint);

                subpathStart = i + 1;
                previous = subpathStart < points.Length ? points[subpathStart] : points[0];
            }
        }

        return best;
    }

    private static void TryUpdateBest(ref PointF? best, ref float bestDistance, PointF origin, PointF candidate)
    {
        var distance = Distance(origin, candidate);
        if (distance > 0.5f && distance > bestDistance)
        {
            bestDistance = distance;
            best = candidate;
        }
    }

    private static PointF? RaySegmentIntersect(PointF origin, float dirX, float dirY, PointF a, PointF b)
    {
        var segX = b.X - a.X;
        var segY = b.Y - a.Y;
        var denominator = dirX * segY - dirY * segX;
        if (MathF.Abs(denominator) < 0.0001f)
            return null;

        var t = ((a.X - origin.X) * segY - (a.Y - origin.Y) * segX) / denominator;
        var u = ((a.X - origin.X) * dirY - (a.Y - origin.Y) * dirX) / denominator;
        if (t < 0f || u < 0f || u > 1f)
            return null;

        return new PointF(origin.X + dirX * t, origin.Y + dirY * t);
    }

    private static float Distance(PointF a, PointF b)
    {
        var dx = a.X - b.X;
        var dy = a.Y - b.Y;
        return MathF.Sqrt(dx * dx + dy * dy);
    }
}
