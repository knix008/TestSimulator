using System.Globalization;
using System.Text;
using System.Xml.Linq;
using SVGEditorWinV10.Models;
using SVGEditorWinV10.Rendering;

namespace SVGEditorWinV10.Serialization;

public static class SvgDocumentSerializer
{
    public const string FileFilter = "SVG 이미지 (*.svg)|*.svg";

    public static string ToSvgString(SvgDocument document)
    {
        var sb = new StringBuilder();
        var background = ColorToHex(Color.FromArgb(document.BackgroundColorArgb));

        sb.AppendLine(CultureInfo.InvariantCulture,
            $"""<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="{document.Width:0.##}" height="{document.Height:0.##}" viewBox="0 0 {document.Width:0.##} {document.Height:0.##}">""");
        sb.AppendLine(CultureInfo.InvariantCulture,
            $"""  <rect x="0" y="0" width="{document.Width:0.##}" height="{document.Height:0.##}" fill="{background}" />""");

        SvgStrokeRenderer.AppendMarkerDefinitions(sb, document.Elements);
        SvgFillRenderer.AppendPatternDefinitions(sb, document.Elements);

        foreach (var element in document.Elements)
            SvgShapeRenderer.AppendSvg(sb, element);

        sb.AppendLine("</svg>");
        return sb.ToString();
    }

    public static void Save(SvgDocument document, string path)
    {
        File.WriteAllText(path, ToSvgString(document), Encoding.UTF8);
    }

    public static SvgDocument Load(string path)
    {
        var xml = XDocument.Load(path, LoadOptions.None);
        var root = xml.Root ?? throw new InvalidDataException("SVG 루트 요소가 없습니다.");

        var width = ParseLength(root.Attribute("width")?.Value, 800f);
        var height = ParseLength(root.Attribute("height")?.Value, 600f);
        var viewBox = ParseViewBox(root.Attribute("viewBox")?.Value);
        if (viewBox.HasValue)
        {
            width = viewBox.Value.Width;
            height = viewBox.Value.Height;
        }

        var document = new SvgDocument
        {
            Width = width,
            Height = height
        };
        var baseDirectory = Path.GetDirectoryName(path) ?? string.Empty;

        foreach (var node in root.Elements())
        {
            if (node.Name.LocalName.Equals("defs", StringComparison.OrdinalIgnoreCase))
                continue;

            if (node.Name.LocalName.Equals("rect", StringComparison.OrdinalIgnoreCase)
                && IsBackgroundRect(node, width, height))
            {
                document.BackgroundColorArgb = ParseColor(node.Attribute("fill")?.Value, Color.White).ToArgb();
                continue;
            }

            var element = TryParseElement(node, baseDirectory);
            if (element is not null)
                document.Elements.Add(element);
        }

        return document;
    }

