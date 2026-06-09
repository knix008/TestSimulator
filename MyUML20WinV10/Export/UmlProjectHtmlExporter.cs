using System.Text;
using MyUML20WinV10.Models;

namespace MyUML20WinV10.Export;

public static class UmlProjectHtmlExporter
{
    public const string FileFilter = "HTML 문서 (*.html)|*.html";

    public static void Export(UmlProject project, string path, UmlDocumentExportOptions options)
    {
        var directory = Path.GetDirectoryName(path) ?? Directory.GetCurrentDirectory();
        var imageFolder = Path.Combine(directory, $"{Path.GetFileNameWithoutExtension(path)}_diagrams");
        if (!options.EmbedDiagramImages)
            Directory.CreateDirectory(imageFolder);

        var imageOptions = new UmlImageExportOptions
        {
            TransparentBackground = options.TransparentDiagramBackground,
            BackgroundColor = options.DiagramBackgroundColor,
        };

        var sb = new StringBuilder();
        sb.AppendLine("<!DOCTYPE html>");
        sb.AppendLine("<html lang=\"ko\">");
        sb.AppendLine("<head>");
        sb.AppendLine("  <meta charset=\"utf-8\" />");
        sb.AppendLine($"  <title>{EscapeHtml(project.Name)}</title>");
        sb.AppendLine("  <style>");
        sb.AppendLine("    body { font-family: 'Segoe UI', sans-serif; margin: 24px; color: #111; }");
        sb.AppendLine("    h1, h2, h3, h4 { margin-top: 1.5em; }");
        sb.AppendLine("    .diagram { margin: 24px 0; }");
        sb.AppendLine("    .diagram img, .diagram object { max-width: 100%; border: 1px solid #ddd; }");
        sb.AppendLine("    ul { line-height: 1.6; }");
        sb.AppendLine("    .meta { color: #666; font-size: 0.9em; }");
        sb.AppendLine("  </style>");
        sb.AppendLine("</head>");
        sb.AppendLine("<body>");
        sb.AppendLine($"  <h1>{EscapeHtml(project.Name)}</h1>");
        sb.AppendLine($"  <p class=\"meta\">UML 2.0 프로젝트 문서 · 생성 시각 {DateTime.Now:yyyy-MM-dd HH:mm}</p>");

        foreach (var diagram in project.Diagrams)
        {
            sb.AppendLine("  <section class=\"diagram\">");
            sb.AppendLine($"    <h2>{EscapeHtml(UmlDiagramCatalog.GetDiagramTreeLabel(diagram))}</h2>");
            sb.AppendLine($"    <p class=\"meta\">{EscapeHtml(diagram.Kind.ToString())} · 요소 {diagram.Nodes.Count}개 · 관계 {diagram.Edges.Count}개</p>");

            AppendDiagramContentsHtml(sb, project, diagram);

            if (options.EmbedDiagramImages)
            {
                var bytes = UmlDiagramImageExporter.ExportToBytes(project, diagram, options.DiagramImageFormat, imageOptions);
                var mime = options.DiagramImageFormat == UmlImageFormat.Jpeg ? "image/jpeg" : options.DiagramImageFormat == UmlImageFormat.Bmp ? "image/bmp" : "image/png";
                var base64 = Convert.ToBase64String(bytes);
                sb.AppendLine($"    <img alt=\"{EscapeHtml(diagram.Name)}\" src=\"data:{mime};base64,{base64}\" />");
            }
            else
            {
                var imageName = $"{UmlDiagramLayout.SanitizeFileName(diagram.Name)}{UmlDiagramImageExporter.GetExtension(options.DiagramImageFormat)}";
                var imagePath = Path.Combine(imageFolder, imageName);
                UmlDiagramImageExporter.Export(project, diagram, imagePath, options.DiagramImageFormat, imageOptions);
                var relative = Path.GetRelativePath(directory, imagePath).Replace('\\', '/');
                sb.AppendLine($"    <img alt=\"{EscapeHtml(diagram.Name)}\" src=\"{EscapeHtml(relative)}\" />");
            }

            sb.AppendLine("  </section>");
        }

        sb.AppendLine("</body>");
        sb.AppendLine("</html>");
        File.WriteAllText(path, sb.ToString(), Encoding.UTF8);
    }

    private static void AppendDiagramContentsHtml(StringBuilder sb, UmlProject project, UmlDiagram diagram)
    {
        var elements = UmlDiagramCatalog.GetDiagramElements(project, diagram).ToList();
        if (elements.Count > 0)
        {
            sb.AppendLine("    <h3>요소</h3>");
            sb.AppendLine("    <ul>");
            foreach (var (_, element) in elements)
            {
                sb.AppendLine($"      <li>{EscapeHtml(UmlDiagramCatalog.GetElementTreeLabel(element))}");
                if (element is UmlClassifier classifier)
                    AppendClassifierDetailsHtml(sb, classifier, "      ");
                sb.AppendLine("      </li>");
            }

            sb.AppendLine("    </ul>");
        }

        var relationships = UmlDiagramCatalog.GetDiagramRelationships(project, diagram).ToList();
        if (relationships.Count > 0)
        {
            sb.AppendLine("    <h3>관계</h3>");
            sb.AppendLine("    <ul>");
            foreach (var (diagramEdge, relationship) in relationships)
                sb.AppendLine($"      <li>{EscapeHtml(UmlDiagramCatalog.GetRelationshipTreeLabel(project, diagram, diagramEdge, relationship))}</li>");
            sb.AppendLine("    </ul>");
        }
    }

    private static void AppendClassifierDetailsHtml(StringBuilder sb, UmlClassifier classifier, string indent)
    {
        if (classifier.Properties.Count == 0 && classifier.Operations.Count == 0 && classifier is not UmlEnumeration)
            return;

        sb.AppendLine($"{indent}  <ul>");
        foreach (var property in classifier.Properties)
            sb.AppendLine($"{indent}    <li>{EscapeHtml(property.SignatureText)}</li>");
        foreach (var operation in classifier.Operations)
            sb.AppendLine($"{indent}    <li>{EscapeHtml(operation.SignatureText)}</li>");
        if (classifier is UmlEnumeration enumeration)
        {
            foreach (var literal in enumeration.Literals)
                sb.AppendLine($"{indent}    <li>{EscapeHtml(literal)}</li>");
        }

        sb.AppendLine($"{indent}  </ul>");
    }

    private static string EscapeHtml(string text) =>
        text.Replace("&", "&amp;", StringComparison.Ordinal)
            .Replace("<", "&lt;", StringComparison.Ordinal)
            .Replace(">", "&gt;", StringComparison.Ordinal)
            .Replace("\"", "&quot;", StringComparison.Ordinal);
}
