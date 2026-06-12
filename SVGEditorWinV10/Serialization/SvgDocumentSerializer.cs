using System.Drawing.Drawing2D;
using System.Globalization;
using System.Text;
using System.Xml.Linq;
using SVGEditorWinV10.Models;
using SVGEditorWinV10.Rendering;

namespace SVGEditorWinV10.Serialization;

public static class SvgDocumentSerializer
{
    public const string FileFilter = "SVG 파일 (*.svg)|*.svg|모든 파일 (*.*)|*.*";

    public static string ToSvgString(SvgDocument document)
    {
        var sb = new StringBuilder();
        var background = ColorToHex(Color.FromArgb(document.BackgroundColorArgb));

        sb.AppendLine(CultureInfo.InvariantCulture,
            $"""<svg xmlns="http://www.w3.org/2000/svg" width="{document.Width:0.##}" height="{document.Height:0.##}" viewBox="0 0 {document.Width:0.##} {document.Height:0.##}">""");
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

        var viewBox = ParseViewBox(root.Attribute("viewBox")?.Value);
        var width = ParseLength(root.Attribute("width")?.Value, viewBox?.Width ?? 800f);
        var height = ParseLength(root.Attribute("height")?.Value, viewBox?.Height ?? 800f);

        var rootMatrix = viewBox.HasValue
            ? SvgViewBoxHelper.CreateViewportMatrix(
                0f,
                0f,
                width,
                height,
                viewBox.Value,
                root.Attribute("preserveAspectRatio")?.Value)
            : SvgTransformHelper.CreateIdentity();

        var document = new SvgDocument
        {
            Width = width,
            Height = height
        };
        var baseDirectory = Path.GetDirectoryName(path) ?? string.Empty;
        var context = new ImportContext(baseDirectory, rootMatrix, new SizeF(width, height));

        foreach (var node in root.Elements())
        {
            if (node.Name.LocalName.Equals("rect", StringComparison.OrdinalIgnoreCase)
                && IsBackgroundRect(node, width, height))
            {
                document.BackgroundColorArgb = ParseColor(SvgStyleHelper.GetAttribute(node, "fill"), Color.White).ToArgb();
                continue;
            }

            CollectElements(node, context, document.Elements);
        }

        return document;
    }

    private sealed class ImportContext
    {
        public ImportContext(string baseDirectory, Matrix transform, SizeF canvasSize)
        {
            BaseDirectory = baseDirectory;
            Transform = transform;
            CanvasSize = canvasSize;
        }

        public string BaseDirectory { get; }
        public Matrix Transform { get; }
        public SizeF CanvasSize { get; }

        public ImportContext WithNode(XElement node)
        {
            var combined = SvgTransformHelper.Combine(Transform, SvgTransformHelper.ParseTransform(node.Attribute("transform")?.Value));
            return new ImportContext(BaseDirectory, combined, CanvasSize);
        }
    }

    private static void CollectElements(XElement node, ImportContext context, List<SvgElement> output)
    {
        var name = node.Name.LocalName;
        if (name.Equals("defs", StringComparison.OrdinalIgnoreCase)
            || name.Equals("title", StringComparison.OrdinalIgnoreCase)
            || name.Equals("desc", StringComparison.OrdinalIgnoreCase)
            || name.Equals("metadata", StringComparison.OrdinalIgnoreCase))
            return;

        var localContext = context.WithNode(node);

        if (name.Equals("svg", StringComparison.OrdinalIgnoreCase))
        {
            var nestedContext = CreateNestedSvgContext(node, localContext);
            foreach (var child in node.Elements())
                CollectElements(child, nestedContext, output);
            return;
        }

        if (name.Equals("g", StringComparison.OrdinalIgnoreCase)
            || name.Equals("a", StringComparison.OrdinalIgnoreCase)
            || name.Equals("switch", StringComparison.OrdinalIgnoreCase))
        {
            foreach (var child in node.Elements())
                CollectElements(child, localContext, output);
            return;
        }

        if (name.Equals("image", StringComparison.OrdinalIgnoreCase))
        {
            var xlink = XNamespace.Get("http://www.w3.org/1999/xlink");
            var href = node.Attribute("href")?.Value ?? node.Attribute(xlink + "href")?.Value;
            if (IsSvgReference(href))
            {
                var embedded = TryLoadEmbeddedSvgElements(href!, node, localContext);
                if (embedded.Count > 0)
                {
                    output.AddRange(embedded);
                    return;
                }
            }
        }

        var element = TryParseElement(node, localContext);
        if (element is not null)
            output.Add(element);
    }

