using System.Globalization;
using System.Text;
using MyUML20WinV10.Models;
using MyUML20WinV10.Rendering;

namespace MyUML20WinV10.Export;

public static class UmlDiagramSvgExporter
{
    public const string FileFilter = "SVG 이미지 (*.svg)|*.svg";

    public static void Export(UmlProject project, UmlDiagram diagram, string path, UmlVectorExportOptions options)
    {
        var svg = BuildSvg(project, diagram, options);
        File.WriteAllText(path, svg, Encoding.UTF8);
    }

    public static string BuildSvg(UmlProject project, UmlDiagram diagram, UmlVectorExportOptions options)
    {
        var bounds = UmlDiagramLayout.CalculateBounds(project, diagram);
        if (bounds.Width <= 0 || bounds.Height <= 0)
            bounds = new RectangleF(0, 0, 800, 600);

        var width = bounds.Width + options.Padding * 2;
        var height = bounds.Height + options.Padding * 2;
        var offset = new PointF(options.Padding - bounds.Left, options.Padding - bounds.Top);

        var sb = new StringBuilder();
        sb.AppendLine(CultureInfo.InvariantCulture,
            $"""<svg xmlns="http://www.w3.org/2000/svg" width="{width:0.##}" height="{height:0.##}" viewBox="0 0 {width:0.##} {height:0.##}">""");

        if (!options.TransparentBackground)
        {
            var back = ColorToHex(options.BackgroundColor);
            sb.AppendLine(CultureInfo.InvariantCulture,
                $"""  <rect x="0" y="0" width="{width:0.##}" height="{height:0.##}" fill="{back}" />""");
        }

        foreach (var edge in diagram.Edges)
            AppendEdgeSvg(sb, project, diagram, edge, offset);

        foreach (var node in diagram.Nodes)
            AppendNodeSvg(sb, project, node, offset);

        sb.AppendLine("</svg>");
        return sb.ToString();
    }

    private static void AppendNodeSvg(StringBuilder sb, UmlProject project, UmlDiagramNode node, PointF offset)
    {
        var classifier = project.FindClassifier(node.ModelElementId);
        if (classifier is null)
            return;

        var rect = OffsetRect(node.Bounds, offset);
        var stroke = "#000000";
        var fill = "#FFFFFF";

        if (classifier is UmlInterface)
        {
            sb.AppendLine(CultureInfo.InvariantCulture,
                $"""  <rect x="{rect.X:0.##}" y="{rect.Y:0.##}" width="{rect.Width:0.##}" height="{rect.Height:0.##}" fill="{fill}" stroke="{stroke}" stroke-width="1.5" rx="8" />""");
        }
        else
        {
            sb.AppendLine(CultureInfo.InvariantCulture,
                $"""  <rect x="{rect.X:0.##}" y="{rect.Y:0.##}" width="{rect.Width:0.##}" height="{rect.Height:0.##}" fill="{fill}" stroke="{stroke}" stroke-width="1.5" />""");
        }

        var y = rect.Y + 8f;
        var stereoText = !string.IsNullOrWhiteSpace(classifier.Stereotype)
            ? $"«{EscapeXml(classifier.Stereotype)}»"
            : classifier is UmlInterface ? "«interface»"
            : classifier is UmlEnumeration ? "«enumeration»"
            : null;
        if (stereoText != null)
        {
            AppendCenteredText(sb, stereoText, rect, y, italic: true);
            y += 16f;
        }

        AppendCenteredText(sb, EscapeXml(classifier.Name), rect, y, italic: classifier.IsAbstract, bold: true);
        y += 16f;
        sb.AppendLine(CultureInfo.InvariantCulture,
            $"""  <line x1="{rect.Left:0.##}" y1="{y:0.##}" x2="{rect.Right:0.##}" y2="{y:0.##}" stroke="{stroke}" stroke-width="1.5" />""");

        if (!node.ShowCompartments)
            return;

        if (classifier is UmlEnumeration enumeration)
        {
            y += 8f;
            foreach (var literal in enumeration.Literals)
            {
                sb.AppendLine(CultureInfo.InvariantCulture,
                    $"""  <text x="{rect.Left + 8:0.##}" y="{y + 12:0.##}" font-family="Segoe UI" font-size="12" fill="#000000">{EscapeXml(literal)}</text>""");
                y += 16f;
            }

            return;
        }

        if (classifier.Properties.Count > 0)
        {
            y += 8f;
            foreach (var property in classifier.Properties)
            {
                sb.AppendLine(CultureInfo.InvariantCulture,
                    $"""  <text x="{rect.Left + 8:0.##}" y="{y + 12:0.##}" font-family="Segoe UI" font-size="12" fill="#000000">{EscapeXml(property.SignatureText)}</text>""");
                y += 16f;
            }

            y += 4f;
            sb.AppendLine(CultureInfo.InvariantCulture,
                $"""  <line x1="{rect.Left:0.##}" y1="{y:0.##}" x2="{rect.Right:0.##}" y2="{y:0.##}" stroke="{stroke}" stroke-width="1.5" />""");
        }

        if (classifier.Operations.Count > 0)
        {
            y += 8f;
            foreach (var operation in classifier.Operations)
            {
                var style = operation.IsAbstract ? """ font-style="italic" """ : string.Empty;
                sb.AppendLine(CultureInfo.InvariantCulture,
                    $"""  <text x="{rect.Left + 8:0.##}" y="{y + 12:0.##}" font-family="Segoe UI" font-size="12" fill="#000000"{style}>{EscapeXml(operation.SignatureText)}</text>""");
                y += 16f;
            }
        }
    }