    private static SvgElement? TryParseElement(XElement node, string baseDirectory)
    {
        var name = node.Name.LocalName;
        if (name.Equals("rect", StringComparison.OrdinalIgnoreCase))
        {
            var bounds = new RectangleF(
                ParseLength(node.Attribute("x")?.Value, 0f),
                ParseLength(node.Attribute("y")?.Value, 0f),
                ParseLength(node.Attribute("width")?.Value, 0f),
                ParseLength(node.Attribute("height")?.Value, 0f));
            var rx = ParseLength(node.Attribute("rx")?.Value, 0f);
            var kind = ParseKind(node) ?? (rx > 0f ? SvgElementKind.RoundedRectangle : SvgElementKind.Rectangle);

            return new SvgElement
            {
                Kind = kind,
                Bounds = bounds,
                CornerRadius = rx,
                FillColor = ParseFillColor(node),
                FillPattern = ParseFillPattern(node),
                FillOpacity = ParseFillOpacity(node),
                StrokeColor = ParseStrokeColor(node),
                StrokeOpacity = ParseStrokeOpacity(node),
                StrokeWidth = ParseLength(node.Attribute("stroke-width")?.Value, 2f),
                StrokeLineStyle = ParseLineStyle(node)
            };
        }

        if (name.Equals("polygon", StringComparison.OrdinalIgnoreCase))
        {
            var points = ParsePoints(node.Attribute("points")?.Value);
            if (points.Length == 0)
                return null;

            var bounds = ComputeBounds(points);
            var kind = ParseKind(node) ?? SvgElementKind.Diamond;
            return new SvgElement
            {
                Kind = kind,
                Bounds = bounds,
                FillColor = ParseFillColor(node),
                FillPattern = ParseFillPattern(node),
                FillOpacity = ParseFillOpacity(node),
                StrokeColor = ParseStrokeColor(node),
                StrokeOpacity = ParseStrokeOpacity(node),
                StrokeWidth = ParseLength(node.Attribute("stroke-width")?.Value, 2f),
                StrokeLineStyle = ParseLineStyle(node)
            };
        }

        if (name.Equals("ellipse", StringComparison.OrdinalIgnoreCase))
        {
            var cx = ParseLength(node.Attribute("cx")?.Value, 0f);
            var cy = ParseLength(node.Attribute("cy")?.Value, 0f);
            var rx = ParseLength(node.Attribute("rx")?.Value, 0f);
            var ry = ParseLength(node.Attribute("ry")?.Value, 0f);
            return new SvgElement
            {
                Kind = SvgElementKind.Ellipse,
                Bounds = new RectangleF(cx - rx, cy - ry, rx * 2f, ry * 2f),
                FillColor = ParseFillColor(node),
                FillPattern = ParseFillPattern(node),
                FillOpacity = ParseFillOpacity(node),
                StrokeColor = ParseStrokeColor(node),
                StrokeOpacity = ParseStrokeOpacity(node),
                StrokeWidth = ParseLength(node.Attribute("stroke-width")?.Value, 2f),
                StrokeLineStyle = ParseLineStyle(node)
            };
        }

        if (name.Equals("circle", StringComparison.OrdinalIgnoreCase))
        {
            var cx = ParseLength(node.Attribute("cx")?.Value, 0f);
            var cy = ParseLength(node.Attribute("cy")?.Value, 0f);
            var r = ParseLength(node.Attribute("r")?.Value, 0f);
            return new SvgElement
            {
                Kind = SvgElementKind.Ellipse,
                Bounds = new RectangleF(cx - r, cy - r, r * 2f, r * 2f),
                FillColor = ParseFillColor(node),
                FillPattern = ParseFillPattern(node),
                FillOpacity = ParseFillOpacity(node),
                StrokeColor = ParseStrokeColor(node),
                StrokeOpacity = ParseStrokeOpacity(node),
                StrokeWidth = ParseLength(node.Attribute("stroke-width")?.Value, 2f),
                StrokeLineStyle = ParseLineStyle(node)
            };
        }

        if (name.Equals("line", StringComparison.OrdinalIgnoreCase))
        {
            return new SvgElement
            {
                Kind = SvgElementKind.Line,
                Start = new PointF(
                    ParseLength(node.Attribute("x1")?.Value, 0f),
                    ParseLength(node.Attribute("y1")?.Value, 0f)),
                End = new PointF(
                    ParseLength(node.Attribute("x2")?.Value, 0f),
                    ParseLength(node.Attribute("y2")?.Value, 0f)),
                StrokeColor = ParseStrokeColor(node),
                StrokeOpacity = ParseStrokeOpacity(node),
                StrokeWidth = ParseLength(node.Attribute("stroke-width")?.Value, 2f),
                StrokeLineStyle = ParseLineStyle(node),
                StartMarker = ParseMarker(node, "data-start-marker", "marker-start"),
                EndMarker = ParseMarker(node, "data-end-marker", "marker-end")
            };
        }

        if (name.Equals("image", StringComparison.OrdinalIgnoreCase)
            || ParseKind(node) == SvgElementKind.Image)
        {
            var xlink = XNamespace.Get("http://www.w3.org/1999/xlink");
            var href = node.Attribute("href")?.Value ?? node.Attribute(xlink + "href")?.Value;
            var imported = SvgImageAssetService.TryLoadFromHref(href, baseDirectory);
            if (imported is null)
                return null;

            var bounds = new RectangleF(
                ParseLength(node.Attribute("x")?.Value, 0f),
                ParseLength(node.Attribute("y")?.Value, 0f),
                ParseLength(node.Attribute("width")?.Value, 0f),
                ParseLength(node.Attribute("height")?.Value, 0f));
            if (bounds.Width <= 0f || bounds.Height <= 0f)
                bounds = SvgImageAssetService.CreateDefaultBounds(bounds.Location, imported.PixelSize);

            var sourcePath = node.Attribute("data-source-path")?.Value;
            if (string.IsNullOrWhiteSpace(sourcePath) && !string.IsNullOrWhiteSpace(imported.SourcePath))
                sourcePath = imported.SourcePath;

            return new SvgElement
            {
                Kind = SvgElementKind.Image,
                Bounds = bounds,
                ImageDataUri = imported.DataUri,
                ImageSourcePath = sourcePath,
                FillOpacity = ParseFillOpacity(node),
                TextBoundsManuallySized = true
            };
        }

        if (name.Equals("text", StringComparison.OrdinalIgnoreCase)
            || ParseKind(node) == SvgElementKind.Text)
        {
            var textElement = new SvgElement
            {
                Kind = SvgElementKind.Text,
                FillColor = ParseFillColor(node),
                FillOpacity = ParseFillOpacity(node)
            };
            SvgTextRenderer.ApplyParsedAttributes(
                textElement,
                node.Value,
                node.Attribute("font-family")?.Value,
                node.Attribute("font-size")?.Value,
                node.Attribute("font-weight")?.Value,
                node.Attribute("font-style")?.Value,
                node.Attribute("data-font-bold")?.Value,
                node.Attribute("data-font-italic")?.Value,
                node.Attribute("x")?.Value,
                node.Attribute("y")?.Value,
                node.Attribute("data-bounds-width")?.Value,
                node.Attribute("data-bounds-height")?.Value,
                node.Attribute("data-bounds-manual")?.Value);
            return textElement;
        }

        return null;
    }

