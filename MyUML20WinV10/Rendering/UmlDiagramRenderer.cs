using MyUML20WinV10.Models;

namespace MyUML20WinV10.Rendering;

public static class UmlDiagramRenderer
{
    private const float CompartmentPadding = 6f;
    private const float LineHeight = 16f;

    // End markers: balanced depth and base width for readable arrowheads.
    private const float HollowTriangleDepth = 24f;
    private const float HollowTriangleHalfBase = 12f;
    private const float OpenArrowLength = 12f;
    private const float OpenArrowHalfWing = 6f;
    private const float FilledArrowLength = 12f;
    private const float FilledArrowHalfWing = 8f;
    private const float DiamondDepth = 30f;
    private const float DiamondHalfWidth = 8f;

    public static void DrawDiagram(
        Graphics g,
        UmlProject project,
        UmlDiagram diagram,
        UmlDiagramNode? selectedNode,
        UmlDiagramEdge? selectedEdge,
        UmlDiagramNode? hoverNode = null,
        UmlDiagramEdge? hoverEdge = null)
    {
        g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
        g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.ClearTypeGridFit;

        if (diagram.Kind == UmlDiagramKind.SequenceDiagram)
        {
            UmlSequenceLayout.Prepare(project, diagram);

            foreach (var node in diagram.Nodes.Where(n =>
                         n.Presentation == UmlNodePresentation.Behavior
                         && project.FindElement(n.ModelElementId) is UmlBehaviorNode { Kind: UmlBehaviorNodeKind.CombinedFragment }))
                DrawNode(g, project, node, node == selectedNode, diagram);

            foreach (var node in diagram.Nodes.Where(n =>
                         n.Presentation != UmlNodePresentation.Behavior
                         || project.FindElement(n.ModelElementId) is not UmlBehaviorNode { Kind: UmlBehaviorNodeKind.CombinedFragment }))
                DrawNode(g, project, node, node == selectedNode, diagram);

            DrawLifelineDecompositionLinks(g, project, diagram);
            DrawSequenceActivations(g, project, diagram);

            foreach (var edge in diagram.Edges)
                DrawEdge(g, project, diagram, edge, edge == selectedEdge, [], drawGeometry: true, drawLabels: false);

            foreach (var edge in diagram.Edges)
                DrawEdge(g, project, diagram, edge, edge == selectedEdge, [], drawGeometry: false, drawLabels: true);
        }
        else
        {
            var edgeLines = BuildEdgeLines(project, diagram);
            var crossingsMap = UmlEdgeRouting.ComputeCrossings(edgeLines);
            var packageOverlayLines = edgeLines
                .Where(line => EdgeConnectsToPackageInterior(project, diagram, line.Edge))
                .ToList();
            var underlayLines = edgeLines
                .Where(line => !EdgeConnectsToPackageInterior(project, diagram, line.Edge))
                .ToList();

            DrawEdgeGeometry(g, project, diagram, underlayLines, selectedEdge, crossingsMap);

            foreach (var node in diagram.Nodes.Where(n => UmlNodeSilhouette.IsContainerPresentation(n.Presentation)))
                DrawNode(g, project, node, node == selectedNode, diagram);

            DrawEdgeGeometry(g, project, diagram, packageOverlayLines, selectedEdge, crossingsMap);

            foreach (var node in diagram.Nodes.Where(n => !UmlNodeSilhouette.IsContainerPresentation(n.Presentation)))
                DrawNode(g, project, node, node == selectedNode, diagram);

            foreach (var line in edgeLines)
            {
                crossingsMap.TryGetValue(line.Edge.Id, out var crossings);
                DrawEdge(g, project, diagram, line.Edge, line.Edge == selectedEdge, crossings ?? [], drawGeometry: false, drawLabels: true);
            }

            DrawInteractionOverlays(g, project, diagram, selectedNode, selectedEdge, hoverNode, hoverEdge, crossingsMap);
            return;
        }

        DrawInteractionOverlays(g, project, diagram, selectedNode, selectedEdge, hoverNode, hoverEdge);
    }

    private static void DrawSequenceActivations(Graphics g, UmlProject project, UmlDiagram diagram)
    {
        using var fill = new SolidBrush(Color.White);
        using var pen = new Pen(Color.Black, 1.5f);
        foreach (var (rect, _) in UmlSequenceLayout.GetActivationBars(project, diagram))
        {
            g.FillRectangle(fill, rect.X, rect.Y, rect.Width, rect.Height);
            g.DrawRectangle(pen, rect.X, rect.Y, rect.Width, rect.Height);
        }
    }

    public static SizeF MeasureClassifier(UmlClassifier classifier, bool showCompartments, float width)
    {
        var headerLines = HasBuiltInStereotypeLine(classifier) || !string.IsNullOrWhiteSpace(classifier.Stereotype) ? 2 : 1;
        var nameHeight = headerLines * LineHeight + CompartmentPadding * 2;
        if (!showCompartments)
            return new SizeF(width, nameHeight + 8);

        var propLines = classifier is UmlEnumeration ? 0 : classifier.Properties.Count;
        var opLines = classifier switch
        {
            UmlEnumeration en => en.Literals.Count,
            _ => classifier.Operations.Count,
        };

        var opHeight = opLines > 0 ? opLines * LineHeight + CompartmentPadding * 2 : CompartmentPadding * 2;
        var propHeight = propLines > 0 ? propLines * LineHeight + CompartmentPadding * 2 : CompartmentPadding * 2;
        if (classifier is UmlEnumeration)
            propHeight = 0;

        return new SizeF(width, nameHeight + opHeight + propHeight);
    }

    private static bool HasBuiltInStereotypeLine(UmlClassifier classifier) =>
        classifier is UmlInterface or UmlEnumeration;

    public static float MeasureNodeHeight(UmlProject project, UmlDiagramNode node)
    {
        if (node.Presentation != UmlNodePresentation.Classifier)
        {
            return node.Presentation switch
            {
                UmlNodePresentation.Actor => MeasureActorNodeHeight(project, node),
                UmlNodePresentation.UseCase => Math.Max(node.Height, 56),
                UmlNodePresentation.SystemBoundary => Math.Max(node.Height, 120),
                UmlNodePresentation.Note => Math.Max(node.Height, 60),
                UmlNodePresentation.Package => UmlPackageNotation.MeasureHeight(
                    project.FindElement(node.ModelElementId) as UmlPackage,
                    node.ShowCompartments,
                    node.Width,
                    node.Height),
                UmlNodePresentation.Component => Math.Max(node.Height, 72),
                UmlNodePresentation.ProvidedInterface or UmlNodePresentation.RequiredInterface =>
                    Math.Max(node.Height, UmlComponentNotation.MinInterfaceHeight),
                UmlNodePresentation.Port => Math.Max(node.Height, 16),
                UmlNodePresentation.ObjectInstance =>
                    UmlObjectNotation.MeasureHeight(
                        (project.FindElement(node.ModelElementId) as UmlObjectInstance)?.Name ?? "obj",
                        (project.FindElement(node.ModelElementId) as UmlObjectInstance)?.TypeName ?? "Class",
                        node.Width),
                UmlNodePresentation.DeploymentHost or UmlNodePresentation.Artifact => Math.Max(node.Height, 56),
                UmlNodePresentation.Behavior => MeasureBehaviorNode(project.FindElement(node.ModelElementId) as UmlBehaviorNode, node.Height),
                _ => node.Height,
            };
        }

        var classifier = project.FindClassifier(node.ModelElementId);
        if (classifier is null)
            return node.Height;

        return MeasureClassifier(classifier, node.ShowCompartments, node.Width).Height;
    }

    public static void DrawNode(Graphics g, UmlProject project, UmlDiagramNode node, bool selected, UmlDiagram? diagram = null)
    {
        node.Height = MeasureNodeHeight(project, node);
        // Auto-expand lifeline width to fit the header label text.
        if (node.Presentation == UmlNodePresentation.Behavior
            && project.FindElement(node.ModelElementId) is UmlBehaviorNode { Kind: UmlBehaviorNodeKind.Lifeline } ll)
        {
            node.Width = Math.Max(node.Width, MeasureLifelineMinWidth(g, ll.Name));
        }
        var bounds = node.Bounds;
        using var bodyPen = UmlDiagramStyle.CreateBorderPen(selected);

        switch (node.Presentation)
        {
            case UmlNodePresentation.Actor:
                DrawActorNode(g, project, node, bounds, bodyPen, selected);
                return;
            case UmlNodePresentation.UseCase:
                DrawUseCaseNode(g, project, node, bounds, bodyPen, selected);
                return;
            case UmlNodePresentation.SystemBoundary:
                DrawSystemBoundaryNode(g, project, node, bounds, bodyPen, selected);
                return;
            case UmlNodePresentation.Package:
                DrawPackageNode(g, project, diagram, node, bounds, bodyPen, selected);
                return;
            case UmlNodePresentation.Note:
                DrawNoteNode(g, project, node, bounds, bodyPen, selected);
                return;
            case UmlNodePresentation.Behavior:
                if (project.FindElement(node.ModelElementId) is UmlBehaviorNode behaviorNode)
                    DrawBehaviorNode(g, behaviorNode, bounds, bodyPen, selected);
                return;
            case UmlNodePresentation.Component:
                if (project.FindElement(node.ModelElementId) is UmlComponent component)
                    UmlComponentNotation.DrawComponent(g, bounds, component, bodyPen);
                return;
            case UmlNodePresentation.ProvidedInterface:
                if (project.FindElement(node.ModelElementId) is UmlComponentInterface provided)
                    UmlComponentNotation.DrawProvidedInterface(g, bounds, provided.Name, bodyPen);
                return;
            case UmlNodePresentation.RequiredInterface:
                if (project.FindElement(node.ModelElementId) is UmlComponentInterface required)
                    UmlComponentNotation.DrawRequiredInterface(g, bounds, required.Name, bodyPen);
                return;
            case UmlNodePresentation.Port:
                if (project.FindElement(node.ModelElementId) is UmlComponentPort port)
                    DrawPortNode(g, bounds, port, bodyPen);
                return;
            case UmlNodePresentation.ObjectInstance:
                if (project.FindElement(node.ModelElementId) is UmlObjectInstance objectInstance)
                    UmlObjectNotation.Draw(g, bounds, objectInstance, bodyPen);
                return;
            case UmlNodePresentation.DeploymentHost:
                if (project.FindElement(node.ModelElementId) is UmlDeploymentHost host)
                    UmlDeploymentNotation.DrawHost(g, bounds, host, bodyPen);
                return;
            case UmlNodePresentation.Artifact:
                if (project.FindElement(node.ModelElementId) is UmlArtifact artifact)
                    UmlDeploymentNotation.DrawArtifact(g, bounds, artifact, bodyPen);
                return;
        }

        var classifier = project.FindClassifier(node.ModelElementId);
        if (classifier is null)
            return;
        using var textBrush = new SolidBrush(UmlDiagramStyle.TextColor);
        using var font = new Font("Segoe UI", 9f);
        using var boldFont = new Font("Segoe UI", 9f, FontStyle.Bold);
        using var italicFont = new Font("Segoe UI", 9f, FontStyle.Italic);
        using var boldItalicFont = new Font("Segoe UI", 9f, FontStyle.Bold | FontStyle.Italic);

        if (classifier is UmlInterface circleInterface && circleInterface.UseCircleNotation)
        {
            DrawInterfaceCircleNode(g, circleInterface, bounds, bodyPen, textBrush, italicFont);
            return;
        }

        DrawClassifierBackground(g, bounds, classifier, bodyPen);

        var y = bounds.Y + CompartmentPadding;

        // Stereotype line: user-defined takes priority, then built-in for interface/enumeration
        var stereoText = !string.IsNullOrWhiteSpace(classifier.Stereotype)
            ? $"«{classifier.Stereotype}»"
            : classifier is UmlInterface ? "«interface»"
            : classifier is UmlEnumeration ? "«enumeration»"
            : null;
        if (stereoText != null)
            DrawCenteredText(g, stereoText, italicFont, textBrush, bounds, ref y);

        // Name only (no keyword prefix); abstract = bold italic, concrete = bold
        var nameFont = classifier.IsAbstract ? boldItalicFont : boldFont;
        DrawCenteredText(g, classifier.Name, nameFont, textBrush, bounds, ref y);
        y += CompartmentPadding;
        g.DrawLine(bodyPen, bounds.Left, y, bounds.Right, y);

        if (!node.ShowCompartments)
            return;

        if (classifier is UmlEnumeration enumeration)
        {
            y += CompartmentPadding;
            foreach (var literal in enumeration.Literals)
            {
                g.DrawString(literal, font, textBrush, bounds.Left + CompartmentPadding, y);
                y += LineHeight;
            }

            return;
        }

        // 속성(변수)을 먼저(위), 연산(함수)을 아래에 표시 — UML 표준
        if (classifier.Properties.Count > 0)
        {
            y += CompartmentPadding;
            foreach (var property in classifier.Properties)
            {
                g.DrawString(property.SignatureText, font, textBrush, bounds.Left + CompartmentPadding, y);
                y += LineHeight;
            }

            y += CompartmentPadding / 2;
            g.DrawLine(bodyPen, bounds.Left, y, bounds.Right, y);
        }

        if (classifier.Operations.Count > 0)
        {
            y += CompartmentPadding;
            foreach (var operation in classifier.Operations)
            {
                var opFont = operation.IsAbstract ? italicFont : font;
                g.DrawString(operation.SignatureText, opFont, textBrush, bounds.Left + CompartmentPadding, y);
                y += LineHeight;
            }
        }

        if (string.Equals(classifier.Stereotype, "table", StringComparison.OrdinalIgnoreCase))
            UmlExtendedNotation.DrawTableIconLines(g, bounds, bodyPen);
    }

