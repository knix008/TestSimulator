using System.Drawing.Drawing2D;
using MyUML20WinV10.Models;

namespace MyUML20WinV10.Rendering;

public static class UmlNodeConnectionGeometry
{
    public const float ForkJoinBarThickness = 8f;
    private const float RoundedNodeRadius = 12f;

    public static PointF GetConnectionPoint(
        UmlProject project,
        UmlDiagramNode fromNode,
        UmlDiagramNode toNode,
        out UmlConnectionSide side)
    {
        var fromBounds = GetLayoutBounds(project, fromNode);
        var toBounds = GetLayoutBounds(project, toNode);
        var aimPoint = ComputeShapeAimPoint(project, fromNode, toNode, fromBounds, toBounds);

        if (fromNode.Presentation is UmlNodePresentation.ProvidedInterface or UmlNodePresentation.RequiredInterface)
        {
            var interfacePoint = UmlComponentNotation.GetConnectionPoint(fromNode, fromBounds, aimPoint);
            side = ClassifyConnectionSide(interfacePoint, fromBounds);
            return interfacePoint;
        }

        return ResolveShapeConnectionPoint(project, fromNode, fromBounds, aimPoint, out side);
    }

    public static PointF GetConnectionPointToBounds(
        UmlProject project,
        UmlDiagramNode fromNode,
        RectangleF targetBounds,
        out UmlConnectionSide side) =>
        GetConnectionPointToBounds(project, fromNode, targetBounds, GetLayoutBounds(project, fromNode), out side);

    public static PointF GetConnectionPointToBounds(
        UmlProject project,
        UmlDiagramNode fromNode,
        RectangleF targetBounds,
        RectangleF fromBounds,
        out UmlConnectionSide side)
    {
        var aimPoint = ComputeShapeAimPoint(project, fromNode, fromBounds, targetBounds);

        return ResolveShapeConnectionPoint(project, fromNode, fromBounds, aimPoint, out side);
    }

    public static RectangleF GetLayoutBounds(UmlProject project, UmlDiagramNode node)
    {
        node.Height = UmlDiagramRenderer.MeasureNodeHeight(project, node);
        return UmlCircleNodeGeometry.TryGetCircularBounds(project, node, out var circularBounds)
            ? circularBounds
            : node.Bounds;
    }

    private static PointF ResolveShapeConnectionPoint(
        UmlProject project,
        UmlDiagramNode fromNode,
        RectangleF fromBounds,
        PointF aimPoint,
        out UmlConnectionSide side)
    {
        using var path = BuildConnectionPath(project, fromNode, fromBounds);
        var origin = UmlCircleNodeGeometry.TryGetCircularBounds(project, fromNode, out var circularBounds)
            ? UmlCircleNodeGeometry.GetEllipseCenter(circularBounds)
            : GetPathCentroid(path, GetShapeCenter(fromBounds));

        var hit = RayIntersectPath(path, origin, aimPoint);
        if (hit is null && UmlCircleNodeGeometry.TryGetCircularBounds(project, fromNode, out circularBounds))
            hit = UmlCircleNodeGeometry.GetEllipseBoundaryPoint(circularBounds, origin, aimPoint);
        hit ??= GetBoundsEdgePoint(fromBounds, origin, aimPoint);

        side = ClassifyConnectionSide(hit.Value, fromBounds);
        return hit.Value;
    }

    private static PointF ComputeShapeAimPoint(
        UmlProject project,
        UmlDiagramNode fromNode,
        UmlDiagramNode toNode,
        RectangleF fromBounds,
        RectangleF toBounds)
    {
        var fromOrigin = GetShapeOrigin(project, fromNode, fromBounds);
        return ComputeTargetAimPoint(project, toNode, toBounds, fromOrigin);
    }

