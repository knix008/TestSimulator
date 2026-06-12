using System.Drawing.Drawing2D;
using System.Globalization;
using System.Text;

namespace SVGEditorWinV10.Serialization;

public enum SvgPathSegmentKind
{
    Move,
    Line,
    Quadratic,
    Cubic,
    Close
}

public sealed class SvgPathSegment
{
    public SvgPathSegmentKind Kind { get; init; }
    public PointF End { get; set; }
    public PointF Control1 { get; set; }
    public PointF Control2 { get; set; }
}

public enum PathEditHandleRole
{
    Anchor,
    Control1,
    Control2
}

public readonly struct PathEditHandle
{
    public PathEditHandle(int segmentIndex, PathEditHandleRole role, PointF point)
    {
        SegmentIndex = segmentIndex;
        Role = role;
        Point = point;
    }

    public int SegmentIndex { get; }
    public PathEditHandleRole Role { get; }
    public PointF Point { get; }
}

public static class SvgPathCommands
{
    public static List<SvgPathSegment> Parse(string pathData)
    {
        var segments = new List<SvgPathSegment>();
        if (string.IsNullOrWhiteSpace(pathData))
            return segments;

        var tokens = SvgPathParser.Tokenize(pathData);
        var index = 0;
        PointF current = default;
        PointF start = default;
        char? currentCommand = null;
        var relative = false;

        while (index < tokens.Count)
        {
            if (tokens[index] is char command)
            {
                currentCommand = char.ToUpperInvariant(command);
                relative = char.IsLower(command);
                index++;
            }
            else if (currentCommand is null)
            {
                index++;
                continue;
            }

            switch (currentCommand)
            {
                case 'M':
                {
                    var point = ReadPoint(tokens, ref index, relative, current);
                    start = current = point;
                    segments.Add(new SvgPathSegment { Kind = SvgPathSegmentKind.Move, End = point });
                    while (index < tokens.Count && tokens[index] is not char)
                    {
                        point = ReadPoint(tokens, ref index, relative, current);
                        segments.Add(new SvgPathSegment { Kind = SvgPathSegmentKind.Line, End = point });
                        current = point;
                    }
                    break;
                }
                case 'L':
                    while (index < tokens.Count && tokens[index] is not char)
                    {
                        var point = ReadPoint(tokens, ref index, relative, current);
                        segments.Add(new SvgPathSegment { Kind = SvgPathSegmentKind.Line, End = point });
                        current = point;
                    }
                    break;
                case 'H':
                    while (index < tokens.Count && tokens[index] is not char)
                    {
                        var x = ReadNumber(tokens, ref index);
                        if (relative)
                            x += current.X;
                        var point = new PointF(x, current.Y);
                        segments.Add(new SvgPathSegment { Kind = SvgPathSegmentKind.Line, End = point });
                        current = point;
                    }
                    break;
                case 'V':
                    while (index < tokens.Count && tokens[index] is not char)
                    {
                        var y = ReadNumber(tokens, ref index);
                        if (relative)
                            y += current.Y;
                        var point = new PointF(current.X, y);
                        segments.Add(new SvgPathSegment { Kind = SvgPathSegmentKind.Line, End = point });
                        current = point;
                    }
                    break;
                case 'C':
                    while (index < tokens.Count && tokens[index] is not char)
                    {
                        var c1 = ReadPoint(tokens, ref index, relative, current);
                        var c2 = ReadPoint(tokens, ref index, relative, current);
                        var end = ReadPoint(tokens, ref index, relative, current);
                        segments.Add(new SvgPathSegment
                        {
                            Kind = SvgPathSegmentKind.Cubic,
                            Control1 = c1,
                            Control2 = c2,
                            End = end
                        });
                        current = end;
                    }
                    break;
                case 'S':
                    while (index < tokens.Count && tokens[index] is not char)
                    {
                        var c2 = ReadPoint(tokens, ref index, relative, current);
                        var end = ReadPoint(tokens, ref index, relative, current);
                        var c1 = ReflectLastCubic(segments, current);
                        segments.Add(new SvgPathSegment
                        {
                            Kind = SvgPathSegmentKind.Cubic,
                            Control1 = c1,
                            Control2 = c2,
                            End = end
                        });
                        current = end;
                    }
                    break;
                case 'Q':
                    while (index < tokens.Count && tokens[index] is not char)
                    {
                        var c1 = ReadPoint(tokens, ref index, relative, current);
                        var end = ReadPoint(tokens, ref index, relative, current);
                        segments.Add(new SvgPathSegment
                        {
                            Kind = SvgPathSegmentKind.Quadratic,
                            Control1 = c1,
                            End = end
                        });
                        current = end;
                    }
                    break;
                case 'T':
                    while (index < tokens.Count && tokens[index] is not char)
                    {
                        var end = ReadPoint(tokens, ref index, relative, current);
                        var c1 = ReflectLastQuadratic(segments, current);
                        segments.Add(new SvgPathSegment
                        {
                            Kind = SvgPathSegmentKind.Quadratic,
                            Control1 = c1,
                            End = end
                        });
                        current = end;
                    }
                    break;
                case 'A':
                    while (index < tokens.Count && tokens[index] is not char)
                    {
                        _ = ReadNumber(tokens, ref index);
                        _ = ReadNumber(tokens, ref index);
                        _ = ReadNumber(tokens, ref index);
                        _ = ReadNumber(tokens, ref index);
                        _ = ReadNumber(tokens, ref index);
                        var end = ReadPoint(tokens, ref index, relative, current);
                        segments.Add(new SvgPathSegment { Kind = SvgPathSegmentKind.Line, End = end });
                        current = end;
                    }
                    break;
                case 'Z':
                    segments.Add(new SvgPathSegment { Kind = SvgPathSegmentKind.Close, End = start });
                    current = start;
                    break;
                default:
                    index++;
                    break;
            }
        }

        return segments;
    }

