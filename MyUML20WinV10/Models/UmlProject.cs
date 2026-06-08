using System.ComponentModel;

namespace MyUML20WinV10.Models;

public sealed class UmlProject
{
    [Category("프로젝트")]
    [DisplayName("이름")]
    public string Name { get; set; } = "Untitled";

    [Browsable(false)]
    public UmlPackage RootPackage { get; set; } = new();

    [Browsable(false)]
    public List<UmlDiagram> Diagrams { get; set; } = [new UmlDiagram()];

    public UmlDiagram ActiveDiagram
    {
        get => Diagrams.Count > 0 ? Diagrams[0] : throw new InvalidOperationException("다이어그램이 없습니다.");
        set
        {
            var index = Diagrams.FindIndex(d => d.Id == value.Id);
            if (index < 0)
                Diagrams.Insert(0, value);
            else if (index != 0)
            {
                Diagrams.RemoveAt(index);
                Diagrams.Insert(0, value);
            }
        }
    }

    public UmlClassifier? FindClassifier(Guid id) => RootPackage.FindClassifier(id);

    public UmlRelationship? FindRelationship(Guid id) => RootPackage.FindRelationship(id);

    public UmlElement? FindElement(Guid id) => RootPackage.FindElement(id);

    public void RemoveElement(Guid id)
    {
        RootPackage.RemoveElement(id);
        foreach (var diagram in Diagrams)
        {
            diagram.Nodes.RemoveAll(n => n.ModelElementId == id);
            diagram.Edges.RemoveAll(e => e.ModelElementId == id);
        }
    }

    /// <summary>
    /// Reference template covering every diagram kind and tool the editor supports,
    /// used both as the "샘플 불러오기" starter project and as a save/load smoke test.
    /// </summary>
    public static UmlProject CreateSample()
    {
        var project = new UmlProject { Name = "Sample UML" };
        project.Diagrams.Clear();

        var classDiagram = BuildClassDiagram(project);
        var useCaseDiagram = BuildUseCaseDiagram(project);
        var sequenceDiagram = BuildSequenceDiagram(project);
        var stateMachineDiagram = BuildStateMachineDiagram(project);
        var activityDiagram = BuildActivityDiagram(project);

        project.Diagrams.AddRange([classDiagram, useCaseDiagram, sequenceDiagram, stateMachineDiagram, activityDiagram]);
        return project;
    }

    private static UmlDiagram BuildClassDiagram(UmlProject project)
    {
        var diagram = new UmlDiagram { Name = "Class Diagram", Kind = UmlDiagramKind.ClassDiagram };

        var customer = new UmlClass { Name = "Customer", IsAbstract = false };
        customer.Properties.Add(new UmlProperty { Name = "id", TypeName = "Guid", Visibility = UmlVisibility.Private });
        customer.Properties.Add(new UmlProperty { Name = "name", TypeName = "string", Visibility = UmlVisibility.Private });
        customer.Operations.Add(new UmlOperation { Name = "PlaceOrder", ReturnTypeName = "Order", Visibility = UmlVisibility.Public });

        var order = new UmlClass { Name = "Order" };
        order.Properties.Add(new UmlProperty { Name = "orderDate", TypeName = "DateTime", Visibility = UmlVisibility.Private });
        order.Operations.Add(new UmlOperation { Name = "Total", ReturnTypeName = "decimal", Visibility = UmlVisibility.Public });

        project.RootPackage.AddClassifier(customer);
        project.RootPackage.AddClassifier(order);

        var association = new UmlAssociation
        {
            SourceClassifierId = customer.Id,
            TargetClassifierId = order.Id,
            SourceEndName = "orders",
            TargetEndName = "customer",
            SourceMultiplicity = "1",
            TargetMultiplicity = "0..*",
        };
        project.RootPackage.AddRelationship(association);

        var customerNode = AddNode(diagram, customer.Id, UmlNodePresentation.Classifier, 80, 80, 180, 140);
        var orderNode = AddNode(diagram, order.Id, UmlNodePresentation.Classifier, 360, 120, 180, 120);
        AddEdge(diagram, association.Id, customerNode, orderNode);

        return diagram;
    }