    private static void AppendEdgeSvg(StringBuilder sb, UmlProject project, UmlDiagram diagram, UmlDiagramEdge edge, PointF offset)
    {
        var sourceNode = diagram.FindNode(edge.SourceNodeId);
        var targetNode = diagram.FindNode(edge.TargetNodeId);
        if (sourceNode is null || targetNode is null)
            return;

        var relationship = project.FindRelationship(edge.ModelElementId);
        if (relationship is null)
            return;

        var start = OffsetPoint(GetCenter(sourceNode.Bounds), offset);
        var end = OffsetPoint(GetCenter(targetNode.Bounds), offset);
        var stroke = "#000000";

        switch (relationship)
        {
            case UmlGeneralization:
                sb.AppendLine(CultureInfo.InvariantCulture,
                    $"""  <line x1="{start.X:0.##}" y1="{start.Y:0.##}" x2="{end.X:0.##}" y2="{end.Y:0.##}" stroke="{stroke}" stroke-width="1.5" />""");
                break;
            case UmlDependency:
                sb.AppendLine(CultureInfo.InvariantCulture,
                    $"""  <line x1="{start.X:0.##}" y1="{start.Y:0.##}" x2="{end.X:0.##}" y2="{end.Y:0.##}" stroke="{stroke}" stroke-width="1.5" stroke-dasharray="6 4" />""");
                break;
            case UmlAssociation assoc:
                sb.AppendLine(CultureInfo.InvariantCulture,
                    $"""  <line x1="{start.X:0.##}" y1="{start.Y:0.##}" x2="{end.X:0.##}" y2="{end.Y:0.##}" stroke="{stroke}" stroke-width="1.5" />""");
                AppendEdgeLabel(sb, start, assoc.SourceMultiplicity);
                AppendEdgeLabel(sb, end, assoc.TargetMultiplicity);
                break;
        }
    }

    private static void AppendCenteredText(StringBuilder sb, string text, RectangleF rect, float y, bool italic, bool bold = false)
    {
        var style = italic ? """ font-style="italic" """ : string.Empty;
        var weight = bold ? """ font-weight="bold" """ : string.Empty;
        sb.AppendLine(CultureInfo.InvariantCulture,
            $"""  <text x="{rect.Left + rect.Width / 2:0.##}" y="{y + 12:0.##}" font-family="Segoe UI" font-size="12" fill="#000000" text-anchor="middle"{style}{weight}>{text}</text>""");
    }

    private static void AppendEdgeLabel(StringBuilder sb, PointF point, string text)
    {
        if (string.IsNullOrWhiteSpace(text))
            return;

        sb.AppendLine(CultureInfo.InvariantCulture,
            $"""  <text x="{point.X + 6:0.##}" y="{point.Y - 6:0.##}" font-family="Segoe UI" font-size="10" fill="#000000">{EscapeXml(text)}</text>""");
    }

    private static PointF GetCenter(RectangleF bounds) =>
        new(bounds.Left + bounds.Width / 2f, bounds.Top + bounds.Height / 2f);

    private static RectangleF OffsetRect(RectangleF rect, PointF offset) =>
        new(rect.X + offset.X, rect.Y + offset.Y, rect.Width, rect.Height);

    private static PointF OffsetPoint(PointF point, PointF offset) =>
        new(point.X + offset.X, point.Y + offset.Y);

    private static string ColorToHex(Color color) =>
        $"#{color.R:X2}{color.G:X2}{color.B:X2}";

    private static string EscapeXml(string text) =>
        text.Replace("&", "&amp;", StringComparison.Ordinal)
            .Replace("<", "&lt;", StringComparison.Ordinal)
            .Replace(">", "&gt;", StringComparison.Ordinal)
            .Replace("\"", "&quot;", StringComparison.Ordinal);
}
