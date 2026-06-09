using MyUML20WinV10.Models;

namespace MyUML20WinV10.Templates;

public static class ActivityDiagramTemplate
{
    public const string Id = "activity-diagram";

    public static UmlDiagram Build(UmlProject project)
    {
        var diagram = new UmlDiagram { Name = "Activity Diagram", Kind = UmlDiagramKind.ActivityDiagram };

        var initial = new UmlBehaviorNode { Name = "Initial", Kind = UmlBehaviorNodeKind.InitialNode };
        var receiveOrder = new UmlBehaviorNode { Name = "Receive Order", Kind = UmlBehaviorNodeKind.Action };
        var decision = new UmlBehaviorNode { Name = "In Stock?", Kind = UmlBehaviorNodeKind.Decision };
        var shipOrder = new UmlBehaviorNode { Name = "Ship Order", Kind = UmlBehaviorNodeKind.Action };
        var backOrder = new UmlBehaviorNode { Name = "Back Order", Kind = UmlBehaviorNodeKind.Action };
        var merge = new UmlBehaviorNode { Name = "Merge", Kind = UmlBehaviorNodeKind.Merge };
        var final = new UmlBehaviorNode { Name = "Final", Kind = UmlBehaviorNodeKind.ActivityFinalNode };
        foreach (var node in new[] { initial, receiveOrder, decision, shipOrder, backOrder, merge, final })
            project.RootPackage.AddBehaviorNode(node);

        var flows = new[]
        {
            NewControlFlow(null, initial, receiveOrder),
            NewControlFlow(null, receiveOrder, decision),
            NewControlFlow("yes", decision, shipOrder),
            NewControlFlow("no", decision, backOrder),
            NewControlFlow(null, shipOrder, merge),
            NewControlFlow(null, backOrder, merge),
            NewControlFlow(null, merge, final),
        };
        foreach (var flow in flows)
            project.RootPackage.AddRelationship(flow);

        var initialNode = UmlTemplateBuilder.AddNode(diagram, initial.Id, UmlNodePresentation.Behavior, 80, 220, 32, 32);
        var receiveNode = UmlTemplateBuilder.AddNode(diagram, receiveOrder.Id, UmlNodePresentation.Behavior, 200, 200, 140, 60);
        var decisionNode = UmlTemplateBuilder.AddNode(diagram, decision.Id, UmlNodePresentation.Behavior, 420, 198, 72, 72);
        var shipNode = UmlTemplateBuilder.AddNode(diagram, shipOrder.Id, UmlNodePresentation.Behavior, 580, 100, 140, 60);
        var backOrderNode = UmlTemplateBuilder.AddNode(diagram, backOrder.Id, UmlNodePresentation.Behavior, 580, 320, 140, 60);
        var mergeNode = UmlTemplateBuilder.AddNode(diagram, merge.Id, UmlNodePresentation.Behavior, 800, 198, 72, 72);
        var finalNode = UmlTemplateBuilder.AddNode(diagram, final.Id, UmlNodePresentation.Behavior, 940, 220, 32, 32);

        UmlTemplateBuilder.AddEdge(diagram, flows[0].Id, initialNode, receiveNode);
        UmlTemplateBuilder.AddEdge(diagram, flows[1].Id, receiveNode, decisionNode);
        UmlTemplateBuilder.AddEdge(diagram, flows[2].Id, decisionNode, shipNode);
        UmlTemplateBuilder.AddEdge(diagram, flows[3].Id, decisionNode, backOrderNode);
        UmlTemplateBuilder.AddEdge(diagram, flows[4].Id, shipNode, mergeNode);
        UmlTemplateBuilder.AddEdge(diagram, flows[5].Id, backOrderNode, mergeNode);
        UmlTemplateBuilder.AddEdge(diagram, flows[6].Id, mergeNode, finalNode);

        return diagram;
    }

    public static UmlProject BuildProject()
    {
        var project = new UmlProject { Name = "Activity Diagram Template" };
        project.Diagrams.Clear();
        project.Diagrams.Add(Build(project));
        return project;
    }

    private static UmlBehaviorConnector NewControlFlow(string? name, UmlBehaviorNode source, UmlBehaviorNode target) => new()
    {
        Name = name ?? string.Empty,
        Kind = UmlBehaviorConnectorKind.ControlFlow,
        SourceClassifierId = source.Id,
        TargetClassifierId = target.Id,
    };
}