    private static SvgElement? TryParseElement(XElement node, ImportContext context)
    {
        var name = node.Name.LocalName;
        if (name.Equals("rect", StringComparison.OrdinalIgnoreCase))
        {
            var bounds = TransformBounds(context.Transform, new RectangleF(
                ParseLength(SvgStyleHelper.GetAttribute(node, "x"), 0f),
                ParseLength(SvgStyleHelper.GetAttribute(node, "y"), 0f),
                ParseLength(SvgStyleHelper.GetAttribute(node, "width"), 0f),
                ParseLength(SvgStyleHelper.GetAttribute(node, "height"), 0f)));
            var rx = ParseLength(SvgStyleHelper.GetAttribute(node, "rx"), 0f);
            if (rx <= 0f)
                rx = ParseLength(SvgStyleHelper.GetAttribute(node, "ry"), 0f);
            var kind = ParseKind(node) ?? (rx > 0f ? SvgElementKind.RoundedRectangle : SvgElementKind.Rectangle);

            return ApplyStyles(new SvgElement
            {
                Kind = kind,
                Bounds = bounds,
                IsSquare = IsSquareRect(node),
                CornerRadius = rx
            }, node);
        }

        if (name.Equals("polygon", StringComparison.OrdinalIgnoreCase)
            || name.Equals("polyline", StringComparison.OrdinalIgnoreCase))
        {
            var points = TransformPoints(context.Transform, ParsePoints(node.Attribute("points")?.Value));
            if (points.Length == 0)
                return null;

            var pathData = SvgPathParser.CreatePathDataFromPoints(points, name.Equals("polygon", StringComparison.OrdinalIgnoreCase));
            var bounds = SvgPathParser.GetBounds(pathData);
            var kind = ParseKind(node);
            if (kind is not null && kind != SvgElementKind.Path)
            {
                return ApplyStyles(new SvgElement
                {
                    Kind = kind.Value,
                    Bounds = bounds
                }, node);
            }

            return ApplyStyles(new SvgElement
            {
                Kind = SvgElementKind.Path,
                PathData = pathData,
                Bounds = bounds,
                NativePathKind = name.Equals("polygon", StringComparison.OrdinalIgnoreCase)
                    ? SvgNativePathKind.Polygon
                    : SvgNativePathKind.Polyline
            }, node);
        }

        if (name.Equals("path", StringComparison.OrdinalIgnoreCase))
        {
            var rawPath = node.Attribute("d")?.Value;
            if (string.IsNullOrWhiteSpace(rawPath))
                return null;

            var pathData = SvgPathParser.TransformPathData(rawPath, context.Transform);
            var bounds = SvgPathParser.GetBounds(pathData);
            return ApplyStyles(new SvgElement
            {
                Kind = SvgElementKind.Path,
                PathData = pathData,
                Bounds = bounds
            }, node);
        }

        if (name.Equals("ellipse", StringComparison.OrdinalIgnoreCase))
        {
            var cx = ParseLength(SvgStyleHelper.GetAttribute(node, "cx"), 0f);
            var cy = ParseLength(SvgStyleHelper.GetAttribute(node, "cy"), 0f);
            var rx = ParseLength(SvgStyleHelper.GetAttribute(node, "rx"), 0f);
            var ry = ParseLength(SvgStyleHelper.GetAttribute(node, "ry"), 0f);
            var bounds = TransformBounds(context.Transform, new RectangleF(cx - rx, cy - ry, rx * 2f, ry * 2f));
            return ApplyStyles(new SvgElement { Kind = SvgElementKind.Ellipse, Bounds = bounds }, node);
        }

        if (name.Equals("circle", StringComparison.OrdinalIgnoreCase))
        {
            var cx = ParseLength(SvgStyleHelper.GetAttribute(node, "cx"), 0f);
            var cy = ParseLength(SvgStyleHelper.GetAttribute(node, "cy"), 0f);
            var r = ParseLength(SvgStyleHelper.GetAttribute(node, "r"), 0f);
            var bounds = TransformBounds(context.Transform, new RectangleF(cx - r, cy - r, r * 2f, r * 2f));
            return ApplyStyles(new SvgElement { Kind = SvgElementKind.Circle, Bounds = bounds }, node);
        }

        if (name.Equals("line", StringComparison.OrdinalIgnoreCase))
        {
            var start = TransformPoint(context.Transform, new PointF(
                ParseLength(SvgStyleHelper.GetAttribute(node, "x1"), 0f),
                ParseLength(SvgStyleHelper.GetAttribute(node, "y1"), 0f)));
            var end = TransformPoint(context.Transform, new PointF(
                ParseLength(SvgStyleHelper.GetAttribute(node, "x2"), 0f),
                ParseLength(SvgStyleHelper.GetAttribute(node, "y2"), 0f)));
            return ApplyStyles(new SvgElement
            {
                Kind = SvgElementKind.Line,
                Start = start,
                End = end
            }, node);
        }

        if (name.Equals("image", StringComparison.OrdinalIgnoreCase)
            || ParseKind(node) == SvgElementKind.Image)
        {
            var xlink = XNamespace.Get("http://www.w3.org/1999/xlink");
            var href = node.Attribute("href")?.Value ?? node.Attribute(xlink + "href")?.Value;
            var imported = SvgImageAssetService.TryLoadFromHref(href, context.BaseDirectory);
            if (imported is null)
                return null;

            var bounds = ReadImageBounds(node, context);
            var sourcePath = node.Attribute("data-source-path")?.Value;
            if (string.IsNullOrWhiteSpace(sourcePath) && !string.IsNullOrWhiteSpace(imported.SourcePath))
                sourcePath = imported.SourcePath;

            return ApplyStyles(new SvgElement
            {
                Kind = SvgElementKind.Image,
                Bounds = bounds,
                ImageDataUri = imported.DataUri,
                ImageSourcePath = sourcePath,
                TextBoundsManuallySized = true
            }, node);
        }

        if (name.Equals("text", StringComparison.OrdinalIgnoreCase)
            || ParseKind(node) == SvgElementKind.Text)
        {
            var textElement = ApplyStyles(new SvgElement { Kind = SvgElementKind.Text }, node);
            SvgTextRenderer.ApplyParsedAttributes(
                textElement,
                ReadTextContent(node),
                SvgStyleHelper.GetAttribute(node, "font-family"),
                SvgStyleHelper.GetAttribute(node, "font-size"),
                SvgStyleHelper.GetAttribute(node, "font-weight"),
                SvgStyleHelper.GetAttribute(node, "font-style"),
                SvgStyleHelper.GetAttribute(node, "text-decoration"),
                node.Attribute("data-font-bold")?.Value,
                node.Attribute("data-font-italic")?.Value,
                node.Attribute("data-font-underline")?.Value,
                node.Attribute("data-font-strikeout")?.Value,
                SvgStyleHelper.GetAttribute(node, "x"),
                SvgStyleHelper.GetAttribute(node, "y"),
                node.Attribute("data-bounds-width")?.Value,
                node.Attribute("data-bounds-height")?.Value,
                node.Attribute("data-bounds-manual")?.Value);

            var topLeft = TransformPoint(context.Transform, new PointF(textElement.Bounds.X, textElement.Bounds.Y));
            var bottomRight = TransformPoint(context.Transform, new PointF(
                textElement.Bounds.Right,
                textElement.Bounds.Bottom));
            textElement.Bounds = RectangleF.FromLTRB(
                Math.Min(topLeft.X, bottomRight.X),
                Math.Min(topLeft.Y, bottomRight.Y),
                Math.Max(topLeft.X, bottomRight.X),
                Math.Max(topLeft.Y, bottomRight.Y));
            if (textElement.Bounds.Width < 1f)
                textElement.Bounds = new RectangleF(textElement.Bounds.X, textElement.Bounds.Y, 1f, textElement.Bounds.Height);
            if (textElement.Bounds.Height < 1f)
                textElement.Bounds = new RectangleF(textElement.Bounds.X, textElement.Bounds.Y, textElement.Bounds.Width, 1f);
            return textElement;
        }

        return null;
    }

