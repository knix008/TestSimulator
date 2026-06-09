using MyUML20WinV10.Models;

namespace MyUML20WinV10.Templates;

public static class StateMachineDiagramTemplate
{
    public const string Id = "state-machine-diagram";

    public static UmlDiagram Build(UmlProject project)
    {
        var diagram = new UmlDiagram { Name = "State Machine Diagram", Kind = UmlDiagramKind.StateMachineDiagram };

        var initial = new UmlBehaviorNode { Name = "Initial", Kind = UmlBehaviorNodeKind.InitialState };
        var pending = new UmlBehaviorNode { Name = "Pending", Kind = UmlBehaviorNodeKind.State };
        var shipped = new UmlBehaviorNode { Name = "Shipped", Kind = UmlBehaviorNodeKind.State };
        var final = new UmlBehaviorNode { Name = "Final", Kind = UmlBehaviorNodeKind.FinalState };
        project.RootPackage.AddBehaviorNode(initial);
        project.RootPackage.AddBehaviorNode(pending);
        project.RootPackage.AddBehaviorNode(shipped);
        project.RootPackage.AddBehaviorNode(final);

        var toPending = NewTransition("submit", initial, pending);
        var toShipped = NewTransition("ship", pending, shipped);
        var toFinal = NewTransition("deliver", shipped, final);
        project.RootPackage.AddRelationship(toPending);
        project.RootPackage.AddRelationship(toShipped);
        project.RootPackage.AddRelationship(toFinal);

        var initialNode = UmlTemplateBuilder.AddNode(diagram, initial.Id, UmlNodePresentation.Behavior, 80, 140, 32, 32);
        var pendingNode = UmlTemplateBuilder.AddNode(diagram, pending.Id, UmlNodePresentation.Behavior, 200, 120, 140, 72);
        var shippedNode = UmlTemplateBuilder.AddNode(diagram, shipped.Id, UmlNodePresentation.Behavior, 420, 120, 140, 72);
        var finalNode = UmlTemplateBuilder.AddNode(diagram, final.Id, UmlNodePresentation.Behavior, 640, 140, 32, 32);
        UmlTemplateBuilder.AddEdge(diagram, toPending.Id, initialNode, pendingNode);
        UmlTemplateBuilder.AddEdge(diagram, toShipped.Id, pendingNode, shippedNode);
        UmlTemplateBuilder.AddEdge(diagram, toFinal.Id, shippedNode, finalNode);

        return diagram;
    }

    public static UmlProject BuildProject()
    {
        var project = new UmlProject { Name = "State Machine Diagram Template" };
        project.Diagrams.Clear();
        project.Diagrams.Add(Build(project));
        return project;
    }

    private static UmlBehaviorConnector NewTransition(string name, UmlBehaviorNode source, UmlBehaviorNode target) => new()
    {
        Name = name,
        Kind = UmlBehaviorConnectorKind.Transition,
        SourceClassifierId = source.Id,
        TargetClassifierId = target.Id,
    };
}
