using System.Drawing.Drawing2D;
using MyUML20WinV10.Models;

namespace MyUML20WinV10.Rendering;

public static class UmlExtendedNotation
{
    public static void DrawExtendedBehaviorNode(Graphics g, UmlBehaviorNode node, RectangleF bounds, Pen pen, bool selected)
    {
        using var textBrush = new SolidBrush(UmlDiagramStyle.TextColor);
        using var font = new Font("Segoe UI", 8.5f);
        var label = string.IsNullOrWhiteSpace(node.Name) ? node.Kind.ToString() : node.Name;

        switch (node.Kind)
        {
            case UmlBehaviorNodeKind.NaryAssociationHub:
                DrawDiamondHub(g, bounds, pen);
                break;
            case UmlBehaviorNodeKind.StateInvariant:
            case UmlBehaviorNodeKind.Continuation:
                DrawSemiOval(g, bounds, pen, label, font, textBrush);
                break;
            case UmlBehaviorNodeKind.CompositeState:
                UmlStateNotation.DrawCompositeState(g, bounds, pen, label);
                break;
            case UmlBehaviorNodeKind.OrthogonalRegion:
                UmlStateNotation.DrawOrthogonalRegion(g, bounds, pen, label);
                break;
            case UmlBehaviorNodeKind.EntryPoint:
            case UmlBehaviorNodeKind.ExitPoint:
            {
                var circle = UmlCircleNodeGeometry.GetCircleBounds(bounds);
                UmlDiagramStyle.DrawStyledEllipse(g, circle, pen);
                break;
            }
            case UmlBehaviorNodeKind.TerminateState:
                UmlCircleNodeGeometry.DrawTerminateStyle(g, bounds, pen);
                break;
            case UmlBehaviorNodeKind.SubmachineState:
                UmlStateNotation.DrawSubmachineState(g, bounds, pen, label);
                break;
            case UmlBehaviorNodeKind.ActivityContainer:
                UmlDiagramStyle.DrawStyledRoundedRect(g, bounds, pen, 18f);
                using (var headerFont = new Font("Segoe UI", 8.5f, FontStyle.Bold))
                    g.DrawString(label, headerFont, textBrush, bounds.Left + 10f, bounds.Top + 8f);
                break;
            case UmlBehaviorNodeKind.DataStore:
                UmlDiagramStyle.DrawStyledRectangle(g, bounds, pen);
                using (var italic = new Font("Segoe UI", 8f, FontStyle.Italic))
                    g.DrawString("«datastore»", italic, textBrush, bounds.Left + 6f, bounds.Top + 4f);
                g.DrawString(label, font, textBrush, bounds.Left + 6f, bounds.Top + 20f);
                break;
            case UmlBehaviorNodeKind.InputPin:
            case UmlBehaviorNodeKind.OutputPin:
                g.FillRectangle(Brushes.White, bounds);
                g.DrawRectangle(pen, bounds.X, bounds.Y, bounds.Width, bounds.Height);
                break;
            case UmlBehaviorNodeKind.ExceptionHandler:
                DrawZigzag(g, bounds, pen);
                g.DrawString(label, font, textBrush, bounds.Left + 4f, bounds.Bottom - 16f);
                break;
            case UmlBehaviorNodeKind.TimingLifeline:
                DrawTimingLifeline(g, bounds, pen, label);
                break;
            case UmlBehaviorNodeKind.TimingState:
                g.FillRectangle(Brushes.White, bounds);
                g.DrawRectangle(pen, bounds.X, bounds.Y, bounds.Width, bounds.Height);
                g.DrawString(label, font, textBrush, bounds.Left + 4f, bounds.Top + (bounds.Height - 14f) / 2f);
                break;
            case UmlBehaviorNodeKind.InteractionUse:
                UmlDiagramStyle.DrawStyledRoundedRect(g, bounds, pen, 14f);
                var refName = string.IsNullOrWhiteSpace(node.ReferencedDiagramName) ? "ref" : $"ref {node.ReferencedDiagramName}";
                g.DrawString(refName, font, textBrush, bounds.Left + 8f, bounds.Top + (bounds.Height - 14f) / 2f);
                break;
        }

    }

    public static void DrawActionLocalConstraints(Graphics g, UmlBehaviorNode node, RectangleF bounds)
    {
        if (node.Kind != UmlBehaviorNodeKind.Action)
            return;

        using var textBrush = new SolidBrush(UmlDiagramStyle.TextColor);
        if (!string.IsNullOrWhiteSpace(node.LocalPrecondition))
        {
            using var small = new Font("Segoe UI", 7f, FontStyle.Italic);
            g.DrawString($"{{localPre: {node.LocalPrecondition}}}", small, textBrush, bounds.Left + 4f, bounds.Bottom - 28f);
        }
        if (!string.IsNullOrWhiteSpace(node.LocalPostcondition))
        {
            using var small = new Font("Segoe UI", 7f, FontStyle.Italic);
            g.DrawString($"{{localPost: {node.LocalPostcondition}}}", small, textBrush, bounds.Left + 4f, bounds.Bottom - 14f);
        }
    }

