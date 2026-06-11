using MyUML20WinV10.Models;

namespace MyUML20WinV10.Templates;

public static class ComponentDiagramTemplate
{
    public const string Id = "component-diagram";

    public static UmlDiagram Build(UmlProject project)
    {
        var diagram = new UmlDiagram { Name = "Component Diagram", Kind = UmlDiagramKind.ComponentDiagram };

        var shoppingCart = new UmlComponent { Name = "ShoppingCart", FillColor = "#FFFFD0D8" };
        var backOrder = new UmlComponent { Name = "BackOrder", FillColor = "#FFD8F0D0" };
        var order = new UmlComponent { Name = "Order", FillColor = "#FFFFF0A0" };
        var product = new UmlComponent { Name = "Product", FillColor = "#FFD0E8FF" };
        var customer = new UmlComponent { Name = "Customer", FillColor = "#FFE8D8F8" };
        var organization = new UmlComponent { Name = "Organization", FillColor = "#FFFFE0C8" };

        var person = new UmlComponentInterface
        {
            Name = "Person",
            InterfaceKind = UmlComponentInterfaceKind.Provided,
        };

        project.RootPackage.AddComponent(shoppingCart);
        project.RootPackage.AddComponent(backOrder);
        project.RootPackage.AddComponent(order);
        project.RootPackage.AddComponent(product);
        project.RootPackage.AddComponent(customer);
        project.RootPackage.AddComponent(organization);
        project.RootPackage.AddComponentInterface(person);

        var orderEntry = new UmlAssembly
        {
            SourceClassifierId = order.Id,
            TargetClassifierId = shoppingCart.Id,
            InterfaceName = "OrderEntry",
        };
        var orderableItem = new UmlAssembly
        {
            SourceClassifierId = order.Id,
            TargetClassifierId = product.Id,
            InterfaceName = "OrderableItem",
        };
        var orderPerson = new UmlAssembly
        {
            SourceClassifierId = order.Id,
            TargetClassifierId = person.Id,
            InterfaceName = "Person",
            SourceIsRequirer = true,
        };
        var customerPerson = new UmlAssembly
        {
            SourceClassifierId = customer.Id,
            TargetClassifierId = person.Id,
            InterfaceName = "Person",
            SourceIsRequirer = false,
        };
        var organizationPerson = new UmlAssembly
        {
            SourceClassifierId = organization.Id,
            TargetClassifierId = person.Id,
            InterfaceName = "Person",
            SourceIsRequirer = false,
        };
        var backOrderPerson = new UmlAssembly
        {
            SourceClassifierId = backOrder.Id,
            TargetClassifierId = person.Id,
            InterfaceName = "Person",
            SourceIsRequirer = false,
        };

        project.RootPackage.AddRelationship(orderEntry);
        project.RootPackage.AddRelationship(orderableItem);
        project.RootPackage.AddRelationship(orderPerson);
        project.RootPackage.AddRelationship(customerPerson);
        project.RootPackage.AddRelationship(organizationPerson);
        project.RootPackage.AddRelationship(backOrderPerson);

        var shoppingCartNode = UmlTemplateBuilder.AddNode(diagram, shoppingCart.Id, UmlNodePresentation.Component, 40, 160, 160, 100);
        var backOrderNode = UmlTemplateBuilder.AddNode(diagram, backOrder.Id, UmlNodePresentation.Component, 270, 30, 160, 90);
        var orderNode = UmlTemplateBuilder.AddNode(diagram, order.Id, UmlNodePresentation.Component, 250, 150, 200, 120);
        var productNode = UmlTemplateBuilder.AddNode(diagram, product.Id, UmlNodePresentation.Component, 270, 320, 160, 90);
        var customerNode = UmlTemplateBuilder.AddNode(diagram, customer.Id, UmlNodePresentation.Component, 500, 40, 160, 90);
        var organizationNode = UmlTemplateBuilder.AddNode(diagram, organization.Id, UmlNodePresentation.Component, 500, 330, 160, 90);
        var personNode = UmlTemplateBuilder.AddNode(diagram, person.Id, UmlNodePresentation.ProvidedInterface, 540, 175, 70, 28);

        UmlTemplateBuilder.AddEdge(diagram, orderEntry.Id, orderNode, shoppingCartNode);
        UmlTemplateBuilder.AddEdge(diagram, orderableItem.Id, orderNode, productNode);
        UmlTemplateBuilder.AddEdge(diagram, orderPerson.Id, orderNode, personNode);
        UmlTemplateBuilder.AddEdge(diagram, customerPerson.Id, customerNode, personNode);
        UmlTemplateBuilder.AddEdge(diagram, organizationPerson.Id, organizationNode, personNode);
        UmlTemplateBuilder.AddEdge(diagram, backOrderPerson.Id, backOrderNode, personNode);

        return diagram;
    }

    public static UmlProject BuildProject()
    {
        var project = new UmlProject { Name = "Component Diagram Template" };
        project.Diagrams.Clear();
        project.Diagrams.Add(Build(project));
        return project;
    }
}
