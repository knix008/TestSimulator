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

    private const float InterfaceW = 88f;
    private const float InterfaceH = UmlComponentNotation.MinInterfaceHeight;
    private const float PortSize = UmlComponentNotation.DefaultPortNodeSize;
    private const float CompactComponentW = 220f;
    private const float CompactComponentH = 110f;
    private const float MainComponentW = UmlComponentNotation.DefaultComponentWidth;
    private const float MainComponentH = UmlComponentNotation.DefaultComponentHeight;

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

        // 패키지를 먼저 추가해 뒤에 깔리도록 합니다 (draw.io: Send to back).
        UmlTemplateBuilder.AddNode(diagram, systemPkg.Id, UmlNodePresentation.Package, 24, 24, 880, 500);

        var webNode = UmlTemplateBuilder.AddNode(
            diagram, webClient.Id, UmlNodePresentation.Component, 56, 112, CompactComponentW, CompactComponentH);
        var orderNode = UmlTemplateBuilder.AddNode(
            diagram, orderService.Id, UmlNodePresentation.Component, 248, 72, MainComponentW, MainComponentH);
        var payNode = UmlTemplateBuilder.AddNode(
            diagram, paymentGateway.Id, UmlNodePresentation.Component, 560, 56, CompactComponentW, CompactComponentH);
        var dbNode = UmlTemplateBuilder.AddNode(
            diagram, dataStore.Id, UmlNodePresentation.Component, 560, 300, CompactComponentW, CompactComponentH);

        var reqOrderNode = AddAttachedInterface(
            diagram, reqOrder.Id, UmlNodePresentation.RequiredInterface,
            webNode, UmlComponentAttachmentEdge.Right, 0.48f);
        var provOrderNode = AddAttachedInterface(
            diagram, provOrder.Id, UmlNodePresentation.ProvidedInterface,
            orderNode, UmlComponentAttachmentEdge.Left, 0.42f);
        var reqPayNode = AddAttachedInterface(
            diagram, reqPayment.Id, UmlNodePresentation.RequiredInterface,
            orderNode, UmlComponentAttachmentEdge.Right, 0.38f);
        var provPayNode = AddAttachedInterface(
            diagram, provPayment.Id, UmlNodePresentation.ProvidedInterface,
            payNode, UmlComponentAttachmentEdge.Left, 0.5f);
        var reqDataNode = AddAttachedInterface(
            diagram, reqData.Id, UmlNodePresentation.RequiredInterface,
            orderNode, UmlComponentAttachmentEdge.Bottom, 0.58f);
        var provDataNode = AddAttachedInterface(
            diagram, provData.Id, UmlNodePresentation.ProvidedInterface,
            dbNode, UmlComponentAttachmentEdge.Top, 0.5f);

        AddAttachedPort(diagram, paymentPort.Id, orderNode, UmlComponentAttachmentEdge.Top, 0.68f);

        UmlTemplateBuilder.AddNode(diagram, note.Id, UmlNodePresentation.Note, 56, 328, 196, 88);

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

    private static UmlDiagramNode AddAttachedInterface(
        UmlDiagram diagram,
        Guid modelElementId,
        UmlNodePresentation presentation,
        UmlDiagramNode component,
        UmlComponentAttachmentEdge edge,
        float t)
    {
        var node = UmlTemplateBuilder.AddNode(diagram, modelElementId, presentation, 0, 0, InterfaceW, InterfaceH);
        AttachToComponent(diagram, node, component, edge, t);
        return node;
    }

    private static UmlDiagramNode AddAttachedPort(
        UmlDiagram diagram,
        Guid modelElementId,
        UmlDiagramNode component,
        UmlComponentAttachmentEdge edge,
        float t)
    {
        var node = UmlTemplateBuilder.AddNode(diagram, modelElementId, UmlNodePresentation.Port, 0, 0, PortSize, PortSize);
        AttachToComponent(diagram, node, component, edge, t);
        return node;
    }

    private static void AttachToComponent(
        UmlDiagram diagram,
        UmlDiagramNode attachable,
        UmlDiagramNode component,
        UmlComponentAttachmentEdge edge,
        float t)
    {
        attachable.AttachedComponentNodeId = component.Id;
        attachable.AttachmentEdge = edge;
        attachable.AttachmentT = t;
        UmlComponentAttachment.ApplyPosition(diagram, attachable);
    }

    public static UmlProject BuildProject()
    {
        var project = new UmlProject { Name = "Component Diagram Template" };
        project.Diagrams.Clear();
        project.Diagrams.Add(Build(project));
        return project;
    }
}
