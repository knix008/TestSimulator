using MyUML20WinV10.Models;

namespace MyUML20WinV10.Rendering;

public static class UmlCircleNodeGeometry
{
    public const float MinDiameter = 24f;

    public static bool IsCircleKind(UmlBehaviorNodeKind kind) =>
        kind is UmlBehaviorNodeKind.InitialState
            or UmlBehaviorNodeKind.FinalState
            or UmlBehaviorNodeKind.InitialNode
            or UmlBehaviorNodeKind.ActivityFinalNode
            or UmlBehaviorNodeKind.FlowFinalNode
            or UmlBehaviorNodeKind.Junction
            or UmlBehaviorNodeKind.ShallowHistory
            or UmlBehaviorNodeKind.DeepHistory
            or UmlBehaviorNodeKind.EntryPoint
            or UmlBehaviorNodeKind.ExitPoint
            or UmlBehaviorNodeKind.TerminateState
            or UmlBehaviorNodeKind.SequenceEndpoint;

    public static bool UsesFixedCircleSize(UmlBehaviorNodeKind kind) =>
        kind is UmlBehaviorNodeKind.InitialState
            or UmlBehaviorNodeKind.FinalState
            or UmlBehaviorNodeKind.InitialNode
            or UmlBehaviorNodeKind.ActivityFinalNode
            or UmlBehaviorNodeKind.FlowFinalNode
            or UmlBehaviorNodeKind.Junction
            or UmlBehaviorNodeKind.EntryPoint
            or UmlBehaviorNodeKind.ExitPoint
            or UmlBehaviorNodeKind.TerminateState
            or UmlBehaviorNodeKind.SequenceEndpoint;

    public static bool IsCircleNode(UmlProject project, UmlDiagramNode node) =>
        node.Presentation == UmlNodePresentation.Behavior
        && project.FindElement(node.ModelElementId) is UmlBehaviorNode behaviorNode
        && IsCircleKind(behaviorNode.Kind);

    public static bool UsesCircularVisual(UmlProject project, UmlDiagramNode node) =>
        node.Presentation == UmlNodePresentation.UseCase
        || IsCircleNode(project, node)
        || (node.Presentation == UmlNodePresentation.Classifier
            && project.FindClassifier(node.ModelElementId) is UmlInterface { UseCircleNotation: true });

    public static bool TryGetCircularBounds(UmlProject project, UmlDiagramNode node, out RectangleF circularBounds)
    {
        node.Height = UmlDiagramRenderer.MeasureNodeHeight(project, node);
        var bounds = node.Bounds;

        if (IsCircleNode(project, node))
        {
            circularBounds = GetCircleBounds(bounds);
            return true;
        }

        if (node.Presentation == UmlNodePresentation.UseCase)
        {
            circularBounds = bounds;
            return true;
        }

        if (node.Presentation == UmlNodePresentation.Classifier
            && project.FindClassifier(node.ModelElementId) is UmlInterface { UseCircleNotation: true })
        {
            circularBounds = GetInterfaceCircleBounds(bounds);
            return true;
        }

        circularBounds = default;
        return false;
    }

    public static RectangleF GetInterfaceCircleBounds(RectangleF bounds)
    {
        var diameter = Math.Min(bounds.Width, bounds.Height * 0.55f);
        return new RectangleF(
            bounds.Left + (bounds.Width - diameter) / 2f,
            bounds.Top + 4f,
            diameter,
            diameter);
    }

    public static RectangleF GetCircleBounds(RectangleF bounds)
    {
        var size = Math.Max(bounds.Width, bounds.Height);
        return new RectangleF(
            bounds.Left + (bounds.Width - size) / 2f,
            bounds.Top + (bounds.Height - size) / 2f,
            size,
            size);
    }

    public static PointF GetEllipseCenter(RectangleF ellipseBounds) =>
        new(ellipseBounds.Left + ellipseBounds.Width / 2f, ellipseBounds.Top + ellipseBounds.Height / 2f);

    public static PointF GetEllipseBoundaryPoint(RectangleF ellipseBounds, PointF from, PointF toward)
    {
        var center = GetEllipseCenter(ellipseBounds);
        var rx = ellipseBounds.Width / 2f;
        var ry = ellipseBounds.Height / 2f;
        if (rx < 0.001f || ry < 0.001f)
            return center;

        var dx = toward.X - from.X;
        var dy = toward.Y - from.Y;
        if (MathF.Abs(dx) < 0.001f && MathF.Abs(dy) < 0.001f)
            return new PointF(center.X + rx, center.Y);

        var ox = (from.X - center.X) / rx;
        var oy = (from.Y - center.Y) / ry;
        var ux = dx / rx;
        var uy = dy / ry;

        var a = ux * ux + uy * uy;
        var b = 2f * (ox * ux + oy * uy);
        var c = ox * ox + oy * oy - 1f;
        var discriminant = b * b - 4f * a * c;
        if (discriminant < 0f || MathF.Abs(a) < 0.0001f)
            return new PointF(center.X + rx, center.Y);

        var sqrt = MathF.Sqrt(discriminant);
        var t1 = (-b + sqrt) / (2f * a);
        var t2 = (-b - sqrt) / (2f * a);
        var t = t1 >= 0f ? t1 : t2;
        if (t < 0f)
            t = MathF.Max(t1, t2);

        return new PointF(from.X + dx * t, from.Y + dy * t);
    }