    private static void DrawClassifierBackground(Graphics g, RectangleF bounds, UmlClassifier classifier, Pen pen)
    {
        if (classifier is UmlInterface)
        {
            using var path = CreateInterfacePath(bounds);
            UmlDiagramStyle.DrawShadowPath(g, path);
            UmlDiagramStyle.FillGradientPath(g, path, bounds);
            g.DrawPath(pen, path);
            return;
        }

        UmlDiagramStyle.DrawStyledRectangle(g, bounds, pen);
    }

    private static System.Drawing.Drawing2D.GraphicsPath CreateInterfacePath(RectangleF bounds)
    {
        var r = 8f;
        var left = bounds.Left;
        var top = bounds.Top;
        var right = bounds.Right;
        var bottom = bounds.Bottom;
        var path = new System.Drawing.Drawing2D.GraphicsPath();
        path.AddArc(right - r * 2, top, r * 2, r * 2, 270, 90);
        path.AddArc(right - r * 2, bottom - r * 2, r * 2, r * 2, 0, 90);
        path.AddLine(right - r, bottom, left, bottom);
        path.AddLine(left, bottom, left, top);
        path.AddLine(left, top, right - r, top);
        path.CloseFigure();
        return path;
    }

    private static void DrawCenteredText(Graphics g, string text, Font font, Brush brush, RectangleF bounds, ref float y)
    {
        var size = g.MeasureString(text, font);
        var x = bounds.Left + (bounds.Width - size.Width) / 2f;
        g.DrawString(text, font, brush, x, y);
        y += LineHeight;
    }

    private static void DrawEdge(
        Graphics g,
        UmlProject project,
        UmlDiagram diagram,
        UmlDiagramEdge edge,
        bool selected,
        IReadOnlyList<(float T, PointF Pt)> crossings,
        bool drawGeometry = true,
        bool drawLabels = true)
    {
        if (!drawGeometry && !drawLabels)
            return;

        var sourceNode = diagram.FindNode(edge.SourceNodeId);
        var targetNode = diagram.FindNode(edge.TargetNodeId);
        if (sourceNode is null || targetNode is null)
            return;

        var relationship = project.FindRelationship(edge.ModelElementId);
        if (relationship is null)
            return;

        if (diagram.Kind == UmlDiagramKind.SequenceDiagram
            && relationship is UmlBehaviorConnector { Kind: UmlBehaviorConnectorKind.Message } messageConnector)
        {
            DrawSequenceMessage(g, project, diagram, edge, messageConnector, selected, drawGeometry, drawLabels);
            return;
        }

        PointF[] pathPoints;
        PointF start;
        PointF end;
        if (UmlEdgeRouting.IsSelfRelationship(sourceNode, targetNode))
        {
            var bounds = UmlNodeConnectionGeometry.GetLayoutBounds(project, sourceNode);
            pathPoints = UmlEdgeRouting.BuildSelfLoopPath(bounds, edge.RoutingKind);
            start = pathPoints[0];
            end = pathPoints[^1];
        }
        else
        {
            start = UmlNodeConnectionGeometry.GetConnectionPoint(project, sourceNode, targetNode, out var startSide);
            end = UmlNodeConnectionGeometry.GetConnectionPoint(project, targetNode, sourceNode, out var endSide);
            pathPoints = UmlEdgeRouting.BuildPathPoints(project, diagram, edge, start, end, startSide, endSide);
        }

        using var pen = UmlDiagramStyle.CreateEdgePen(selected);
        using var font = new Font("Segoe UI", 8f);
        using var brush = new SolidBrush(UmlDiagramStyle.TextColor);

        if (drawGeometry)
        {
            switch (relationship)
            {
                case UmlGeneralization:
                    DrawGeneralization(g, pen, start, end, pathPoints, edge.RoutingKind, crossings);
                    break;
                case UmlRealization:
                    DrawRealization(g, pen, start, end, pathPoints, edge.RoutingKind, crossings);
                    break;
                case UmlDependency:
                    DrawDependencyGeometry(g, pen, end, pathPoints, edge.RoutingKind, crossings);
                    break;
                case UmlAssembly assembly:
                    UmlComponentNotation.DrawAssemblyConnector(g, pen, start, end, pathPoints, edge.RoutingKind, crossings,
                        sourceNode, targetNode, assembly);
                    break;
                case UmlInclude:
                case UmlExtend:
                    DrawLabeledConnectorGeometry(g, pen, end, pathPoints, edge.RoutingKind, crossings);
                    break;
                case UmlAssociation assoc:
                    DrawAssociationGeometry(g, pen, end, pathPoints, edge.RoutingKind, assoc, crossings);
                    break;
                case UmlNoteLink:
                    DrawNoteLink(g, pen, pathPoints, edge.RoutingKind, crossings);
                    break;
                case UmlPackageRelationship packageRel:
                    UmlPackageDiagramNotation.DrawPackageRelationshipGeometry(
                        g, pen, start, end, pathPoints, edge.RoutingKind, packageRel, crossings);
                    break;
                case UmlAssociationClass:
                    DrawAssociationClassGeometry(g, pen, start, end, pathPoints, edge.RoutingKind, crossings);
                    break;
                case UmlDeploymentLink:
                    UmlDeploymentNotation.DrawDeploymentLinkGeometry(g, pen, pathPoints, edge.RoutingKind, crossings);
                    break;
                case UmlDeploymentPath:
                    UmlDeploymentNotation.DrawDeploymentPathGeometry(g, pen, pathPoints, edge.RoutingKind, crossings);
                    break;
                case UmlClassNesting:
                    UmlExtendedNotation.DrawClassNestingGeometry(g, pen, pathPoints, edge.RoutingKind, end, crossings);
                    break;
                case UmlBehaviorConnector behaviorConnector:
                    DrawBehaviorConnectorGeometry(g, behaviorConnector, pen, end, pathPoints, edge.RoutingKind, crossings);
                    break;
            }
        }

        if (drawLabels)
        {
            switch (relationship)
            {
                case UmlDependency dep:
                    DrawDependencyLabel(g, font, brush, pathPoints, edge.RoutingKind, dep);
                    break;
                case UmlInclude:
                    DrawConnectorLabel(g, font, brush, pathPoints, edge.RoutingKind, "«include»");
                    break;
                case UmlExtend extend:
                    if (!string.IsNullOrWhiteSpace(extend.ExtensionPoint))
                        DrawConnectorLabel(g, font, brush, pathPoints, edge.RoutingKind, $"«extend» EP: {extend.ExtensionPoint}");
                    else
                        DrawConnectorLabel(g, font, brush, pathPoints, edge.RoutingKind, "«extend»");
                    break;
                case UmlAssociation assoc:
                    DrawAssociationLabels(g, font, brush, start, end, pathPoints, edge.RoutingKind, assoc);
                    break;
                case UmlBehaviorConnector behaviorConnector:
                    DrawBehaviorConnectorLabel(g, behaviorConnector, font, brush, pathPoints, edge.RoutingKind);
                    break;
                case UmlAssembly assembly when !string.IsNullOrWhiteSpace(assembly.InterfaceName):
                    DrawConnectorLabel(g, font, brush, pathPoints, edge.RoutingKind, assembly.InterfaceName!);
                    break;
                case UmlPackageRelationship packageRel:
                    DrawConnectorLabel(g, font, brush, pathPoints, edge.RoutingKind, packageRel.DisplayLabel);
                    break;
                case UmlAssociationClass assocClass:
                    DrawConnectorLabel(g, font, brush, pathPoints, edge.RoutingKind, assocClass.ClassName);
                    break;
                case UmlDeploymentLink deploymentLink:
                    DrawConnectorLabel(g, font, brush, pathPoints, edge.RoutingKind, deploymentLink.DisplayLabel);
                    break;
                case UmlDeploymentPath deploymentPath:
                    DrawConnectorLabel(g, font, brush, pathPoints, edge.RoutingKind, deploymentPath.DisplayLabel);
                    break;
                case UmlClassNesting:
                    DrawConnectorLabel(g, font, brush, pathPoints, edge.RoutingKind, "«nested»");
                    break;
            }
        }
    }

    private static void DrawAssociationClassGeometry(
        Graphics g,
        Pen pen,
        PointF start,
        PointF end,
        PointF[] pathPoints,
        UmlEdgeRoutingKind routingKind,
        IReadOnlyList<(float T, PointF Pt)> crossings)
    {
        pen = new Pen(pen.Color, pen.Width);
        UmlEdgeRouting.DrawRoutedPathSegment(g, pen, pathPoints, routingKind, crossings, trimFromEnd: 0f);
        var mid = UmlEdgeRouting.GetPathLabelPoint(pathPoints, routingKind);
        var box = new RectangleF(mid.X - 36f, mid.Y - 14f, 72f, 28f);
        UmlDiagramStyle.DrawStyledRectangle(g, box, pen);
        pen.Dispose();
    }

