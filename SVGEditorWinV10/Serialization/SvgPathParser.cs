using System.Drawing.Drawing2D;
using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;

namespace SVGEditorWinV10.Serialization;

internal static partial class SvgPathParser
{
    public static GraphicsPath CreatePath(string pathData, FillMode fillMode = FillMode.Winding)
    {
        var path = new GraphicsPath(fillMode);
        if (string.IsNullOrWhiteSpace(pathData))
            return path;

        var tokens = Tokenize(pathData);
        var index = 0;
        PointF current = default;
        PointF start = default;
        PointF lastCubicControl = default;
        PointF lastQuadraticControl = default;
        char? currentCommand = null;
        bool relative = false;

        while (index < tokens.Count)
        {
            if (tokens[index] is char command)
            {
                currentCommand = command;
                relative = char.IsLower(command);
                currentCommand = char.ToUpperInvariant(command);
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
                    path.StartFigure();
                    while (index < tokens.Count && tokens[index] is not char)
                    {
                        point = ReadPoint(tokens, ref index, relative, current);
                        path.AddLine(current, point);
                        current = point;
                    }
                    break;
                }
                case 'L':
                    while (index < tokens.Count && tokens[index] is not char)
                    {
                        var point = ReadPoint(tokens, ref index, relative, current);
                        path.AddLine(current, point);
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
                        path.AddLine(current, point);
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
                        path.AddLine(current, point);
                        current = point;
                    }
                    break;
                case 'C':
                    while (index < tokens.Count && tokens[index] is not char)
                    {
                        var c1 = ReadPoint(tokens, ref index, relative, current);
                        var c2 = ReadPoint(tokens, ref index, relative, current);
                        var end = ReadPoint(tokens, ref index, relative, current);
                        path.AddBezier(current, c1, c2, end);
                        lastCubicControl = c2;
                        current = end;
                    }
                    break;
                case 'S':
                    while (index < tokens.Count && tokens[index] is not char)
                    {
                        var c1 = Reflect(lastCubicControl, current);
                        var c2 = ReadPoint(tokens, ref index, relative, current);
                        var end = ReadPoint(tokens, ref index, relative, current);
                        path.AddBezier(current, c1, c2, end);
                        lastCubicControl = c2;
                        current = end;
                    }
                    break;
                case 'Q':
                    while (index < tokens.Count && tokens[index] is not char)
                    {
                        var c1 = ReadPoint(tokens, ref index, relative, current);
                        var end = ReadPoint(tokens, ref index, relative, current);
                        path.AddBezier(current,
                            Lerp(current, c1, 2f / 3f),
                            Lerp(end, c1, 2f / 3f),
                            end);
                        lastQuadraticControl = c1;
                        current = end;
                    }
                    break;
                case 'T':
                    while (index < tokens.Count && tokens[index] is not char)
                    {
                        var c1 = Reflect(lastQuadraticControl, current);
                        var end = ReadPoint(tokens, ref index, relative, current);
                        path.AddBezier(current,
                            Lerp(current, c1, 2f / 3f),
                            Lerp(end, c1, 2f / 3f),
                            end);
                        lastQuadraticControl = c1;
                        current = end;
                    }
                    break;
                case 'A':
                    while (index < tokens.Count && tokens[index] is not char)
                    {
                        var rx = Math.Abs(ReadNumber(tokens, ref index));
                        var ry = Math.Abs(ReadNumber(tokens, ref index));
                        var rotation = ReadNumber(tokens, ref index);
                        var largeArc = ReadNumber(tokens, ref index) != 0;
                        var sweepFlag = ReadNumber(tokens, ref index) != 0;
                        var end = ReadPoint(tokens, ref index, relative, current);
                        SvgPathArc.AddToPath(path, current, rx, ry, rotation, largeArc, sweepFlag, end);
                        current = end;
                    }
                    break;
                case 'Z':
                    path.CloseFigure();
                    current = start;
                    break;
                default:
                    index++;
                    break;
            }
        }

        return path;
    }

    public static string TransformPathData(string pathData, Matrix matrix)
    {
        using var path = CreatePath(pathData);
        path.Transform(matrix);
        return FlattenToPathData(path);
    }

    public static string CreatePathDataFromPoints(IReadOnlyList<PointF> points, bool close)
    {
        if (points.Count == 0)
            return string.Empty;

        var sb = new StringBuilder();
        sb.Append(CultureInfo.InvariantCulture, $"M {points[0].X:0.##} {points[0].Y:0.##}");
        for (var i = 1; i < points.Count; i++)
            sb.Append(CultureInfo.InvariantCulture, $" L {points[i].X:0.##} {points[i].Y:0.##}");
        if (close)
            sb.Append(" Z");
        return sb.ToString();
    }

    public static RectangleF GetBounds(string pathData)
    {
        if (string.IsNullOrWhiteSpace(pathData))
            return RectangleF.Empty;

        using var path = CreatePath(pathData);
        return path.GetBounds();
    }

    public static string FlattenToPathData(GraphicsPath path)
    {
        using var flat = (GraphicsPath)path.Clone();
        flat.Flatten(new Matrix(), 0.25f);
        var points = flat.PathPoints;
        var types = flat.PathTypes;
        if (points.Length == 0)
            return string.Empty;

        var sb = new StringBuilder();
        var startNewFigure = true;
        for (var i = 0; i < points.Length; i++)
        {
            var point = points[i];
            var isClose = (types[i] & (byte)PathPointType.CloseSubpath) != 0;
            var isStart = (types[i] & (byte)PathPointType.Start) != 0;

            if (startNewFigure || isStart)
            {
                sb.Append(CultureInfo.InvariantCulture, $"M {point.X:0.##} {point.Y:0.##}");
                startNewFigure = false;
            }
            else
            {
                sb.Append(CultureInfo.InvariantCulture, $" L {point.X:0.##} {point.Y:0.##}");
            }

            if (isClose)
            {
                sb.Append(" Z");
                startNewFigure = true;
            }
        }

        return sb.ToString();
    }

    internal static List<object> Tokenize(string pathData)
    {
        var tokens = new List<object>();
        foreach (Match match in TokenRegex().Matches(pathData))
        {
            var value = match.Value;
            if (value.Length == 1 && char.IsLetter(value[0]))
                tokens.Add(value[0]);
            else
                tokens.Add(float.Parse(value, CultureInfo.InvariantCulture));
        }

        return tokens;
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

    private static PointF Reflect(PointF control, PointF anchor) =>
        new(anchor.X + (anchor.X - control.X), anchor.Y + (anchor.Y - control.Y));

    private static PointF Lerp(PointF a, PointF b, float t) =>
        new(a.X + (b.X - a.X) * t, a.Y + (b.Y - a.Y) * t);

    [GeneratedRegex(@"[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?")]
    private static partial Regex TokenRegex();
}