    public static RectangleF SquareFromDrag(RectangleF dragRect)
    {
        var width = Math.Abs(dragRect.Width);
        var height = Math.Abs(dragRect.Height);
        var size = Math.Max(Math.Max(width, height), MinDiameter);
        return new RectangleF(
            dragRect.Left + (dragRect.Width - size) / 2f,
            dragRect.Top + (dragRect.Height - size) / 2f,
            size,
            size);
    }

    public static RectangleF NormalizeCreateRect(RectangleF rect, SizeF defaultSize, float zoom)
    {
        const float minScreen = 6f;
        var width = Math.Abs(rect.Width);
        var height = Math.Abs(rect.Height);
        if (width * zoom < minScreen && height * zoom < minScreen)
        {
            var size = Math.Max(defaultSize.Width, defaultSize.Height);
            return new RectangleF(rect.X, rect.Y, size, size);
        }

        return SquareFromDrag(rect);
    }

    public static void DrawFlowFinalStyle(Graphics g, RectangleF bounds, Pen pen)
    {
        var circle = GetCircleBounds(bounds);
        UmlDiagramStyle.DrawStyledEllipse(g, circle, pen);
        DrawCross(g, circle, pen);
    }

    public static void DrawTerminateStyle(Graphics g, RectangleF bounds, Pen pen) =>
        DrawFlowFinalStyle(g, bounds, pen);

    public static void DrawFlowFinalPreview(Graphics g, RectangleF area, Color stroke)
    {
        var circle = FitPreviewSquare(area);
        using var pen = new Pen(stroke, UmlDiagramStyle.PreviewPenWidth);
        UmlDiagramStyle.DrawStyledEllipse(g, circle, pen);
        DrawCross(g, circle, pen);
    }

    public static void DrawFlowFinalGhost(Graphics g, RectangleF rect, Color fill, Color stroke)
    {
        var circle = GetCircleBounds(rect);
        using var fillBrush = new SolidBrush(fill);
        g.FillEllipse(fillBrush, circle);
        using var pen = new Pen(stroke, 1.4f);
        g.DrawEllipse(pen, circle);
        DrawCross(g, circle, pen);
    }

    public static void DrawCross(Graphics g, RectangleF circle, Pen pen)
    {
        var inset = circle.Width * 0.26f;
        using var xPen = new Pen(pen.Color, Math.Max(1.4f, pen.Width));
        g.DrawLine(xPen, circle.X + inset, circle.Y + inset, circle.Right - inset, circle.Bottom - inset);
        g.DrawLine(xPen, circle.Right - inset, circle.Y + inset, circle.X + inset, circle.Bottom - inset);
    }

    private static RectangleF FitPreviewSquare(RectangleF area, float fillRatio = 0.82f)
    {
        var size = Math.Max(Math.Min(area.Width, area.Height) * fillRatio, 8f);
        return new RectangleF(
            area.Left + (area.Width - size) / 2f,
            area.Top + (area.Height - size) / 2f,
            size,
            size);
    }

    public static bool IsCircleCreateTool(UmlToolMode mode) =>
        mode is UmlToolMode.CreateInitialState
            or UmlToolMode.CreateFinalState
            or UmlToolMode.CreateInitialNode
            or UmlToolMode.CreateActivityFinalNode
            or UmlToolMode.CreateFlowFinalNode
            or UmlToolMode.CreateJunction
            or UmlToolMode.CreateShallowHistory
            or UmlToolMode.CreateDeepHistory
            or UmlToolMode.CreateEntryPoint
            or UmlToolMode.CreateExitPoint
            or UmlToolMode.CreateTerminateState
            or UmlToolMode.CreateSequenceEndpoint;

    public static bool IsDiamondKind(UmlBehaviorNodeKind kind) =>
        kind is UmlBehaviorNodeKind.Decision
            or UmlBehaviorNodeKind.Merge
            or UmlBehaviorNodeKind.Choice;

    public static bool IsDiamondNode(UmlProject project, UmlDiagramNode node) =>
        node.Presentation == UmlNodePresentation.Behavior
        && project.FindElement(node.ModelElementId) is UmlBehaviorNode behaviorNode
        && IsDiamondKind(behaviorNode.Kind);

    public static bool IsDiamondCreateTool(UmlToolMode mode) =>
        mode is UmlToolMode.CreateDecision
            or UmlToolMode.CreateMerge
            or UmlToolMode.CreateChoice;
}
