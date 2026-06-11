using MyUML20WinV10.Models;

namespace MyUML20WinV10.Templates;

public static class TimingDiagramTemplate
{
    public const string Id = "timing-diagram";

    public static UmlDiagram Build(UmlProject project)
    {
        var diagram = new UmlDiagram { Name = "Timing Diagram", Kind = UmlDiagramKind.TimingDiagram };

        var lifeline = new UmlBehaviorNode { Name = "Controller", Kind = UmlBehaviorNodeKind.TimingLifeline };
        var idle = new UmlBehaviorNode { Name = "Idle", Kind = UmlBehaviorNodeKind.TimingState };
        var active = new UmlBehaviorNode { Name = "Active", Kind = UmlBehaviorNodeKind.TimingState };

        project.RootPackage.AddBehaviorNode(lifeline);
        project.RootPackage.AddBehaviorNode(idle);
        project.RootPackage.AddBehaviorNode(active);

        var lifelineNode = UmlTemplateBuilder.AddNode(diagram, lifeline.Id, UmlNodePresentation.Behavior, 60, 80, 480, 120);
        var idleNode = UmlTemplateBuilder.AddNode(diagram, idle.Id, UmlNodePresentation.Behavior, 80, 130, 140, 36);
        var activeNode = UmlTemplateBuilder.AddNode(diagram, active.Id, UmlNodePresentation.Behavior, 240, 130, 180, 36);

        return diagram;
    }

    public static UmlProject BuildProject()
    {
        var project = new UmlProject { Name = "Timing Diagram Template" };
        project.Diagrams.Clear();
        project.Diagrams.Add(Build(project));
        return project;
    }
}
