using System.Drawing.Drawing2D;
using System.Globalization;
using System.Text.RegularExpressions;

namespace SVGEditorWinV10.Serialization;

internal static partial class SvgTransformHelper
{
    public static Matrix CreateIdentity() => new();

    public static Matrix? ParseTransform(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return null;

        var matrix = new Matrix();
        foreach (Match match in TransformRegex().Matches(value))
        {
            var name = match.Groups[1].Value;
            var args = ParseNumbers(match.Groups[2].Value);
            switch (name)
            {
                case "matrix" when args.Length == 6:
                    matrix.Multiply(new Matrix(args[0], args[1], args[2], args[3], args[4], args[5]));
                    break;
                case "translate":
                    matrix.Translate(args.ElementAtOrDefault(0), args.ElementAtOrDefault(1));
                    break;
                case "scale":
                    matrix.Scale(
                        args.ElementAtOrDefault(0, 1f),
                        args.Length > 1 ? args[1] : args.ElementAtOrDefault(0, 1f));
                    break;
                case "rotate" when args.Length >= 1:
                    if (args.Length >= 3)
                    {
                        matrix.Translate(args[1], args[2]);
                        matrix.Rotate(args[0]);
                        matrix.Translate(-args[1], -args[2]);
                    }
                    else
                    {
                        matrix.Rotate(args[0]);
                    }
                    break;
                case "skewX" when args.Length >= 1:
                    matrix.Shear((float)Math.Tan(args[0] * Math.PI / 180.0), 0f);
                    break;
                case "skewY" when args.Length >= 1:
                    matrix.Shear(0f, (float)Math.Tan(args[0] * Math.PI / 180.0));
                    break;
            }
        }

        return matrix;
    }

    public static Matrix Combine(Matrix parent, Matrix? local)
    {
        if (local is null)
            return parent.Clone();

        var combined = parent.Clone();
        combined.Multiply(local);
        return combined;
    }

    public static PointF TransformPoint(Matrix matrix, PointF point)
    {
        var points = new[] { point };
        matrix.TransformPoints(points);
        return points[0];
    }

    public static RectangleF TransformBounds(Matrix matrix, RectangleF bounds)
    {
        var points = new[]
        {
            new PointF(bounds.Left, bounds.Top),
            new PointF(bounds.Right, bounds.Top),
            new PointF(bounds.Right, bounds.Bottom),
            new PointF(bounds.Left, bounds.Bottom)
        };
        matrix.TransformPoints(points);
        var minX = points.Min(p => p.X);
        var minY = points.Min(p => p.Y);
        var maxX = points.Max(p => p.X);
        var maxY = points.Max(p => p.Y);
        return RectangleF.FromLTRB(minX, minY, maxX, maxY);
    }

    public static PointF[] TransformPoints(Matrix matrix, IEnumerable<PointF> points)
    {
        var array = points.ToArray();
        matrix.TransformPoints(array);
        return array;
    }

    private static float[] ParseNumbers(string value)
    {
        return NumberRegex()
            .Matches(value)
            .Select(m => float.Parse(m.Value, CultureInfo.InvariantCulture))
            .ToArray();
    }

    private static float ElementAtOrDefault(this float[] values, int index, float fallback = 0f) =>
        index >= 0 && index < values.Length ? values[index] : fallback;

    [GeneratedRegex(@"(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)", RegexOptions.IgnoreCase)]
    private static partial Regex TransformRegex();

    [GeneratedRegex(@"-?\d*\.?\d+(?:e[-+]?\d+)?", RegexOptions.IgnoreCase)]
    private static partial Regex NumberRegex();
}
