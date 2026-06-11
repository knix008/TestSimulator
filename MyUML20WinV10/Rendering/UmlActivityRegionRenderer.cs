using System.Drawing.Drawing2D;
using MyUML20WinV10.Models;

namespace MyUML20WinV10.Rendering;

public static class UmlActivityRegionRenderer
{
    public const float TabHeight = 16f;

    public static bool IsExpansionRegion(UmlBehaviorNode node) =>
        node.Kind == UmlBehaviorNodeKind.ExpansionRegion;

    public static bool IsInterruptibleRegion(UmlBehaviorNode node) =>
        node.Kind == UmlBehaviorNodeKind.InterruptibleRegion;

    public static string GetExpansionLabel(UmlBehaviorNode node)
    {
        var kind = node.ExpansionKind?.ToString().ToLowerInvariant() ?? "iterative";
        return string.IsNullOrWhiteSpace(node.Name) ? kind : $"{kind}\n{node.Name}";
    }

    public static void DrawExpansionRegion(Graphics g, UmlBehaviorNode node, RectangleF bounds, Pen pen, bool selected)
    {
        var label = GetExpansionLabel(node);
        using var font = new Font("Segoe UI", 8f, FontStyle.Bold);
        var labelSize = g.MeasureString(label.Split('\n')[0], font);
        var tabHeight = Math.Max(TabHeight, labelSize.Height + 4f);
        var tabWidth = Math.Min(bounds.Width - 8f, labelSize.Width + 14f);

        DrawFrame(g, bounds, pen, tabHeight, tabWidth, dashed: false);
        using var textBrush = new SolidBrush(UmlDiagramStyle.TextColor);
        g.DrawString(label.Split('\n')[0], font, textBrush, bounds.Left + 7f, bounds.Top + (tabHeight - labelSize.Height) / 2f);

        if (label.Contains('\n'))
        {
            using var nameFont = new Font("Segoe UI", 8f);
            g.DrawString(node.Name, nameFont, textBrush, bounds.Left + 8f, bounds.Top + tabHeight + 6f);
        }
    }

    public static void DrawInterruptibleRegion(Graphics g, UmlBehaviorNode node, RectangleF bounds, Pen pen, bool selected)
    {
        var label = string.IsNullOrWhiteSpace(node.Name) ? "interruptible" : node.Name;
        using var font = new Font("Segoe UI", 8f, FontStyle.Italic);
        var labelSize = g.MeasureString(label, font);
        var tabHeight = Math.Max(TabHeight, labelSize.Height + 4f);
        var tabWidth = Math.Min(bounds.Width - 8f, labelSize.Width + 14f);

        DrawFrame(g, bounds, pen, tabHeight, tabWidth, dashed: true);
        using var textBrush = new SolidBrush(UmlDiagramStyle.TextColor);
        g.DrawString(label, font, textBrush, bounds.Left + 7f, bounds.Top + (tabHeight - labelSize.Height) / 2f);
    }

    public static void DrawPreview(Graphics g, RectangleF bounds, Pen pen, bool expansion)
    {
        var tabHeight = Math.Max(TabHeight, bounds.Height * 0.12f);
        var tabWidth = Math.Min(bounds.Width - 8f, bounds.Width * 0.4f);
        DrawFrame(g, bounds, pen, tabHeight, tabWidth, dashed: !expansion);
        using var font = new Font("Segoe UI", 6.5f, FontStyle.Bold);
        using var brush = new SolidBrush(UmlDiagramStyle.TextColor);
        g.DrawString(expansion ? "iterative" : "interruptible", font, brush, bounds.Left + 6f, bounds.Top + 3f);
    }

    public static void AppendFramePath(GraphicsPath path, RectangleF bounds, float tabHeight, float tabWidth)
    {
        var left = bounds.Left;
        var top = bounds.Top;
        var right = bounds.Right;
        var bottom = bounds.Bottom;
        var bodyTop = top + tabHeight;

        path.StartFigure();
        path.AddLine(left, bodyTop, left, top);
        path.AddLine(left, top, left + tabWidth, top);
        path.AddLine(left + tabWidth, top, left + tabWidth, bodyTop);
        path.AddLine(left + tabWidth, bodyTop, right, bodyTop);
        path.AddLine(right, bodyTop, right, bottom);
        path.AddLine(right, bottom, left, bottom);
        path.CloseFigure();
    }

    private static void DrawFrame(Graphics g, RectangleF bounds, Pen pen, float tabHeight, float tabWidth, bool dashed)
    {
        using var path = new GraphicsPath();
        AppendFramePath(path, bounds, tabHeight, tabWidth);
        UmlDiagramStyle.FillGradientPath(g, path, bounds);
        using var framePen = new Pen(pen.Color, pen.Width)
        {
            DashStyle = dashed ? DashStyle.Dash : DashStyle.Solid,
        };
        g.DrawPath(framePen, path);
    }
}
