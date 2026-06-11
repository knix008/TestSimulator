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
        var inventoryPart = new UmlBehaviorNode
        {
            Name = "inventory",
            Kind = UmlBehaviorNodeKind.Lifeline,
            ParentLifelineId = orderServiceLifeline.Id,
            DecompositionRole = ":inventory",
        };
        var interactionOccurrence = new UmlBehaviorNode
        {
            Name = "sd",
            Kind = UmlBehaviorNodeKind.CombinedFragment,
            CombinedFragmentKind = UmlCombinedFragmentKind.InteractionOccurrence,
            ReferencedDiagramName = "Checkout Flow",
        };
        project.RootPackage.AddBehaviorNode(customerLifeline);
        project.RootPackage.AddBehaviorNode(orderServiceLifeline);
        project.RootPackage.AddBehaviorNode(inventoryPart);
        project.RootPackage.AddBehaviorNode(interactionOccurrence);

        var callMessage = new UmlBehaviorConnector
        {
            Name = "placeOrder()",
            Kind = UmlBehaviorConnectorKind.Message,
            MessageKind = UmlMessageKind.Synchronous,
            SourceClassifierId = customerLifeline.Id,
            TargetClassifierId = orderServiceLifeline.Id,
            DurationMin = "2",
            DurationMax = "5",
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

        var customerNode = UmlTemplateBuilder.AddNode(diagram, customerLifeline.Id, UmlNodePresentation.Behavior, 80, 60, 120, 300);
        var orderServiceNode = UmlTemplateBuilder.AddNode(diagram, orderServiceLifeline.Id, UmlNodePresentation.Behavior, 280, 60, 120, 300);
        var inventoryNode = UmlTemplateBuilder.AddNode(diagram, inventoryPart.Id, UmlNodePresentation.Behavior, 500, 90, 96, 270);
        UmlTemplateBuilder.AddNode(diagram, interactionOccurrence.Id, UmlNodePresentation.Behavior, 60, 220, 300, 120);
        UmlTemplateBuilder.AddSequenceEdge(diagram, callMessage.Id, customerNode, orderServiceNode, 132f);
        UmlTemplateBuilder.AddSequenceEdge(diagram, returnMessage.Id, orderServiceNode, customerNode, 200f);

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
