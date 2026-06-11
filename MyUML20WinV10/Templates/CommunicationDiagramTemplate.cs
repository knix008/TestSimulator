using MyUML20WinV10.Models;

namespace MyUML20WinV10.Templates;

public static class CommunicationDiagramTemplate
{
    public const string Id = "communication-diagram";

    public static UmlDiagram Build(UmlProject project)
    {
        var diagram = new UmlDiagram { Name = "Communication Diagram", Kind = UmlDiagramKind.CommunicationDiagram };

        var controller = new UmlObjectInstance { Name = ":Controller", TypeName = "Controller" };
        var service = new UmlObjectInstance { Name = ":OrderService", TypeName = "OrderService" };
        project.RootPackage.AddObjectInstance(controller);
        project.RootPackage.AddObjectInstance(service);

        var message = new UmlBehaviorConnector
        {
            Kind = UmlBehaviorConnectorKind.Message,
            MessageKind = UmlMessageKind.Synchronous,
            Name = "submit()",
            CommunicationSequenceNumber = 1,
            SourceClassifierId = controller.Id,
            TargetClassifierId = service.Id,
        };
        project.RootPackage.AddRelationship(message);

        var controllerNode = UmlTemplateBuilder.AddNode(diagram, controller.Id, UmlNodePresentation.ObjectInstance, 80, 140, 140, 48);
        var serviceNode = UmlTemplateBuilder.AddNode(diagram, service.Id, UmlNodePresentation.ObjectInstance, 300, 140, 160, 48);
        UmlTemplateBuilder.AddEdge(diagram, message.Id, controllerNode, serviceNode);

        return diagram;
    }

    public static UmlProject BuildProject()
    {
        var project = new UmlProject { Name = "Communication Diagram Template" };
        project.Diagrams.Clear();
        project.Diagrams.Add(Build(project));
        return project;
    }
}