    private static PointF ComputeShapeAimPoint(
        UmlProject project,
        UmlDiagramNode fromNode,
        RectangleF fromBounds,
        RectangleF targetBounds)
    {
        var fromOrigin = GetShapeOrigin(project, fromNode, fromBounds);
        return GetBoundsEdgePoint(targetBounds, GetShapeCenter(targetBounds), fromOrigin);
    }

    private static PointF GetShapeOrigin(UmlProject project, UmlDiagramNode node, RectangleF layoutBounds) =>
        UmlCircleNodeGeometry.TryGetCircularBounds(project, node, out var circular)
            ? UmlCircleNodeGeometry.GetEllipseCenter(circular)
            : GetShapeCenter(layoutBounds);

    private static PointF ComputeTargetAimPoint(
        UmlProject project,
        UmlDiagramNode targetNode,
        RectangleF targetBounds,
        PointF fromPoint)
    {
        if (UmlCircleNodeGeometry.TryGetCircularBounds(project, targetNode, out var circular))
        {
            var center = UmlCircleNodeGeometry.GetEllipseCenter(circular);
            return UmlCircleNodeGeometry.GetEllipseBoundaryPoint(circular, center, fromPoint);
        }

        var targetCenter = GetShapeCenter(targetBounds);
        return GetBoundsEdgePoint(targetBounds, targetCenter, fromPoint);
    }

    public static RectangleF GetForkJoinBarBounds(RectangleF bounds) =>
        new(bounds.X, bounds.Top + bounds.Height / 2f - ForkJoinBarThickness / 2f, bounds.Width, ForkJoinBarThickness);

    private static GraphicsPath BuildConnectionPath(UmlProject project, UmlDiagramNode node, RectangleF bounds)
    {
        var path = new GraphicsPath();

        switch (node.Presentation)
        {
            case UmlNodePresentation.Classifier:
                AddClassifierConnectionPath(project, node, bounds, path);
                break;
            case UmlNodePresentation.Note:
            case UmlNodePresentation.Component:
            case UmlNodePresentation.ObjectInstance:
            case UmlNodePresentation.DeploymentHost:
            case UmlNodePresentation.Artifact:
                path.AddRectangle(bounds);
                break;

            case UmlNodePresentation.ProvidedInterface:
            case UmlNodePresentation.RequiredInterface:
                UmlComponentNotation.AddInterfacePath(path, node.Presentation, bounds);
                break;

            case UmlNodePresentation.Actor:
                UmlActorGeometry.AddStickFigurePath(path, bounds);
                break;

            case UmlNodePresentation.UseCase:
                path.AddEllipse(bounds);
                break;

            case UmlNodePresentation.SystemBoundary:
                path.AddRectangle(bounds);
                break;

            case UmlNodePresentation.Package:
                path.AddRectangle(GetPackageBodyBounds(bounds));
                break;

            case UmlNodePresentation.Behavior:
                AddBehaviorConnectionPath(project, node, bounds, path);
                break;
        }

        return path;
    }

    private static void AddBehaviorConnectionPath(
        UmlProject project,
        UmlDiagramNode node,
        RectangleF bounds,
        GraphicsPath path)
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
                AddRoundedRectangle(path, bounds, RoundedNodeRadius);
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
                AddDiamond(path, bounds);
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
                path.AddRectangle(GetForkJoinBarBounds(bounds));
                break;

            case UmlBehaviorNodeKind.CombinedFragment:
                path.AddRectangle(bounds);
                break;

            case UmlBehaviorNodeKind.Lifeline:
                path.AddRectangle(new RectangleF(bounds.X, bounds.Y, bounds.Width, UmlSequenceLayout.HeaderHeight));
                break;

            case UmlBehaviorNodeKind.SequenceEndpoint:
                path.AddEllipse(UmlCircleNodeGeometry.GetCircleBounds(bounds));
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

    private static void AddClassifierConnectionPath(
        UmlProject project,
        UmlDiagramNode node,
        RectangleF bounds,
        GraphicsPath path)
    {
        if (project.FindClassifier(node.ModelElementId) is UmlInterface { UseCircleNotation: true })
        {
            path.AddEllipse(UmlCircleNodeGeometry.GetInterfaceCircleBounds(bounds));
            return;
        }

        path.AddRectangle(bounds);
    }

