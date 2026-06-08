namespace CodeAnalyzer.Controls;

internal static class DiagramEdgeLabelPlacer
{
    private const float PadX = 5f;
    private const float PadY = 3f;

    public static SizeF MeasureLabel(Graphics graphics, string label, Font font)
    {
        var textSize = graphics.MeasureString(label, font, int.MaxValue, StringFormat.GenericTypographic);
        return new SizeF(textSize.Width + PadX * 2, textSize.Height + PadY * 2);
    }

    public static PointF FindPosition(
        IReadOnlyList<Point> route,
        SizeF labelSize,
        IList<RectangleF> occupied)
    {
        if (route.Count < 2)
        {
            var fallback = route.Count == 1 ? route[0] : Point.Empty;
            return new PointF(fallback.X, fallback.Y);
        }

        var bestIndex = 0;
        var bestLength = 0f;
        for (var i = 0; i < route.Count - 1; i++)
        {
            var length = SegmentLength(route[i], route[i + 1]);
            if (length > bestLength)
            {
                bestLength = length;
                bestIndex = i;
            }
        }

        var start = route[bestIndex];
        var end = route[bestIndex + 1];
        var center = new PointF((start.X + end.X) / 2f, (start.Y + end.Y) / 2f);
        var dx = end.X - start.X;
        var dy = end.Y - start.Y;
        var lengthSegment = MathF.Sqrt(dx * dx + dy * dy);
        if (lengthSegment < 1f)
        {
            return new PointF(center.X - labelSize.Width / 2f, center.Y - labelSize.Height / 2f);
        }

        var perpX = -dy / lengthSegment;
        var perpY = dx / lengthSegment;

        for (var offset = 0; offset <= 40; offset += 8)
        {
            foreach (var sign in new[] { -1, 1 })
            {
                if (offset == 0 && sign < 0)
                {
                    continue;
                }

                var candidate = new PointF(
                    center.X + perpX * offset * sign - labelSize.Width / 2f,
                    center.Y + perpY * offset * sign - labelSize.Height / 2f);
                var bounds = new RectangleF(candidate, labelSize);
                if (!OverlapsAny(bounds, occupied))
                {
                    occupied.Add(bounds);
                    return candidate;
                }
            }
        }

        var fallbackBounds = new RectangleF(
            center.X - labelSize.Width / 2f,
            center.Y - labelSize.Height / 2f,
            labelSize.Width,
            labelSize.Height);
        occupied.Add(fallbackBounds);
        return fallbackBounds.Location;
    }

    public static void DrawLabel(
        Graphics graphics,
        string label,
        Font font,
        Brush textBrush,
        PointF position)
    {
        var labelSize = MeasureLabel(graphics, label, font);
        var bounds = new RectangleF(position, labelSize);
        using var background = new SolidBrush(Color.FromArgb(245, 248, 252));
        using var border = new Pen(Color.FromArgb(210, 220, 235));
        graphics.FillRectangle(background, bounds);
        graphics.DrawRectangle(border, bounds.X, bounds.Y, bounds.Width, bounds.Height);
        graphics.DrawString(
            label,
            font,
            textBrush,
            position.X + PadX,
            position.Y + PadY,
            StringFormat.GenericTypographic);
    }

    private static float SegmentLength(Point a, Point b)
    {
        var dx = b.X - a.X;
        var dy = b.Y - a.Y;
        return MathF.Sqrt(dx * dx + dy * dy);
    }

    private static bool OverlapsAny(RectangleF candidate, IEnumerable<RectangleF> occupied)
    {
        var expanded = RectangleF.Inflate(candidate, 2f, 2f);
        return occupied.Any(existing => existing.IntersectsWith(expanded));
    }
}
