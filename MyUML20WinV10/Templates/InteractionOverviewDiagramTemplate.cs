using MyUML20WinV10.Models;

namespace MyUML20WinV10.Templates;

public static class InteractionOverviewDiagramTemplate
{
    public const string Id = "interaction-overview-diagram";

    public static UmlDiagram Build(UmlProject project)
    {
        var diagram = new UmlDiagram { Name = "Interaction Overview Diagram", Kind = UmlDiagramKind.InteractionOverviewDiagram };

        var initial = new UmlBehaviorNode { Name = "Initial", Kind = UmlBehaviorNodeKind.InitialNode };
        var use1 = new UmlBehaviorNode
        {
            Name = "Place Order",
            Kind = UmlBehaviorNodeKind.InteractionUse,
            ReferencedDiagramName = "Sequence Diagram",
        };
        var decision = new UmlBehaviorNode { Name = "paid?", Kind = UmlBehaviorNodeKind.Decision };
        var use2 = new UmlBehaviorNode
        {
            Name = "Payment",
            Kind = UmlBehaviorNodeKind.InteractionUse,
            ReferencedDiagramName = "Payment Flow",
        };
        var final = new UmlBehaviorNode { Name = "Final", Kind = UmlBehaviorNodeKind.ActivityFinalNode };

        foreach (var node in new[] { initial, use1, decision, use2, final })
            project.RootPackage.AddBehaviorNode(node);

        var flow1 = new UmlBehaviorConnector
        {
            Kind = UmlBehaviorConnectorKind.ControlFlow,
            SourceClassifierId = initial.Id,
            TargetClassifierId = use1.Id,
        };
        var flow2 = new UmlBehaviorConnector
        {
            Kind = UmlBehaviorConnectorKind.ControlFlow,
            SourceClassifierId = use1.Id,
            TargetClassifierId = decision.Id,
        };
        var flow3 = new UmlBehaviorConnector
        {
            Kind = UmlBehaviorConnectorKind.ControlFlow,
            SourceClassifierId = decision.Id,
            TargetClassifierId = use2.Id,
            Guard = "[ok]",
        };
        var flow4 = new UmlBehaviorConnector
        {
            Kind = UmlBehaviorConnectorKind.ControlFlow,
            SourceClassifierId = use2.Id,
            TargetClassifierId = final.Id,
        };

        foreach (var edge in new[] { flow1, flow2, flow3, flow4 })
            project.RootPackage.AddRelationship(edge);

        var n0 = UmlTemplateBuilder.AddNode(diagram, initial.Id, UmlNodePresentation.Behavior, 80, 120, 32, 32);
        var n1 = UmlTemplateBuilder.AddNode(diagram, use1.Id, UmlNodePresentation.Behavior, 160, 100, 140, 60);
        var n2 = UmlTemplateBuilder.AddNode(diagram, decision.Id, UmlNodePresentation.Behavior, 340, 100, 72, 72);
        var n3 = UmlTemplateBuilder.AddNode(diagram, use2.Id, UmlNodePresentation.Behavior, 460, 100, 140, 60);
        var n4 = UmlTemplateBuilder.AddNode(diagram, final.Id, UmlNodePresentation.Behavior, 640, 110, 32, 32);

        UmlTemplateBuilder.AddEdge(diagram, flow1.Id, n0, n1);
        UmlTemplateBuilder.AddEdge(diagram, flow2.Id, n1, n2);
        UmlTemplateBuilder.AddEdge(diagram, flow3.Id, n2, n3);
        UmlTemplateBuilder.AddEdge(diagram, flow4.Id, n3, n4);

        return diagram;
    }

    public static UmlProject BuildProject()
    {
        var project = new UmlProject { Name = "Interaction Overview Diagram Template" };
        project.Diagrams.Clear();
        project.Diagrams.Add(Build(project));
        return project;
    }
}
