using MyUML20WinV10.Models;

namespace MyUML20WinV10.Templates;

public static class PackageDiagramTemplate
{
    public const string Id = "package-diagram";

    public static UmlDiagram Build(UmlProject project)
    {
        var diagram = new UmlDiagram { Name = "Package Diagram", Kind = UmlDiagramKind.PackageDiagram };

        var genApply = new UmlPackage { Name = "GenApply" };
        var controller = new UmlPackage { Name = "Controller" };
        var common = new UmlPackage { Name = "Common" };
        var model = new UmlPackage { Name = "Model" };

        project.RootPackage.AddNestedPackage(genApply);
        project.RootPackage.AddNestedPackage(controller);
        project.RootPackage.AddNestedPackage(common);
        project.RootPackage.AddNestedPackage(model);

        var merge = new UmlPackageRelationship
        {
            PackageKind = UmlPackageRelationshipKind.Merge,
            SourceClassifierId = genApply.Id,
            TargetClassifierId = controller.Id,
        };
        var import = new UmlPackageRelationship
        {
            PackageKind = UmlPackageRelationshipKind.Import,
            SourceClassifierId = controller.Id,
            TargetClassifierId = common.Id,
        };
        var nesting = new UmlPackageRelationship
        {
            PackageKind = UmlPackageRelationshipKind.Nesting,
            SourceClassifierId = model.Id,
            TargetClassifierId = controller.Id,
        };

        project.RootPackage.AddRelationship(merge);
        project.RootPackage.AddRelationship(import);
        project.RootPackage.AddRelationship(nesting);

        var genApplyNode = UmlTemplateBuilder.AddNode(diagram, genApply.Id, UmlNodePresentation.Package, 40, 80, 180, 120);
        var controllerNode = UmlTemplateBuilder.AddNode(diagram, controller.Id, UmlNodePresentation.Package, 320, 80, 200, 140);
        var commonNode = UmlTemplateBuilder.AddNode(diagram, common.Id, UmlNodePresentation.Package, 600, 60, 180, 110);
        var modelNode = UmlTemplateBuilder.AddNode(diagram, model.Id, UmlNodePresentation.Package, 360, 280, 160, 100);

        UmlTemplateBuilder.AddEdge(diagram, merge.Id, genApplyNode, controllerNode);
        UmlTemplateBuilder.AddEdge(diagram, import.Id, controllerNode, commonNode);
        UmlTemplateBuilder.AddEdge(diagram, nesting.Id, modelNode, controllerNode);

        return diagram;
    }

    public static UmlProject BuildProject()
    {
        var project = new UmlProject { Name = "Package Diagram Template" };
        project.Diagrams.Clear();
        project.Diagrams.Add(Build(project));
        return project;
    }
}
