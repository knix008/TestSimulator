using MyUML20WinV10.Models;

namespace MyUML20WinV10.Templates;

public static class ActivityDiagramTemplate
{
    public const string Id = "activity-diagram";

    public static UmlDiagram Build(UmlProject project)
    {
        var diagram = new UmlDiagram { Name = "Activity Diagram", Kind = UmlDiagramKind.ActivityDiagram };

        // Nodes
        var initial      = new UmlBehaviorNode { Name = "Initial",         Kind = UmlBehaviorNodeKind.InitialNode };
        var inputPin     = new UmlBehaviorNode { Name = "orderData",       Kind = UmlBehaviorNodeKind.InputPin };
        var validate     = new UmlBehaviorNode { Name = "Validate Order",  Kind = UmlBehaviorNodeKind.Action };
        var decision     = new UmlBehaviorNode { Name = "Valid?",          Kind = UmlBehaviorNodeKind.Decision };
        var fork         = new UmlBehaviorNode { Name = "Fork",            Kind = UmlBehaviorNodeKind.Fork };
        var expansion    = new UmlBehaviorNode { Name = "Process Items",   Kind = UmlBehaviorNodeKind.ExpansionRegion, ExpansionKind = UmlExpansionRegionKind.Iterative };
        var charge       = new UmlBehaviorNode { Name = "Charge Payment",  Kind = UmlBehaviorNodeKind.Action };
        var join         = new UmlBehaviorNode { Name = "Join",            Kind = UmlBehaviorNodeKind.Join };
        var shipOrder    = new UmlBehaviorNode { Name = "Ship Order",      Kind = UmlBehaviorNodeKind.Action };
        var outputPin    = new UmlBehaviorNode { Name = "trackingCode",    Kind = UmlBehaviorNodeKind.OutputPin };
        var reject       = new UmlBehaviorNode { Name = "Reject Order",    Kind = UmlBehaviorNodeKind.Action };
        var merge        = new UmlBehaviorNode { Name = "Merge",           Kind = UmlBehaviorNodeKind.Merge };
        var final        = new UmlBehaviorNode { Name = "Final",           Kind = UmlBehaviorNodeKind.ActivityFinalNode };

        foreach (var n in new[] { initial, inputPin, validate, decision, fork, expansion, charge, join, shipOrder, outputPin, reject, merge, final })
            project.RootPackage.AddBehaviorNode(n);

        // Flows
        var f0  = ControlFlow(initial,   validate);
        var f1  = ObjectFlow(inputPin,   validate,   "orderData");
        var f2  = ControlFlow(validate,  decision);
        var f3  = ControlFlow(decision,  fork,       "valid");
        var f4  = ControlFlow(decision,  reject,     "invalid");
        var f5  = ControlFlow(fork,      expansion);
        var f6  = ControlFlow(fork,      charge);
        var f7  = ControlFlow(expansion, join);
        var f8  = ControlFlow(charge,    join);
        var f9  = ControlFlow(join,      shipOrder);
        var f10 = ObjectFlow(shipOrder,  outputPin,  "trackingCode");
        var f11 = ControlFlow(shipOrder, merge);
        var f12 = ControlFlow(reject,    merge);
        var f13 = ControlFlow(merge,     final);

        foreach (var f in new[] { f0, f1, f2, f3, f4, f5, f6, f7, f8, f9, f10, f11, f12, f13 })
            project.RootPackage.AddRelationship(f);

        // Layout — left to right with fork/join branch
        var initialNode   = UmlTemplateBuilder.AddNode(diagram, initial.Id,   UmlNodePresentation.Behavior, 40,  200, 32,  32);
        var inputPinNode  = UmlTemplateBuilder.AddNode(diagram, inputPin.Id,  UmlNodePresentation.Behavior, 40,  280, 80,  28);
        var validateNode  = UmlTemplateBuilder.AddNode(diagram, validate.Id,  UmlNodePresentation.Behavior, 140, 185, 140, 60);
        var decisionNode  = UmlTemplateBuilder.AddNode(diagram, decision.Id,  UmlNodePresentation.Behavior, 340, 184, 72,  72);
        var forkNode      = UmlTemplateBuilder.AddNode(diagram, fork.Id,      UmlNodePresentation.Behavior, 480, 162, 16,  120);
        var expansionNode = UmlTemplateBuilder.AddNode(diagram, expansion.Id, UmlNodePresentation.Behavior, 550, 100, 160, 90);
        var chargeNode    = UmlTemplateBuilder.AddNode(diagram, charge.Id,    UmlNodePresentation.Behavior, 550, 240, 160, 60);
        var joinNode      = UmlTemplateBuilder.AddNode(diagram, join.Id,      UmlNodePresentation.Behavior, 770, 162, 16,  120);
        var shipNode      = UmlTemplateBuilder.AddNode(diagram, shipOrder.Id, UmlNodePresentation.Behavior, 840, 185, 150, 60);
        var outputPinNode = UmlTemplateBuilder.AddNode(diagram, outputPin.Id, UmlNodePresentation.Behavior, 840, 280, 100, 28);
        var rejectNode    = UmlTemplateBuilder.AddNode(diagram, reject.Id,    UmlNodePresentation.Behavior, 440, 340, 140, 60);
        var mergeNode     = UmlTemplateBuilder.AddNode(diagram, merge.Id,     UmlNodePresentation.Behavior, 1040, 184, 72, 72);
        var finalNode     = UmlTemplateBuilder.AddNode(diagram, final.Id,     UmlNodePresentation.Behavior, 1170, 200, 32, 32);

        UmlTemplateBuilder.AddEdge(diagram, f0.Id,  initialNode,   validateNode);
        UmlTemplateBuilder.AddEdge(diagram, f1.Id,  inputPinNode,  validateNode);
        UmlTemplateBuilder.AddEdge(diagram, f2.Id,  validateNode,  decisionNode);
        UmlTemplateBuilder.AddEdge(diagram, f3.Id,  decisionNode,  forkNode);
        UmlTemplateBuilder.AddEdge(diagram, f4.Id,  decisionNode,  rejectNode);
        UmlTemplateBuilder.AddEdge(diagram, f5.Id,  forkNode,      expansionNode);
        UmlTemplateBuilder.AddEdge(diagram, f6.Id,  forkNode,      chargeNode);
        UmlTemplateBuilder.AddEdge(diagram, f7.Id,  expansionNode, joinNode);
        UmlTemplateBuilder.AddEdge(diagram, f8.Id,  chargeNode,    joinNode);
        UmlTemplateBuilder.AddEdge(diagram, f9.Id,  joinNode,      shipNode);
        UmlTemplateBuilder.AddEdge(diagram, f10.Id, shipNode,      outputPinNode);
        UmlTemplateBuilder.AddEdge(diagram, f11.Id, shipNode,      mergeNode);
        UmlTemplateBuilder.AddEdge(diagram, f12.Id, rejectNode,    mergeNode);
        UmlTemplateBuilder.AddEdge(diagram, f13.Id, mergeNode,     finalNode);

        return diagram;
    }

    public static UmlProject BuildProject()
    {
        var project = new UmlProject { Name = "Activity Diagram Template" };
        project.Diagrams.Clear();
        project.Diagrams.Add(Build(project));
        return project;
    }

    private static UmlBehaviorConnector ControlFlow(UmlBehaviorNode source, UmlBehaviorNode target, string? guard = null) => new()
    {
        Name = guard ?? string.Empty,
        Kind = UmlBehaviorConnectorKind.ControlFlow,
        SourceClassifierId = source.Id,
        TargetClassifierId = target.Id,
    };

    private static UmlBehaviorConnector ObjectFlow(UmlBehaviorNode source, UmlBehaviorNode target, string name) => new()
    {
        Name = name,
        Kind = UmlBehaviorConnectorKind.ObjectFlow,
        SourceClassifierId = source.Id,
        TargetClassifierId = target.Id,
    };
}