    private static SvgElement ApplyStyles(SvgElement element, XElement node)
    {
        var fillValue = SvgStyleHelper.GetAttribute(node, "fill");
        var strokeValue = SvgStyleHelper.GetAttribute(node, "stroke");

        if (IsExplicitPaintNone(fillValue))
        {
            element.FillPattern = FillPattern.None;
            element.FillOpacity = 0f;
        }
        else
        {
            element.FillColor = ParseFillColor(node);
            element.FillOpacity = ParseFillOpacity(node, element.FillOpacity);
        }

        if (IsExplicitPaintNone(strokeValue) || string.IsNullOrWhiteSpace(strokeValue))
            element.StrokeOpacity = 0f;
        else
        {
            element.StrokeColor = ParseStrokeColor(node);
            element.StrokeOpacity = ParseStrokeOpacity(node, element.StrokeOpacity);
        }

        element.FillPattern = ParseFillPattern(node);
        element.FillRule = ParseFillRule(node);

        element.StrokeWidth = ParseLength(SvgStyleHelper.GetAttribute(node, "stroke-width"), 2f);
        element.StrokeLineStyle = ParseLineStyle(node);
        element.StartMarker = ParseMarker(node, "data-start-marker", "marker-start");
        element.EndMarker = ParseMarker(node, "data-end-marker", "marker-end");
        return element;
    }