    private static Color ParseFillColor(XElement node) =>
        SvgColorHelper.GetRgbColor(ParseFillColorRaw(node).ToArgb());

    private static Color ParseFillColorRaw(XElement node)
    {
        var dataColor = node.Attribute("data-fill-color")?.Value;
        if (!string.IsNullOrWhiteSpace(dataColor))
            return ParseColor(dataColor, Color.FromArgb(219, 234, 254));

        var fill = node.Attribute("fill")?.Value;
        if (!string.IsNullOrWhiteSpace(fill) && fill.StartsWith("url(#", StringComparison.OrdinalIgnoreCase))
        {
            var id = fill[5..].TrimEnd(')');
            var lastDash = id.LastIndexOf('-');
            if (lastDash > 0 && int.TryParse(id[(lastDash + 1)..], NumberStyles.HexNumber, CultureInfo.InvariantCulture, out var argb))
                return Color.FromArgb(argb);
        }

        return ParseColor(fill, Color.FromArgb(219, 234, 254));
    }

    private static float ParseFillOpacity(XElement node)
    {
        if (TryParseOpacity(node.Attribute("data-fill-opacity")?.Value, out var dataOpacity))
            return dataOpacity;

        if (TryParseOpacity(node.Attribute("opacity")?.Value, out var elementOpacity))
            return elementOpacity;

        if (TryParseOpacity(node.Attribute("fill-opacity")?.Value, out var svgOpacity))
            return svgOpacity;

        var raw = ParseFillColorRaw(node);
        return raw.A < 255 ? raw.A / 255f : 1f;
    }

    private static Color ParseStrokeColor(XElement node) =>
        SvgColorHelper.GetRgbColor(ParseStrokeColorRaw(node).ToArgb());

    private static Color ParseStrokeColorRaw(XElement node) =>
        ParseColor(node.Attribute("stroke")?.Value, Color.FromArgb(37, 99, 235));

    private static float ParseStrokeOpacity(XElement node)
    {
        if (TryParseOpacity(node.Attribute("data-stroke-opacity")?.Value, out var dataOpacity))
            return dataOpacity;

        if (TryParseOpacity(node.Attribute("stroke-opacity")?.Value, out var svgOpacity))
            return svgOpacity;

        var raw = ParseStrokeColorRaw(node);
        return raw.A < 255 ? raw.A / 255f : 1f;
    }

    private static bool TryParseOpacity(string? value, out float opacity)
    {
        opacity = 1f;
        if (string.IsNullOrWhiteSpace(value))
            return false;

        if (!float.TryParse(value, NumberStyles.Float, CultureInfo.InvariantCulture, out var parsed))
            return false;

        opacity = SvgColorHelper.ClampOpacity(parsed);
        return true;
    }

    private static FillPattern ParseFillPattern(XElement node)
    {
        var dataPattern = node.Attribute("data-fill-pattern")?.Value;
        if (!string.IsNullOrWhiteSpace(dataPattern)
            && Enum.TryParse(dataPattern, ignoreCase: true, out FillPattern parsed))
            return parsed;

        var fill = node.Attribute("fill")?.Value;
        if (string.IsNullOrWhiteSpace(fill) || !fill.StartsWith("url(#", StringComparison.OrdinalIgnoreCase))
            return FillPattern.Solid;

        var id = fill[5..].TrimEnd(')');
        if (!id.StartsWith("pattern-", StringComparison.OrdinalIgnoreCase))
            return FillPattern.Solid;

        var body = id["pattern-".Length..];
        var lastDash = body.LastIndexOf('-');
        if (lastDash <= 0)
            return FillPattern.Solid;

        var patternName = body[..lastDash];
        return Enum.TryParse(patternName, ignoreCase: true, out FillPattern fromId)
            ? fromId
            : FillPattern.Solid;
    }

