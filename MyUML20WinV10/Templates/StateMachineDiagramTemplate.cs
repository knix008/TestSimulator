using MyUML20WinV10.Models;

namespace MyUML20WinV10.Templates;

public static class StateMachineDiagramTemplate
{
    public const string Id = "state-machine-diagram";

    public static UmlDiagram Build(UmlProject project)
    {
        var diagram = new UmlDiagram { Name = "State Machine Diagram", Kind = UmlDiagramKind.StateMachineDiagram };

        var initial   = new UmlBehaviorNode { Name = "Initial",   Kind = UmlBehaviorNodeKind.InitialState };
        var pending   = new UmlBehaviorNode { Name = "Pending",   Kind = UmlBehaviorNodeKind.State };
        var paid      = new UmlBehaviorNode { Name = "Paid",      Kind = UmlBehaviorNodeKind.State };
        var shipped   = new UmlBehaviorNode { Name = "Shipped",   Kind = UmlBehaviorNodeKind.State };
        var delivered = new UmlBehaviorNode { Name = "Delivered", Kind = UmlBehaviorNodeKind.State };
        var cancelled = new UmlBehaviorNode { Name = "Cancelled", Kind = UmlBehaviorNodeKind.State };
        var final     = new UmlBehaviorNode { Name = "Final",     Kind = UmlBehaviorNodeKind.FinalState };

        foreach (var n in new[] { initial, pending, paid, shipped, delivered, cancelled, (UmlBehaviorNode)final })
            project.RootPackage.AddBehaviorNode(n);

        var toPending   = Transition("submit",   initial,   pending);
        var toPaid      = Transition("pay",      pending,   paid);
        var toShipped   = Transition("ship",     paid,      shipped);
        var toDelivered = Transition("deliver",  shipped,   delivered);
        var cancelPending = Transition("cancel", pending,   cancelled);
        var cancelPaid    = Transition("cancel", paid,      cancelled);
        var toFinal1    = Transition("close",    delivered, final);
        var toFinal2    = Transition("close",    cancelled, final);

        foreach (var t in new[] { toPending, toPaid, toShipped, toDelivered, cancelPending, cancelPaid, toFinal1, toFinal2 })
            project.RootPackage.AddRelationship(t);

        var initialNode   = UmlTemplateBuilder.AddNode(diagram, initial.Id,   UmlNodePresentation.Behavior, 40,  200, 32,  32);
        var pendingNode   = UmlTemplateBuilder.AddNode(diagram, pending.Id,   UmlNodePresentation.Behavior, 130, 180, 130, 72);
        var paidNode      = UmlTemplateBuilder.AddNode(diagram, paid.Id,      UmlNodePresentation.Behavior, 320, 180, 130, 72);
        var shippedNode   = UmlTemplateBuilder.AddNode(diagram, shipped.Id,   UmlNodePresentation.Behavior, 510, 180, 130, 72);
        var deliveredNode = UmlTemplateBuilder.AddNode(diagram, delivered.Id, UmlNodePresentation.Behavior, 700, 180, 130, 72);
        var cancelledNode = UmlTemplateBuilder.AddNode(diagram, cancelled.Id, UmlNodePresentation.Behavior, 310, 320, 160, 72);
        var finalNode     = UmlTemplateBuilder.AddNode(diagram, final.Id,     UmlNodePresentation.Behavior, 880, 200, 32,  32);

        UmlTemplateBuilder.AddEdge(diagram, toPending.Id,    initialNode,   pendingNode);
        UmlTemplateBuilder.AddEdge(diagram, toPaid.Id,       pendingNode,   paidNode);
        UmlTemplateBuilder.AddEdge(diagram, toShipped.Id,    paidNode,      shippedNode);
        UmlTemplateBuilder.AddEdge(diagram, toDelivered.Id,  shippedNode,   deliveredNode);
        UmlTemplateBuilder.AddEdge(diagram, cancelPending.Id,pendingNode,   cancelledNode);
        UmlTemplateBuilder.AddEdge(diagram, cancelPaid.Id,   paidNode,      cancelledNode);
        UmlTemplateBuilder.AddEdge(diagram, toFinal1.Id,     deliveredNode, finalNode);
        UmlTemplateBuilder.AddEdge(diagram, toFinal2.Id,     cancelledNode, finalNode);

        return diagram;
    }

    public static UmlProject BuildProject()
    {
        var project = new UmlProject { Name = "State Machine Diagram Template" };
        project.Diagrams.Clear();
        project.Diagrams.Add(Build(project));
        return project;
    }

    private static UmlBehaviorConnector Transition(string name, UmlBehaviorNode source, UmlBehaviorNode target) => new()
    {
        Name = name,
        Kind = UmlBehaviorConnectorKind.Transition,
        SourceClassifierId = source.Id,
        TargetClassifierId = target.Id,
    };
}