    private static List<SvgElement> TryLoadEmbeddedSvgElements(string href, XElement node, ImportContext context)
    {
        var resolved = ResolveHrefPath(href, context.BaseDirectory);
        if (resolved is null || !File.Exists(resolved))
            return [];

        try
        {
            var embedded = Load(resolved);
            if (embedded.Elements.Count == 0)
                return [];

            var localBounds = ReadImageLocalBounds(node);
            if (localBounds.Width <= 0f || localBounds.Height <= 0f)
                return [];

            var fitLocal = SvgTransformHelper.CreateIdentity();
            fitLocal.Translate(localBounds.X, localBounds.Y);
            fitLocal.Scale(localBounds.Width / embedded.Width, localBounds.Height / embedded.Height);

            var matrix = SvgTransformHelper.Combine(context.Transform, fitLocal);
            return embedded.Elements.Select(element => TransformImportedElement(element, matrix)).ToList();
        }
        catch
        {
            return [];
        }
    }

    private static ImportContext CreateNestedSvgContext(XElement node, ImportContext localContext)
    {
        var viewBox = ParseViewBox(node.Attribute("viewBox")?.Value);
        var x = ParseLength(node.Attribute("x")?.Value, 0f);
        var y = ParseLength(node.Attribute("y")?.Value, 0f);
        var width = ParseLength(node.Attribute("width")?.Value, 0f);
        var height = ParseLength(node.Attribute("height")?.Value, 0f);
        var preserveAspectRatio = node.Attribute("preserveAspectRatio")?.Value;

        Matrix? viewportMatrix = null;
        if (viewBox.HasValue && width > 0f && height > 0f)
        {
            viewportMatrix = SvgViewBoxHelper.CreateViewportMatrix(
                x, y, width, height, viewBox.Value, preserveAspectRatio);
        }
        else if (Math.Abs(x) > 0.001f || Math.Abs(y) > 0.001f)
        {
            viewportMatrix = SvgTransformHelper.CreateIdentity();
            viewportMatrix.Translate(x, y);
        }

        if (viewportMatrix is null)
            return localContext;

        return new ImportContext(
            localContext.BaseDirectory,
            SvgTransformHelper.Combine(localContext.Transform, viewportMatrix),
            localContext.CanvasSize);
    }

    private static RectangleF ReadImageLocalBounds(XElement node) =>
        new(
            ParseLength(SvgStyleHelper.GetAttribute(node, "x"), 0f),
            ParseLength(SvgStyleHelper.GetAttribute(node, "y"), 0f),
            ParseLength(SvgStyleHelper.GetAttribute(node, "width"), 0f),
            ParseLength(SvgStyleHelper.GetAttribute(node, "height"), 0f));

