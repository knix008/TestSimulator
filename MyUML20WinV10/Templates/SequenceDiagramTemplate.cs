using MyUML20WinV10.Models;

namespace MyUML20WinV10.Templates;

public static class SequenceDiagramTemplate
{
    public const string Id = "sequence-diagram";

    public static UmlDiagram Build(UmlProject project)
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

        var customerNode = UmlTemplateBuilder.AddNode(diagram, customerLifeline.Id, UmlNodePresentation.Behavior, 100, 60, 120, 280);
        var orderServiceNode = UmlTemplateBuilder.AddNode(diagram, orderServiceLifeline.Id, UmlNodePresentation.Behavior, 360, 60, 120, 280);
        UmlTemplateBuilder.AddSequenceEdge(diagram, callMessage.Id, customerNode, orderServiceNode, 132f);
        UmlTemplateBuilder.AddSequenceEdge(diagram, returnMessage.Id, orderServiceNode, customerNode, 180f);

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
