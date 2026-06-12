using SVGEditorWinV10.Serialization;

namespace SVGEditorWinV10.Rendering;

public static class SvgPathEditHandles
{
    public static PathEditHandle? HitTest(string pathData, PointF point, float handleSize)
    {
        var half = handleSize;
        foreach (var handle in SvgPathCommands.GetEditHandles(pathData))
        {
            var rect = new RectangleF(handle.Point.X - half, handle.Point.Y - half, half * 2, half * 2);
            if (rect.Contains(point))
                return handle;
        }

        return null;
    }

    public static void Draw(Graphics graphics, string pathData, float handleSize)
    {
        using var anchorFill = new SolidBrush(Color.White);
        using var controlFill = new SolidBrush(Color.FromArgb(255, 250, 230));
        using var anchorBorder = new Pen(Color.FromArgb(37, 99, 235), 1f);
        using var controlBorder = new Pen(Color.FromArgb(234, 88, 12), 1f);
        using var guidePen = new Pen(Color.FromArgb(160, 234, 88, 12), 1f)
        {
            DashStyle = System.Drawing.Drawing2D.DashStyle.Dot
        };

        var segments = SvgPathCommands.Parse(pathData);
        for (var i = 0; i < segments.Count; i++)
        {
            var segment = segments[i];
            if (segment.Kind is SvgPathSegmentKind.Line or SvgPathSegmentKind.Quadratic)
            {
                var start = SvgPathCommands.GetSegmentStart(segments, i);
                var control = segment.Kind == SvgPathSegmentKind.Line
                    ? SvgPathCommands.GetDefaultCurveControl(segments, i)
                    : SvgPathCommands.GetQuadraticMidpoint(start, segment.Control1, segment.End);
                graphics.DrawLine(guidePen, start.X, start.Y, control.X, control.Y);
                graphics.DrawLine(guidePen, control.X, control.Y, segment.End.X, segment.End.Y);
            }
            else if (segment.Kind == SvgPathSegmentKind.Cubic)
            {
                var start = SvgPathCommands.GetSegmentStart(segments, i);
                graphics.DrawLine(guidePen, start.X, start.Y, segment.Control1.X, segment.Control1.Y);
                graphics.DrawLine(guidePen, segment.End.X, segment.End.Y, segment.Control2.X, segment.Control2.Y);
            }
        }

        foreach (var handle in SvgPathCommands.GetEditHandles(pathData))
        {
            var half = handleSize;
            var rect = new RectangleF(handle.Point.X - half, handle.Point.Y - half, half * 2, half * 2);
            var isControl = handle.Role != PathEditHandleRole.Anchor;
            graphics.FillEllipse(isControl ? controlFill : anchorFill, rect);
            graphics.DrawEllipse(isControl ? controlBorder : anchorBorder, rect);
        }
    }
}