    private static void DrawNoteLink(
        Graphics g,
        Pen pen,
        PointF[] pathPoints,
        UmlEdgeRoutingKind routingKind,
        IReadOnlyList<(float T, PointF Pt)> crossings)
    {
        pen.DashStyle = System.Drawing.Drawing2D.DashStyle.Dash;
        UmlEdgeRouting.DrawRoutedPathSegment(g, pen, pathPoints, routingKind, crossings, trimFromEnd: 0f);
    }

    private static float MeasureActorNodeHeight(UmlProject project, UmlDiagramNode node)
    {
        var name = project.FindElement(node.ModelElementId) is UmlActor actor ? actor.Name : "Actor";
        return Math.Max(node.Height, UmlActorGeometry.GetMinimumNodeHeight(node.Width, name));
    }

    private static void DrawActorNode(Graphics g, UmlProject project, UmlDiagramNode node, RectangleF bounds, Pen pen, bool selected)
    {
        var actor = project.FindElement(node.ModelElementId) as UmlActor;
        var name = actor?.Name ?? "Actor";
        using var brush = new SolidBrush(UmlDiagramStyle.TextColor);
        using var font = new Font("Segoe UI", 8f);
        using var italicFont = new Font("Segoe UI", 8f, FontStyle.Italic);

        if (actor?.UseRectangleNotation == true)
        {
            var figure = new RectangleF(bounds.Left, bounds.Top, bounds.Width, bounds.Height - 20f);
            UmlDiagramStyle.DrawStyledRectangle(g, figure, pen);
            g.DrawString("«actor»", italicFont, brush, figure.Left + 6f, figure.Top + 4f);
            using var format = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center };
            g.DrawString(name, font, brush, figure, format);
            return;
        }

