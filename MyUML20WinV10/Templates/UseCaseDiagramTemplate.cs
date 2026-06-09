using MyUML20WinV10.Models;

namespace MyUML20WinV10.Templates;

public static class UseCaseDiagramTemplate
{
    public const string Id = "use-case-diagram";

    public static UmlDiagram Build(UmlProject project)
    {
        var diagram = new UmlDiagram { Name = "Use Case Diagram", Kind = UmlDiagramKind.UseCaseDiagram };

        var system = new UmlSystemBoundary { Name = "Order System" };
        var customer = new UmlActor { Name = "Customer" };
        var placeOrder = new UmlUseCase { Name = "Place Order" };
        var makePayment = new UmlUseCase { Name = "Make Payment" };

        project.RootPackage.AddSystemBoundary(system);
        project.RootPackage.AddActor(customer);
        project.RootPackage.AddUseCase(placeOrder);
        project.RootPackage.AddUseCase(makePayment);

        var association = new UmlAssociation { SourceClassifierId = customer.Id, TargetClassifierId = placeOrder.Id };
        var include = new UmlInclude { SourceClassifierId = placeOrder.Id, TargetClassifierId = makePayment.Id };
        project.RootPackage.AddRelationship(association);
        project.RootPackage.AddRelationship(include);

        UmlTemplateBuilder.AddNode(diagram, system.Id, UmlNodePresentation.SystemBoundary, 220, 60, 500, 200);
        var actorNode = UmlTemplateBuilder.AddNode(diagram, customer.Id, UmlNodePresentation.Actor, 80, 120, 72, 96);
        var placeOrderNode = UmlTemplateBuilder.AddNode(diagram, placeOrder.Id, UmlNodePresentation.UseCase, 280, 100, 160, 72);
        var makePaymentNode = UmlTemplateBuilder.AddNode(diagram, makePayment.Id, UmlNodePresentation.UseCase, 520, 100, 160, 72);
        UmlTemplateBuilder.AddEdge(diagram, association.Id, actorNode, placeOrderNode);
        UmlTemplateBuilder.AddEdge(diagram, include.Id, placeOrderNode, makePaymentNode);

        return diagram;
    }

    public static UmlProject BuildProject()
    {
        var project = new UmlProject { Name = "Use Case Diagram Template" };
        project.Diagrams.Clear();
        project.Diagrams.Add(Build(project));
        return project;
    }
}