    private static void AddActorBodyEllipse(GraphicsPath path, RectangleF bounds) =>
        UmlActorGeometry.AddStickFigurePath(path, bounds);

    private static RectangleF GetPackageBodyBounds(RectangleF bounds) =>
        UmlPackageNotation.GetBodyBounds(bounds);

    private static void AddDiamond(GraphicsPath path, RectangleF bounds)
    {
        var size = Math.Min(bounds.Width, bounds.Height);
        var sq = new RectangleF(
            bounds.Left + (bounds.Width - size) / 2f,
            bounds.Top + (bounds.Height - size) / 2f,
            size, size);
        var cx = sq.Left + size / 2f;
        var cy = sq.Top + size / 2f;
        path.AddPolygon(
        [
            new PointF(cx, sq.Top),
            new PointF(sq.Right, cy),
            new PointF(cx, sq.Bottom),
            new PointF(sq.Left, cy),
        ]);
    }

    private static void AddRoundedRectangle(GraphicsPath path, RectangleF bounds, float radius)
    {
        if (bounds.Width <= 0f || bounds.Height <= 0f)
            return;

        var r = Math.Min(radius, Math.Min(bounds.Width, bounds.Height) / 2f);
        var d = r * 2f;
        path.AddArc(bounds.Left, bounds.Top, d, d, 180, 90);
        path.AddArc(bounds.Right - d, bounds.Top, d, d, 270, 90);
        path.AddArc(bounds.Right - d, bounds.Bottom - d, d, d, 0, 90);
        path.AddArc(bounds.Left, bounds.Bottom - d, d, d, 90, 90);
        path.CloseFigure();
    }

    public static PointF GetRectConnectionPoint(RectangleF from, RectangleF to, out UmlConnectionSide side)
    {
        var fromCenter = GetShapeCenter(from);
        var toCenter = GetShapeCenter(to);
        var dx = toCenter.X - fromCenter.X;
        var dy = toCenter.Y - fromCenter.Y;

        if (MathF.Abs(dx) < 0.001f && MathF.Abs(dy) < 0.001f)
        {
            side = UmlConnectionSide.Right;
            return new PointF(from.Right, fromCenter.Y);
        }

        var bestT = float.MaxValue;
        var best = fromCenter;
        var bestSide = UmlConnectionSide.Right;

        void TryHit(float t, float x, float y, UmlConnectionSide candidate)
        {
            if (t <= 0.0001f || t >= bestT)
                return;

            if (x < from.Left - 0.01f || x > from.Right + 0.01f || y < from.Top - 0.01f || y > from.Bottom + 0.01f)
                return;

            bestT = t;
            best = new PointF(x, y);
            bestSide = candidate;
        }

        if (MathF.Abs(dx) > 0.001f)
        {
            var tRight = (from.Right - fromCenter.X) / dx;
            TryHit(tRight, from.Right, fromCenter.Y + tRight * dy, UmlConnectionSide.Right);

            var tLeft = (from.Left - fromCenter.X) / dx;
            TryHit(tLeft, from.Left, fromCenter.Y + tLeft * dy, UmlConnectionSide.Left);
        }

        if (MathF.Abs(dy) > 0.001f)
        {
            var tBottom = (from.Bottom - fromCenter.Y) / dy;
            TryHit(tBottom, fromCenter.X + tBottom * dx, from.Bottom, UmlConnectionSide.Bottom);

            var tTop = (from.Top - fromCenter.Y) / dy;
            TryHit(tTop, fromCenter.X + tTop * dx, from.Top, UmlConnectionSide.Top);
        }

        side = bestSide;
        return best;
    }

    private static PointF GetShapeCenter(RectangleF bounds) =>
        new(bounds.Left + bounds.Width / 2f, bounds.Top + bounds.Height / 2f);

