using MyUML20WinV10.Models;

namespace MyUML20WinV10.Templates;

public static class ClassDiagramTemplate
{
    public const string Id = "class-diagram";

    public static UmlDiagram Build(UmlProject project)
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

        var customerNode = UmlTemplateBuilder.AddNode(diagram, customer.Id, UmlNodePresentation.Classifier, 80, 80, 180, 140);
        var orderNode = UmlTemplateBuilder.AddNode(diagram, order.Id, UmlNodePresentation.Classifier, 360, 120, 180, 120);
        UmlTemplateBuilder.AddEdge(diagram, association.Id, customerNode, orderNode);

        return diagram;
    }

    public static UmlProject BuildProject()
    {
        var project = new UmlProject { Name = "Class Diagram Template" };
        project.Diagrams.Clear();
        project.Diagrams.Add(Build(project));
        return project;
    }
}
