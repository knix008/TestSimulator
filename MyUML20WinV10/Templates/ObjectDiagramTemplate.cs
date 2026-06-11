using MyUML20WinV10.Models;

namespace MyUML20WinV10.Templates;

public static class ObjectDiagramTemplate
{
    public const string Id = "object-diagram";

    public static UmlDiagram Build(UmlProject project)
    {
        var diagram = new UmlDiagram { Name = "Object Diagram", Kind = UmlDiagramKind.ObjectDiagram };

        var order = new UmlObjectInstance { Name = "order1", TypeName = "Order" };
        var customer = new UmlObjectInstance { Name = "cust1", TypeName = "Customer" };
        project.RootPackage.AddObjectInstance(order);
        project.RootPackage.AddObjectInstance(customer);

        var association = new UmlAssociation
        {
            SourceClassifierId = customer.Id,
            TargetClassifierId = order.Id,
            Name = "places",
        };
        project.RootPackage.AddRelationship(association);

        var customerNode = UmlTemplateBuilder.AddNode(diagram, customer.Id, UmlNodePresentation.ObjectInstance, 80, 120, 120, 48);
        var orderNode = UmlTemplateBuilder.AddNode(diagram, order.Id, UmlNodePresentation.ObjectInstance, 280, 120, 120, 48);
        UmlTemplateBuilder.AddEdge(diagram, association.Id, customerNode, orderNode);

        return diagram;
    }

    public static UmlProject BuildProject()
    {
        var project = new UmlProject { Name = "Object Diagram Template" };
        project.Diagrams.Clear();
        project.Diagrams.Add(Build(project));
        return project;
    }
}