    private static SvgElement TransformImportedElement(SvgElement source, Matrix matrix)
    {
        var clone = source.Clone();
        clone.Id = Guid.NewGuid();

        switch (clone.Kind)
        {
            case SvgElementKind.Line:
                clone.Start = TransformPoint(matrix, clone.Start);
                clone.End = TransformPoint(matrix, clone.End);
                break;
            case SvgElementKind.Path:
                clone.PathData = SvgPathParser.TransformPathData(clone.PathData, matrix);
                clone.Bounds = SvgPathParser.GetBounds(clone.PathData);
                break;
            case SvgElementKind.Text:
                clone.Bounds = TransformBounds(matrix, clone.Bounds);
                break;
            default:
                clone.Bounds = TransformBounds(matrix, clone.Bounds);
                break;
        }

        return clone;
    }

    private static RectangleF ReadImageBounds(XElement node, ImportContext context)
    {
        var bounds = new RectangleF(
            ParseLength(SvgStyleHelper.GetAttribute(node, "x"), 0f),
            ParseLength(SvgStyleHelper.GetAttribute(node, "y"), 0f),
            ParseLength(SvgStyleHelper.GetAttribute(node, "width"), 0f),
            ParseLength(SvgStyleHelper.GetAttribute(node, "height"), 0f));
        bounds = TransformBounds(context.Transform, bounds);
        if (bounds.Width <= 0f || bounds.Height <= 0f)
            bounds = SvgImageAssetService.CreateDefaultBounds(
                bounds.Location,
                new SizeF(128f, 128f),
                context.CanvasSize);
        return bounds;
    }

    private static string? ResolveHrefPath(string href, string baseDirectory)
    {
        href = href.Trim();
        if (href.StartsWith("data:", StringComparison.OrdinalIgnoreCase))
            return null;

        if (Uri.TryCreate(href, UriKind.Absolute, out var absolute) && absolute.IsFile)
            return absolute.LocalPath;

        if (string.IsNullOrWhiteSpace(baseDirectory))
            return null;

        return Path.GetFullPath(Path.Combine(baseDirectory, href.Replace('/', Path.DirectorySeparatorChar)));
    }

    private static bool IsSvgReference(string? href) =>
        !string.IsNullOrWhiteSpace(href)
        && (href.EndsWith(".svg", StringComparison.OrdinalIgnoreCase)
            || href.Contains(".svg?", StringComparison.OrdinalIgnoreCase));

    private static string ReadTextContent(XElement node) =>
        string.Concat(node.DescendantNodes().OfType<XText>().Select(text => text.Value)).Trim();

    private static bool IsExplicitPaintNone(string? value) =>
        !string.IsNullOrWhiteSpace(value) && value.Equals("none", StringComparison.OrdinalIgnoreCase);

    private static RectangleF TransformBounds(Matrix matrix, RectangleF bounds) =>
        SvgTransformHelper.TransformBounds(matrix, bounds);

    private static PointF TransformPoint(Matrix matrix, PointF point) =>
        SvgTransformHelper.TransformPoint(matrix, point);

    private static PointF[] TransformPoints(Matrix matrix, PointF[] points) =>
        SvgTransformHelper.TransformPoints(matrix, points);

    private static Color ParseFillColor(XElement node) =>
        SvgColorHelper.GetRgbColor(ParseFillColorRaw(node).ToArgb());

    private static Color ParseFillColorRaw(XElement node)
    {
        var dataColor = node.Attribute("data-fill-color")?.Value;
        if (!string.IsNullOrWhiteSpace(dataColor))
            return ParseColor(dataColor, Color.Black);

        var fill = SvgStyleHelper.GetAttribute(node, "fill");
        if (!string.IsNullOrWhiteSpace(fill) && fill.StartsWith("url(#", StringComparison.OrdinalIgnoreCase))
        {
            var id = fill[5..].TrimEnd(')');
            var lastDash = id.LastIndexOf('-');
            if (lastDash > 0 && int.TryParse(id[(lastDash + 1)..], NumberStyles.HexNumber, CultureInfo.InvariantCulture, out var argb))
                return Color.FromArgb(argb);
        }

        return ParseColor(fill, Color.Black);
    }

    private static float ParseFillOpacity(XElement node, float currentOpacity = 1f)
    {
        if (TryParseOpacity(node.Attribute("data-fill-opacity")?.Value, out var dataOpacity))
            return dataOpacity;

        if (TryParseOpacity(SvgStyleHelper.GetAttribute(node, "opacity"), out var elementOpacity))
            return elementOpacity;

        if (TryParseOpacity(SvgStyleHelper.GetAttribute(node, "fill-opacity"), out var svgOpacity))
            return svgOpacity;

        var raw = ParseFillColorRaw(node);
        return raw.A < 255 ? raw.A / 255f : currentOpacity;
    }

