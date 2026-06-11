using System.Drawing.Drawing2D;
using MyUML20WinV10.Models;

namespace MyUML20WinV10.Rendering;

public static class UmlObjectNotation
{
    public static float MeasureHeight(string name, string typeName, float width) =>
        Math.Max(40f, 24f + 8f);

    public static void Draw(Graphics g, RectangleF bounds, UmlObjectInstance instance, Pen pen)
    {
        UmlDiagramStyle.DrawStyledRectangle(g, bounds, pen);

        var name = string.IsNullOrWhiteSpace(instance.Name) ? "obj" : instance.Name;
        var typeName = string.IsNullOrWhiteSpace(instance.TypeName) ? "Class" : instance.TypeName;
        var label = $"{name} : {typeName}";

        using var textBrush = new SolidBrush(UmlDiagramStyle.TextColor);
        using var font = new Font("Segoe UI", 9f);
        using var underlineFont = new Font("Segoe UI", 9f, FontStyle.Underline);
        using var fmt = new StringFormat
        {
            Alignment = StringAlignment.Center,
            LineAlignment = StringAlignment.Center,
            Trimming = StringTrimming.EllipsisCharacter,
        };

        var nameSize = g.MeasureString(name, underlineFont);
        var sepSize = g.MeasureString(" : ", font);
        var typeSize = g.MeasureString(typeName, font);
        var totalW = nameSize.Width + sepSize.Width + typeSize.Width;
        var startX = bounds.Left + (bounds.Width - totalW) / 2f;
        var y = bounds.Top + (bounds.Height - nameSize.Height) / 2f;

        g.DrawString(name, underlineFont, textBrush, startX, y);
        g.DrawString(" : ", font, textBrush, startX + nameSize.Width, y);
        g.DrawString(typeName, font, textBrush, startX + nameSize.Width + sepSize.Width, y);
    }

    public static void DrawPreview(Graphics g, RectangleF bounds, Pen pen)
    {
        UmlDiagramStyle.DrawStyledRectangle(g, bounds, pen);
        using var textBrush = new SolidBrush(UmlDiagramStyle.TextColor);
        using var font = new Font("Segoe UI", Math.Max(5f, bounds.Height * 0.18f));
        using var underlineFont = new Font(font.FontFamily, font.Size, FontStyle.Underline);
        var y = bounds.Top + bounds.Height * 0.38f;
        g.DrawString("obj", underlineFont, textBrush, bounds.Left + 8f, y);
        g.DrawString(" : Class", font, textBrush, bounds.Left + 8f + g.MeasureString("obj", underlineFont).Width, y);
    }

    public static void AddSilhouettePath(GraphicsPath path, RectangleF bounds) =>
        path.AddRectangle(bounds);
}
