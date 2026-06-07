using MyUML20WinV10.Models;

namespace MyUML20WinV10.Export;

public static class UmlExportService
{
    public static void ExportDiagramImage(UmlProject project, UmlDiagram diagram, string path, UmlImageFormat format, UmlImageExportOptions options) =>
        UmlDiagramImageExporter.Export(project, diagram, path, format, options);

    public static void ExportDiagramSvg(UmlProject project, UmlDiagram diagram, string path, UmlVectorExportOptions options) =>
        UmlDiagramSvgExporter.Export(project, diagram, path, options);

    public static void ExportDiagramPdf(UmlProject project, UmlDiagram diagram, string path, UmlImageExportOptions options) =>
        UmlDiagramPdfExporter.Export(project, diagram, path, options);

    public static int ExportDiagramImages(UmlProject project, string directory, UmlImageFormat format, UmlImageExportOptions options)
    {
        Directory.CreateDirectory(directory);
        var diagrams = ResolveDiagrams(project, options.Scope, project.ActiveDiagram);
        var count = 0;

        foreach (var diagram in diagrams)
        {
            var fileName = $"{UmlDiagramLayout.SanitizeFileName(diagram.Name)}{UmlDiagramImageExporter.GetExtension(format)}";
            var path = Path.Combine(directory, fileName);
            UmlDiagramImageExporter.Export(project, diagram, path, format, options);
            count++;
        }

        return count;
    }

    public static int ExportDiagramSvgs(UmlProject project, string directory, UmlVectorExportOptions options)
    {
        Directory.CreateDirectory(directory);
        var diagrams = ResolveDiagrams(project, options.Scope, project.ActiveDiagram);
        var count = 0;

        foreach (var diagram in diagrams)
        {
            var fileName = $"{UmlDiagramLayout.SanitizeFileName(diagram.Name)}.svg";
            var path = Path.Combine(directory, fileName);
            UmlDiagramSvgExporter.Export(project, diagram, path, options);
            count++;
        }

        return count;
    }

    public static IEnumerable<UmlDiagram> ResolveDiagrams(UmlProject project, UmlDiagramExportScope scope, UmlDiagram activeDiagram) =>
        scope == UmlDiagramExportScope.AllDiagrams ? project.Diagrams : [activeDiagram];
}