    private static UmlDiagram BuildUseCaseDiagram(UmlProject project)
    {
        var diagram = new UmlDiagram { Name = "Use Case Diagram", Kind = UmlDiagramKind.UseCaseDiagram };

        var customer = new UmlActor { Name = "Customer" };
        var placeOrder = new UmlUseCase { Name = "Place Order" };
        var makePayment = new UmlUseCase { Name = "Make Payment" };

        project.RootPackage.AddActor(customer);
        project.RootPackage.AddUseCase(placeOrder);
        project.RootPackage.AddUseCase(makePayment);

        var association = new UmlAssociation { SourceClassifierId = customer.Id, TargetClassifierId = placeOrder.Id };
        var include = new UmlInclude { SourceClassifierId = placeOrder.Id, TargetClassifierId = makePayment.Id };
        project.RootPackage.AddRelationship(association);
        project.RootPackage.AddRelationship(include);

        var actorNode = AddNode(diagram, customer.Id, UmlNodePresentation.Actor, 80, 120, 72, 96);
        var placeOrderNode = AddNode(diagram, placeOrder.Id, UmlNodePresentation.UseCase, 280, 100, 160, 72);
        var makePaymentNode = AddNode(diagram, makePayment.Id, UmlNodePresentation.UseCase, 520, 100, 160, 72);
        AddEdge(diagram, association.Id, actorNode, placeOrderNode);
        AddEdge(diagram, include.Id, placeOrderNode, makePaymentNode);

        return diagram;
    }

    private static UmlDiagram BuildSequenceDiagram(UmlProject project)
    {
        var diagram = new UmlDiagram { Name = "Sequence Diagram", Kind = UmlDiagramKind.SequenceDiagram };

        var customerLifeline = new UmlBehaviorNode { Name = "customer", Kind = UmlBehaviorNodeKind.Lifeline };
        var orderServiceLifeline = new UmlBehaviorNode { Name = "orderService", Kind = UmlBehaviorNodeKind.Lifeline };
        project.RootPackage.AddBehaviorNode(customerLifeline);
        project.RootPackage.AddBehaviorNode(orderServiceLifeline);

        var callMessage = new UmlBehaviorConnector
        {
            Name = "placeOrder()",
            Kind = UmlBehaviorConnectorKind.Message,
            MessageKind = UmlMessageKind.Synchronous,
            SourceClassifierId = customerLifeline.Id,
            TargetClassifierId = orderServiceLifeline.Id,
        };
        var returnMessage = new UmlBehaviorConnector
        {
            Name = "orderId",
            Kind = UmlBehaviorConnectorKind.Message,
            MessageKind = UmlMessageKind.Return,
            SourceClassifierId = orderServiceLifeline.Id,
            TargetClassifierId = customerLifeline.Id,
        };
        project.RootPackage.AddRelationship(callMessage);
        project.RootPackage.AddRelationship(returnMessage);

        var customerNode = AddNode(diagram, customerLifeline.Id, UmlNodePresentation.Behavior, 100, 60, 120, 280);
        var orderServiceNode = AddNode(diagram, orderServiceLifeline.Id, UmlNodePresentation.Behavior, 360, 60, 120, 280);
        AddSequenceEdge(diagram, callMessage.Id, customerNode, orderServiceNode, 132f);
        AddSequenceEdge(diagram, returnMessage.Id, orderServiceNode, customerNode, 180f);

        return diagram;
    }

    private static UmlDiagram BuildStateMachineDiagram(UmlProject project)
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

