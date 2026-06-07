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
        sb.AppendLine("## 모델 구조");
        sb.AppendLine();
        AppendPackageMarkdown(sb, project.RootPackage, 0);
        sb.AppendLine();
        sb.AppendLine("## 다이어그램");
        sb.AppendLine();

        foreach (var diagram in project.Diagrams)
        {
            var imageName = $"{UmlDiagramLayout.SanitizeFileName(diagram.Name)}{UmlDiagramImageExporter.GetExtension(options.DiagramImageFormat)}";
            var imagePath = Path.Combine(imageFolder, imageName);
            UmlDiagramImageExporter.Export(project, diagram, imagePath, options.DiagramImageFormat, imageOptions);

            var relative = Path.GetRelativePath(directory, imagePath).Replace('\\', '/');
            sb.AppendLine($"### {diagram.Name} ({diagram.Kind})");
            sb.AppendLine();
            sb.AppendLine($"![{diagram.Name}]({relative})");
            sb.AppendLine();
        }

        File.WriteAllText(path, sb.ToString(), Encoding.UTF8);
    }

    private static void AppendPackageMarkdown(StringBuilder sb, UmlPackage package, int depth)
    {
        var indent = new string(' ', depth * 2);
        sb.AppendLine($"{indent}- **Package** {package.Name}");

        foreach (var nested in package.NestedPackages)
            AppendPackageMarkdown(sb, nested, depth + 1);

        foreach (var classifier in package.Classifiers)
        {
            sb.AppendLine($"{indent}  - **{classifier.NotationKeyword}** {classifier.Name}");
            if (!string.IsNullOrWhiteSpace(classifier.Stereotype))
                sb.AppendLine($"{indent}    - «{classifier.Stereotype}»");

            foreach (var property in classifier.Properties)
                sb.AppendLine($"{indent}    - `{property.SignatureText}`");

            foreach (var operation in classifier.Operations)
                sb.AppendLine($"{indent}    - `{operation.SignatureText}`");

            if (classifier is UmlEnumeration enumeration)
            {
                foreach (var literal in enumeration.Literals)
                    sb.AppendLine($"{indent}    - `{literal}`");
            }
        }

        foreach (var relationship in package.Relationships)
            sb.AppendLine($"{indent}  - **{relationship.RelationshipKind}** {relationship.DisplayLabel}");
    }
}
