using MyUML20WinV10.Models;
using MyUML20WinV10.Rendering;

namespace MyUML20WinV10.Templates;

public static class CompositeStructureDiagramTemplate
{
    public const string Id = "composite-structure-diagram";

    public static UmlDiagram Build(UmlProject project)
    {
        var diagram = new UmlDiagram { Name = "Composite Structure Diagram", Kind = UmlDiagramKind.CompositeStructureDiagram };

        var frame = new UmlClass { Name = "OrderProcessor" };
        frame.Properties.Add(new UmlProperty { Name = "controller", TypeName = "Controller", Visibility = UmlVisibility.Private });
        frame.Properties.Add(new UmlProperty { Name = "repository", TypeName = "Repository", Visibility = UmlVisibility.Private });

        var port = new UmlComponentPort { Name = "api", InterfaceName = "IOrderAPI", InterfaceKind = UmlComponentInterfaceKind.Provided };

        project.RootPackage.AddClassifier(frame);
        project.RootPackage.AddComponentPort(port);

        var connector = new UmlAssociation
        {
            SourceClassifierId = frame.Id,
            TargetClassifierId = frame.Id,
            Name = "connector",
        };
        project.RootPackage.AddRelationship(connector);

        var frameNode = UmlTemplateBuilder.AddNode(diagram, frame.Id, UmlNodePresentation.Classifier, 80, 60, 320, 200);
        frameNode.ShowCompartments = true;

        var portSize = UmlComponentNotation.DefaultPortNodeSize;
        var frameBounds = frameNode.Bounds;
        var portAnchor = new PointF(frameBounds.Right, frameBounds.Top + frameBounds.Height * 0.42f);
        UmlTemplateBuilder.AddNode(
            diagram,
            port.Id,
            UmlNodePresentation.Port,
            portAnchor.X,
            portAnchor.Y - portSize / 2f,
            portSize,
            portSize);

        UmlTemplateBuilder.AddEdge(diagram, connector.Id, frameNode, frameNode);
        return diagram;
    }

    public static UmlProject BuildProject()
    {
        var project = new UmlProject { Name = "Composite Structure Diagram Template" };
        project.Diagrams.Clear();
        project.Diagrams.Add(Build(project));
        return project;
    }
}
