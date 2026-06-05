using System.Drawing.Imaging;
using MyDiagramWinV10.Models;
using MyDiagramWinV10.Rendering;

namespace MyDiagramWinV10.Export;

public static class DiagramExporter
{
    public const string ImageFilter = "PNG 이미지 (*.png)|*.png|JPEG 이미지 (*.jpg;*.jpeg)|*.jpg;*.jpeg|BMP 이미지 (*.bmp)|*.bmp";

    public static void ExportToImage(DiagramProject project, string path, ImageFormat format, Size? size = null)
    {
        var bounds = CalculateBounds(project);
        if (bounds.Width <= 0 || bounds.Height <= 0)
            bounds = new RectangleF(0, 0, 800, 600);

        var padding = 40f;
        var exportSize = size ?? new Size(
            (int)Math.Ceiling(bounds.Width + padding * 2),
            (int)Math.Ceiling(bounds.Height + padding * 2));

        using var bitmap = new Bitmap(Math.Max(1, exportSize.Width), Math.Max(1, exportSize.Height));
        using var graphics = Graphics.FromImage(bitmap);
        graphics.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
        graphics.Clear(Color.FromArgb(project.CanvasBackColorArgb));

        var offset = new PointF(padding - bounds.Left, padding - bounds.Top);
        foreach (var connector in project.Connectors)
        {
            var source = project.Shapes.FirstOrDefault(s => s.Id == connector.SourceShapeId);
            var target = project.Shapes.FirstOrDefault(s => s.Id == connector.TargetShapeId);
            if (source is null || target is null)
                continue;

            DiagramRenderer.DrawConnector(graphics, connector, source, target, offset);
        }

        foreach (var shape in project.Shapes)
            DiagramRenderer.DrawShape(graphics, shape, offset, selected: false);

        bitmap.Save(path, format);
    }

    public static RectangleF CalculateBounds(DiagramProject project)
    {
        if (project.Shapes.Count == 0)
            return RectangleF.Empty;

        float left = float.MaxValue;
        float top = float.MaxValue;
        float right = float.MinValue;
        float bottom = float.MinValue;

        foreach (var shape in project.Shapes)
        {
            var bounds = shape.Bounds;
            left = Math.Min(left, bounds.Left);
            top = Math.Min(top, bounds.Top);
            right = Math.Max(right, bounds.Right);
            bottom = Math.Max(bottom, bounds.Bottom);
        }

        return RectangleF.FromLTRB(left, top, right, bottom);
    }
}
