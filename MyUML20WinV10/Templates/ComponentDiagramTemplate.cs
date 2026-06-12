using MyUML20WinV10.Models;

namespace MyUML20WinV10.Templates;

public static class ComponentDiagramTemplate
{
    public const string Id = "component-diagram";

    public static UmlDiagram Build(UmlProject project)
    {
        var diagram = new UmlDiagram { Name = "Component Diagram", Kind = UmlDiagramKind.ComponentDiagram };

        // Components
        var webUI     = new UmlComponent { Name = "WebUI" };
        var orderApi  = new UmlComponent { Name = "OrderAPI" };
        var payment   = new UmlComponent { Name = "PaymentService" };
        var inventory = new UmlComponent { Name = "InventoryService" };
        var database  = new UmlComponent { Name = "Database" };

        // Interfaces
        var iOrderApi = new UmlComponentInterface
        {
            Name = "IOrderService",
            InterfaceKind = UmlComponentInterfaceKind.Provided,
        };
        var iPayment = new UmlComponentInterface
        {
            Name = "IPayment",
            InterfaceKind = UmlComponentInterfaceKind.Provided,
        };
        var iInventory = new UmlComponentInterface
        {
            Name = "IInventory",
            InterfaceKind = UmlComponentInterfaceKind.Provided,
        };
        var iDataStore = new UmlComponentInterface
        {
            Name = "IDataStore",
            InterfaceKind = UmlComponentInterfaceKind.Provided,
        };

        project.RootPackage.AddComponent(webUI);
        project.RootPackage.AddComponent(orderApi);
        project.RootPackage.AddComponent(payment);
        project.RootPackage.AddComponent(inventory);
        project.RootPackage.AddComponent(database);
        project.RootPackage.AddComponentInterface(iOrderApi);
        project.RootPackage.AddComponentInterface(iPayment);
        project.RootPackage.AddComponentInterface(iInventory);
        project.RootPackage.AddComponentInterface(iDataStore);

        // Assembly connectors
        var webToOrder = new UmlAssembly
        {
            SourceClassifierId = webUI.Id,
            TargetClassifierId = iOrderApi.Id,
            InterfaceName = "IOrderService",
            SourceIsRequirer = true,
        };
        var orderProvides = new UmlAssembly
        {
            SourceClassifierId = orderApi.Id,
            TargetClassifierId = iOrderApi.Id,
            InterfaceName = "IOrderService",
            SourceIsRequirer = false,
        };
        var orderToPayment = new UmlAssembly
        {
            SourceClassifierId = orderApi.Id,
            TargetClassifierId = iPayment.Id,
            InterfaceName = "IPayment",
            SourceIsRequirer = true,
        };
        var paymentProvides = new UmlAssembly
        {
            SourceClassifierId = payment.Id,
            TargetClassifierId = iPayment.Id,
            InterfaceName = "IPayment",
            SourceIsRequirer = false,
        };
        var orderToInventory = new UmlAssembly
        {
            SourceClassifierId = orderApi.Id,
            TargetClassifierId = iInventory.Id,
            InterfaceName = "IInventory",
            SourceIsRequirer = true,
        };
        var inventoryProvides = new UmlAssembly
        {
            SourceClassifierId = inventory.Id,
            TargetClassifierId = iInventory.Id,
            InterfaceName = "IInventory",
            SourceIsRequirer = false,
        };
        var dbAssembly = new UmlAssembly
        {
            SourceClassifierId = orderApi.Id,
            TargetClassifierId = iDataStore.Id,
            InterfaceName = "IDataStore",
            SourceIsRequirer = true,
        };
        var dbProvides = new UmlAssembly
        {
            SourceClassifierId = database.Id,
            TargetClassifierId = iDataStore.Id,
            InterfaceName = "IDataStore",
            SourceIsRequirer = false,
        };

        project.RootPackage.AddRelationship(webToOrder);
        project.RootPackage.AddRelationship(orderProvides);
        project.RootPackage.AddRelationship(orderToPayment);
        project.RootPackage.AddRelationship(paymentProvides);
        project.RootPackage.AddRelationship(orderToInventory);
        project.RootPackage.AddRelationship(inventoryProvides);
        project.RootPackage.AddRelationship(dbAssembly);
        project.RootPackage.AddRelationship(dbProvides);

        // Layout — WebUI on left, OrderAPI in center, services on right, DB at bottom
        var webNode       = UmlTemplateBuilder.AddNode(diagram, webUI.Id,     UmlNodePresentation.Component,        40,  160, 160, 100);
        var orderNode     = UmlTemplateBuilder.AddNode(diagram, orderApi.Id,  UmlNodePresentation.Component,        290, 140, 180, 130);
        var paymentNode   = UmlTemplateBuilder.AddNode(diagram, payment.Id,   UmlNodePresentation.Component,        600, 40,  160, 90);
        var inventoryNode = UmlTemplateBuilder.AddNode(diagram, inventory.Id, UmlNodePresentation.Component,        600, 180, 160, 90);
        var dbNode        = UmlTemplateBuilder.AddNode(diagram, database.Id,  UmlNodePresentation.Component,        600, 310, 160, 90);

        var iOrderNode    = UmlTemplateBuilder.AddNode(diagram, iOrderApi.Id,  UmlNodePresentation.ProvidedInterface, 245, 190, 72, 28);
        var iPayNode      = UmlTemplateBuilder.AddNode(diagram, iPayment.Id,   UmlNodePresentation.ProvidedInterface, 560, 72,  72, 28);
        var iInvNode      = UmlTemplateBuilder.AddNode(diagram, iInventory.Id, UmlNodePresentation.ProvidedInterface, 560, 210, 72, 28);
        var iDbNode       = UmlTemplateBuilder.AddNode(diagram, iDataStore.Id, UmlNodePresentation.ProvidedInterface, 560, 340, 72, 28);

        UmlTemplateBuilder.AddEdge(diagram, webToOrder.Id,      webNode,       iOrderNode);
        UmlTemplateBuilder.AddEdge(diagram, orderProvides.Id,   orderNode,     iOrderNode);
        UmlTemplateBuilder.AddEdge(diagram, orderToPayment.Id,  orderNode,     iPayNode);
        UmlTemplateBuilder.AddEdge(diagram, paymentProvides.Id, paymentNode,   iPayNode);
        UmlTemplateBuilder.AddEdge(diagram, orderToInventory.Id,orderNode,     iInvNode);
        UmlTemplateBuilder.AddEdge(diagram, inventoryProvides.Id,inventoryNode,iInvNode);
        UmlTemplateBuilder.AddEdge(diagram, dbAssembly.Id,      orderNode,     iDbNode);
        UmlTemplateBuilder.AddEdge(diagram, dbProvides.Id,      dbNode,        iDbNode);

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
