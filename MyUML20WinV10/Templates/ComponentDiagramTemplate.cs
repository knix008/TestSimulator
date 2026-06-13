using MyUML20WinV10.Models;
using MyUML20WinV10.Rendering;

namespace MyUML20WinV10.Templates;

/// <summary>
/// draw.io UML 컴포넌트 다이어그램 가이드 스타일 예제 —
/// 패키지 그룹, «component»/포트, Required(소켓)→Provided(로리팝) 조립.
/// </summary>
public static class ComponentDiagramTemplate
{
    public const string Id = "component-diagram";

    public static UmlDiagram Build(UmlProject project)
    {
        var diagram = new UmlDiagram { Name = "Component Diagram", Kind = UmlDiagramKind.ComponentDiagram };

        var systemPkg = new UmlPackage { Name = "E-Commerce System" };

        var webClient = new UmlComponent { Name = "WebClient", FillColor = "#FFF8FCFF" };
        var orderService = new UmlComponent { Name = "OrderService", FillColor = "#FFF8FCFF" };
        var paymentGateway = new UmlComponent { Name = "PaymentGateway", FillColor = "#FFF8FCFF" };
        var dataStore = new UmlComponent { Name = "DataStore", FillColor = "#FFF8FCFF" };

        var reqOrder = new UmlComponentInterface
        {
            Name = "IOrderService",
            InterfaceKind = UmlComponentInterfaceKind.Required,
        };
        var provOrder = new UmlComponentInterface
        {
            Name = "IOrderService",
            InterfaceKind = UmlComponentInterfaceKind.Provided,
        };
        var reqPayment = new UmlComponentInterface
        {
            Name = "IPayment",
            InterfaceKind = UmlComponentInterfaceKind.Required,
        };
        var provPayment = new UmlComponentInterface
        {
            Name = "IPayment",
            InterfaceKind = UmlComponentInterfaceKind.Provided,
        };
        var reqData = new UmlComponentInterface
        {
            Name = "IDataAccess",
            InterfaceKind = UmlComponentInterfaceKind.Required,
        };
        var provData = new UmlComponentInterface
        {
            Name = "IDataAccess",
            InterfaceKind = UmlComponentInterfaceKind.Provided,
        };

        var paymentPort = new UmlComponentPort
        {
            Name = "payment",
            InterfaceName = "IPayment",
            InterfaceKind = UmlComponentInterfaceKind.Provided,
        };

        var note = new UmlNote
        {
            Name = "«database» DataStore\r\nAssembly = Required → Provided\r\nPort = 경계 연결 터널",
        };

        project.RootPackage.AddNestedPackage(systemPkg);
        project.RootPackage.AddComponent(webClient);
        project.RootPackage.AddComponent(orderService);
        project.RootPackage.AddComponent(paymentGateway);
        project.RootPackage.AddComponent(dataStore);
        project.RootPackage.AddComponentInterface(reqOrder);
        project.RootPackage.AddComponentInterface(provOrder);
        project.RootPackage.AddComponentInterface(reqPayment);
        project.RootPackage.AddComponentInterface(provPayment);
        project.RootPackage.AddComponentInterface(reqData);
        project.RootPackage.AddComponentInterface(provData);
        project.RootPackage.AddComponentPort(paymentPort);
        project.RootPackage.AddNote(note);

        var asmWebOrder = MakeAssembly(reqOrder, provOrder);
        var asmOrderPayment = MakeAssembly(reqPayment, provPayment);
        var asmOrderData = MakeAssembly(reqData, provData);
        project.RootPackage.AddRelationship(asmWebOrder);
        project.RootPackage.AddRelationship(asmOrderPayment);
        project.RootPackage.AddRelationship(asmOrderData);

        var compactW = UmlComponentNotation.PlacementComponentWidth;
        var compactH = UmlComponentNotation.PlacementComponentHeight;

        // 패키지를 먼저 추가해 뒤에 깔리도록 합니다 (draw.io: Send to back).
        UmlTemplateBuilder.AddNode(diagram, systemPkg.Id, UmlNodePresentation.Package, 24, 24, 860, 480);

        var webNode = UmlTemplateBuilder.AddNode(
            diagram, webClient.Id, UmlNodePresentation.Component, 56, 116, compactW, compactH);
        var orderNode = UmlTemplateBuilder.AddNode(
            diagram, orderService.Id, UmlNodePresentation.Component, 280, 72,
            UmlComponentNotation.DefaultComponentWidth, UmlComponentNotation.DefaultComponentHeight);
        var payNode = UmlTemplateBuilder.AddNode(
            diagram, paymentGateway.Id, UmlNodePresentation.Component, 580, 56, compactW, compactH);
        var dbNode = UmlTemplateBuilder.AddNode(
            diagram, dataStore.Id, UmlNodePresentation.Component, 580, 300, compactW, compactH);

        var reqOrderNode = UmlTemplateBuilder.AttachInterface(
            diagram, reqOrder.Id, UmlNodePresentation.RequiredInterface,
            webNode, UmlComponentAttachmentEdge.Right, 0.48f);
        var provOrderNode = UmlTemplateBuilder.AttachInterface(
            diagram, provOrder.Id, UmlNodePresentation.ProvidedInterface,
            orderNode, UmlComponentAttachmentEdge.Left, 0.42f);
        var reqPayNode = UmlTemplateBuilder.AttachInterface(
            diagram, reqPayment.Id, UmlNodePresentation.RequiredInterface,
            orderNode, UmlComponentAttachmentEdge.Right, 0.38f);
        var provPayNode = UmlTemplateBuilder.AttachInterface(
            diagram, provPayment.Id, UmlNodePresentation.ProvidedInterface,
            payNode, UmlComponentAttachmentEdge.Left, 0.5f);
        var reqDataNode = UmlTemplateBuilder.AttachInterface(
            diagram, reqData.Id, UmlNodePresentation.RequiredInterface,
            orderNode, UmlComponentAttachmentEdge.Bottom, 0.58f);
        var provDataNode = UmlTemplateBuilder.AttachInterface(
            diagram, provData.Id, UmlNodePresentation.ProvidedInterface,
            dbNode, UmlComponentAttachmentEdge.Top, 0.5f);

        UmlTemplateBuilder.AttachPort(diagram, paymentPort.Id, orderNode, UmlComponentAttachmentEdge.Top, 0.68f);

        UmlTemplateBuilder.AddNode(diagram, note.Id, UmlNodePresentation.Note, 56, 320, 196, 88);

        UmlTemplateBuilder.AddEdge(diagram, asmWebOrder.Id, reqOrderNode, provOrderNode);
        UmlTemplateBuilder.AddEdge(diagram, asmOrderPayment.Id, reqPayNode, provPayNode);
        UmlTemplateBuilder.AddEdge(diagram, asmOrderData.Id, reqDataNode, provDataNode);

        return diagram;
    }

    private static UmlAssembly MakeAssembly(UmlComponentInterface required, UmlComponentInterface provided) =>
        new()
        {
            SourceClassifierId = required.Id,
            TargetClassifierId = provided.Id,
            InterfaceName = provided.Name,
            SourceIsRequirer = true,
        };

    public static UmlProject BuildProject()
    {
        var project = new UmlProject { Name = "Component Diagram Template" };
        project.Diagrams.Clear();
        project.Diagrams.Add(Build(project));
        return project;
    }
}
