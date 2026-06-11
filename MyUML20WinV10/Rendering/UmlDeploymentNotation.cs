using System.Drawing.Drawing2D;
using MyUML20WinV10.Models;

namespace MyUML20WinV10.Rendering;

public static class UmlDeploymentNotation
{
    public const float TabHeight = 16f;
    public const float DepthOffset = 10f;

    public static void DrawHost(Graphics g, RectangleF bounds, UmlDeploymentHost host, Pen pen)
    {
        Draw3DBox(g, bounds, pen, host.Name, tabLabel: null);
    }

    public static void DrawArtifact(Graphics g, RectangleF bounds, UmlArtifact artifact, Pen pen)
    {
        var tab = artifact.IsInstance ? "«instance»" : "«artifact»";
        Draw3DBox(g, bounds, pen, artifact.Name, tabLabel: tab);
    }

    public static void DrawDeploymentLinkGeometry(
        Graphics g,
        Pen pen,
        PointF[] pathPoints,
        UmlEdgeRoutingKind routingKind,
        IReadOnlyList<(float T, PointF Pt)> crossings)
    {
        pen = new Pen(pen.Color, pen.Width) { DashStyle = DashStyle.Dash };
        UmlEdgeRouting.DrawRoutedPathSegment(g, pen, pathPoints, routingKind, crossings, trimFromEnd: 12f);
        var end = pathPoints[^1];
        var prev = pathPoints.Length > 1 ? pathPoints[^2] : end;
        DrawOpenArrow(g, pen, prev, end);
        pen.Dispose();
    }

    public static void DrawDeploymentPathGeometry(
        Graphics g,
        Pen pen,
        PointF[] pathPoints,
        UmlEdgeRoutingKind routingKind,
        IReadOnlyList<(float T, PointF Pt)> crossings)
    {
        UmlEdgeRouting.DrawRoutedPathSegment(g, pen, pathPoints, routingKind, crossings, trimFromEnd: 0f);
    }

    public static void DrawHostPreview(Graphics g, RectangleF bounds, Pen pen) =>
        Draw3DBox(g, bounds, pen, "Node", tabLabel: null);

    public static void DrawArtifactPreview(Graphics g, RectangleF bounds, Pen pen) =>
        Draw3DBox(g, bounds, pen, "artifact.war", tabLabel: "«artifact»");

    public static void AddHostSilhouettePath(GraphicsPath path, RectangleF bounds) =>
        path.AddRectangle(bounds);

    public static void AddArtifactSilhouettePath(GraphicsPath path, RectangleF bounds) =>
        path.AddRectangle(bounds);

    private static void Draw3DBox(Graphics g, RectangleF bounds, Pen pen, string label, string? tabLabel)
    {
        var front = bounds;
        var back = new RectangleF(bounds.X + DepthOffset, bounds.Y - DepthOffset, bounds.Width, bounds.Height);

        using var fillBack = new SolidBrush(Color.FromArgb(235, 238, 245));
        using var fillFront = new SolidBrush(Color.FromArgb(248, 250, 255));
        g.FillRectangle(fillBack, back.X, back.Y, back.Width, back.Height);
        g.DrawRectangle(pen, back.X, back.Y, back.Width, back.Height);

        if (!string.IsNullOrWhiteSpace(tabLabel))
        {
            var tab = new RectangleF(front.X, front.Y - TabHeight + 2f, Math.Min(front.Width * 0.55f, 72f), TabHeight);
            g.FillRectangle(fillFront, tab.X, tab.Y, tab.Width, tab.Height);
            g.DrawRectangle(pen, tab.X, tab.Y, tab.Width, tab.Height);
            using var tabFont = new Font("Segoe UI", 7f, FontStyle.Italic);
            using var brush = new SolidBrush(UmlDiagramStyle.TextColor);
            g.DrawString(tabLabel, tabFont, brush, tab.X + 4f, tab.Y + 2f);
        }

        g.FillRectangle(fillFront, front.X, front.Y, front.Width, front.Height);
        g.DrawRectangle(pen, front.X, front.Y, front.Width, front.Height);

        g.DrawLine(pen, front.Left, front.Top, back.Left, back.Top);
        g.DrawLine(pen, front.Right, front.Top, back.Right, back.Top);
        g.DrawLine(pen, front.Right, front.Bottom, back.Right, back.Bottom);

        using var labelFont = new Font("Segoe UI", 8.5f);
        using var textBrush = new SolidBrush(UmlDiagramStyle.TextColor);
        using var fmt = new StringFormat
        {
            Alignment = StringAlignment.Center,
            LineAlignment = StringAlignment.Center,
            Trimming = StringTrimming.EllipsisCharacter,
        };
        g.DrawString(label, labelFont, textBrush, front, fmt);
    }

    private static void DrawOpenArrow(Graphics g, Pen pen, PointF from, PointF to)
    {
        var angle = Math.Atan2(to.Y - from.Y, to.X - from.X);
        const float len = 10f;
        const float wing = 5f;
        var p1 = new PointF(
            (float)(to.X - len * Math.Cos(angle) + wing * Math.Sin(angle)),
            (float)(to.Y - len * Math.Sin(angle) - wing * Math.Cos(angle)));
        var p2 = new PointF(
            (float)(to.X - len * Math.Cos(angle) - wing * Math.Sin(angle)),
            (float)(to.Y - len * Math.Sin(angle) + wing * Math.Cos(angle)));
        g.DrawLine(pen, to, p1);
        g.DrawLine(pen, to, p2);
    }
}
