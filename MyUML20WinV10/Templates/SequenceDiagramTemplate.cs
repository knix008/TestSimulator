using MyUML20WinV10.Models;

namespace MyUML20WinV10.Templates;

public static class SequenceDiagramTemplate
{
    public const string Id = "sequence-diagram";

    public static UmlDiagram Build(UmlProject project)
    {
        var diagram = new UmlDiagram { Name = "Sequence Diagram", Kind = UmlDiagramKind.SequenceDiagram };

        // Lifelines
        var customerLL     = new UmlBehaviorNode { Name = "customer",       Kind = UmlBehaviorNodeKind.Lifeline };
        var orderServiceLL = new UmlBehaviorNode { Name = "orderService",   Kind = UmlBehaviorNodeKind.Lifeline };
        var paymentLL      = new UmlBehaviorNode { Name = "paymentGateway", Kind = UmlBehaviorNodeKind.Lifeline };

        // Combined fragments
        var loopFrag = new UmlBehaviorNode
        {
            Name = "loop",
            Kind = UmlBehaviorNodeKind.CombinedFragment,
            CombinedFragmentKind = UmlCombinedFragmentKind.Loop,
        };
        var altFrag = new UmlBehaviorNode
        {
            Name = "alt",
            Kind = UmlBehaviorNodeKind.CombinedFragment,
            CombinedFragmentKind = UmlCombinedFragmentKind.Alt,
        };

        project.RootPackage.AddBehaviorNode(customerLL);
        project.RootPackage.AddBehaviorNode(orderServiceLL);
        project.RootPackage.AddBehaviorNode(paymentLL);
        project.RootPackage.AddBehaviorNode(loopFrag);
        project.RootPackage.AddBehaviorNode(altFrag);

        // Messages
        var placeOrder = new UmlBehaviorConnector
        {
            Name = "placeOrder(items)",
            Kind = UmlBehaviorConnectorKind.Message,
            MessageKind = UmlMessageKind.Synchronous,
            SourceClassifierId = customerLL.Id,
            TargetClassifierId = orderServiceLL.Id,
        };
        var validateItem = new UmlBehaviorConnector
        {
            Name = "validateItem(item)",
            Kind = UmlBehaviorConnectorKind.Message,
            MessageKind = UmlMessageKind.Synchronous,
            SourceClassifierId = orderServiceLL.Id,
            TargetClassifierId = orderServiceLL.Id,
        };
        var chargeCard = new UmlBehaviorConnector
        {
            Name = "charge(amount)",
            Kind = UmlBehaviorConnectorKind.Message,
            MessageKind = UmlMessageKind.Synchronous,
            SourceClassifierId = orderServiceLL.Id,
            TargetClassifierId = paymentLL.Id,
        };
        var chargeSuccess = new UmlBehaviorConnector
        {
            Name = "paymentOk",
            Kind = UmlBehaviorConnectorKind.Message,
            MessageKind = UmlMessageKind.Return,
            SourceClassifierId = paymentLL.Id,
            TargetClassifierId = orderServiceLL.Id,
        };
        var chargeDeclined = new UmlBehaviorConnector
        {
            Name = "declined",
            Kind = UmlBehaviorConnectorKind.Message,
            MessageKind = UmlMessageKind.Return,
            SourceClassifierId = paymentLL.Id,
            TargetClassifierId = orderServiceLL.Id,
        };
        var confirmOrder = new UmlBehaviorConnector
        {
            Name = "orderId",
            Kind = UmlBehaviorConnectorKind.Message,
            MessageKind = UmlMessageKind.Return,
            SourceClassifierId = orderServiceLL.Id,
            TargetClassifierId = customerLL.Id,
        };

        project.RootPackage.AddRelationship(placeOrder);
        project.RootPackage.AddRelationship(validateItem);
        project.RootPackage.AddRelationship(chargeCard);
        project.RootPackage.AddRelationship(chargeSuccess);
        project.RootPackage.AddRelationship(chargeDeclined);
        project.RootPackage.AddRelationship(confirmOrder);

        // Layout
        var customerNode     = UmlTemplateBuilder.AddNode(diagram, customerLL.Id,     UmlNodePresentation.Behavior, 60,  50, 120, 440);
        var orderServiceNode = UmlTemplateBuilder.AddNode(diagram, orderServiceLL.Id, UmlNodePresentation.Behavior, 280, 50, 120, 440);
        var paymentNode      = UmlTemplateBuilder.AddNode(diagram, paymentLL.Id,      UmlNodePresentation.Behavior, 500, 50, 120, 440);

        // loop fragment: covers validate-item self-call area
        UmlTemplateBuilder.AddNode(diagram, loopFrag.Id, UmlNodePresentation.Behavior, 220, 170, 200, 90);

        // alt fragment: covers payment success/decline area
        UmlTemplateBuilder.AddNode(diagram, altFrag.Id,  UmlNodePresentation.Behavior, 220, 310, 460, 120);

        // Sequence edges (Y = vertical position of the arrow on the lifeline)
        UmlTemplateBuilder.AddSequenceEdge(diagram, placeOrder.Id,    customerNode,     orderServiceNode, 140f);
        UmlTemplateBuilder.AddSequenceEdge(diagram, validateItem.Id,  orderServiceNode, orderServiceNode, 210f);
        UmlTemplateBuilder.AddSequenceEdge(diagram, chargeCard.Id,    orderServiceNode, paymentNode,      330f);
        UmlTemplateBuilder.AddSequenceEdge(diagram, chargeSuccess.Id, paymentNode,      orderServiceNode, 365f);
        UmlTemplateBuilder.AddSequenceEdge(diagram, chargeDeclined.Id,paymentNode,      orderServiceNode, 405f);
        UmlTemplateBuilder.AddSequenceEdge(diagram, confirmOrder.Id,  orderServiceNode, customerNode,     450f);

        return diagram;
    }

    public static UmlProject BuildProject()
    {
        var project = new UmlProject { Name = "Sequence Diagram Template" };
        project.Diagrams.Clear();
        project.Diagrams.Add(Build(project));
        return project;
    }
}
