using MyUML20WinV10.Models;

namespace MyUML20WinV10.Rendering;

public static class UmlSystemBoundaryRenderer
{
    public const float LabelPadding = 8f;

    public static void Draw(Graphics g, string? name, RectangleF bounds, Pen pen, bool selected)
    {
        var top = Color.FromArgb(selected ? 255 : 255, 248, 252, 255);
        var bottom = Color.FromArgb(selected ? 255 : 255, 228, 238, 252);
        UmlDiagramStyle.DrawStyledRectangle(g, bounds, pen, top, bottom);

        var label = string.IsNullOrWhiteSpace(name) ? "System" : name;
        using var font = new Font("Segoe UI", 9f, FontStyle.Bold);
        using var brush = new SolidBrush(UmlDiagramStyle.TextColor);
        g.DrawString(label, font, brush, bounds.Left + LabelPadding, bounds.Top + LabelPadding);
    }

    public static void DrawPreview(Graphics g, RectangleF area, Color stroke)
    {
        var bounds = FitPreviewBounds(area);
        using var pen = new Pen(stroke, 1.8f);
        Draw(g, "System", bounds, pen, selected: false);
    }

    public static RectangleF FitPreviewBounds(RectangleF area)
    {
        var w = area.Width * 0.9f;
        var h = area.Height * 0.82f;
        return new RectangleF(
            area.Left + (area.Width - w) / 2f,
            area.Top + (area.Height - h) / 2f,
            w,
            h);
    }
}
