using System.Drawing.Drawing2D;
using MyUML20WinV10.Models;

namespace MyUML20WinV10.Rendering;

public static class UmlStateNotation
{
    public const float CornerRadius = 12f;

    public static void DrawCompositeState(Graphics g, RectangleF bounds, Pen pen, string? label = null)
    {
        UmlDiagramStyle.DrawStyledRoundedRect(g, bounds, pen, CornerRadius);
        if (!string.IsNullOrWhiteSpace(label))
        {
            using var font = new Font("Segoe UI", 8f);
            using var brush = new SolidBrush(UmlDiagramStyle.TextColor);
            g.DrawString(label, font, brush, bounds.Left + 6f, bounds.Top + 5f);
        }

        using var innerPen = new Pen(pen.Color, 1f) { DashStyle = DashStyle.Dash };
        var inset = GetCompositeInset(bounds);
        g.DrawRectangle(innerPen, inset.X, inset.Y, inset.Width, inset.Height);
    }

    public static void DrawOrthogonalRegion(Graphics g, RectangleF bounds, Pen pen, string? label = null)
    {
        UmlDiagramStyle.DrawStyledRoundedRect(g, bounds, pen, CornerRadius);
        if (!string.IsNullOrWhiteSpace(label))
        {
            using var font = new Font("Segoe UI", 8f);
            using var brush = new SolidBrush(UmlDiagramStyle.TextColor);
            g.DrawString(label, font, brush, bounds.Left + 6f, bounds.Top + 5f);
        }

        var dividerX = bounds.Left + bounds.Width / 2f;
        g.DrawLine(pen, dividerX, bounds.Top + 18f, dividerX, bounds.Bottom - 5f);
    }

    public static void DrawSubmachineState(Graphics g, RectangleF bounds, Pen pen, string? label = null)
    {
        UmlDiagramStyle.DrawStyledRoundedRect(g, bounds, pen, CornerRadius);
        using var textBrush = new SolidBrush(UmlDiagramStyle.TextColor);
        using var stereoFont = new Font("Segoe UI", 7f, FontStyle.Italic);
        using var nameFont = new Font("Segoe UI", 8f, FontStyle.Bold);
        g.DrawString("«submachine»", stereoFont, textBrush, bounds.Left + 6f, bounds.Top + 4f);
        if (!string.IsNullOrWhiteSpace(label))
            g.DrawString(label, nameFont, textBrush, bounds.Left + 6f, bounds.Top + 18f);
    }

    public static void AddCompositeStatePath(GraphicsPath path, RectangleF bounds)
    {
        path.AddPath(CreateRoundedPath(bounds, CornerRadius), connect: false);
        var inset = GetCompositeInset(bounds);
        path.AddRectangle(inset);
    }

    public static void AddOrthogonalRegionPath(GraphicsPath path, RectangleF bounds)
    {
        path.AddPath(CreateRoundedPath(bounds, CornerRadius), connect: false);
        var dividerX = bounds.Left + bounds.Width / 2f;
        path.AddLine(dividerX, bounds.Top + 18f, dividerX, bounds.Bottom - 5f);
    }

    public static void AddSubmachineStatePath(GraphicsPath path, RectangleF bounds) =>
        path.AddPath(CreateRoundedPath(bounds, CornerRadius), connect: false);

    public static void AddRoundedStatePath(GraphicsPath path, RectangleF bounds, float radius = CornerRadius) =>
        path.AddPath(CreateRoundedPath(bounds, radius), connect: false);

    public static void DrawCompositePreview(Graphics g, RectangleF area, Color stroke)
    {
        var bounds = FitPreviewBounds(area);
        using var pen = new Pen(stroke, UmlDiagramStyle.PreviewPenWidth);
        DrawCompositeState(g, bounds, pen);
    }

    public static void DrawOrthogonalPreview(Graphics g, RectangleF area, Color stroke)
    {
        var bounds = FitPreviewBounds(area);
        using var pen = new Pen(stroke, UmlDiagramStyle.PreviewPenWidth);
        DrawOrthogonalRegion(g, bounds, pen);
    }

    public static void DrawSubmachinePreview(Graphics g, RectangleF area, Color stroke)
    {
        var bounds = FitPreviewBounds(area);
        using var pen = new Pen(stroke, UmlDiagramStyle.PreviewPenWidth);
        DrawSubmachineState(g, bounds, pen, "State");
    }

    public static void DrawCompositeGhost(Graphics g, RectangleF rect, Color fill, Color stroke)
    {
        using var pen = new Pen(stroke, 1.4f);
        using var fillBrush = new SolidBrush(fill);
        using var path = CreateRoundedPath(rect, CornerRadius);
        g.FillPath(fillBrush, path);
        g.DrawPath(pen, path);
        using var innerPen = new Pen(stroke, 1f) { DashStyle = DashStyle.Dash };
        var inset = GetCompositeInset(rect);
        g.DrawRectangle(innerPen, inset.X, inset.Y, inset.Width, inset.Height);
    }

    public static void DrawOrthogonalGhost(Graphics g, RectangleF rect, Color fill, Color stroke)
    {
        using var pen = new Pen(stroke, 1.4f);
        using var fillBrush = new SolidBrush(fill);
        using var path = CreateRoundedPath(rect, CornerRadius);
        g.FillPath(fillBrush, path);
        g.DrawPath(pen, path);
        var dividerX = rect.Left + rect.Width / 2f;
        g.DrawLine(pen, dividerX, rect.Top + 18f, dividerX, rect.Bottom - 5f);
    }

    public static void DrawSubmachineGhost(Graphics g, RectangleF rect, Color fill, Color stroke)
    {
        using var pen = new Pen(stroke, 1.4f);
        using var fillBrush = new SolidBrush(fill);
        using var path = CreateRoundedPath(rect, CornerRadius);
        g.FillPath(fillBrush, path);
        g.DrawPath(pen, path);
        using var stereoFont = new Font("Segoe UI", 7f, FontStyle.Italic);
        using var brush = new SolidBrush(UmlDiagramStyle.TextColor);
        g.DrawString("«submachine»", stereoFont, brush, rect.Left + 6f, rect.Top + 4f);
    }

    private static RectangleF GetCompositeInset(RectangleF bounds) =>
        new(bounds.X + 8f, bounds.Y + 20f, Math.Max(12f, bounds.Width - 16f), Math.Max(12f, bounds.Height - 28f));

    private static RectangleF FitPreviewBounds(RectangleF area)
    {
        var w = area.Width * 0.88f;
        var h = area.Height * 0.78f;
        return new RectangleF(
            area.Left + (area.Width - w) / 2f,
            area.Top + (area.Height - h) / 2f,
            w,
            h);
    }

    private static GraphicsPath CreateRoundedPath(RectangleF bounds, float radius)
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
}