    public static string ToPathData(IReadOnlyList<SvgPathSegment> segments)
    {
        if (segments.Count == 0)
            return string.Empty;

        var sb = new StringBuilder();
        for (var i = 0; i < segments.Count; i++)
        {
            var segment = segments[i];
            switch (segment.Kind)
            {
                case SvgPathSegmentKind.Move:
                    sb.Append(CultureInfo.InvariantCulture, $"M {segment.End.X:0.##} {segment.End.Y:0.##}");
                    break;
                case SvgPathSegmentKind.Line:
                    sb.Append(CultureInfo.InvariantCulture, $" L {segment.End.X:0.##} {segment.End.Y:0.##}");
                    break;
                case SvgPathSegmentKind.Quadratic:
                    sb.Append(CultureInfo.InvariantCulture,
                        $" Q {segment.Control1.X:0.##} {segment.Control1.Y:0.##} {segment.End.X:0.##} {segment.End.Y:0.##}");
                    break;
                case SvgPathSegmentKind.Cubic:
                    sb.Append(CultureInfo.InvariantCulture,
                        $" C {segment.Control1.X:0.##} {segment.Control1.Y:0.##} {segment.Control2.X:0.##} {segment.Control2.Y:0.##} {segment.End.X:0.##} {segment.End.Y:0.##}");
                    break;
                case SvgPathSegmentKind.Close:
                    sb.Append(" Z");
                    break;
            }
        }

        return sb.ToString();
    }

    public static string Translate(string pathData, PointF delta)
    {
        var segments = Parse(pathData);
        foreach (var segment in segments)
        {
            if (segment.Kind == SvgPathSegmentKind.Close)
                continue;

            segment.End = TransformPoint(segment.End, delta);
            if (segment.Kind is SvgPathSegmentKind.Quadratic or SvgPathSegmentKind.Cubic)
                segment.Control1 = TransformPoint(segment.Control1, delta);
            if (segment.Kind == SvgPathSegmentKind.Cubic)
                segment.Control2 = TransformPoint(segment.Control2, delta);
        }

        return ToPathData(segments);
    }

    public static string Transform(string pathData, Matrix matrix)
    {
        var segments = Parse(pathData);
        foreach (var segment in segments)
        {
            if (segment.Kind == SvgPathSegmentKind.Close)
                continue;

            segment.End = TransformPoint(segment.End, matrix);
            if (segment.Kind is SvgPathSegmentKind.Quadratic or SvgPathSegmentKind.Cubic)
                segment.Control1 = TransformPoint(segment.Control1, matrix);
            if (segment.Kind == SvgPathSegmentKind.Cubic)
                segment.Control2 = TransformPoint(segment.Control2, matrix);
        }

        return ToPathData(segments);
    }

    public static RectangleF GetBounds(IReadOnlyList<SvgPathSegment> segments)
    {
        var pathData = ToPathData(segments);
        return SvgPathParser.GetBounds(pathData);
    }

    public static bool HasCurves(string pathData) =>
        Parse(pathData).Any(static s => s.Kind is SvgPathSegmentKind.Quadratic or SvgPathSegmentKind.Cubic);

    public static IReadOnlyList<PathEditHandle> GetEditHandles(string pathData)
    {
        var segments = Parse(pathData);
        var handles = new List<PathEditHandle>();
        for (var i = 0; i < segments.Count; i++)
        {
            var segment = segments[i];
            if (segment.Kind == SvgPathSegmentKind.Close)
                continue;

            handles.Add(new PathEditHandle(i, PathEditHandleRole.Anchor, segment.End));
            if (segment.Kind == SvgPathSegmentKind.Quadratic)
                handles.Add(new PathEditHandle(i, PathEditHandleRole.Control1, segment.Control1));
            if (segment.Kind == SvgPathSegmentKind.Cubic)
            {
                handles.Add(new PathEditHandle(i, PathEditHandleRole.Control1, segment.Control1));
                handles.Add(new PathEditHandle(i, PathEditHandleRole.Control2, segment.Control2));
            }
        }

        return handles;
    }

