using System.Drawing.Drawing2D;

namespace SVGEditorWinV10.Serialization;

internal static class SvgViewBoxHelper
{
    public static Matrix CreateViewportMatrix(
        float viewportX,
        float viewportY,
        float viewportWidth,
        float viewportHeight,
        RectangleF viewBox,
        string? preserveAspectRatio)
    {
        var matrix = new Matrix();
        matrix.Translate(viewportX, viewportY);

        if (viewportWidth <= 0f || viewportHeight <= 0f || viewBox.Width <= 0f || viewBox.Height <= 0f)
            return matrix;

        var (scaleX, scaleY, offsetX, offsetY) = ResolveScaling(
            viewBox,
            viewportWidth,
            viewportHeight,
            preserveAspectRatio);

        matrix.Translate(offsetX, offsetY);
        matrix.Scale(scaleX, scaleY);
        matrix.Translate(-viewBox.X, -viewBox.Y);
        return matrix;
    }

    private static (float ScaleX, float ScaleY, float OffsetX, float OffsetY) ResolveScaling(
        RectangleF viewBox,
        float viewportWidth,
        float viewportHeight,
        string? preserveAspectRatio)
    {
        var parts = string.IsNullOrWhiteSpace(preserveAspectRatio)
            ? new[] { "xMidYMid", "meet" }
            : preserveAspectRatio.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        var align = parts.Length > 0 ? parts[0] : "xMidYMid";
        var meetOrSlice = parts.Length > 1 ? parts[1] : "meet";

        var scaleX = viewportWidth / viewBox.Width;
        var scaleY = viewportHeight / viewBox.Height;

        if (align.Equals("none", StringComparison.OrdinalIgnoreCase))
            return (scaleX, scaleY, 0f, 0f);

        var uniform = meetOrSlice.Equals("slice", StringComparison.OrdinalIgnoreCase)
            ? Math.Max(scaleX, scaleY)
            : Math.Min(scaleX, scaleY);

        var scaledWidth = viewBox.Width * uniform;
        var scaledHeight = viewBox.Height * uniform;

        var offsetX = align.Contains("xMax", StringComparison.OrdinalIgnoreCase)
            ? viewportWidth - scaledWidth
            : align.Contains("xMid", StringComparison.OrdinalIgnoreCase)
                ? (viewportWidth - scaledWidth) / 2f
                : 0f;

        var offsetY = align.Contains("YMax", StringComparison.OrdinalIgnoreCase)
            ? viewportHeight - scaledHeight
            : align.Contains("YMid", StringComparison.OrdinalIgnoreCase)
                ? (viewportHeight - scaledHeight) / 2f
                : 0f;

        return (uniform, uniform, offsetX, offsetY);
    }
}
