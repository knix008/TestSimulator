using System.Text;
using MyUML20WinV10.Models;

namespace MyUML20WinV10.Export;

public static class UmlProjectMarkdownExporter
{
    public const string FileFilter = "Markdown 문서 (*.md)|*.md";

    public static void Export(UmlProject project, string path, UmlDocumentExportOptions options)
    {
        var directory = Path.GetDirectoryName(path) ?? Directory.GetCurrentDirectory();
        var imageFolder = Path.Combine(directory, $"{Path.GetFileNameWithoutExtension(path)}_diagrams");
        Directory.CreateDirectory(imageFolder);

        var imageOptions = new UmlImageExportOptions
        {
            TransparentBackground = options.TransparentDiagramBackground,
            BackgroundColor = options.DiagramBackgroundColor,
        };

        var sb = new StringBuilder();
        sb.AppendLine($"# {project.Name}");
        sb.AppendLine();
        sb.AppendLine($"> UML 2.0 프로젝트 문서 · 생성 시각 {DateTime.Now:yyyy-MM-dd HH:mm}");
        sb.AppendLine();

        foreach (var diagram in project.Diagrams)
        {
            var imageName = $"{UmlDiagramLayout.SanitizeFileName(diagram.Name)}{UmlDiagramImageExporter.GetExtension(options.DiagramImageFormat)}";
            var imagePath = Path.Combine(imageFolder, imageName);
            UmlDiagramImageExporter.Export(project, diagram, imagePath, options.DiagramImageFormat, imageOptions);

            var relative = Path.GetRelativePath(directory, imagePath).Replace('\\', '/');
            sb.AppendLine($"## {UmlDiagramCatalog.GetDiagramTreeLabel(diagram)}");
            sb.AppendLine();
            sb.AppendLine($"*{diagram.Kind} · 요소 {diagram.Nodes.Count}개 · 관계 {diagram.Edges.Count}개*");
            sb.AppendLine();
            AppendDiagramContentsMarkdown(sb, project, diagram);
            sb.AppendLine($"![{diagram.Name}]({relative})");
            sb.AppendLine();
        }

        File.WriteAllText(path, sb.ToString(), Encoding.UTF8);
    }

    private static void AppendDiagramContentsMarkdown(StringBuilder sb, UmlProject project, UmlDiagram diagram)
    {
        var elements = UmlDiagramCatalog.GetDiagramElements(project, diagram).ToList();
        if (elements.Count > 0)
        {
            sb.AppendLine("### 요소");
            sb.AppendLine();
            foreach (var (_, element) in elements)
            {
                sb.AppendLine($"- {UmlDiagramCatalog.GetElementTreeLabel(element)}");
                if (element is UmlClassifier classifier)
                    AppendClassifierDetailsMarkdown(sb, classifier);
            }

            sb.AppendLine();
        }

        var relationships = UmlDiagramCatalog.GetDiagramRelationships(project, diagram).ToList();
        if (relationships.Count > 0)
        {
            sb.AppendLine("### 관계");
            sb.AppendLine();
            foreach (var (diagramEdge, relationship) in relationships)
                sb.AppendLine($"- {UmlDiagramCatalog.GetRelationshipTreeLabel(project, diagram, diagramEdge, relationship)}");
            sb.AppendLine();
        }
    }

    private static void AppendClassifierDetailsMarkdown(StringBuilder sb, UmlClassifier classifier)
    {
        foreach (var property in classifier.Properties)
            sb.AppendLine($"  - `{property.SignatureText}`");
        foreach (var operation in classifier.Operations)
            sb.AppendLine($"  - `{operation.SignatureText}`");
        if (classifier is UmlEnumeration enumeration)
        {
            foreach (var literal in enumeration.Literals)
                sb.AppendLine($"  - `{literal}`");
        }
    }
}
