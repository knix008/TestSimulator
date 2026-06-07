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
        sb.AppendLine("    h1, h2, h3 { margin-top: 1.5em; }");
        sb.AppendLine("    .diagram { margin: 24px 0; }");
        sb.AppendLine("    .diagram img, .diagram object { max-width: 100%; border: 1px solid #ddd; }");
        sb.AppendLine("    ul { line-height: 1.6; }");
        sb.AppendLine("    .meta { color: #666; font-size: 0.9em; }");
        sb.AppendLine("  </style>");
        sb.AppendLine("</head>");
        sb.AppendLine("<body>");
        sb.AppendLine($"  <h1>{EscapeHtml(project.Name)}</h1>");
        sb.AppendLine($"  <p class=\"meta\">UML 2.0 프로젝트 문서 · 생성 시각 {DateTime.Now:yyyy-MM-dd HH:mm}</p>");

        sb.AppendLine("  <h2>모델 구조</h2>");
        AppendPackageHtml(sb, project.RootPackage, 0);

        sb.AppendLine("  <h2>다이어그램</h2>");
        foreach (var diagram in project.Diagrams)
        {
            sb.AppendLine("  <section class=\"diagram\">");
            sb.AppendLine($"    <h3>{EscapeHtml(diagram.Name)} <span class=\"meta\">({diagram.Kind})</span></h3>");

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

    private static void AppendPackageHtml(StringBuilder sb, UmlPackage package, int depth)
    {
        var indent = new string(' ', depth * 2);
        sb.AppendLine($"{indent}<ul>");
        sb.AppendLine($"{indent}  <li><strong>Package</strong> {EscapeHtml(package.Name)}</li>");
        sb.AppendLine($"{indent}  <ul>");

        foreach (var nested in package.NestedPackages)
            AppendPackageHtml(sb, nested, depth + 2);

        foreach (var classifier in package.Classifiers)
        {
            sb.AppendLine($"{indent}    <li><strong>{EscapeHtml(classifier.NotationKeyword)}</strong> {EscapeHtml(classifier.Name)}");
            if (!string.IsNullOrWhiteSpace(classifier.Stereotype))
                sb.AppendLine($"{indent}      <div class=\"meta\">«{EscapeHtml(classifier.Stereotype)}»</div>");

            if (classifier.Properties.Count > 0)
            {
                sb.AppendLine($"{indent}      <ul>");
                foreach (var property in classifier.Properties)
                    sb.AppendLine($"{indent}        <li>{EscapeHtml(property.SignatureText)}</li>");
                sb.AppendLine($"{indent}      </ul>");
            }

            if (classifier.Operations.Count > 0)
            {
                sb.AppendLine($"{indent}      <ul>");
                foreach (var operation in classifier.Operations)
                    sb.AppendLine($"{indent}        <li>{EscapeHtml(operation.SignatureText)}</li>");
                sb.AppendLine($"{indent}      </ul>");
            }

            if (classifier is UmlEnumeration enumeration)
            {
                sb.AppendLine($"{indent}      <ul>");
                foreach (var literal in enumeration.Literals)
                    sb.AppendLine($"{indent}        <li>{EscapeHtml(literal)}</li>");
                sb.AppendLine($"{indent}      </ul>");
            }

            sb.AppendLine($"{indent}    </li>");
        }

        foreach (var relationship in package.Relationships)
            sb.AppendLine($"{indent}    <li><strong>{EscapeHtml(relationship.RelationshipKind)}</strong> {EscapeHtml(relationship.DisplayLabel)}</li>");

        sb.AppendLine($"{indent}  </ul>");
        sb.AppendLine($"{indent}</ul>");
    }

    private static string EscapeHtml(string text) =>
        text.Replace("&", "&amp;", StringComparison.Ordinal)
            .Replace("<", "&lt;", StringComparison.Ordinal)
            .Replace(">", "&gt;", StringComparison.Ordinal)
            .Replace("\"", "&quot;", StringComparison.Ordinal);
}
