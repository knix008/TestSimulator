using MyUML20WinV10.Models;

namespace MyUML20WinV10.Templates;

public static class ProfileDiagramTemplate
{
    public const string Id = "profile-diagram";

    public static UmlDiagram Build(UmlProject project)
    {
        var diagram = new UmlDiagram { Name = "Profile Diagram", Kind = UmlDiagramKind.ProfileDiagram };

        var profile = new UmlPackage { Name = "ECommerceProfile", Stereotype = "profile" };
        var metaclass = new UmlClass { Name = "Product", Stereotype = "metaclass" };
        var stereotypeClass = new UmlClass { Name = "Sellable", Stereotype = "stereotype" };

        project.RootPackage.AddNestedPackage(profile);
        project.RootPackage.AddClassifier(metaclass);
        project.RootPackage.AddClassifier(stereotypeClass);

        var apply = new UmlDependency
        {
            Stereotype = "apply",
            SourceClassifierId = stereotypeClass.Id,
            TargetClassifierId = metaclass.Id,
        };
        project.RootPackage.AddRelationship(apply);

        var profileNode = UmlTemplateBuilder.AddNode(diagram, profile.Id, UmlNodePresentation.Package, 40, 60, 200, 140);
        var metaNode = UmlTemplateBuilder.AddNode(diagram, metaclass.Id, UmlNodePresentation.Classifier, 300, 80, 160, 100);
        var stereoNode = UmlTemplateBuilder.AddNode(diagram, stereotypeClass.Id, UmlNodePresentation.Classifier, 300, 240, 160, 100);

        UmlTemplateBuilder.AddEdge(diagram, apply.Id, stereoNode, metaNode);
        return diagram;
    }

    public static UmlProject BuildProject()
    {
        var project = new UmlProject { Name = "Profile Diagram Template" };
        project.Diagrams.Clear();
        project.Diagrams.Add(Build(project));
        return project;
    }
}
