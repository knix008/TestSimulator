namespace SVGEditorWinV10.Ui;

/// <summary>
/// Canvas-only alignment grid. Drawn on the editor background and never saved to SVG or exported images.
/// </summary>
public static class EditorCanvasGrid
{
    public const int MinorGrid = 20;
    public const int MajorGrid = 100;

    public static float Snap(float value) =>
        MathF.Round(value / MinorGrid) * MinorGrid;

    public static PointF SnapPoint(PointF point) =>
        new(Snap(point.X), Snap(point.Y));

    public static void Draw(
        Graphics g,
        float zoom,
        float scrollX,
        float scrollY,
        Size viewport,
        float pageWidth,
        float pageHeight)
    {
        var visLeft = Math.Max(0f, scrollX / zoom);
        var visTop = Math.Max(0f, scrollY / zoom);
        var visRight = Math.Min(pageWidth, visLeft + viewport.Width / zoom);
        var visBottom = Math.Min(pageHeight, visTop + viewport.Height / zoom);

        if (visRight <= visLeft || visBottom <= visTop)
            return;

        var state = g.Save();
        g.SetClip(new RectangleF(0, 0, pageWidth, pageHeight));

        var xMinor0 = (int)(Math.Floor(visLeft / MinorGrid) * MinorGrid);
        var yMinor0 = (int)(Math.Floor(visTop / MinorGrid) * MinorGrid);
        var xMajor0 = (int)(Math.Floor(visLeft / MajorGrid) * MajorGrid);
        var yMajor0 = (int)(Math.Floor(visTop / MajorGrid) * MajorGrid);

        using var minorPen = new Pen(Color.FromArgb(28, 0, 0, 0), 1f / zoom);
        using var majorPen = new Pen(Color.FromArgb(52, 0, 0, 0), 1.2f / zoom);
        using var axisPen = new Pen(Color.FromArgb(70, 37, 99, 235), 1f / zoom);

        for (var x = xMinor0; x <= visRight; x += MinorGrid)
            g.DrawLine(minorPen, x, visTop, x, visBottom);
        for (var y = yMinor0; y <= visBottom; y += MinorGrid)
            g.DrawLine(minorPen, visLeft, y, visRight, y);

        for (var x = xMajor0; x <= visRight; x += MajorGrid)
            g.DrawLine(majorPen, x, visTop, x, visBottom);
        for (var y = yMajor0; y <= visBottom; y += MajorGrid)
            g.DrawLine(majorPen, visLeft, y, visRight, y);

        g.DrawLine(axisPen, 0, visTop, 0, visBottom);
        g.DrawLine(axisPen, visLeft, 0, visRight, 0);

        var fontSize = Math.Clamp(9f / zoom, 6f, 11f);
        using var font = new Font("Segoe UI", fontSize, FontStyle.Regular, GraphicsUnit.Point);
        using var textBrush = new SolidBrush(Color.FromArgb(130, 0, 0, 0));
        var labelOffset = 2f / zoom;

        for (var x = xMajor0; x <= visRight; x += MajorGrid)
        {
            if (x > 0)
                g.DrawString(x.ToString(), font, textBrush, x + labelOffset, labelOffset);
        }

        for (var y = yMajor0; y <= visBottom; y += MajorGrid)
        {
            if (y > 0)
                g.DrawString(y.ToString(), font, textBrush, labelOffset, y + labelOffset);
        }

        g.Restore(state);
    }
}
