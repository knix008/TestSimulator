using MyUML20WinV10.Models;

namespace MyUML20WinV10.Templates;

public static class ClassDiagramTemplate
{
    public const string Id = "class-diagram";

    public static UmlDiagram Build(UmlProject project)
    {
        var diagram = new UmlDiagram { Name = "Class Diagram", Kind = UmlDiagramKind.ClassDiagram };

        // Abstract base
        var person = new UmlClass { Name = "Person", IsAbstract = true };
        person.Properties.Add(new UmlProperty { Name = "id", TypeName = "Guid", Visibility = UmlVisibility.Private });
        person.Properties.Add(new UmlProperty { Name = "name", TypeName = "string", Visibility = UmlVisibility.Protected });
        person.Operations.Add(new UmlOperation { Name = "GetFullName", ReturnTypeName = "string", Visibility = UmlVisibility.Public, IsAbstract = true });

        // Concrete class
        var customer = new UmlClass { Name = "Customer" };
        customer.Properties.Add(new UmlProperty { Name = "email", TypeName = "string", Visibility = UmlVisibility.Private });
        customer.Properties.Add(new UmlProperty { Name = "tier", TypeName = "CustomerTier", Visibility = UmlVisibility.Private });
        customer.Operations.Add(new UmlOperation { Name = "PlaceOrder", ReturnTypeName = "Order", Visibility = UmlVisibility.Public });
        customer.Operations.Add(new UmlOperation { Name = "GetFullName", ReturnTypeName = "string", Visibility = UmlVisibility.Public });

        // Order class
        var order = new UmlClass { Name = "Order" };
        order.Properties.Add(new UmlProperty { Name = "orderDate", TypeName = "DateTime", Visibility = UmlVisibility.Private });
        order.Properties.Add(new UmlProperty { Name = "status", TypeName = "OrderStatus", Visibility = UmlVisibility.Private });
        order.Operations.Add(new UmlOperation { Name = "Total", ReturnTypeName = "decimal", Visibility = UmlVisibility.Public });
        order.Operations.Add(new UmlOperation { Name = "Cancel", ReturnTypeName = "void", Visibility = UmlVisibility.Public });

        // Interface
        var iShippable = new UmlInterface { Name = "IShippable" };
        iShippable.Operations.Add(new UmlOperation { Name = "Ship", ReturnTypeName = "void", Visibility = UmlVisibility.Public });
        iShippable.Operations.Add(new UmlOperation { Name = "Track", ReturnTypeName = "string", Visibility = UmlVisibility.Public });

        // Enumeration
        var orderStatus = new UmlEnumeration { Name = "OrderStatus" };
        orderStatus.Literals.AddRange(["Pending", "Paid", "Shipped", "Delivered", "Cancelled"]);

        // Table (DB table stereotype)
        var ordersTable = new UmlClass { Name = "orders", Stereotype = "table" };
        ordersTable.Properties.Add(new UmlProperty { Name = "id", TypeName = "INT PK", Visibility = UmlVisibility.Public });
        ordersTable.Properties.Add(new UmlProperty { Name = "customer_id", TypeName = "INT FK", Visibility = UmlVisibility.Public });
        ordersTable.Properties.Add(new UmlProperty { Name = "order_date", TypeName = "DATETIME", Visibility = UmlVisibility.Public });
        ordersTable.Properties.Add(new UmlProperty { Name = "total", TypeName = "DECIMAL", Visibility = UmlVisibility.Public });

        project.RootPackage.AddClassifier(person);
        project.RootPackage.AddClassifier(customer);
        project.RootPackage.AddClassifier(order);
        project.RootPackage.AddClassifier(iShippable);
        project.RootPackage.AddClassifier(orderStatus);
        project.RootPackage.AddClassifier(ordersTable);

        // Relationships
        var personToCustomer = new UmlGeneralization
        {
            SourceClassifierId = customer.Id,
            TargetClassifierId = person.Id,
        };
        var customerToOrder = new UmlAssociation
        {
            SourceClassifierId = customer.Id,
            TargetClassifierId = order.Id,
            SourceEndName = "orders",
            TargetEndName = "customer",
            SourceMultiplicity = "0..*",
            TargetMultiplicity = "1",
        };
        var orderRealizesShippable = new UmlRealization
        {
            SourceClassifierId = order.Id,
            TargetClassifierId = iShippable.Id,
        };

        project.RootPackage.AddRelationship(personToCustomer);
        project.RootPackage.AddRelationship(customerToOrder);
        project.RootPackage.AddRelationship(orderRealizesShippable);

        // Layout: top row = Person, Customer, Order; bottom row = IShippable, OrderStatus, ordersTable
        var personNode       = UmlTemplateBuilder.AddNode(diagram, person.Id,       UmlNodePresentation.Classifier, 60,  40,  160, 120);
        var customerNode     = UmlTemplateBuilder.AddNode(diagram, customer.Id,     UmlNodePresentation.Classifier, 280, 40,  180, 140);
        var orderNode        = UmlTemplateBuilder.AddNode(diagram, order.Id,        UmlNodePresentation.Classifier, 520, 40,  180, 140);
        var iShippableNode   = UmlTemplateBuilder.AddNode(diagram, iShippable.Id,   UmlNodePresentation.Classifier, 520, 250, 180, 100);
        var orderStatusNode  = UmlTemplateBuilder.AddNode(diagram, orderStatus.Id,  UmlNodePresentation.Classifier, 60,  260, 160, 140);
        var ordersTableNode  = UmlTemplateBuilder.AddNode(diagram, ordersTable.Id,  UmlNodePresentation.Classifier, 280, 260, 200, 150);

        UmlTemplateBuilder.AddEdge(diagram, personToCustomer.Id, customerNode, personNode);
        UmlTemplateBuilder.AddEdge(diagram, customerToOrder.Id, customerNode, orderNode);
        UmlTemplateBuilder.AddEdge(diagram, orderRealizesShippable.Id, orderNode, iShippableNode);

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