    public static string UpdateHandle(string pathData, PathEditHandle handle, PointF newPoint)
    {
        var segments = Parse(pathData);
        if (handle.SegmentIndex < 0 || handle.SegmentIndex >= segments.Count)
            return pathData;

        var segment = segments[handle.SegmentIndex];
        switch (handle.Role)
        {
            case PathEditHandleRole.Anchor:
                MoveAnchor(segments, handle.SegmentIndex, newPoint);
                break;
            case PathEditHandleRole.Control1:
                segment.Control1 = newPoint;
                break;
            case PathEditHandleRole.Control2:
                segment.Control2 = newPoint;
                break;
        }

        return ToPathData(segments);
    }

    public static PointF GetSegmentStart(IReadOnlyList<SvgPathSegment> segments, int segmentIndex)
    {
        if (segmentIndex <= 0 || segments.Count == 0)
            return segments[0].End;

        var previous = segments[segmentIndex - 1];
        return previous.Kind == SvgPathSegmentKind.Close
            ? segments[0].End
            : previous.End;
    }

    private static void MoveAnchor(List<SvgPathSegment> segments, int segmentIndex, PointF newPoint)
    {
        var segment = segments[segmentIndex];
        if (segment.Kind == SvgPathSegmentKind.Close)
            return;

        var oldPoint = segment.End;
        var delta = new PointF(newPoint.X - oldPoint.X, newPoint.Y - oldPoint.Y);
        segment.End = newPoint;

        if (segment.Kind == SvgPathSegmentKind.Quadratic)
        {
            segment.Control1 = new PointF(segment.Control1.X + delta.X, segment.Control1.Y + delta.Y);
        }
        else if (segment.Kind == SvgPathSegmentKind.Cubic)
        {
            segment.Control2 = new PointF(segment.Control2.X + delta.X, segment.Control2.Y + delta.Y);
        }

        if (segmentIndex + 1 < segments.Count)
        {
            var next = segments[segmentIndex + 1];
            if (next.Kind == SvgPathSegmentKind.Quadratic || next.Kind == SvgPathSegmentKind.Cubic)
            {
                next.Control1 = new PointF(next.Control1.X + delta.X, next.Control1.Y + delta.Y);
            }
        }

        if (segmentIndex == 0 && segment.Kind == SvgPathSegmentKind.Move && segments.Count > 1)
        {
            var next = segments[1];
            if (next.Kind is SvgPathSegmentKind.Quadratic or SvgPathSegmentKind.Cubic)
            {
                next.Control1 = new PointF(next.Control1.X + delta.X, next.Control1.Y + delta.Y);
            }
        }

        var close = segments.FirstOrDefault(static s => s.Kind == SvgPathSegmentKind.Close);
        if (close is not null && segmentIndex == 0)
            close.End = newPoint;
    }

    private static PointF TransformPoint(PointF point, PointF delta) =>
        new(point.X + delta.X, point.Y + delta.Y);

    private static PointF TransformPoint(PointF point, Matrix matrix)
    {
        var pts = new[] { point };
        matrix.TransformPoints(pts);
        return pts[0];
    }

    private static PointF ReadPoint(List<object> tokens, ref int index, bool relative, PointF current)
    {
        var x = ReadNumber(tokens, ref index);
        var y = ReadNumber(tokens, ref index);
        if (relative)
        {
            x += current.X;
            y += current.Y;
        }

        return new PointF(x, y);
    }

    private static float ReadNumber(List<object> tokens, ref int index)
    {
        if (index >= tokens.Count || tokens[index] is char)
            return 0f;

        return (float)tokens[index++];
    }

    private static PointF ReflectLastCubic(IReadOnlyList<SvgPathSegment> segments, PointF anchor)
    {
        for (var i = segments.Count - 1; i >= 0; i--)
        {
            if (segments[i].Kind == SvgPathSegmentKind.Cubic)
            {
                var c2 = segments[i].Control2;
                return new PointF(anchor.X + (anchor.X - c2.X), anchor.Y + (anchor.Y - c2.Y));
            }
        }

        return anchor;
    }

    private static PointF ReflectLastQuadratic(IReadOnlyList<SvgPathSegment> segments, PointF anchor)
    {
        for (var i = segments.Count - 1; i >= 0; i--)
        {
            if (segments[i].Kind == SvgPathSegmentKind.Quadratic)
            {
                var c1 = segments[i].Control1;
                return new PointF(anchor.X + (anchor.X - c1.X), anchor.Y + (anchor.Y - c1.Y));
            }
        }

        return anchor;
    }
}