    private static StrokeLineStyle ParseLineStyle(XElement node)
    {
        var dataStyle = node.Attribute("data-line-style")?.Value;
        if (!string.IsNullOrWhiteSpace(dataStyle)
            && Enum.TryParse(dataStyle, ignoreCase: true, out StrokeLineStyle parsed))
            return parsed;

        return SvgStrokeRenderer.ParseDashArray(node.Attribute("stroke-dasharray")?.Value);
    }

    private static LineMarkerStyle ParseMarker(XElement node, string dataAttribute, string svgAttribute)
    {
        var dataValue = node.Attribute(dataAttribute)?.Value;
        if (!string.IsNullOrWhiteSpace(dataValue)
            && Enum.TryParse(dataValue, ignoreCase: true, out LineMarkerStyle parsed))
            return parsed;

        return SvgStrokeRenderer.ParseMarkerUrl(node.Attribute(svgAttribute)?.Value);
    }

    private static SvgElementKind? ParseKind(XElement node)
    {
        var value = node.Attribute("data-kind")?.Value;
        if (string.IsNullOrWhiteSpace(value))
            return null;

        return Enum.TryParse(value, ignoreCase: true, out SvgElementKind kind) ? kind : null;
    }

    private static PointF[] ParsePoints(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return [];

        var tokens = value.Split([' ', ',', '\t', '\r', '\n'], StringSplitOptions.RemoveEmptyEntries);
        var points = new List<PointF>();
        for (var i = 0; i + 1 < tokens.Length; i += 2)
        {
            if (!float.TryParse(tokens[i], NumberStyles.Float, CultureInfo.InvariantCulture, out var x))
                continue;
            if (!float.TryParse(tokens[i + 1], NumberStyles.Float, CultureInfo.InvariantCulture, out var y))
                continue;
            points.Add(new PointF(x, y));
        }

        return points.ToArray();
    }

    private static RectangleF ComputeBounds(PointF[] points)
    {
        var minX = points.Min(p => p.X);
        var minY = points.Min(p => p.Y);
        var maxX = points.Max(p => p.X);
        var maxY = points.Max(p => p.Y);
        return RectangleF.FromLTRB(minX, minY, maxX, maxY);
    }

    private static bool IsBackgroundRect(XElement node, float width, float height)
    {
        var x = ParseLength(node.Attribute("x")?.Value, -1f);
        var y = ParseLength(node.Attribute("y")?.Value, -1f);
        var w = ParseLength(node.Attribute("width")?.Value, -1f);
        var h = ParseLength(node.Attribute("height")?.Value, -1f);
        return Math.Abs(x) < 0.01f
            && Math.Abs(y) < 0.01f
            && Math.Abs(w - width) < 0.5f
            && Math.Abs(h - height) < 0.5f;
    }

    private static RectangleF? ParseViewBox(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return null;

        var parts = value.Split([' ', ','], StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length != 4)
            return null;

        if (!float.TryParse(parts[2], NumberStyles.Float, CultureInfo.InvariantCulture, out var width))
            return null;
        if (!float.TryParse(parts[3], NumberStyles.Float, CultureInfo.InvariantCulture, out var height))
            return null;

        return new RectangleF(0f, 0f, width, height);
    }

    private static float ParseLength(string? value, float fallback)
    {
        if (string.IsNullOrWhiteSpace(value))
            return fallback;

        value = value.Trim().TrimEnd('p', 'x', 't', 'c', 'm', 'm');
        return float.TryParse(value, NumberStyles.Float, CultureInfo.InvariantCulture, out var parsed)
            ? parsed
            : fallback;
    }

    private static Color ParseColor(string? value, Color fallback)
    {
        if (string.IsNullOrWhiteSpace(value) || value.Equals("none", StringComparison.OrdinalIgnoreCase))
            return fallback;

        if (value.StartsWith('#'))
        {
            var hex = value[1..];
            if (hex.Length == 3)
                hex = string.Concat(hex.Select(c => $"{c}{c}"));

            if (hex.Length == 6 && int.TryParse(hex, NumberStyles.HexNumber, CultureInfo.InvariantCulture, out var rgb))
                return Color.FromArgb(255, (rgb >> 16) & 0xFF, (rgb >> 8) & 0xFF, rgb & 0xFF);

            if (hex.Length == 8 && int.TryParse(hex, NumberStyles.HexNumber, CultureInfo.InvariantCulture, out var argb))
                return Color.FromArgb((argb >> 24) & 0xFF, (argb >> 16) & 0xFF, (argb >> 8) & 0xFF, argb & 0xFF);
        }

        try
        {
            return ColorTranslator.FromHtml(value);
        }
        catch
        {
            return fallback;
        }
    }

    private static string ColorToHex(Color color)
    {
        if (color.A < 255)
            return $"#{color.A:X2}{color.R:X2}{color.G:X2}{color.B:X2}";
        return $"#{color.R:X2}{color.G:X2}{color.B:X2}";
    }
}