    private static Color ParseStrokeColor(XElement node) =>
        SvgColorHelper.GetRgbColor(ParseStrokeColorRaw(node).ToArgb());

    private static Color ParseStrokeColorRaw(XElement node) =>
        ParseColor(SvgStyleHelper.GetAttribute(node, "stroke"), Color.FromArgb(37, 99, 235));

    private static float ParseStrokeOpacity(XElement node, float currentOpacity = 1f)
    {
        if (TryParseOpacity(node.Attribute("data-stroke-opacity")?.Value, out var dataOpacity))
            return dataOpacity;

        if (TryParseOpacity(SvgStyleHelper.GetAttribute(node, "stroke-opacity"), out var svgOpacity))
            return svgOpacity;

        var raw = ParseStrokeColorRaw(node);
        return raw.A < 255 ? raw.A / 255f : currentOpacity;
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

    private static SvgFillRule ParseFillRule(XElement node)
    {
        var value = SvgStyleHelper.GetAttribute(node, "fill-rule");
        return !string.IsNullOrWhiteSpace(value)
               && value.Equals("evenodd", StringComparison.OrdinalIgnoreCase)
            ? SvgFillRule.EvenOdd
            : SvgFillRule.NonZero;
    }

    private static FillPattern ParseFillPattern(XElement node)
    {
        var dataPattern = node.Attribute("data-fill-pattern")?.Value;
        if (!string.IsNullOrWhiteSpace(dataPattern)
            && Enum.TryParse(dataPattern, ignoreCase: true, out FillPattern parsed))
            return parsed;

        var fill = SvgStyleHelper.GetAttribute(node, "fill");
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

        return SvgStrokeRenderer.ParseDashArray(SvgStyleHelper.GetAttribute(node, "stroke-dasharray"));
    }

    private static LineMarkerStyle ParseMarker(XElement node, string dataAttribute, string svgAttribute)
    {
        var dataValue = node.Attribute(dataAttribute)?.Value;
        if (!string.IsNullOrWhiteSpace(dataValue)
            && Enum.TryParse(dataValue, ignoreCase: true, out LineMarkerStyle parsed))
            return parsed;

        return SvgStrokeRenderer.ParseMarkerUrl(SvgStyleHelper.GetAttribute(node, svgAttribute));
    }

    private static SvgElementKind? ParseKind(XElement node)
    {
        var value = node.Attribute("data-kind")?.Value;
        if (string.IsNullOrWhiteSpace(value))
            return null;

        return Enum.TryParse(value, ignoreCase: true, out SvgElementKind kind) ? kind : null;
    }

    private static bool IsSquareRect(XElement node)
    {
        var value = node.Attribute("data-kind")?.Value;
        return string.Equals(value, "Square", StringComparison.OrdinalIgnoreCase);
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

    private static bool IsBackgroundRect(XElement node, float width, float height)
    {
        var x = ParseLength(SvgStyleHelper.GetAttribute(node, "x"), -1f);
        var y = ParseLength(SvgStyleHelper.GetAttribute(node, "y"), -1f);
        var w = ParseLength(SvgStyleHelper.GetAttribute(node, "width"), -1f);
        var h = ParseLength(SvgStyleHelper.GetAttribute(node, "height"), -1f);
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

        if (!float.TryParse(parts[0], NumberStyles.Float, CultureInfo.InvariantCulture, out var x))
            return null;
        if (!float.TryParse(parts[1], NumberStyles.Float, CultureInfo.InvariantCulture, out var y))
            return null;
        if (!float.TryParse(parts[2], NumberStyles.Float, CultureInfo.InvariantCulture, out var width))
            return null;
        if (!float.TryParse(parts[3], NumberStyles.Float, CultureInfo.InvariantCulture, out var height))
            return null;

        return new RectangleF(x, y, width, height);
    }

    private static float ParseLength(string? value, float fallback)
    {
        if (string.IsNullOrWhiteSpace(value))
            return fallback;

        value = value.Trim();
        if (value.EndsWith('%'))
            return fallback;

        value = value.TrimEnd('p', 'x', 't', 'c', 'm', 'm', 'n', 'i');
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