    public static bool IsExtendedBehaviorKind(UmlBehaviorNodeKind kind) => kind is
        UmlBehaviorNodeKind.NaryAssociationHub or UmlBehaviorNodeKind.StateInvariant or UmlBehaviorNodeKind.Continuation
        or UmlBehaviorNodeKind.CompositeState or UmlBehaviorNodeKind.OrthogonalRegion
        or UmlBehaviorNodeKind.EntryPoint or UmlBehaviorNodeKind.ExitPoint or UmlBehaviorNodeKind.TerminateState
        or UmlBehaviorNodeKind.SubmachineState or UmlBehaviorNodeKind.ActivityContainer or UmlBehaviorNodeKind.DataStore
        or UmlBehaviorNodeKind.InputPin or UmlBehaviorNodeKind.OutputPin or UmlBehaviorNodeKind.ExceptionHandler
        or UmlBehaviorNodeKind.TimingLifeline or UmlBehaviorNodeKind.TimingState or UmlBehaviorNodeKind.InteractionUse;

    public static void DrawTableIconLines(Graphics g, RectangleF bounds, Pen pen)
    {
        var y = bounds.Top + 36f;
        for (var i = 0; i < 3; i++)
        {
            g.DrawLine(pen, bounds.Left + 8f, y, bounds.Right - 8f, y);
            y += 14f;
        }
    }

    public static void DrawClassNestingGeometry(
        Graphics g,
        Pen pen,
        PointF[] pathPoints,
        UmlEdgeRoutingKind routingKind,
        PointF end,
        IReadOnlyList<(float T, PointF Pt)> crossings)
    {
        using var dashed = new Pen(pen.Color, pen.Width) { DashStyle = DashStyle.Dash };
        UmlEdgeRouting.DrawRoutedPathSegment(g, dashed, pathPoints, routingKind, crossings, trimFromEnd: 10f);
        UmlPackageDiagramNotation.DrawNestingSymbol(g, dashed, end);
    }

    private static void DrawDiamondHub(Graphics g, RectangleF bounds, Pen pen)
    {
        var cx = bounds.Left + bounds.Width / 2f;
        var cy = bounds.Top + bounds.Height / 2f;
        var points = new[]
        {
            new PointF(cx, bounds.Top),
            new PointF(bounds.Right, cy),
            new PointF(cx, bounds.Bottom),
            new PointF(bounds.Left, cy),
        };
        using var path = new GraphicsPath();
        path.AddPolygon(points);
        UmlDiagramStyle.FillGradientPath(g, path, bounds);
        g.DrawPolygon(pen, points);
    }

    private static void DrawSemiOval(Graphics g, RectangleF bounds, Pen pen, string label, Font font, Brush brush)
    {
        var arc = new RectangleF(bounds.X, bounds.Y, bounds.Width, bounds.Height * 2f);
        using var path = new GraphicsPath();
        path.AddArc(arc.X, arc.Y, arc.Width, arc.Height, 0, 180);
        path.AddLine(bounds.Right, bounds.Top + bounds.Height / 2f, bounds.Left, bounds.Top + bounds.Height / 2f);
        path.CloseFigure();
        UmlDiagramStyle.FillGradientPath(g, path, bounds);
        g.DrawPath(pen, path);
        g.DrawString(label, font, brush, bounds.Left + 4f, bounds.Top + 2f);
    }

    private static void DrawZigzag(Graphics g, RectangleF bounds, Pen pen)
    {
        var y = bounds.Top + bounds.Height / 2f;
        var step = bounds.Width / 4f;
        var x = bounds.Left;
        var points = new List<PointF> { new(x, y) };
        for (var i = 0; i < 4; i++)
        {
            x += step;
            points.Add(new PointF(x, i % 2 == 0 ? y - 8f : y + 8f));
        }
        g.DrawLines(pen, points.ToArray());
    }

    private static void DrawTimingLifeline(Graphics g, RectangleF bounds, Pen pen, string label)
    {
        using var font = new Font("Segoe UI", 8f);
        using var brush = new SolidBrush(UmlDiagramStyle.TextColor);
        g.DrawString(label, font, brush, bounds.Left + 4f, bounds.Top + 2f);
        g.DrawLine(pen, bounds.Left, bounds.Top + 18f, bounds.Right, bounds.Top + 18f);
        g.DrawLine(pen, bounds.Left, bounds.Top + 18f, bounds.Left, bounds.Bottom);
        g.DrawLine(pen, bounds.Right, bounds.Top + 18f, bounds.Right, bounds.Bottom);
        for (var x = bounds.Left + 40f; x < bounds.Right; x += 40f)
            g.DrawLine(pen, x, bounds.Top + 18f, x, bounds.Bottom);
    }
}