    private static PointF ComputeMinDistAimPoint(RectangleF source, RectangleF target)
    {
        var sourceCenter = GetShapeCenter(source);
        var targetCenter = GetShapeCenter(target);
        var dx = targetCenter.X - sourceCenter.X;
        var dy = targetCenter.Y - sourceCenter.Y;

        var xSep = dx > 0 ? target.Left - source.Right : source.Left - target.Right;
        var ySep = dy > 0 ? target.Top - source.Bottom : source.Top - target.Bottom;
        xSep = Math.Max(0f, xSep);
        ySep = Math.Max(0f, ySep);

        if (xSep > 0f && xSep >= ySep)
        {
            var edgeX = dx > 0 ? target.Left : target.Right;
            var edgeY = Math.Clamp(sourceCenter.Y, target.Top, target.Bottom);
            return new PointF(edgeX, edgeY);
        }

        if (ySep > 0f)
        {
            var edgeY = dy > 0 ? target.Top : target.Bottom;
            var edgeX = Math.Clamp(sourceCenter.X, target.Left, target.Right);
            return new PointF(edgeX, edgeY);
        }

        return targetCenter;
    }

    private static PointF GetPathCentroid(GraphicsPath path, PointF fallback)
    {
        using var flat = (GraphicsPath)path.Clone();
        using var identity = new Matrix();
        flat.Flatten(identity, 0.35f);
        var points = flat.PathPoints;
        if (points.Length == 0)
            return fallback;

        var cx = 0f;
        var cy = 0f;
        foreach (var point in points)
        {
            cx += point.X;
            cy += point.Y;
        }

        return new PointF(cx / points.Length, cy / points.Length);
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

    private static PointF GetBoundsEdgePoint(RectangleF rect, PointF origin, PointF target)
    {
        var dx = target.X - origin.X;
        var dy = target.Y - origin.Y;
        var tMin = float.MaxValue;
        var result = GetShapeCenter(rect);

        if (MathF.Abs(dx) > 0.001f)
        {
            var edgeX = dx > 0 ? rect.Right : rect.Left;
            var t = (edgeX - origin.X) / dx;
            if (t > 0f)
            {
                var y = origin.Y + dy * t;
                if (y >= rect.Top && y <= rect.Bottom && t < tMin)
                {
                    tMin = t;
                    result = new PointF(edgeX, Math.Clamp(y, rect.Top, rect.Bottom));
                }
            }
        }

        if (MathF.Abs(dy) > 0.001f)
        {
            var edgeY = dy > 0 ? rect.Bottom : rect.Top;
            var t = (edgeY - origin.Y) / dy;
            if (t > 0f)
            {
                var x = origin.X + dx * t;
                if (x >= rect.Left && x <= rect.Right && t < tMin)
                {
                    tMin = t;
                    result = new PointF(Math.Clamp(x, rect.Left, rect.Right), edgeY);
                }
            }
        }

        return result;
    }

    private static UmlConnectionSide ClassifyConnectionSide(PointF hit, RectangleF bounds)
    {
        var cx = bounds.Left + bounds.Width / 2f;
        var cy = bounds.Top + bounds.Height / 2f;
        var dx = hit.X - cx;
        var dy = hit.Y - cy;

        if (bounds.Width > 0.001f && bounds.Height > 0.001f)
        {
            var nx = MathF.Abs(dx) / bounds.Width;
            var ny = MathF.Abs(dy) / bounds.Height;
            if (nx >= ny)
                return dx >= 0f ? UmlConnectionSide.Right : UmlConnectionSide.Left;
        }

        return dy >= 0f ? UmlConnectionSide.Bottom : UmlConnectionSide.Top;
    }

    private static float Distance(PointF a, PointF b)
    {
        var dx = a.X - b.X;
        var dy = a.Y - b.Y;
        return MathF.Sqrt(dx * dx + dy * dy);
    }
}