        UmlActorGeometry.DrawStickFigure(g, pen, bounds);
        using var labelFormat = new StringFormat
        {
            Alignment = StringAlignment.Center,
            LineAlignment = StringAlignment.Near,
            Trimming = StringTrimming.Word,
        };
        g.DrawString(name, font, brush, UmlActorGeometry.GetLabelBounds(bounds), labelFormat);
    }

    private static void DrawUseCaseNode(Graphics g, UmlProject project, UmlDiagramNode node, RectangleF bounds, Pen pen, bool selected)
    {
        var useCase = project.FindElement(node.ModelElementId) as UmlUseCase;
        var name = useCase?.Name ?? "UseCase";
        using var brush = new SolidBrush(UmlDiagramStyle.TextColor);
        using var font = new Font("Segoe UI", 9f);
        using var smallFont = new Font("Segoe UI", 7.5f);
        UmlDiagramStyle.DrawStyledEllipse(g, bounds, pen);
        var size = g.MeasureString(name, font);
        var y = bounds.Top + (bounds.Height - size.Height) / 2f;
        g.DrawString(name, font, brush, bounds.Left + (bounds.Width - size.Width) / 2f, y);
        if (useCase?.ExtensionPoints is { Count: > 0 } points)
        {
            var ep = string.Join(", ", points);
            g.DrawString($"EP: {ep}", smallFont, brush, bounds.Left + 6f, bounds.Bottom - 16f);
        }
    }

    private static void DrawSystemBoundaryNode(Graphics g, UmlProject project, UmlDiagramNode node, RectangleF bounds, Pen pen, bool selected)
    {
        var boundary = project.FindElement(node.ModelElementId) as UmlSystemBoundary;
        UmlSystemBoundaryRenderer.Draw(g, boundary?.Name, bounds, pen, selected);
    }

    private static void DrawPackageNode(Graphics g, UmlProject project, UmlDiagram? diagram, UmlDiagramNode node, RectangleF bounds, Pen pen, bool selected)
    {
        var package = project.FindElement(node.ModelElementId) as UmlPackage;
        var nestingFrom = diagram is not null
            ? UmlPackageDiagramNotation.GetNestingParentLabel(project, diagram, node)
            : null;
        UmlPackageNotation.DrawPackage(g, bounds, pen, package, node.ShowCompartments, nestingFromLabel: nestingFrom);
    }

    private static void DrawPortNode(Graphics g, RectangleF bounds, UmlComponentPort port, Pen pen)
    {
        var center = new PointF(bounds.Left + bounds.Width / 2f, bounds.Top + bounds.Height / 2f);
        UmlComponentNotation.DrawPort(g, center, pen);
        if (!string.IsNullOrWhiteSpace(port.InterfaceName))
            UmlComponentNotation.DrawPortInterface(g, center, pen, port.InterfaceKind, port.InterfaceName);
        if (!string.IsNullOrWhiteSpace(port.Name))
        {
            using var font = new Font("Segoe UI", 7.5f);
            using var brush = new SolidBrush(UmlDiagramStyle.TextColor);
            g.DrawString(port.Name, font, brush, bounds.Right + 2f, bounds.Top);
        }
    }

    private static void DrawInterfaceCircleNode(Graphics g, UmlInterface iface, RectangleF bounds, Pen pen, Brush textBrush, Font italicFont)
    {
        var diameter = Math.Min(bounds.Width, bounds.Height * 0.55f);
        var circle = new RectangleF(
            bounds.Left + (bounds.Width - diameter) / 2f,
            bounds.Top + 4f,
            diameter,
            diameter);
        UmlDiagramStyle.DrawStyledEllipse(g, circle, pen);
        using var nameFont = new Font("Segoe UI", 8.5f, FontStyle.Bold);
        var nameSize = g.MeasureString(iface.Name, nameFont);
        g.DrawString(iface.Name, nameFont, textBrush,
            bounds.Left + (bounds.Width - nameSize.Width) / 2f,
            circle.Bottom + 4f);
        g.DrawString("«interface»", italicFont, textBrush,
            bounds.Left + (bounds.Width - g.MeasureString("«interface»", italicFont).Width) / 2f,
            bounds.Top + 2f);
    }

    private static void DrawSwimlaneNode(Graphics g, RectangleF bounds, string label, Pen pen, Brush textBrush, Font font)
    {
        var headerHeight = Math.Min(28f, bounds.Height * 0.12f);
        var header = new RectangleF(bounds.X, bounds.Y, bounds.Width, headerHeight);
        var body = new RectangleF(bounds.X, bounds.Y + headerHeight, bounds.Width, Math.Max(1f, bounds.Height - headerHeight));
        UmlDiagramStyle.FillGradientRectangle(g, header);
        UmlDiagramStyle.FillGradientRectangle(g, body, Color.FromArgb(255, 248, 250, 255), Color.FromArgb(255, 236, 240, 252));
        g.DrawRectangle(pen, bounds.X, bounds.Y, bounds.Width, bounds.Height);
        g.DrawLine(pen, bounds.Left, header.Bottom, bounds.Right, header.Bottom);
        using var headerFont = new Font(font.FontFamily, font.Size, FontStyle.Bold);
        DrawCenteredLabel(g, label, headerFont, textBrush, header);
    }

    private static void DrawNoteNode(Graphics g, UmlProject project, UmlDiagramNode node, RectangleF bounds, Pen pen, bool selected)
    {
        var note = project.FindElement(node.ModelElementId) as UmlNote;
        var text = note?.Body ?? note?.Name ?? "Note";
        using var brush = new SolidBrush(UmlDiagramStyle.TextColor);
        using var font = new Font("Segoe UI", 8f);
        var fold = 14f;
        UmlDiagramStyle.DrawStyledRectangle(g, bounds, pen, UmlDiagramStyle.NoteGradientTop, UmlDiagramStyle.NoteGradientBottom);
        g.DrawLine(pen, bounds.Right - fold, bounds.Top, bounds.Right, bounds.Top + fold);
        g.DrawLine(pen, bounds.Right - fold, bounds.Top, bounds.Right - fold, bounds.Top + fold);
        g.DrawLine(pen, bounds.Right - fold, bounds.Top + fold, bounds.Right, bounds.Top + fold);
        g.DrawString(text, font, brush, bounds.Left + 6, bounds.Top + 6, new StringFormat { Trimming = StringTrimming.EllipsisCharacter });
    }

    private static void DrawBehaviorNode(Graphics g, UmlBehaviorNode behaviorNode, RectangleF bounds, Pen pen, bool selected)
    {
        if (UmlExtendedNotation.IsExtendedBehaviorKind(behaviorNode.Kind))
        {
            UmlExtendedNotation.DrawExtendedBehaviorNode(g, behaviorNode, bounds, pen, selected);
            return;
        }

        var label = string.IsNullOrWhiteSpace(behaviorNode.Name) ? behaviorNode.Kind.ToString() : behaviorNode.Name;
        using var textBrush = new SolidBrush(UmlDiagramStyle.TextColor);
        using var font = new Font("Segoe UI", 8.5f);

        switch (behaviorNode.Kind)
        {
            case UmlBehaviorNodeKind.State:
            case UmlBehaviorNodeKind.Action:
                UmlDiagramStyle.DrawStyledRoundedRect(g, bounds, pen, 12f);
                DrawCenteredLabel(g, label, font, textBrush, bounds);
                UmlExtendedNotation.DrawActionLocalConstraints(g, behaviorNode, bounds);
                break;
            case UmlBehaviorNodeKind.InitialState:
            case UmlBehaviorNodeKind.InitialNode:
            {
                var circle = UmlCircleNodeGeometry.GetCircleBounds(bounds);
                g.FillEllipse(new SolidBrush(pen.Color), circle.X, circle.Y, circle.Width, circle.Height);
                break;
            }
            case UmlBehaviorNodeKind.FinalState:
            case UmlBehaviorNodeKind.ActivityFinalNode:
            {
                var circle = UmlCircleNodeGeometry.GetCircleBounds(bounds);
                g.DrawEllipse(pen, circle.X, circle.Y, circle.Width, circle.Height);
                g.FillEllipse(
                    new SolidBrush(pen.Color),
                    circle.X + circle.Width * 0.25f,
                    circle.Y + circle.Height * 0.25f,
                    circle.Width * 0.5f,
                    circle.Height * 0.5f);
                break;
            }
            case UmlBehaviorNodeKind.FlowFinalNode:
                UmlCircleNodeGeometry.DrawFlowFinalStyle(g, bounds, pen);
                break;
            case UmlBehaviorNodeKind.Decision:
                DrawStyledDiamondNode(g, bounds, pen);
                {
                    var size = Math.Min(bounds.Width, bounds.Height);
                    var cx = bounds.Left + bounds.Width / 2f;
                    var cy = bounds.Top + bounds.Height / 2f;
                    using var qFont = new Font("Segoe UI", Math.Max(6f, size * 0.28f), FontStyle.Bold);
                    using var qBrush = new SolidBrush(pen.Color);
                    var qSize = g.MeasureString("?", qFont);
                    g.DrawString("?", qFont, qBrush, cx - qSize.Width / 2f, cy - qSize.Height / 2f);
                }
                break;
            case UmlBehaviorNodeKind.Merge:
            case UmlBehaviorNodeKind.Choice:
                DrawStyledDiamondNode(g, bounds, pen);
                break;
            case UmlBehaviorNodeKind.Junction:
            {
                var circle = UmlCircleNodeGeometry.GetCircleBounds(bounds);
                g.FillEllipse(new SolidBrush(pen.Color), circle.X, circle.Y, circle.Width, circle.Height);
                break;
            }
            case UmlBehaviorNodeKind.ShallowHistory:
            case UmlBehaviorNodeKind.DeepHistory:
            {
                var circle = UmlCircleNodeGeometry.GetCircleBounds(bounds);
                UmlDiagramStyle.DrawStyledEllipse(g, circle, pen);
                var historyLabel = behaviorNode.Kind == UmlBehaviorNodeKind.DeepHistory ? "H*" : "H";
                using var histFont = new Font("Segoe UI", Math.Max(5f, circle.Width * 0.36f), FontStyle.Bold);
                DrawCenteredLabel(g, historyLabel, histFont, new SolidBrush(pen.Color), circle);
                break;
            }
            case UmlBehaviorNodeKind.Fork:
            case UmlBehaviorNodeKind.Join:
            {
                var bar = UmlNodeConnectionGeometry.GetForkJoinBarBounds(bounds);
                g.FillRectangle(new SolidBrush(pen.Color), bar.X, bar.Y, bar.Width, bar.Height);
                break;
            }
            case UmlBehaviorNodeKind.Activation:
                return;
            case UmlBehaviorNodeKind.CombinedFragment:
                UmlCombinedFragmentRenderer.Draw(g, behaviorNode, bounds, pen, selected);
                return;
            case UmlBehaviorNodeKind.ObjectNode:
                UmlDiagramStyle.DrawStyledRectangle(g, bounds, pen);
                DrawCenteredLabel(g, label, font, textBrush, bounds);
                return;
            case UmlBehaviorNodeKind.Swimlane:
                DrawSwimlaneNode(g, bounds, label, pen, textBrush, font);
                return;
            case UmlBehaviorNodeKind.Lifeline:
                DrawLifelineNode(g, bounds, pen, behaviorNode, label);
                return;
            case UmlBehaviorNodeKind.SequenceEndpoint:
                DrawSequenceEndpointNode(g, bounds, pen, label);
                return;
            case UmlBehaviorNodeKind.Gate:
                DrawGateNode(g, bounds, pen, label);
                return;
            case UmlBehaviorNodeKind.ExpansionRegion:
                UmlActivityRegionRenderer.DrawExpansionRegion(g, behaviorNode, bounds, pen, selected);
                return;
            case UmlBehaviorNodeKind.InterruptibleRegion:
                UmlActivityRegionRenderer.DrawInterruptibleRegion(g, behaviorNode, bounds, pen, selected);
                return;
        }

    }

    private static void DrawSequenceEndpointNode(Graphics g, RectangleF bounds, Pen pen, string label)
    {
        var circle = UmlCircleNodeGeometry.GetCircleBounds(bounds);
        UmlDiagramStyle.DrawStyledEllipse(g, circle, pen);
        using var font = new Font("Segoe UI", 7.5f);
        using var brush = new SolidBrush(UmlDiagramStyle.TextColor);
        DrawCenteredLabel(g, label, font, brush, circle);
    }

    private static void DrawGateNode(Graphics g, RectangleF bounds, Pen pen, string label)
    {
        var inset = Math.Min(bounds.Width, bounds.Height) * 0.2f;
        var inner = new RectangleF(bounds.X + inset, bounds.Y + inset, bounds.Width - inset * 2f, bounds.Height - inset * 2f);
        UmlDiagramStyle.DrawStyledRectangle(g, inner, pen);
        using var font = new Font("Segoe UI", 7.5f, FontStyle.Italic);
        using var brush = new SolidBrush(UmlDiagramStyle.TextColor);
        DrawCenteredLabel(g, label, font, brush, bounds);
    }

    private static void DrawSequenceMessage(
        Graphics g,
        UmlProject project,
        UmlDiagram diagram,
        UmlDiagramEdge edge,
        UmlBehaviorConnector connector,
        bool selected,
        bool drawGeometry,
        bool drawLabels)
    {
        var messageKind = connector.MessageKind;
        var messageY = UmlSequenceLayout.GetMessageY(diagram, edge);
        var color = selected ? Color.DodgerBlue : Color.Black;
        using var pen = new Pen(color, selected ? 2f : 1.5f);
        using var font = new Font("Segoe UI", 8f);
        using var brush = new SolidBrush(color);

        if (messageKind is UmlMessageKind.Return or UmlMessageKind.Create)
            pen.DashStyle = System.Drawing.Drawing2D.DashStyle.Dash;

        if (messageKind is UmlMessageKind.Lost or UmlMessageKind.Found)
        {
            DrawLostFoundMessage(g, project, diagram, edge, connector, messageKind, messageY, pen, font, brush, drawGeometry, drawLabels);
            return;
        }

        if (messageKind == UmlMessageKind.SelfCall || edge.SourceNodeId == edge.TargetNodeId)
        {
            DrawSelfMessage(g, diagram, edge, messageY, pen, brush, font, connector.Name, drawGeometry, drawLabels);
            return;
        }

        var (start, end) = UmlSequenceLayout.GetMessageEndpoints(diagram, edge, messageY);
        var durationSlope = GetDurationSlopePixels(connector);
        var hasDuration = durationSlope > 0f;
        if (hasDuration && drawGeometry)
        {
            var slopeEnd = new PointF(end.X, end.Y + durationSlope);
            g.DrawLine(pen, start, slopeEnd);
            DrawDurationTicks(g, pen, start, slopeEnd);
            end = slopeEnd;
        }

        if (drawGeometry)
        {
            if (!hasDuration)
                g.DrawLine(pen, start, end);
            switch (messageKind)
            {
                case UmlMessageKind.Asynchronous:
                case UmlMessageKind.Return:
                    DrawOpenArrow(g, pen, start, end);
                    break;
                case UmlMessageKind.Destroy:
                    DrawFilledArrow(g, pen, start, end);
                    // Draw X at the target end to indicate lifeline termination
                    var xSize = 8f;
                    using (var xPen = new Pen(color, 2f))
                    {
                        g.DrawLine(xPen, end.X - xSize, end.Y - xSize, end.X + xSize, end.Y + xSize);
                        g.DrawLine(xPen, end.X + xSize, end.Y - xSize, end.X - xSize, end.Y + xSize);
                    }
                    break;
                default:
                    DrawFilledArrow(g, pen, start, end);
                    break;
            }
        }

        if (drawLabels)
        {
            var displayName = messageKind == UmlMessageKind.Create && string.IsNullOrWhiteSpace(connector.Name)
                ? "«create»"
                : connector.Name;
            DrawMessageLabel(g, displayName, start, end, font, brush);
            var durationLabel = FormatDurationConstraint(connector);
            if (!string.IsNullOrWhiteSpace(durationLabel))
            {
                var constraintPoint = new PointF((start.X + end.X) / 2f + 8f, (start.Y + end.Y) / 2f);
                DrawEdgeLabel(g, font, brush, constraintPoint, $"{{{durationLabel}}}");
            }
        }
    }

    private static float GetDurationSlopePixels(UmlBehaviorConnector connector)
    {
        if (!string.IsNullOrWhiteSpace(connector.DurationMin) || !string.IsNullOrWhiteSpace(connector.DurationMax))
        {
            var min = TryParseDurationValue(connector.DurationMin);
            var max = TryParseDurationValue(connector.DurationMax) ?? min;
            if (min.HasValue || max.HasValue)
            {
                var span = Math.Abs((max ?? min ?? 0d) - (min ?? max ?? 0d));
                return 14f + (float)Math.Min(span * 6d, 48d);
            }
        }

        return string.IsNullOrWhiteSpace(connector.DurationConstraint) ? 0f : 18f;
    }

    private static double? TryParseDurationValue(string? text)
    {
        if (string.IsNullOrWhiteSpace(text))
            return null;

        var trimmed = text.Trim();
        return double.TryParse(trimmed, System.Globalization.NumberStyles.Float,
            System.Globalization.CultureInfo.InvariantCulture, out var value)
            ? value
            : null;
    }

    private static string? FormatDurationConstraint(UmlBehaviorConnector connector)
    {
        if (!string.IsNullOrWhiteSpace(connector.DurationMin) || !string.IsNullOrWhiteSpace(connector.DurationMax))
        {
            var min = connector.DurationMin?.Trim();
            var max = connector.DurationMax?.Trim();
            if (!string.IsNullOrWhiteSpace(min) && !string.IsNullOrWhiteSpace(max))
                return $"{min}..{max}";
            return min ?? max;
        }

        return connector.DurationConstraint?.Trim();
    }

    private static void DrawDurationTicks(Graphics g, Pen pen, PointF start, PointF end)
    {
        const float tickHalf = 5f;
        g.DrawLine(pen, start.X - tickHalf, start.Y, start.X + tickHalf, start.Y);
        g.DrawLine(pen, end.X - tickHalf, end.Y, end.X + tickHalf, end.Y);
    }

    private static void DrawLifelineDecompositionLinks(Graphics g, UmlProject project, UmlDiagram diagram)
    {
        var children = diagram.Nodes
            .Select(n => (Node: n, Behavior: project.FindElement(n.ModelElementId) as UmlBehaviorNode))
            .Where(t => t.Behavior is { Kind: UmlBehaviorNodeKind.Lifeline, ParentLifelineId: not null })
            .ToList();
        if (children.Count == 0)
            return;

        using var pen = new Pen(UmlDiagramStyle.BorderColor, UmlDiagramStyle.BorderWidthNormal);
        var grouped = children.GroupBy(t => t.Behavior!.ParentLifelineId!.Value);

        foreach (var group in grouped)
        {
            var parentNode = diagram.Nodes.FirstOrDefault(n => n.ModelElementId == group.Key);
            if (parentNode is null)
                continue;

            var parentCx = UmlSequenceLayout.GetLifelineCenterX(parentNode.Bounds);
            var parentHeaderBottom = parentNode.Bounds.Top + UmlSequenceLayout.HeaderHeight;

            var childCenters = group
                .Select(t => UmlSequenceLayout.GetLifelineCenterX(t.Node.Bounds))
                .OrderBy(x => x)
                .ToList();
            if (childCenters.Count == 0)
                continue;

            var forkY = parentHeaderBottom + 6f;
            g.DrawLine(pen, parentCx, parentHeaderBottom, parentCx, forkY);
            g.DrawLine(pen, childCenters[0], forkY, childCenters[^1], forkY);

            foreach (var (childNode, _) in group)
            {
                var childCx = UmlSequenceLayout.GetLifelineCenterX(childNode.Bounds);
                var childHeaderTop = childNode.Bounds.Top + 2f;
                g.DrawLine(pen, childCx, forkY, childCx, childHeaderTop);
            }
        }
    }

    private static void DrawLostFoundMessage(
        Graphics g,
        UmlProject project,
        UmlDiagram diagram,
        UmlDiagramEdge edge,
        UmlBehaviorConnector connector,
        UmlMessageKind messageKind,
        float messageY,
        Pen pen,
        Font font,
        Brush brush,
        bool drawGeometry,
        bool drawLabels)
    {
        var lifelineNode = diagram.FindNode(messageKind == UmlMessageKind.Lost ? edge.SourceNodeId : edge.TargetNodeId);
        var endpointNode = diagram.FindNode(messageKind == UmlMessageKind.Lost ? edge.TargetNodeId : edge.SourceNodeId);
        if (lifelineNode is null || endpointNode is null)
            return;

        var lifelineX = UmlSequenceLayout.GetLifelineCenterX(lifelineNode.Bounds);
        var endpointBounds = endpointNode.Bounds;
        var endpointCenter = new PointF(endpointBounds.Left + endpointBounds.Width / 2f, endpointBounds.Top + endpointBounds.Height / 2f);
        var start = messageKind == UmlMessageKind.Lost
            ? new PointF(lifelineX, messageY)
            : endpointCenter;
        var end = messageKind == UmlMessageKind.Lost
            ? endpointCenter
            : new PointF(lifelineX, messageY);

        if (drawGeometry)
        {
            g.DrawLine(pen, start, end);
            var circle = UmlCircleNodeGeometry.GetCircleBounds(endpointBounds);
            g.DrawEllipse(pen, circle.X, circle.Y, circle.Width, circle.Height);
            DrawFilledArrow(g, pen, start, end);
        }

        if (drawLabels && !string.IsNullOrWhiteSpace(connector.Name))
            DrawMessageLabel(g, connector.Name, start, end, font, brush);
    }

    private static void DrawSelfMessage(
        Graphics g,
        UmlDiagram diagram,
        UmlDiagramEdge edge,
        float messageY,
        Pen pen,
        Brush brush,
        Font font,
        string? name,
        bool drawGeometry,
        bool drawLabels)
    {
        var node = diagram.FindNode(edge.SourceNodeId);
        if (node is null)
            return;

        var cx = UmlSequenceLayout.GetLifelineCenterX(node.Bounds);
        var barRight = cx + UmlSequenceLayout.ActivationHalfWidth;
        var right = cx + UmlSequenceLayout.SelfMessageLoopWidth;
        var bottom = messageY + UmlSequenceLayout.SelfMessageLoopHeight;
        var topStart = new PointF(barRight, messageY);
        var topEnd = new PointF(right, messageY);
        var downEnd = new PointF(right, bottom);
        var backEnd = new PointF(barRight, bottom);

        if (drawGeometry)
        {
            g.DrawLine(pen, topStart, topEnd);
            g.DrawLine(pen, topEnd, downEnd);
            g.DrawLine(pen, downEnd, backEnd);
            DrawFilledArrow(g, pen, topStart, topEnd);
        }

        if (drawLabels && !string.IsNullOrWhiteSpace(name))
        {
            var labelPoint = new PointF((topStart.X + topEnd.X) / 2f, topStart.Y - 14f);
            DrawEdgeLabel(g, font, brush, labelPoint, name);
        }
    }

    private static void DrawMessageLabel(Graphics g, string? name, PointF start, PointF end, Font font, Brush brush)
    {
        if (string.IsNullOrWhiteSpace(name))
            return;

        var mid = new PointF((start.X + end.X) / 2f, start.Y - 14f);
        DrawEdgeLabel(g, font, brush, mid, name);
    }

    private static void DrawBehaviorConnectorGeometry(
        Graphics g,
        UmlBehaviorConnector connector,
        Pen pen,
        PointF end,
        PointF[] pathPoints,
        UmlEdgeRoutingKind routingKind,
        IReadOnlyList<(float T, PointF Pt)> crossings)
    {
        switch (connector.Kind)
        {
            case UmlBehaviorConnectorKind.Message:
                DrawPathEndingWithFilledArrow(g, pen, pathPoints, routingKind, crossings, end);
                break;
            case UmlBehaviorConnectorKind.Transition:
            case UmlBehaviorConnectorKind.ControlFlow:
                DrawPathEndingWithOpenArrow(g, pen, pathPoints, routingKind, crossings, end);
                break;
            case UmlBehaviorConnectorKind.ObjectFlow:
                pen.DashStyle = System.Drawing.Drawing2D.DashStyle.Dash;
                DrawPathEndingWithOpenArrow(g, pen, pathPoints, routingKind, crossings, end);
                break;
        }
    }

    private static void DrawBehaviorConnectorLabel(
        Graphics g,
        UmlBehaviorConnector connector,
        Font font,
        Brush brush,
        PointF[] pathPoints,
        UmlEdgeRoutingKind routingKind)
    {
        var label = BuildBehaviorConnectorDisplayLabel(connector);
        if (string.IsNullOrWhiteSpace(label))
            return;

        var midPt = UmlEdgeRouting.GetPathLabelPoint(pathPoints, routingKind);
        var dir = UmlEdgeRouting.GetPathEndDirection(pathPoints, routingKind);
        var lineAngle = MathF.Atan2(dir.Y, dir.X);
        var mid = PolarOffset(midPt, lineAngle + MathF.PI / 2f, 14f);
        DrawEdgeLabel(g, font, brush, mid, label);
    }

    private static string BuildBehaviorConnectorDisplayLabel(UmlBehaviorConnector connector)
    {
        if (connector.Kind is UmlBehaviorConnectorKind.Transition)
        {
            var sb = new System.Text.StringBuilder();
            if (!string.IsNullOrWhiteSpace(connector.Trigger))
                sb.Append(connector.Trigger.Trim());
            if (!string.IsNullOrWhiteSpace(connector.Guard))
            {
                if (sb.Length > 0) sb.Append(' ');
                sb.Append('[').Append(connector.Guard.Trim()).Append(']');
            }
            if (!string.IsNullOrWhiteSpace(connector.Effect))
            {
                if (sb.Length > 0) sb.Append(' ');
                sb.Append("/ ").Append(connector.Effect.Trim());
            }
            return sb.Length > 0 ? sb.ToString() : connector.Name ?? string.Empty;
        }

        if (connector.Kind is UmlBehaviorConnectorKind.ControlFlow or UmlBehaviorConnectorKind.ObjectFlow)
        {
            if (!string.IsNullOrWhiteSpace(connector.Guard))
                return '[' + connector.Guard.Trim() + ']';
        }

        if (connector.Kind == UmlBehaviorConnectorKind.Message && connector.CommunicationSequenceNumber > 0)
        {
            var name = connector.Name ?? "message";
            return $"{connector.CommunicationSequenceNumber}: {name}";
        }

        return connector.Name ?? string.Empty;
    }

    private static float MeasureBehaviorNode(UmlBehaviorNode? behaviorNode, float currentHeight)
    {
        if (behaviorNode is null)
            return currentHeight;

        return behaviorNode.Kind switch
        {
            UmlBehaviorNodeKind.InitialState or UmlBehaviorNodeKind.FinalState
                or UmlBehaviorNodeKind.InitialNode or UmlBehaviorNodeKind.ActivityFinalNode
                or UmlBehaviorNodeKind.FlowFinalNode or UmlBehaviorNodeKind.Junction
                or UmlBehaviorNodeKind.ShallowHistory or UmlBehaviorNodeKind.DeepHistory => Math.Max(currentHeight, 32),
            UmlBehaviorNodeKind.Decision or UmlBehaviorNodeKind.Merge or UmlBehaviorNodeKind.Choice => Math.Max(currentHeight, 48),
            UmlBehaviorNodeKind.Fork or UmlBehaviorNodeKind.Join => Math.Max(currentHeight, 18),
            UmlBehaviorNodeKind.Lifeline => Math.Max(currentHeight, 220),
            UmlBehaviorNodeKind.CombinedFragment => Math.Max(currentHeight, 80),
            UmlBehaviorNodeKind.ObjectNode => Math.Max(currentHeight, 48),
            UmlBehaviorNodeKind.Swimlane => Math.Max(currentHeight, 180),
            UmlBehaviorNodeKind.Activation => Math.Max(currentHeight, 48),
            UmlBehaviorNodeKind.SequenceEndpoint or UmlBehaviorNodeKind.Gate => Math.Max(currentHeight, 28),
            UmlBehaviorNodeKind.ExpansionRegion or UmlBehaviorNodeKind.InterruptibleRegion => Math.Max(currentHeight, 100),
            UmlBehaviorNodeKind.NaryAssociationHub => Math.Max(currentHeight, 40),
            UmlBehaviorNodeKind.StateInvariant or UmlBehaviorNodeKind.Continuation => Math.Max(currentHeight, 24),
            UmlBehaviorNodeKind.EntryPoint or UmlBehaviorNodeKind.ExitPoint or UmlBehaviorNodeKind.TerminateState => Math.Max(currentHeight, 24),
            UmlBehaviorNodeKind.CompositeState or UmlBehaviorNodeKind.OrthogonalRegion
                or UmlBehaviorNodeKind.SubmachineState or UmlBehaviorNodeKind.ActivityContainer => Math.Max(currentHeight, 100),
            UmlBehaviorNodeKind.TimingLifeline => Math.Max(currentHeight, 80),
            UmlBehaviorNodeKind.TimingState => Math.Max(currentHeight, 28),
            UmlBehaviorNodeKind.InputPin or UmlBehaviorNodeKind.OutputPin => Math.Max(currentHeight, 14),
            _ => Math.Max(currentHeight, 60),
        };
    }

    private static void DrawRoundedRect(Graphics g, RectangleF bounds, Brush fillBrush, Pen pen, float radius)
    {
        using var path = CreateRoundedPath(bounds, radius);
        g.FillPath(fillBrush, path);
        g.DrawPath(pen, path);
    }

    private static void DrawStyledDiamondNode(Graphics g, RectangleF bounds, Pen pen)
    {
        var size = Math.Min(bounds.Width, bounds.Height);
        var sq = new RectangleF(
            bounds.Left + (bounds.Width - size) / 2f,
            bounds.Top + (bounds.Height - size) / 2f,
            size, size);
        var cx = sq.Left + size / 2f;
        var cy = sq.Top + size / 2f;
        PointF[] points =
        [
            new PointF(cx, sq.Top),
            new PointF(sq.Right, cy),
            new PointF(cx, sq.Bottom),
            new PointF(sq.Left, cy),
        ];

        using var path = new System.Drawing.Drawing2D.GraphicsPath();
        path.AddPolygon(points);
        UmlDiagramStyle.DrawShadowPath(g, path);
        UmlDiagramStyle.FillGradientPath(g, path, sq);
        g.DrawPolygon(pen, points);
    }

    private static void DrawLifelineNode(Graphics g, RectangleF bounds, Pen pen, UmlBehaviorNode behaviorNode, string label)
    {
        // Header box size is fixed, independent of the lifeline node height.
        var headerHeight = UmlSequenceLayout.HeaderHeight - 4f;
        var header = new RectangleF(bounds.Left + 2, bounds.Top + 2, bounds.Width - 4, headerHeight);
        UmlDiagramStyle.FillGradientRectangle(g, header);
        g.DrawRectangle(pen, header.X, header.Y, header.Width, header.Height);

        var displayLabel = behaviorNode.ParentLifelineId.HasValue
            ? FormatDecomposedLifelineLabel(behaviorNode, label)
            : label;

        if (behaviorNode.LifelineKind == UmlLifelineKind.Actor)
        {
            var mini = new RectangleF(header.Left + 4f, header.Top + 2f, header.Width - 8f, header.Height - 4f);
            UmlActorGeometry.DrawStickFigure(g, pen, mini);
        }
        else
        {
            using var labelBrush = new SolidBrush(UmlDiagramStyle.TextColor);
            using var font = behaviorNode.ParentLifelineId.HasValue
                ? new Font("Segoe UI", 7.5f)
                : new Font("Segoe UI", 8f);
            DrawCenteredLabel(g, displayLabel, font, labelBrush, header);
        }

        using var dashPen = new Pen(pen.Color, 1.2f)
        {
            DashStyle = System.Drawing.Drawing2D.DashStyle.Dash,
        };
        var cx = bounds.Left + bounds.Width / 2f;
        g.DrawLine(dashPen, cx, header.Bottom, cx, bounds.Bottom - 2);
    }

    private static string FormatDecomposedLifelineLabel(UmlBehaviorNode behaviorNode, string fallback)
    {
        if (!string.IsNullOrWhiteSpace(behaviorNode.DecompositionRole))
            return behaviorNode.DecompositionRole.StartsWith(':')
                ? behaviorNode.DecompositionRole
                : $":{behaviorNode.DecompositionRole}";

        return string.IsNullOrWhiteSpace(fallback) ? ":part" : $":{fallback}";
    }

    private static void DrawCenteredLabel(Graphics g, string label, Font font, Brush brush, RectangleF bounds)
    {
        var size = g.MeasureString(label, font);
        var x = bounds.Left + (bounds.Width - size.Width) / 2f;
        var y = bounds.Top + (bounds.Height - size.Height) / 2f;
        g.DrawString(label, font, brush, x, y);
    }

    private static void DrawFilledArrow(Graphics g, Pen pen, PointF from, PointF to)
    {
        var angle = Math.Atan2(to.Y - from.Y, to.X - from.X);
        var p1 = new PointF(
            (float)(to.X - FilledArrowLength * Math.Cos(angle) + FilledArrowHalfWing * Math.Sin(angle)),
            (float)(to.Y - FilledArrowLength * Math.Sin(angle) - FilledArrowHalfWing * Math.Cos(angle)));
        var p2 = new PointF(
            (float)(to.X - FilledArrowLength * Math.Cos(angle) - FilledArrowHalfWing * Math.Sin(angle)),
            (float)(to.Y - FilledArrowLength * Math.Sin(angle) + FilledArrowHalfWing * Math.Cos(angle)));

        const float halo = 2f;
        var h1 = new PointF(
            (float)(to.X - (FilledArrowLength + halo) * Math.Cos(angle) + (FilledArrowHalfWing + halo) * Math.Sin(angle)),
            (float)(to.Y - (FilledArrowLength + halo) * Math.Sin(angle) - (FilledArrowHalfWing + halo) * Math.Cos(angle)));
        var h2 = new PointF(
            (float)(to.X - (FilledArrowLength + halo) * Math.Cos(angle) - (FilledArrowHalfWing + halo) * Math.Sin(angle)),
            (float)(to.Y - (FilledArrowLength + halo) * Math.Sin(angle) + (FilledArrowHalfWing + halo) * Math.Cos(angle)));

        using var white = new SolidBrush(Color.White);
        using var brush = new SolidBrush(pen.Color);
        g.FillPolygon(white, [to, h1, h2]);
        g.FillPolygon(brush, [to, p1, p2]);
        g.DrawPolygon(pen, [to, p1, p2]);
    }

    private static void DrawPathEndingWithOpenArrow(
        Graphics g,
        Pen pen,
        PointF[] pathPoints,
        UmlEdgeRoutingKind routingKind,
        IReadOnlyList<(float T, PointF Pt)> crossings,
        PointF end)
    {
        UmlEdgeRouting.DrawRoutedPathSegment(g, pen, pathPoints, routingKind, crossings, OpenArrowLength);
        DrawOpenArrowAtEnd(g, pen, pathPoints, routingKind, end);
        BridgeOpenArrowStem(g, pen, pathPoints, routingKind, end);
    }

    private static void DrawPathEndingWithFilledArrow(
        Graphics g,
        Pen pen,
        PointF[] pathPoints,
        UmlEdgeRoutingKind routingKind,
        IReadOnlyList<(float T, PointF Pt)> crossings,
        PointF end)
    {
        UmlEdgeRouting.DrawRoutedPathSegment(g, pen, pathPoints, routingKind, crossings, trimFromEnd: 0f);
        DrawFilledArrowAtEnd(g, pen, pathPoints, routingKind, end);
    }

    private static System.Drawing.Drawing2D.GraphicsPath CreateRoundedPath(RectangleF rect, float radius)
    {
        var path = new System.Drawing.Drawing2D.GraphicsPath();
        var d = radius * 2f;
        path.AddArc(rect.Left, rect.Top, d, d, 180, 90);
        path.AddArc(rect.Right - d, rect.Top, d, d, 270, 90);
        path.AddArc(rect.Right - d, rect.Bottom - d, d, d, 0, 90);
        path.AddArc(rect.Left, rect.Bottom - d, d, d, 90, 90);
        path.CloseFigure();
        return path;
    }

    private static void DrawRealization(
        Graphics g,
        Pen pen,
        PointF start,
        PointF end,
        PointF[] pathPoints,
        UmlEdgeRoutingKind routingKind,
        IReadOnlyList<(float T, PointF Pt)> crossings)
    {
        pen.DashStyle = System.Drawing.Drawing2D.DashStyle.Dash;
        UmlEdgeRouting.DrawRoutedPathSegment(g, pen, pathPoints, routingKind, crossings, trimFromEnd: 0f);
        DrawDirectedHollowTriangleAtEnd(g, pen, pathPoints, routingKind, end);
    }

    private static void DrawLabeledConnectorGeometry(
        Graphics g,
        Pen pen,
        PointF end,
        PointF[] pathPoints,
        UmlEdgeRoutingKind routingKind,
        IReadOnlyList<(float T, PointF Pt)> crossings)
    {
        pen.DashStyle = System.Drawing.Drawing2D.DashStyle.Dash;
        DrawPathEndingWithOpenArrow(g, pen, pathPoints, routingKind, crossings, end);
    }

    private static void DrawConnectorLabel(
        Graphics g,
        Font font,
        Brush brush,
        PointF[] pathPoints,
        UmlEdgeRoutingKind routingKind,
        string label)
    {
        var midPt = UmlEdgeRouting.GetPathLabelPoint(pathPoints, routingKind);
        var dir = UmlEdgeRouting.GetPathEndDirection(pathPoints, routingKind);
        var lineAngle = MathF.Atan2(dir.Y, dir.X);
        var mid = PolarOffset(midPt, lineAngle + MathF.PI / 2f, 14f);
        DrawEdgeLabel(g, font, brush, mid, label);
    }

    private static void DrawGeneralization(
        Graphics g,
        Pen pen,
        PointF start,
        PointF end,
        PointF[] pathPoints,
        UmlEdgeRoutingKind routingKind,
        IReadOnlyList<(float T, PointF Pt)> crossings)
    {
        UmlEdgeRouting.DrawRoutedPathSegment(g, pen, pathPoints, routingKind, crossings, trimFromEnd: 0f);
        DrawDirectedHollowTriangleAtEnd(g, pen, pathPoints, routingKind, end);
    }

    private static void DrawDependencyGeometry(
        Graphics g,
        Pen pen,
        PointF end,
        PointF[] pathPoints,
        UmlEdgeRoutingKind routingKind,
        IReadOnlyList<(float T, PointF Pt)> crossings)
    {
        pen.DashStyle = System.Drawing.Drawing2D.DashStyle.Dash;
        DrawPathEndingWithOpenArrow(g, pen, pathPoints, routingKind, crossings, end);
    }

    private static void DrawDependencyLabel(
        Graphics g,
        Font font,
        Brush brush,
        PointF[] pathPoints,
        UmlEdgeRoutingKind routingKind,
        UmlDependency dep)
    {
        if (string.IsNullOrWhiteSpace(dep.Stereotype))
            return;

        DrawConnectorLabel(g, font, brush, pathPoints, routingKind, $"«{dep.Stereotype}»");
    }

    private static void DrawAssociationGeometry(
        Graphics g,
        Pen pen,
        PointF end,
        PointF[] pathPoints,
        UmlEdgeRoutingKind routingKind,
        UmlAssociation assoc,
        IReadOnlyList<(float T, PointF Pt)> crossings)
    {
        var hasDiamond = assoc.Aggregation is UmlAggregationKind.Shared or UmlAggregationKind.Composite;
        if (hasDiamond)
            UmlEdgeRouting.DrawRoutedPathSegment(g, pen, pathPoints, routingKind, crossings, trimFromEnd: 0f);
        else if (assoc.IsDirected)
            DrawPathEndingWithOpenArrow(g, pen, pathPoints, routingKind, crossings, end);
        else
            UmlEdgeRouting.DrawRoutedPath(g, pen, pathPoints, routingKind, crossings);

        if (assoc.Aggregation == UmlAggregationKind.Shared)
            DrawDirectedDiamondAtEnd(g, pen, pathPoints, routingKind, end, filled: false);
        else if (assoc.Aggregation == UmlAggregationKind.Composite)
            DrawDirectedDiamondAtEnd(g, pen, pathPoints, routingKind, end, filled: true);
    }

    private static void DrawAssociationLabels(
        Graphics g,
        Font font,
        Brush brush,
        PointF start,
        PointF end,
        PointF[] pathPoints,
        UmlEdgeRoutingKind routingKind,
        UmlAssociation assoc)
    {
        var flat = UmlEdgeRouting.FlattenForCrossingDetection(pathPoints, routingKind);
        var startNeighbor = flat.Length >= 2 ? flat[1] : end;
        var endNeighbor = flat.Length >= 2 ? flat[^2] : start;
        var targetLabelInward = GetAssociationEndLabelInward(assoc);

        DrawMultiplicity(g, font, brush, start, startNeighbor, assoc.SourceMultiplicity);
        DrawMultiplicity(g, font, brush, end, endNeighbor, assoc.TargetMultiplicity, targetLabelInward);

        if (!string.IsNullOrWhiteSpace(assoc.SourceEndName))
            DrawEndName(g, font, brush, start, startNeighbor, assoc.SourceEndName);
        if (!string.IsNullOrWhiteSpace(assoc.TargetEndName))
            DrawEndName(g, font, brush, end, endNeighbor, assoc.TargetEndName, targetLabelInward);
    }

    private static float GetAssociationEndLabelInward(UmlAssociation assoc)
    {
        if (assoc.Aggregation is UmlAggregationKind.Shared or UmlAggregationKind.Composite)
            return DiamondDepth + 14f;

        return assoc.IsDirected ? 32f : 28f;
    }

    // Labels offset inward along line + 14px perpendicular (left of direction = above for horizontal lines).
    private static void DrawMultiplicity(Graphics g, Font font, Brush brush, PointF point, PointF otherEnd, string text, float inwardDistance = 28f)
    {
        if (string.IsNullOrWhiteSpace(text)) return;
        var angle = MathF.Atan2(otherEnd.Y - point.Y, otherEnd.X - point.X);
        var inward = PolarOffset(point, angle, inwardDistance);
        var labelPt = PolarOffset(inward, angle + MathF.PI / 2f, 13f);
        DrawEdgeLabel(g, font, brush, labelPt, text);
    }

    // Role names go on the opposite perpendicular side from multiplicity labels.
    private static void DrawEndName(Graphics g, Font font, Brush brush, PointF point, PointF otherEnd, string text, float inwardDistance = 28f)
    {
        if (string.IsNullOrWhiteSpace(text)) return;
        var angle = MathF.Atan2(otherEnd.Y - point.Y, otherEnd.X - point.X);
        var inward = PolarOffset(point, angle, inwardDistance);
        var labelPt = PolarOffset(inward, angle - MathF.PI / 2f, 13f);
        DrawEdgeLabel(g, font, brush, labelPt, text);
    }

    private static void DrawEdgeLabel(Graphics g, Font font, Brush brush, PointF labelPt, string text)
    {
        var size = g.MeasureString(text, font);
        var textX = labelPt.X - size.Width / 2f;
        var textY = labelPt.Y - size.Height / 2f;
        g.DrawString(text, font, brush, textX, textY);
    }

    private static void DrawDirectedHollowTriangle(Graphics g, Pen pen, PointF tip, PointF from)
    {
        var angle = MathF.Atan2(tip.Y - from.Y, tip.X - from.X);
        var baseCenter = PolarOffset(tip, angle + MathF.PI, HollowTriangleDepth);
        var wing1 = PolarOffset(baseCenter, angle + MathF.PI / 2f, HollowTriangleHalfBase);
        var wing2 = PolarOffset(baseCenter, angle - MathF.PI / 2f, HollowTriangleHalfBase);

        using var outlinePen = new Pen(pen.Color, Math.Max(pen.Width, 2f));
        using var fill = new SolidBrush(Color.White);
        g.FillPolygon(fill, [tip, wing1, wing2]);
        g.DrawPolygon(outlinePen, [tip, wing1, wing2]);
    }

    private static void DrawOpenArrow(Graphics g, Pen pen, PointF from, PointF to)
    {
        var angle = Math.Atan2(to.Y - from.Y, to.X - from.X);
        DrawOpenArrowAtAngle(g, pen, to, angle);
    }

    private static void DrawOpenArrowAtEnd(Graphics g, Pen pen, PointF[] pathPoints, UmlEdgeRoutingKind routingKind, PointF end)
    {
        var dir = UmlEdgeRouting.GetPathEndDirection(pathPoints, routingKind);
        var angle = MathF.Atan2(dir.Y, dir.X);
        DrawOpenArrowAtAngle(g, pen, end, angle);
    }

    private static (PointF BaseCenter, PointF Wing1, PointF Wing2) GetOpenArrowGeometry(PointF tip, double angle)
    {
        var cos = Math.Cos(angle);
        var sin = Math.Sin(angle);
        var baseCenter = new PointF(
            (float)(tip.X - OpenArrowLength * cos),
            (float)(tip.Y - OpenArrowLength * sin));
        var wing1 = new PointF(
            (float)(baseCenter.X + OpenArrowHalfWing * sin),
            (float)(baseCenter.Y - OpenArrowHalfWing * cos));
        var wing2 = new PointF(
            (float)(baseCenter.X - OpenArrowHalfWing * sin),
            (float)(baseCenter.Y + OpenArrowHalfWing * cos));
        return (baseCenter, wing1, wing2);
    }

    private static void BridgeOpenArrowStem(
        Graphics g,
        Pen pen,
        PointF[] pathPoints,
        UmlEdgeRoutingKind routingKind,
        PointF end)
    {
        var dir = UmlEdgeRouting.GetPathEndDirection(pathPoints, routingKind);
        var angle = MathF.Atan2(dir.Y, dir.X);
        var (_, wing1, wing2) = GetOpenArrowGeometry(end, angle);
        var stemEnd = UmlEdgeRouting.ShortenPathEnd(pathPoints, routingKind, OpenArrowLength);
        var baseCenter = new PointF((wing1.X + wing2.X) / 2f, (wing1.Y + wing2.Y) / 2f);
        var dx = stemEnd.X - baseCenter.X;
        var dy = stemEnd.Y - baseCenter.Y;
        if (dx * dx + dy * dy <= 1.5f * 1.5f)
            return;

        using var bridgePen = new Pen(pen.Color, pen.Width);
        g.DrawLine(bridgePen, stemEnd, baseCenter);
    }

    private static void DrawOpenArrowAtAngle(Graphics g, Pen pen, PointF to, double angle)
    {
        var (_, wing1, wing2) = GetOpenArrowGeometry(to, angle);

        using var haloPen = new Pen(Color.White, Math.Max(pen.Width, 2f) + 3f)
        {
            StartCap = System.Drawing.Drawing2D.LineCap.Round,
            EndCap = System.Drawing.Drawing2D.LineCap.Round,
        };
        g.DrawLine(haloPen, to, wing1);
        g.DrawLine(haloPen, to, wing2);

        using var thickPen = new Pen(pen.Color, Math.Max(pen.Width, 2f))
        {
            StartCap = System.Drawing.Drawing2D.LineCap.Round,
            EndCap = System.Drawing.Drawing2D.LineCap.Round,
        };
        g.DrawLine(thickPen, to, wing1);
        g.DrawLine(thickPen, to, wing2);
    }

    private static void DrawFilledArrowAtEnd(Graphics g, Pen pen, PointF[] pathPoints, UmlEdgeRoutingKind routingKind, PointF end)
    {
        var dir = UmlEdgeRouting.GetPathEndDirection(pathPoints, routingKind);
        var from = new PointF(end.X - dir.X * FilledArrowLength, end.Y - dir.Y * FilledArrowLength);
        DrawFilledArrow(g, pen, from, end);
    }

    private static void DrawDirectedHollowTriangleAtEnd(Graphics g, Pen pen, PointF[] pathPoints, UmlEdgeRoutingKind routingKind, PointF end)
    {
        var dir = UmlEdgeRouting.GetPathEndDirection(pathPoints, routingKind);
        var from = new PointF(end.X - dir.X * HollowTriangleDepth, end.Y - dir.Y * HollowTriangleDepth);
        DrawDirectedHollowTriangle(g, pen, end, from);
    }

    private static void DrawDirectedDiamondAtEnd(Graphics g, Pen pen, PointF[] pathPoints, UmlEdgeRoutingKind routingKind, PointF end, bool filled)
    {
        var dir = UmlEdgeRouting.GetPathEndDirection(pathPoints, routingKind);
        var from = new PointF(end.X - dir.X * DiamondDepth, end.Y - dir.Y * DiamondDepth);
        DrawDirectedDiamond(g, pen, end, from, filled);
    }

    private static void DrawDirectedDiamond(Graphics g, Pen pen, PointF tip, PointF from, bool filled)
    {
        var angle = MathF.Atan2(tip.Y - from.Y, tip.X - from.X);
        var inward = angle + MathF.PI;
        var basePt = PolarOffset(tip, inward, DiamondDepth);
        var mid = PolarOffset(tip, inward, DiamondDepth * 0.5f);
        var wing1 = PolarOffset(mid, angle + MathF.PI / 2f, DiamondHalfWidth);
        var wing2 = PolarOffset(mid, angle - MathF.PI / 2f, DiamondHalfWidth);

        PointF[] points = [tip, wing1, basePt, wing2];
        using var outlinePen = new Pen(pen.Color, Math.Max(pen.Width, 2f));
        if (filled)
        {
            using var brush = new SolidBrush(Color.Black);
            g.FillPolygon(brush, points);
        }
        else
        {
            using var fill = new SolidBrush(Color.White);
            g.FillPolygon(fill, points);
        }

        g.DrawPolygon(outlinePen, points);
    }

    private static PointF ShortenToward(PointF from, PointF to, float distanceFromTo)
    {
        var dx = to.X - from.X;
        var dy = to.Y - from.Y;
        var len = MathF.Sqrt(dx * dx + dy * dy);
        if (len <= distanceFromTo || len < 0.001f)
            return from;

        var ratio = (len - distanceFromTo) / len;
        return new PointF(from.X + dx * ratio, from.Y + dy * ratio);
    }

    private static PointF PolarOffset(PointF origin, float angle, float distance) =>
        new(origin.X + distance * MathF.Cos(angle), origin.Y + distance * MathF.Sin(angle));

    private static float MeasureLifelineMinWidth(Graphics g, string name)
    {
        using var font = new Font("Segoe UI", 8f);
        var w = g.MeasureString(string.IsNullOrWhiteSpace(name) ? "Lifeline" : name, font).Width;
        return Math.Max(80f, w + 24f);
    }

    private static void DrawInteractionOverlays(
        Graphics g,
        UmlProject project,
        UmlDiagram diagram,
        UmlDiagramNode? selectedNode,
        UmlDiagramEdge? selectedEdge,
        UmlDiagramNode? hoverNode,
        UmlDiagramEdge? hoverEdge,
        IReadOnlyDictionary<Guid, List<(float T, PointF Pt)>>? crossingsMap = null)
    {
        if (hoverEdge is not null && hoverEdge != selectedEdge)
            DrawEdgeOverlay(g, project, diagram, hoverEdge, selected: false, GetEdgeCrossings(crossingsMap, hoverEdge.Id));

        if (selectedEdge is not null)
            DrawEdgeOverlay(g, project, diagram, selectedEdge, selected: true, GetEdgeCrossings(crossingsMap, selectedEdge.Id));

        if (hoverNode is not null && hoverNode != selectedNode)
            DrawNodeHoverOverlay(g, project, hoverNode);

        if (selectedNode is not null)
            DrawNodeSelectionOverlay(g, project, selectedNode);
    }

    private static void DrawNodeHoverOverlay(Graphics g, UmlProject project, UmlDiagramNode node)
    {
        using var pen = new Pen(Color.FromArgb(180, 79, 70, 229), 2f)
        {
            DashStyle = System.Drawing.Drawing2D.DashStyle.Dash,
        };
        UmlNodeSilhouette.DrawOutline(g, pen, project, node);
    }

    private static void DrawNodeSelectionOverlay(Graphics g, UmlProject project, UmlDiagramNode node)
    {
        using var selectPen = new Pen(Color.FromArgb(220, 30, 136, 229), 1.8f)
        {
            DashStyle = System.Drawing.Drawing2D.DashStyle.Dot,
        };
        UmlNodeSilhouette.DrawOutline(g, selectPen, project, node);
        UmlNodeSilhouette.DrawResizeHandles(g, project, node);
    }

    private static void DrawEdgeOverlay(
        Graphics g,
        UmlProject project,
        UmlDiagram diagram,
        UmlDiagramEdge edge,
        bool selected,
        IReadOnlyList<(float T, PointF Pt)> crossings)
    {
        var sourceNode = diagram.FindNode(edge.SourceNodeId);
        var targetNode = diagram.FindNode(edge.TargetNodeId);
        if (sourceNode is null || targetNode is null)
            return;

        var color = selected ? Color.FromArgb(220, 30, 136, 229) : Color.FromArgb(140, 79, 70, 229);
        var width = selected ? 4f : 3f;

        if (diagram.Kind == UmlDiagramKind.SequenceDiagram
            && UmlSequenceLayout.IsSequenceMessage(project, diagram, edge))
        {
            foreach (var (start, end) in UmlSequenceLayout.GetMessageSegments(project, diagram, edge))
                DrawOverlaySegment(g, start, end, color, width, selected, []);

            return;
        }

        PointF[] pathPoints;
        if (UmlEdgeRouting.IsSelfRelationship(sourceNode, targetNode))
        {
            var bounds = UmlNodeConnectionGeometry.GetLayoutBounds(project, sourceNode);
            pathPoints = UmlEdgeRouting.BuildSelfLoopPath(bounds, edge.RoutingKind);
        }
        else
        {
            var startPt = UmlNodeConnectionGeometry.GetConnectionPoint(project, sourceNode, targetNode, out var startSide);
            var endPt = UmlNodeConnectionGeometry.GetConnectionPoint(project, targetNode, sourceNode, out var endSide);
            pathPoints = UmlEdgeRouting.BuildPathPoints(project, diagram, edge, startPt, endPt, startSide, endSide);
        }

        DrawOverlayPath(g, pathPoints, edge.RoutingKind, color, width, selected, crossings);

        if (selected
            && edge.RoutingKind == UmlEdgeRoutingKind.Bent
            && !UmlEdgeRouting.IsSelfRelationship(sourceNode, targetNode)
            && pathPoints.Length >= 3)
        {
            const float size = 7f;
            using var fill = new SolidBrush(Color.White);
            using var border = new Pen(color, 1.6f);
            for (var i = 1; i < pathPoints.Length - 1; i++)
            {
                var handle = pathPoints[i];
                var rect = new RectangleF(handle.X - size, handle.Y - size, size * 2f, size * 2f);
                g.FillRectangle(fill, rect.X, rect.Y, rect.Width, rect.Height);
                g.DrawRectangle(border, rect.X, rect.Y, rect.Width, rect.Height);
            }
        }
    }

    private static void DrawOverlaySegment(
        Graphics g,
        PointF start,
        PointF end,
        Color color,
        float width,
        bool selected,
        IReadOnlyList<(float T, PointF Pt)> crossings)
    {
        using var pen = new Pen(color, width)
        {
            StartCap = System.Drawing.Drawing2D.LineCap.Round,
            EndCap = System.Drawing.Drawing2D.LineCap.Round,
        };
        UmlEdgeRouting.DrawRoutedPath(g, pen, [start, end], UmlEdgeRoutingKind.Straight, crossings);

        if (selected)
        {
            var mid = new PointF((start.X + end.X) / 2f, (start.Y + end.Y) / 2f);
            const float marker = 5f;
            using var brush = new SolidBrush(color);
            g.FillEllipse(brush, mid.X - marker, mid.Y - marker, marker * 2, marker * 2);
        }
    }

    private static void DrawOverlayPath(
        Graphics g,
        PointF[] pathPoints,
        UmlEdgeRoutingKind routingKind,
        Color color,
        float width,
        bool selected,
        IReadOnlyList<(float T, PointF Pt)> crossings)
    {
        using var pen = new Pen(color, width)
        {
            StartCap = System.Drawing.Drawing2D.LineCap.Round,
            EndCap = System.Drawing.Drawing2D.LineCap.Round,
        };
        UmlEdgeRouting.DrawRoutedPath(g, pen, pathPoints, routingKind, crossings);

        if (selected)
        {
            var mid = UmlEdgeRouting.GetPathLabelPoint(pathPoints, routingKind);
            const float marker = 5f;
            using var brush = new SolidBrush(color);
            g.FillEllipse(brush, mid.X - marker, mid.Y - marker, marker * 2, marker * 2);
        }
    }

    private static RectangleF GetNodeBounds(UmlProject project, UmlDiagramNode node)
    {
        node.Height = MeasureNodeHeight(project, node);
        return node.Bounds;
    }

    private static void DrawEdgeGeometry(
        Graphics g,
        UmlProject project,
        UmlDiagram diagram,
        IReadOnlyList<(UmlDiagramEdge Edge, PointF[] FlatPoints)> lines,
        UmlDiagramEdge? selectedEdge,
        IReadOnlyDictionary<Guid, List<(float T, PointF Pt)>> crossingsMap)
    {
        foreach (var line in lines)
        {
            crossingsMap.TryGetValue(line.Edge.Id, out var crossings);
            DrawEdge(g, project, diagram, line.Edge, line.Edge == selectedEdge, crossings ?? [], drawGeometry: true, drawLabels: false);
        }
    }

    private static bool EdgeConnectsToPackageInterior(UmlProject project, UmlDiagram diagram, UmlDiagramEdge edge)
    {
        var source = diagram.FindNode(edge.SourceNodeId);
        var target = diagram.FindNode(edge.TargetNodeId);
        if (source is null || target is null)
            return false;

        return IsNodeInsidePackageBody(project, diagram, source)
            || IsNodeInsidePackageBody(project, diagram, target);
    }

    private static bool IsNodeInsidePackageBody(UmlProject project, UmlDiagram diagram, UmlDiagramNode node)
    {
        if (node.Presentation == UmlNodePresentation.Package)
            return false;

        var nodeBounds = GetNodeBounds(project, node);
        var anchor = new PointF(
            nodeBounds.Left + nodeBounds.Width / 2f,
            nodeBounds.Top + nodeBounds.Height / 2f);

        foreach (var packageNode in diagram.Nodes.Where(n => n.Presentation == UmlNodePresentation.Package))
        {
            var body = UmlPackageNotation.GetBodyBounds(GetNodeBounds(project, packageNode));
            if (body.Contains(anchor))
                return true;
        }

        return false;
    }

    private static List<(UmlDiagramEdge Edge, PointF[] FlatPoints)> BuildEdgeLines(UmlProject project, UmlDiagram diagram)
    {
        var lines = new List<(UmlDiagramEdge Edge, PointF[] FlatPoints)>();
        foreach (var edge in diagram.Edges)
        {
            if (!TryGetEdgePath(project, diagram, edge, out var pathPoints, out var flatPoints))
                continue;

            lines.Add((edge, flatPoints));
        }

        return lines;
    }

    private static IReadOnlyList<(float T, PointF Pt)> GetEdgeCrossings(
        IReadOnlyDictionary<Guid, List<(float T, PointF Pt)>>? crossingsMap,
        Guid edgeId) =>
        crossingsMap is not null && crossingsMap.TryGetValue(edgeId, out var crossings) ? crossings : [];

    public static PointF[] BuildPreviewPath(
        UmlEdgeRoutingKind routingKind,
        RectangleF sourceBounds,
        RectangleF targetBounds) =>
        BuildPreviewPath(null, routingKind, null, sourceBounds, null, targetBounds);

    public static PointF[] BuildPreviewPath(
        UmlProject? project,
        UmlEdgeRoutingKind routingKind,
        UmlDiagramNode? sourceNode,
        RectangleF sourceBounds,
        UmlDiagramNode? targetNode,
        RectangleF targetBounds,
        UmlDiagramEdge? routingEdge = null,
        UmlDiagram? diagram = null)
    {
        UmlConnectionSide startSide;
        UmlConnectionSide endSide;
        PointF start;
        PointF end;

        if (project is not null && sourceNode is not null && targetNode is not null)
        {
            if (UmlEdgeRouting.IsSelfRelationship(sourceNode, targetNode))
            {
                var bounds = UmlNodeConnectionGeometry.GetLayoutBounds(project, sourceNode);
                return UmlEdgeRouting.BuildSelfLoopPath(bounds, routingKind);
            }

            start = UmlNodeConnectionGeometry.GetConnectionPoint(project, sourceNode, targetNode, out startSide);
            end = UmlNodeConnectionGeometry.GetConnectionPoint(project, targetNode, sourceNode, out endSide);
        }
        else if (project is not null && sourceNode is not null)
        {
            var resolvedSource = UmlNodeConnectionGeometry.GetLayoutBounds(project, sourceNode);
            start = UmlNodeConnectionGeometry.GetConnectionPointToBounds(project, sourceNode, targetBounds, resolvedSource, out startSide);
            end = UmlNodeConnectionGeometry.GetRectConnectionPoint(targetBounds, resolvedSource, out endSide);
        }
        else if (project is not null && targetNode is not null)
        {
            var resolvedTarget = UmlNodeConnectionGeometry.GetLayoutBounds(project, targetNode);
            start = UmlNodeConnectionGeometry.GetRectConnectionPoint(sourceBounds, resolvedTarget, out startSide);
            end = UmlNodeConnectionGeometry.GetConnectionPointToBounds(project, targetNode, sourceBounds, resolvedTarget, out endSide);
        }
        else
        {
            start = UmlNodeConnectionGeometry.GetRectConnectionPoint(sourceBounds, targetBounds, out startSide);
            end = UmlNodeConnectionGeometry.GetRectConnectionPoint(targetBounds, sourceBounds, out endSide);
        }

        var edge = routingEdge ?? new UmlDiagramEdge { RoutingKind = routingKind };
        if (routingEdge is null)
            edge.RoutingKind = routingKind;

        if (project is not null && diagram is not null)
            return UmlEdgeRouting.BuildPathPoints(project, diagram, edge, start, end, startSide, endSide);

        if (edge.RoutingKind == UmlEdgeRoutingKind.Bent)
        {
            var midX = edge.OrthoMidX ?? (start.X + end.X) / 2f;
            var midY = edge.OrthoMidY ?? (start.Y + end.Y) / 2f;
            if (edge.OrthoMidY is not null)
                return [start, new(start.X, midY), new(end.X, midY), end];

            return [start, new(midX, start.Y), new(midX, end.Y), end];
        }

        return [start, end];
    }

    public static bool TryGetEdgePath(
        UmlProject project,
        UmlDiagram diagram,
        UmlDiagramEdge edge,
        out PointF[] pathPoints,
        out PointF[] flatPoints)
    {
        pathPoints = [];
        flatPoints = [];

        var sourceNode = diagram.FindNode(edge.SourceNodeId);
        var targetNode = diagram.FindNode(edge.TargetNodeId);
        if (sourceNode is null || targetNode is null)
            return false;

        var relationship = project.FindRelationship(edge.ModelElementId);
        if (relationship is null)
            return false;

        if (diagram.Kind == UmlDiagramKind.SequenceDiagram
            && relationship is UmlBehaviorConnector { Kind: UmlBehaviorConnectorKind.Message })
            return false;

        if (UmlEdgeRouting.IsSelfRelationship(sourceNode, targetNode))
        {
            var bounds = UmlNodeConnectionGeometry.GetLayoutBounds(project, sourceNode);
            pathPoints = UmlEdgeRouting.BuildSelfLoopPath(bounds, edge.RoutingKind);
            flatPoints = UmlEdgeRouting.FlattenForCrossingDetection(pathPoints, edge.RoutingKind);
            return true;
        }

        var start = UmlNodeConnectionGeometry.GetConnectionPoint(project, sourceNode, targetNode, out var startSide);
        var end = UmlNodeConnectionGeometry.GetConnectionPoint(project, targetNode, sourceNode, out var endSide);
        pathPoints = UmlEdgeRouting.BuildPathPoints(project, diagram, edge, start, end, startSide, endSide);
        flatPoints = UmlEdgeRouting.FlattenForCrossingDetection(pathPoints, edge.RoutingKind);
        return true;
    }
}