        var initialNode = AddNode(diagram, initial.Id, UmlNodePresentation.Behavior, 80, 140, 32, 32);
        var pendingNode = AddNode(diagram, pending.Id, UmlNodePresentation.Behavior, 200, 120, 140, 72);
        var shippedNode = AddNode(diagram, shipped.Id, UmlNodePresentation.Behavior, 420, 120, 140, 72);
        var finalNode = AddNode(diagram, final.Id, UmlNodePresentation.Behavior, 640, 140, 32, 32);
        AddEdge(diagram, toPending.Id, initialNode, pendingNode);
        AddEdge(diagram, toShipped.Id, pendingNode, shippedNode);
        AddEdge(diagram, toFinal.Id, shippedNode, finalNode);

        return diagram;

        static UmlBehaviorConnector NewTransition(string name, UmlBehaviorNode source, UmlBehaviorNode target) => new()
        {
            Name = name,
            Kind = UmlBehaviorConnectorKind.Transition,
            SourceClassifierId = source.Id,
            TargetClassifierId = target.Id,
        };
    }

    private static UmlDiagram BuildActivityDiagram(UmlProject project)
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

        var initialNode = AddNode(diagram, initial.Id, UmlNodePresentation.Behavior, 80, 220, 32, 32);
        var receiveNode = AddNode(diagram, receiveOrder.Id, UmlNodePresentation.Behavior, 200, 200, 140, 60);
        var decisionNode = AddNode(diagram, decision.Id, UmlNodePresentation.Behavior, 420, 198, 72, 72);
        var shipNode = AddNode(diagram, shipOrder.Id, UmlNodePresentation.Behavior, 580, 100, 140, 60);
        var backOrderNode = AddNode(diagram, backOrder.Id, UmlNodePresentation.Behavior, 580, 320, 140, 60);
        var mergeNode = AddNode(diagram, merge.Id, UmlNodePresentation.Behavior, 800, 198, 72, 72);
        var finalNode = AddNode(diagram, final.Id, UmlNodePresentation.Behavior, 940, 220, 32, 32);

        AddEdge(diagram, flows[0].Id, initialNode, receiveNode);
        AddEdge(diagram, flows[1].Id, receiveNode, decisionNode);
        AddEdge(diagram, flows[2].Id, decisionNode, shipNode);
        AddEdge(diagram, flows[3].Id, decisionNode, backOrderNode);
        AddEdge(diagram, flows[4].Id, shipNode, mergeNode);
        AddEdge(diagram, flows[5].Id, backOrderNode, mergeNode);
        AddEdge(diagram, flows[6].Id, mergeNode, finalNode);

        return diagram;

        static UmlBehaviorConnector NewControlFlow(string? name, UmlBehaviorNode source, UmlBehaviorNode target) => new()
        {
            Name = name ?? string.Empty,
            Kind = UmlBehaviorConnectorKind.ControlFlow,
            SourceClassifierId = source.Id,
            TargetClassifierId = target.Id,
        };
    }

    private static UmlDiagramNode AddNode(UmlDiagram diagram, Guid modelElementId, UmlNodePresentation presentation, float x, float y, float width, float height)
    {
        var node = new UmlDiagramNode
        {
            ModelElementId = modelElementId,
            Presentation = presentation,
            X = x,
            Y = y,
            Width = width,
            Height = height,
        };
        diagram.Nodes.Add(node);
        return node;
    }

    private static void AddEdge(UmlDiagram diagram, Guid modelElementId, UmlDiagramNode source, UmlDiagramNode target) =>
        diagram.Edges.Add(new UmlDiagramEdge
        {
            ModelElementId = modelElementId,
            SourceNodeId = source.Id,
            TargetNodeId = target.Id,
        });

    private static void AddSequenceEdge(
        UmlDiagram diagram,
        Guid modelElementId,
        UmlDiagramNode source,
        UmlDiagramNode target,
        float sequenceY) =>
        diagram.Edges.Add(new UmlDiagramEdge
        {
            ModelElementId = modelElementId,
            SourceNodeId = source.Id,
            TargetNodeId = target.Id,
            SequenceY = sequenceY,
        });
}
