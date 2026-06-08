using MyUML20WinV10.Models;

namespace MyUML20WinV10.Rendering;

public static class UmlDiagramRenderer
{
    private const float CompartmentPadding = 6f;
    private const float LineHeight = 16f;

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
            foreach (var node in diagram.Nodes)
                DrawNode(g, project, node, node == selectedNode);

            DrawSequenceActivations(g, project, diagram);

            foreach (var edge in diagram.Edges)
                DrawEdge(g, project, diagram, edge, edge == selectedEdge);
        }
        else
        {
            foreach (var edge in diagram.Edges)
                DrawEdge(g, project, diagram, edge, edge == selectedEdge);

            foreach (var node in diagram.Nodes)
                DrawNode(g, project, node, node == selectedNode);
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
                UmlNodePresentation.Actor => Math.Max(node.Height, 90),
                UmlNodePresentation.UseCase => Math.Max(node.Height, 56),
                UmlNodePresentation.Note => Math.Max(node.Height, 60),
                UmlNodePresentation.Package => Math.Max(node.Height, 120),
                UmlNodePresentation.Behavior => MeasureBehaviorNode(project.FindElement(node.ModelElementId) as UmlBehaviorNode, node.Height),
                _ => node.Height,
            };
        }

        var classifier = project.FindClassifier(node.ModelElementId);
        if (classifier is null)
            return node.Height;

        return MeasureClassifier(classifier, node.ShowCompartments, node.Width).Height;
    }

    public static void DrawNode(Graphics g, UmlProject project, UmlDiagramNode node, bool selected)
    {
        node.Height = MeasureNodeHeight(project, node);
        var bounds = node.Bounds;
        using var bodyPen = new Pen(selected ? Color.DodgerBlue : Color.Black, selected ? 2f : 1.5f);

        switch (node.Presentation)
        {
            case UmlNodePresentation.Actor:
                DrawActorNode(g, project, node, bounds, bodyPen, selected);
                return;
            case UmlNodePresentation.UseCase:
                DrawUseCaseNode(g, project, node, bounds, bodyPen, selected);
                return;
            case UmlNodePresentation.Package:
                DrawPackageNode(g, project, node, bounds, bodyPen, selected);
                return;
            case UmlNodePresentation.Note:
                DrawNoteNode(g, project, node, bounds, bodyPen, selected);
                return;
            case UmlNodePresentation.Behavior:
                if (project.FindElement(node.ModelElementId) is UmlBehaviorNode behaviorNode)
                    DrawBehaviorNode(g, behaviorNode, bounds, bodyPen, selected);
                return;
        }

        var classifier = project.FindClassifier(node.ModelElementId);
        if (classifier is null)
            return;
        using var textBrush = new SolidBrush(Color.Black);
        using var font = new Font("Segoe UI", 9f);
        using var boldFont = new Font("Segoe UI", 9f, FontStyle.Bold);
        using var italicFont = new Font("Segoe UI", 9f, FontStyle.Italic);
        using var boldItalicFont = new Font("Segoe UI", 9f, FontStyle.Bold | FontStyle.Italic);

        // White fill background (prevents see-through when nodes overlap)
        using var bgBrush = new SolidBrush(Color.White);
        g.FillRectangle(bgBrush, bounds.X, bounds.Y, bounds.Width, bounds.Height);

        if (classifier is UmlInterface)
            DrawInterfaceShape(g, bounds, bodyPen);
        else if (classifier is UmlEnumeration)
            DrawEnumerationShape(g, bounds, bodyPen);
        else
            g.DrawRectangle(bodyPen, bounds.X, bounds.Y, bounds.Width, bounds.Height);

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

        // 연산(함수)을 먼저, 속성(변수)을 아래에 표시
        if (classifier.Operations.Count > 0)
        {
            y += CompartmentPadding;
            foreach (var operation in classifier.Operations)
            {
                var opFont = operation.IsAbstract ? italicFont : font;
                g.DrawString(operation.SignatureText, opFont, textBrush, bounds.Left + CompartmentPadding, y);
                y += LineHeight;
            }

            y += CompartmentPadding / 2;
            g.DrawLine(bodyPen, bounds.Left, y, bounds.Right, y);
        }

        if (classifier.Properties.Count > 0)
        {
            y += CompartmentPadding;
            foreach (var property in classifier.Properties)
            {
                g.DrawString(property.SignatureText, font, textBrush, bounds.Left + CompartmentPadding, y);
                y += LineHeight;
            }
        }
    }

    private static void DrawInterfaceShape(Graphics g, RectangleF bounds, Pen pen)
    {
        var r = 8f;
        var left = bounds.Left;
        var top = bounds.Top;
        var right = bounds.Right;
        var bottom = bounds.Bottom;
        using var path = new System.Drawing.Drawing2D.GraphicsPath();
        path.AddArc(right - r * 2, top, r * 2, r * 2, 270, 90);
        path.AddArc(right - r * 2, bottom - r * 2, r * 2, r * 2, 0, 90);
        path.AddLine(right - r, bottom, left, bottom);
        path.AddLine(left, bottom, left, top);
        path.AddLine(left, top, right - r, top);
        g.DrawPath(pen, path);
    }

    private static void DrawEnumerationShape(Graphics g, RectangleF bounds, Pen pen)
    {
        g.DrawRectangle(pen, bounds.X, bounds.Y, bounds.Width, bounds.Height);
    }

    private static void DrawCenteredText(Graphics g, string text, Font font, Brush brush, RectangleF bounds, ref float y)
    {
        var size = g.MeasureString(text, font);
        var x = bounds.Left + (bounds.Width - size.Width) / 2f;
        g.DrawString(text, font, brush, x, y);
        y += LineHeight;
    }

    private static void DrawEdge(Graphics g, UmlProject project, UmlDiagram diagram, UmlDiagramEdge edge, bool selected)
    {
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
            DrawSequenceMessage(g, project, diagram, edge, messageConnector, selected);
            return;
        }

        var start = GetConnectionPoint(sourceNode.Bounds, targetNode.Bounds, out var startSide);
        var end = GetConnectionPoint(targetNode.Bounds, sourceNode.Bounds, out var endSide);

        using var pen = new Pen(selected ? Color.DodgerBlue : Color.Black, selected ? 2f : 1.5f);
        using var font = new Font("Segoe UI", 8f);
        using var brush = new SolidBrush(Color.Black);

        switch (relationship)
        {
            case UmlGeneralization:
                DrawGeneralization(g, pen, start, end);
                break;
            case UmlRealization:
                DrawRealization(g, pen, start, end);
                break;
            case UmlDependency dep:
                DrawDependency(g, pen, font, brush, start, end, dep);
                break;
            case UmlInclude:
                DrawLabeledConnector(g, pen, font, brush, start, end, "«include»");
                break;
            case UmlExtend:
                DrawLabeledConnector(g, pen, font, brush, start, end, "«extend»");
                break;
            case UmlAssociation assoc:
                DrawAssociation(g, pen, font, brush, start, end, startSide, endSide, assoc);
                break;
            case UmlBehaviorConnector behaviorConnector:
                DrawBehaviorConnector(g, behaviorConnector, font, brush, start, end, startSide, endSide, selected);
                break;
        }
    }

    private static void DrawActorNode(Graphics g, UmlProject project, UmlDiagramNode node, RectangleF bounds, Pen pen, bool selected)
    {
        var actor = project.FindElement(node.ModelElementId) as UmlActor;
        var name = actor?.Name ?? "Actor";
        var headR = bounds.Width * 0.14f;
        var headCenter = new PointF(bounds.Left + bounds.Width / 2f, bounds.Top + headR + 4);
        using var brush = new SolidBrush(Color.Black);
        using var font = new Font("Segoe UI", 8f);
        g.DrawEllipse(pen, headCenter.X - headR, headCenter.Y - headR, headR * 2, headR * 2);
        g.DrawLine(pen, headCenter.X, headCenter.Y + headR, headCenter.X, bounds.Bottom - 24);
        g.DrawLine(pen, headCenter.X, headCenter.Y + headR * 2.2f, bounds.Left + 8, bounds.Top + bounds.Height * 0.55f);
        g.DrawLine(pen, headCenter.X, headCenter.Y + headR * 2.2f, bounds.Right - 8, bounds.Top + bounds.Height * 0.55f);
        g.DrawLine(pen, headCenter.X, bounds.Bottom - 24, bounds.Left + 10, bounds.Bottom - 6);
        g.DrawLine(pen, headCenter.X, bounds.Bottom - 24, bounds.Right - 10, bounds.Bottom - 6);
        var size = g.MeasureString(name, font);
        g.DrawString(name, font, brush, bounds.Left + (bounds.Width - size.Width) / 2f, bounds.Bottom - 18);
    }

    private static void DrawUseCaseNode(Graphics g, UmlProject project, UmlDiagramNode node, RectangleF bounds, Pen pen, bool selected)
    {
        var useCase = project.FindElement(node.ModelElementId) as UmlUseCase;
        var name = useCase?.Name ?? "UseCase";
        using var bgBrush = new SolidBrush(Color.White);
        using var brush = new SolidBrush(Color.Black);
        using var font = new Font("Segoe UI", 9f);
        g.FillEllipse(bgBrush, bounds.X, bounds.Y, bounds.Width, bounds.Height);
        g.DrawEllipse(pen, bounds.X, bounds.Y, bounds.Width, bounds.Height);
        var size = g.MeasureString(name, font);
        g.DrawString(name, font, brush, bounds.Left + (bounds.Width - size.Width) / 2f, bounds.Top + (bounds.Height - size.Height) / 2f);
    }

    private static void DrawPackageNode(Graphics g, UmlProject project, UmlDiagramNode node, RectangleF bounds, Pen pen, bool selected)
    {
        var package = project.FindElement(node.ModelElementId) as UmlPackage;
        var name = package?.Name ?? "Package";
        var tabW = Math.Min(60, bounds.Width * 0.35f);
        var tabH = 18f;
        using var brush = new SolidBrush(Color.Black);
        using var font = new Font("Segoe UI", 9f, FontStyle.Bold);
        g.DrawRectangle(pen, bounds.X, bounds.Y + tabH, bounds.Width, bounds.Height - tabH);
        g.DrawRectangle(pen, bounds.X, bounds.Y, tabW, tabH);
        g.DrawString(name, font, brush, bounds.X + 6, bounds.Y + 2);
    }

    private static void DrawNoteNode(Graphics g, UmlProject project, UmlDiagramNode node, RectangleF bounds, Pen pen, bool selected)
    {
        var note = project.FindElement(node.ModelElementId) as UmlNote;
        var text = note?.Body ?? note?.Name ?? "Note";
        using var fill = new SolidBrush(Color.FromArgb(255, 255, 244, 180));
        using var brush = new SolidBrush(Color.Black);
        using var font = new Font("Segoe UI", 8f);
        var fold = 14f;
        g.FillRectangle(fill, bounds.X, bounds.Y, bounds.Width, bounds.Height);
        g.DrawRectangle(pen, bounds.X, bounds.Y, bounds.Width, bounds.Height);
        g.DrawLine(pen, bounds.Right - fold, bounds.Top, bounds.Right, bounds.Top + fold);
        g.DrawLine(pen, bounds.Right - fold, bounds.Top, bounds.Right - fold, bounds.Top + fold);
        g.DrawLine(pen, bounds.Right - fold, bounds.Top + fold, bounds.Right, bounds.Top + fold);
        g.DrawString(text, font, brush, bounds.Left + 6, bounds.Top + 6, new StringFormat { Trimming = StringTrimming.EllipsisCharacter });
    }

    private static void DrawBehaviorNode(Graphics g, UmlBehaviorNode behaviorNode, RectangleF bounds, Pen pen, bool selected)
    {
        var label = string.IsNullOrWhiteSpace(behaviorNode.Name) ? behaviorNode.Kind.ToString() : behaviorNode.Name;
        using var fillBrush = new SolidBrush(Color.White);
        using var textBrush = new SolidBrush(Color.Black);
        using var font = new Font("Segoe UI", 8.5f);

        switch (behaviorNode.Kind)
        {
            case UmlBehaviorNodeKind.State:
            case UmlBehaviorNodeKind.Action:
                DrawRoundedRect(g, bounds, fillBrush, pen, 12f);
                DrawCenteredLabel(g, label, font, textBrush, bounds);
                break;
            case UmlBehaviorNodeKind.InitialState:
            case UmlBehaviorNodeKind.InitialNode:
                g.FillEllipse(new SolidBrush(pen.Color), bounds.X, bounds.Y, bounds.Width, bounds.Height);
                break;
            case UmlBehaviorNodeKind.FinalState:
            case UmlBehaviorNodeKind.ActivityFinalNode:
                g.DrawEllipse(pen, bounds.X, bounds.Y, bounds.Width, bounds.Height);
                g.FillEllipse(new SolidBrush(pen.Color), bounds.X + bounds.Width * 0.25f, bounds.Y + bounds.Height * 0.25f, bounds.Width * 0.5f, bounds.Height * 0.5f);
                break;
            case UmlBehaviorNodeKind.Decision:
            case UmlBehaviorNodeKind.Merge:
                DrawDiamondNode(g, bounds, fillBrush, pen);
                break;
            case UmlBehaviorNodeKind.Fork:
            case UmlBehaviorNodeKind.Join:
                g.FillRectangle(new SolidBrush(pen.Color), bounds.X, bounds.Top + bounds.Height / 2f - 4, bounds.Width, 8);
                break;
            case UmlBehaviorNodeKind.Activation:
                return;
            case UmlBehaviorNodeKind.Lifeline:
                DrawLifelineNode(g, bounds, fillBrush, pen, label);
                return;
        }

        if (behaviorNode.Kind is UmlBehaviorNodeKind.State or UmlBehaviorNodeKind.Action)
            DrawCenteredLabel(g, label, font, textBrush, bounds);
    }

    private static void DrawSequenceMessage(
        Graphics g,
        UmlProject project,
        UmlDiagram diagram,
        UmlDiagramEdge edge,
        UmlBehaviorConnector connector,
        bool selected)
    {
        var messageKind = connector.MessageKind;
        var messageY = UmlSequenceLayout.GetMessageY(diagram, edge);
        var color = selected ? Color.DodgerBlue : Color.Black;
        using var pen = new Pen(color, selected ? 2f : 1.5f);
        using var font = new Font("Segoe UI", 8f);
        using var brush = new SolidBrush(color);

        if (messageKind == UmlMessageKind.Return)
            pen.DashStyle = System.Drawing.Drawing2D.DashStyle.Dash;

        if (messageKind == UmlMessageKind.SelfCall || edge.SourceNodeId == edge.TargetNodeId)
        {
            DrawSelfMessage(g, diagram, edge, messageY, pen, brush, font, connector.Name);
            return;
        }

        var (start, end) = UmlSequenceLayout.GetMessageEndpoints(diagram, edge, messageY);
        g.DrawLine(pen, start, end);

        switch (messageKind)
        {
            case UmlMessageKind.Asynchronous:
                DrawOpenArrow(g, pen, start, end);
                break;
            case UmlMessageKind.Return:
                DrawOpenArrow(g, pen, start, end);
                break;
            default:
                DrawFilledArrow(g, pen, start, end);
                break;
        }

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
        string? name)
    {
        var node = diagram.FindNode(edge.SourceNodeId);
        if (node is null)
            return;

        var cx = UmlSequenceLayout.GetLifelineCenterX(node.Bounds);
        var right = cx + UmlSequenceLayout.SelfMessageLoopWidth;
        var bottom = messageY + UmlSequenceLayout.SelfMessageLoopHeight;
        var topStart = new PointF(cx, messageY);
        var topEnd = new PointF(right, messageY);
        var downEnd = new PointF(right, bottom);
        var backEnd = new PointF(cx, bottom);

        g.DrawLine(pen, topStart, topEnd);
        g.DrawLine(pen, topEnd, downEnd);
        g.DrawLine(pen, downEnd, backEnd);
        DrawFilledArrow(g, pen, topStart, topEnd);

        if (!string.IsNullOrWhiteSpace(name))
        {
            var labelPoint = new PointF((topStart.X + topEnd.X) / 2f, topStart.Y - 14f);
            g.DrawString(name, font, brush, labelPoint);
        }
    }

    private static void DrawMessageLabel(Graphics g, string? name, PointF start, PointF end, Font font, Brush brush)
    {
        if (string.IsNullOrWhiteSpace(name))
            return;

        var mid = new PointF((start.X + end.X) / 2f, start.Y - 14f);
        g.DrawString(name, font, brush, mid);
    }

    private static void DrawBehaviorConnector(
        Graphics g,
        UmlBehaviorConnector connector,
        Font font,
        Brush brush,
        PointF start,
        PointF end,
        RectangleSide startSide,
        RectangleSide endSide,
        bool selected)
    {
        var color = selected ? Color.DodgerBlue : Color.Black;
        using var pen = new Pen(color, selected ? 2f : 1.5f);
        var label = string.IsNullOrWhiteSpace(connector.Name) ? null : connector.Name;

        switch (connector.Kind)
        {
            case UmlBehaviorConnectorKind.Message:
                g.DrawLine(pen, start, end);
                DrawFilledArrow(g, pen, start, end);
                break;
            case UmlBehaviorConnectorKind.Transition:
            case UmlBehaviorConnectorKind.ControlFlow:
                g.DrawLine(pen, start, end);
                DrawOpenArrow(g, pen, start, end);
                break;
            case UmlBehaviorConnectorKind.ObjectFlow:
                pen.DashStyle = System.Drawing.Drawing2D.DashStyle.Dash;
                g.DrawLine(pen, start, end);
                DrawOpenArrow(g, pen, start, end);
                break;
        }

        if (label is not null)
        {
            var mid = new PointF((start.X + end.X) / 2f, (start.Y + end.Y) / 2f - 12f);
            g.DrawString(label, font, brush, mid);
        }
    }

    private static float MeasureBehaviorNode(UmlBehaviorNode? behaviorNode, float currentHeight)
    {
        if (behaviorNode is null)
            return currentHeight;

        return behaviorNode.Kind switch
        {
            UmlBehaviorNodeKind.InitialState or UmlBehaviorNodeKind.FinalState or UmlBehaviorNodeKind.InitialNode or UmlBehaviorNodeKind.ActivityFinalNode => Math.Max(currentHeight, 32),
            UmlBehaviorNodeKind.Decision or UmlBehaviorNodeKind.Merge => Math.Max(currentHeight, 48),
            UmlBehaviorNodeKind.Fork or UmlBehaviorNodeKind.Join => Math.Max(currentHeight, 18),
            UmlBehaviorNodeKind.Lifeline => Math.Max(currentHeight, 220),
            UmlBehaviorNodeKind.Activation => Math.Max(currentHeight, 48),
            _ => Math.Max(currentHeight, 60),
        };
    }

    private static void DrawRoundedRect(Graphics g, RectangleF bounds, Brush fillBrush, Pen pen, float radius)
    {
        using var path = CreateRoundedPath(bounds, radius);
        g.FillPath(fillBrush, path);
        g.DrawPath(pen, path);
    }

    private static void DrawDiamondNode(Graphics g, RectangleF bounds, Brush fillBrush, Pen pen)
    {
        var cx = bounds.Left + bounds.Width / 2f;
        var cy = bounds.Top + bounds.Height / 2f;
        PointF[] points =
        [
            new PointF(cx, bounds.Top),
            new PointF(bounds.Right, cy),
            new PointF(cx, bounds.Bottom),
            new PointF(bounds.Left, cy),
        ];

        g.FillPolygon(fillBrush, points);
        g.DrawPolygon(pen, points);
    }

    private static void DrawLifelineNode(Graphics g, RectangleF bounds, Brush fillBrush, Pen pen, string label)
    {
        var headerHeight = UmlSequenceLayout.GetHeaderBottom(bounds) - bounds.Top - 2f;
        var header = new RectangleF(bounds.Left + 2, bounds.Top + 2, bounds.Width - 4, headerHeight);
        g.FillRectangle(fillBrush, header.X, header.Y, header.Width, header.Height);
        g.DrawRectangle(pen, header.X, header.Y, header.Width, header.Height);
        DrawCenteredLabel(g, label, new Font("Segoe UI", 8f), new SolidBrush(Color.Black), header);

        using var dashPen = new Pen(pen.Color, 1.2f)
        {
            DashStyle = System.Drawing.Drawing2D.DashStyle.Dash,
        };
        var cx = bounds.Left + bounds.Width / 2f;
        g.DrawLine(dashPen, cx, header.Bottom, cx, bounds.Bottom - 2);
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
        const float len = 10f;
        const float wing = 5f;
        var p1 = new PointF(
            (float)(to.X - len * Math.Cos(angle) + wing * Math.Sin(angle)),
            (float)(to.Y - len * Math.Sin(angle) - wing * Math.Cos(angle)));
        var p2 = new PointF(
            (float)(to.X - len * Math.Cos(angle) - wing * Math.Sin(angle)),
            (float)(to.Y - len * Math.Sin(angle) + wing * Math.Cos(angle)));
        using var brush = new SolidBrush(pen.Color);
        g.FillPolygon(brush, [to, p1, p2]);
        g.DrawPolygon(pen, [to, p1, p2]);
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

    private static void DrawRealization(Graphics g, Pen pen, PointF start, PointF end)
    {
        pen.DashStyle = System.Drawing.Drawing2D.DashStyle.Dash;
        const float markerDepth = 18f;
        var shaftEnd = ShortenToward(start, end, markerDepth);
        g.DrawLine(pen, start, shaftEnd);
        DrawDirectedHollowTriangle(g, pen, end, start);
    }

    private static void DrawLabeledConnector(Graphics g, Pen pen, Font font, Brush brush, PointF start, PointF end, string label)
    {
        pen.DashStyle = System.Drawing.Drawing2D.DashStyle.Dash;
        g.DrawLine(pen, start, end);
        DrawOpenArrow(g, pen, start, end);
        var mid = new PointF((start.X + end.X) / 2f, (start.Y + end.Y) / 2f - 12f);
        g.DrawString(label, font, brush, mid);
    }

    private static void DrawGeneralization(Graphics g, Pen pen, PointF start, PointF end)
    {
        const float markerDepth = 18f;
        var shaftEnd = ShortenToward(start, end, markerDepth);
        g.DrawLine(pen, start, shaftEnd);
        DrawDirectedHollowTriangle(g, pen, end, start);
    }

    private static void DrawDependency(Graphics g, Pen pen, Font font, Brush brush, PointF start, PointF end, UmlDependency dep)
    {
        pen.DashStyle = System.Drawing.Drawing2D.DashStyle.Dash;
        g.DrawLine(pen, start, end);
        DrawOpenArrow(g, pen, start, end);

        if (!string.IsNullOrWhiteSpace(dep.Stereotype))
        {
            var label = $"«{dep.Stereotype}»";
            var mid = new PointF((start.X + end.X) / 2f, (start.Y + end.Y) / 2f - 12f);
            g.DrawString(label, font, brush, mid);
        }
    }

    private static void DrawAssociation(Graphics g, Pen pen, Font font, Brush brush, PointF start, PointF end, RectangleSide startSide, RectangleSide endSide, UmlAssociation assoc)
    {
        const float diamondDepth = 22f;

        var hasDiamond = assoc.Aggregation is UmlAggregationKind.Shared or UmlAggregationKind.Composite;
        if (hasDiamond)
        {
            var shaftEnd = ShortenToward(start, end, diamondDepth);
            g.DrawLine(pen, start, shaftEnd);
        }
        else
        {
            g.DrawLine(pen, start, end);
        }

        DrawMultiplicity(g, font, brush, start, startSide, assoc.SourceMultiplicity);
        DrawMultiplicity(g, font, brush, end, endSide, assoc.TargetMultiplicity);

        if (!string.IsNullOrWhiteSpace(assoc.SourceEndName))
            DrawEndName(g, font, brush, start, startSide, assoc.SourceEndName);
        if (!string.IsNullOrWhiteSpace(assoc.TargetEndName))
            DrawEndName(g, font, brush, end, endSide, assoc.TargetEndName);

        if (assoc.Aggregation == UmlAggregationKind.Shared)
            DrawDirectedDiamond(g, pen, end, start, filled: false);
        else if (assoc.Aggregation == UmlAggregationKind.Composite)
            DrawDirectedDiamond(g, pen, end, start, filled: true);
        else if (assoc.IsDirected)
            DrawOpenArrow(g, pen, start, end);
    }

    private static void DrawMultiplicity(Graphics g, Font font, Brush brush, PointF point, RectangleSide side, string text)
    {
        var offset = side switch
        {
            RectangleSide.Top => new PointF(-8, -16),
            RectangleSide.Bottom => new PointF(-8, 4),
            RectangleSide.Left => new PointF(-28, -6),
            _ => new PointF(6, -6),
        };
        g.DrawString(text, font, brush, point.X + offset.X, point.Y + offset.Y);
    }

    private static void DrawEndName(Graphics g, Font font, Brush brush, PointF point, RectangleSide side, string text)
    {
        var offset = side switch
        {
            RectangleSide.Top => new PointF(4, -16),
            RectangleSide.Bottom => new PointF(4, 4),
            RectangleSide.Left => new PointF(-40, 4),
            _ => new PointF(8, 4),
        };
        g.DrawString(text, font, brush, point.X + offset.X, point.Y + offset.Y);
    }

    private static void DrawDirectedHollowTriangle(Graphics g, Pen pen, PointF tip, PointF from)
    {
        const float depth = 18f;
        const float halfBase = 8f;
        var angle = MathF.Atan2(tip.Y - from.Y, tip.X - from.X);
        var baseCenter = PolarOffset(tip, angle + MathF.PI, depth);
        var wing1 = PolarOffset(baseCenter, angle + MathF.PI / 2f, halfBase);
        var wing2 = PolarOffset(baseCenter, angle - MathF.PI / 2f, halfBase);

        using var outlinePen = new Pen(pen.Color, Math.Max(pen.Width, 2f));
        g.DrawPolygon(outlinePen, [tip, wing1, wing2]);
    }

    private static void DrawOpenArrow(Graphics g, Pen pen, PointF from, PointF to)
    {
        var angle = Math.Atan2(to.Y - from.Y, to.X - from.X);
        const float len = 14f;
        const float wing = 7f;
        var p1 = new PointF(
            (float)(to.X - len * Math.Cos(angle) + wing * Math.Sin(angle)),
            (float)(to.Y - len * Math.Sin(angle) - wing * Math.Cos(angle)));
        var p2 = new PointF(
            (float)(to.X - len * Math.Cos(angle) - wing * Math.Sin(angle)),
            (float)(to.Y - len * Math.Sin(angle) + wing * Math.Cos(angle)));
        using var thickPen = new Pen(pen.Color, Math.Max(pen.Width, 2f))
        {
            StartCap = System.Drawing.Drawing2D.LineCap.Round,
            EndCap = System.Drawing.Drawing2D.LineCap.Round,
        };
        g.DrawLine(thickPen, to, p1);
        g.DrawLine(thickPen, to, p2);
    }

    private static void DrawDirectedDiamond(Graphics g, Pen pen, PointF tip, PointF from, bool filled)
    {
        const float depth = 22f;
        const float halfWidth = 10f;
        var angle = MathF.Atan2(tip.Y - from.Y, tip.X - from.X);
        var inward = angle + MathF.PI;
        var basePt = PolarOffset(tip, inward, depth);
        var mid = PolarOffset(tip, inward, depth * 0.5f);
        var wing1 = PolarOffset(mid, angle + MathF.PI / 2f, halfWidth);
        var wing2 = PolarOffset(mid, angle - MathF.PI / 2f, halfWidth);

        PointF[] points = [tip, wing1, basePt, wing2];
        using var outlinePen = new Pen(pen.Color, Math.Max(pen.Width, 2f));
        if (filled)
        {
            using var brush = new SolidBrush(Color.Black);
            g.FillPolygon(brush, points);
        }

        g.DrawPolygon(outlinePen, points);
    }

    private enum RectangleSide { Top, Right, Bottom, Left }

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

    private static PointF GetConnectionPoint(RectangleF from, RectangleF to, out RectangleSide side)
    {
        var fromCenter = new PointF(from.Left + from.Width / 2f, from.Top + from.Height / 2f);
        var toCenter = new PointF(to.Left + to.Width / 2f, to.Top + to.Height / 2f);
        var dx = toCenter.X - fromCenter.X;
        var dy = toCenter.Y - fromCenter.Y;

        if (MathF.Abs(dx) < 0.001f && MathF.Abs(dy) < 0.001f)
        {
            side = RectangleSide.Right;
            return new PointF(from.Right, fromCenter.Y);
        }

        var bestT = float.MaxValue;
        var best = fromCenter;
        var bestSide = RectangleSide.Right;

        void TryHit(float t, float x, float y, RectangleSide candidate)
        {
            if (t <= 0.0001f || t >= bestT)
                return;

            if (x < from.Left - 0.01f || x > from.Right + 0.01f || y < from.Top - 0.01f || y > from.Bottom + 0.01f)
                return;

            bestT = t;
            best = new PointF(x, y);
            bestSide = candidate;
        }

        if (MathF.Abs(dx) > 0.001f)
        {
            var tRight = (from.Right - fromCenter.X) / dx;
            TryHit(tRight, from.Right, fromCenter.Y + tRight * dy, RectangleSide.Right);

            var tLeft = (from.Left - fromCenter.X) / dx;
            TryHit(tLeft, from.Left, fromCenter.Y + tLeft * dy, RectangleSide.Left);
        }

        if (MathF.Abs(dy) > 0.001f)
        {
            var tBottom = (from.Bottom - fromCenter.Y) / dy;
            TryHit(tBottom, fromCenter.X + tBottom * dx, from.Bottom, RectangleSide.Bottom);

            var tTop = (from.Top - fromCenter.Y) / dy;
            TryHit(tTop, fromCenter.X + tTop * dx, from.Top, RectangleSide.Top);
        }

        side = bestSide;
        return best;
    }

    private static void DrawInteractionOverlays(
        Graphics g,
        UmlProject project,
        UmlDiagram diagram,
        UmlDiagramNode? selectedNode,
        UmlDiagramEdge? selectedEdge,
        UmlDiagramNode? hoverNode,
        UmlDiagramEdge? hoverEdge)
    {
        if (hoverEdge is not null && hoverEdge != selectedEdge)
            DrawEdgeOverlay(g, project, diagram, hoverEdge, selected: false);

        if (selectedEdge is not null)
            DrawEdgeOverlay(g, project, diagram, selectedEdge, selected: true);

        if (hoverNode is not null && hoverNode != selectedNode)
            DrawNodeHoverOverlay(g, project, hoverNode);

        if (selectedNode is not null)
            DrawNodeSelectionOverlay(g, project, selectedNode);
    }

    private static void DrawNodeHoverOverlay(Graphics g, UmlProject project, UmlDiagramNode node)
    {
        var rect = GetNodeBounds(project, node);
        using var pen = new Pen(Color.FromArgb(180, 79, 70, 229), 2f)
        {
            DashStyle = System.Drawing.Drawing2D.DashStyle.Dash,
        };
        g.DrawRectangle(pen, rect.X, rect.Y, rect.Width, rect.Height);
    }

    private static void DrawNodeSelectionOverlay(Graphics g, UmlProject project, UmlDiagramNode node)
    {
        var rect = GetNodeBounds(project, node);
        using var selectPen = new Pen(Color.FromArgb(220, 30, 136, 229), 1.2f)
        {
            DashStyle = System.Drawing.Drawing2D.DashStyle.Dot,
        };
        g.DrawRectangle(selectPen, rect.X, rect.Y, rect.Width, rect.Height);
        DrawSelectionHandles(g, rect);
    }

    private static void DrawSelectionHandles(Graphics g, RectangleF rect)
    {
        const float handleSize = 7f;
        using var brush = new SolidBrush(Color.White);
        using var pen = new Pen(Color.FromArgb(30, 136, 229), 1.5f);

        foreach (var handleRect in GetHandleRects(rect, handleSize))
        {
            g.FillRectangle(brush, handleRect);
            g.DrawRectangle(pen, handleRect.X, handleRect.Y, handleRect.Width, handleRect.Height);
        }
    }

    private static IEnumerable<RectangleF> GetHandleRects(RectangleF rect, float size)
    {
        var half = size / 2f;
        var points = new[]
        {
            new PointF(rect.Left, rect.Top),
            new PointF(rect.Left + rect.Width / 2f, rect.Top),
            new PointF(rect.Right, rect.Top),
            new PointF(rect.Right, rect.Top + rect.Height / 2f),
            new PointF(rect.Right, rect.Bottom),
            new PointF(rect.Left + rect.Width / 2f, rect.Bottom),
            new PointF(rect.Left, rect.Bottom),
            new PointF(rect.Left, rect.Top + rect.Height / 2f),
        };

        foreach (var point in points)
            yield return new RectangleF(point.X - half, point.Y - half, size, size);
    }

    private static void DrawEdgeOverlay(Graphics g, UmlProject project, UmlDiagram diagram, UmlDiagramEdge edge, bool selected)
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
                DrawOverlaySegment(g, start, end, color, width, selected);

            return;
        }

        var genericStart = GetConnectionPoint(sourceNode.Bounds, targetNode.Bounds, out _);
        var genericEnd = GetConnectionPoint(targetNode.Bounds, sourceNode.Bounds, out _);
        DrawOverlaySegment(g, genericStart, genericEnd, color, width, selected);
    }

    private static void DrawOverlaySegment(Graphics g, PointF start, PointF end, Color color, float width, bool selected)
    {
        using var pen = new Pen(color, width)
        {
            StartCap = System.Drawing.Drawing2D.LineCap.Round,
            EndCap = System.Drawing.Drawing2D.LineCap.Round,
        };
        g.DrawLine(pen, start, end);

        if (selected)
        {
            var mid = new PointF((start.X + end.X) / 2f, (start.Y + end.Y) / 2f);
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
}
