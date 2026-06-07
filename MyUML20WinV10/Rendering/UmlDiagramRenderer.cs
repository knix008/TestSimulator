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

        foreach (var edge in diagram.Edges)
            DrawEdge(g, project, diagram, edge, edge == selectedEdge);

        foreach (var node in diagram.Nodes)
            DrawNode(g, project, node, node == selectedNode);

        DrawInteractionOverlays(g, project, diagram, selectedNode, selectedEdge, hoverNode, hoverEdge);
    }

    public static SizeF MeasureClassifier(UmlClassifier classifier, bool showCompartments, float width)
    {
        var nameHeight = LineHeight + CompartmentPadding * 2;
        if (!showCompartments)
            return new SizeF(width, nameHeight + 8);

        var attrLines = classifier.Properties.Count;
        var opLines = classifier switch
        {
            UmlEnumeration en => en.Literals.Count,
            _ => classifier.Operations.Count,
        };

        var attrHeight = attrLines > 0 ? attrLines * LineHeight + CompartmentPadding * 2 : CompartmentPadding * 2;
        var opHeight = opLines > 0 ? opLines * LineHeight + CompartmentPadding * 2 : CompartmentPadding * 2;
        if (classifier is UmlEnumeration)
            attrHeight = 0;

        return new SizeF(width, nameHeight + attrHeight + opHeight);
    }

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
        }

        var classifier = project.FindClassifier(node.ModelElementId);
        if (classifier is null)
            return;
        using var textBrush = new SolidBrush(Color.Black);
        using var font = new Font("Segoe UI", 9f);
        using var italicFont = new Font("Segoe UI", 9f, FontStyle.Italic);

        if (classifier is UmlInterface)
            DrawInterfaceShape(g, bounds, bodyPen);
        else if (classifier is UmlEnumeration)
            DrawEnumerationShape(g, bounds, bodyPen);
        else
            g.DrawRectangle(bodyPen, bounds.X, bounds.Y, bounds.Width, bounds.Height);

        var y = bounds.Y + CompartmentPadding;
        if (!string.IsNullOrWhiteSpace(classifier.Stereotype))
        {
            var stereo = $"«{classifier.Stereotype}»";
            DrawCenteredText(g, stereo, italicFont, textBrush, bounds, ref y);
        }

        var keyword = classifier.NotationKeyword;
        var title = classifier.IsAbstract && classifier is UmlClass
            ? $"{keyword} {classifier.Name}"
            : $"{keyword} {classifier.Name}";
        DrawCenteredText(g, title, classifier.IsAbstract ? italicFont : font, textBrush, bounds, ref y);
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

        var start = GetConnectionPoint(sourceNode.Bounds, targetNode.Bounds, out var startSide);
        var end = GetConnectionPoint(targetNode.Bounds, sourceNode.Bounds, out var endSide);

        using var pen = new Pen(selected ? Color.DodgerBlue : Color.Black, selected ? 2f : 1.5f);
        using var font = new Font("Segoe UI", 8f);
        using var brush = new SolidBrush(Color.Black);

        switch (relationship)
        {
            case UmlGeneralization:
                DrawGeneralization(g, pen, start, end, startSide);
                break;
            case UmlRealization:
                DrawRealization(g, pen, start, end, startSide);
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
        using var brush = new SolidBrush(Color.Black);
        using var font = new Font("Segoe UI", 9f);
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

    private static void DrawRealization(Graphics g, Pen pen, PointF start, PointF end, RectangleSide childSide)
    {
        pen.DashStyle = System.Drawing.Drawing2D.DashStyle.Dash;
        var shaftEnd = Offset(end, childSide, -18f);
        g.DrawLine(pen, start, shaftEnd);
        DrawHollowTriangle(g, pen, end, childSide);
    }

    private static void DrawLabeledConnector(Graphics g, Pen pen, Font font, Brush brush, PointF start, PointF end, string label)
    {
        pen.DashStyle = System.Drawing.Drawing2D.DashStyle.Dash;
        g.DrawLine(pen, start, end);
        DrawOpenArrow(g, pen, start, end);
        var mid = new PointF((start.X + end.X) / 2f, (start.Y + end.Y) / 2f - 12f);
        g.DrawString(label, font, brush, mid);
    }

    private static void DrawGeneralization(Graphics g, Pen pen, PointF start, PointF end, RectangleSide childSide)
    {
        var shaftEnd = Offset(end, childSide, -18f);
        g.DrawLine(pen, start, shaftEnd);
        DrawHollowTriangle(g, pen, end, childSide);
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
        g.DrawLine(pen, start, end);
        DrawMultiplicity(g, font, brush, start, startSide, assoc.SourceMultiplicity);
        DrawMultiplicity(g, font, brush, end, endSide, assoc.TargetMultiplicity);

        if (!string.IsNullOrWhiteSpace(assoc.SourceEndName))
            DrawEndName(g, font, brush, start, startSide, assoc.SourceEndName);
        if (!string.IsNullOrWhiteSpace(assoc.TargetEndName))
            DrawEndName(g, font, brush, end, endSide, assoc.TargetEndName);

        if (assoc.Aggregation == UmlAggregationKind.Shared)
            DrawDiamond(g, pen, end, endSide, filled: false);
        else if (assoc.Aggregation == UmlAggregationKind.Composite)
            DrawDiamond(g, pen, end, endSide, filled: true);
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

    private static void DrawHollowTriangle(Graphics g, Pen pen, PointF tip, RectangleSide side)
    {
        var baseCenter = Offset(tip, side, -14f);
        PointF[] points = side is RectangleSide.Top or RectangleSide.Bottom
            ?
            [
                tip,
                new(baseCenter.X - 8, baseCenter.Y),
                new(baseCenter.X + 8, baseCenter.Y),
            ]
            :
            [
                tip,
                new(baseCenter.X, baseCenter.Y - 8),
                new(baseCenter.X, baseCenter.Y + 8),
            ];

        g.DrawPolygon(pen, points);
    }

    private static void DrawOpenArrow(Graphics g, Pen pen, PointF from, PointF to)
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
        g.DrawLine(pen, to, p1);
        g.DrawLine(pen, to, p2);
    }

    private static void DrawDiamond(Graphics g, Pen pen, PointF anchor, RectangleSide side, bool filled)
    {
        var center = Offset(anchor, side, -10f);
        PointF[] points = side is RectangleSide.Top or RectangleSide.Bottom
            ?
            [
                anchor,
                new(center.X - 8, center.Y),
                Offset(anchor, side, -20f),
                new(center.X + 8, center.Y),
            ]
            :
            [
                anchor,
                new(center.X, center.Y - 8),
                Offset(anchor, side, -20f),
                new(center.X, center.Y + 8),
            ];

        if (filled)
        {
            using var brush = new SolidBrush(Color.Black);
            g.FillPolygon(brush, points);
        }

        g.DrawPolygon(pen, points);
    }

    private enum RectangleSide { Top, Right, Bottom, Left }

    private static PointF GetConnectionPoint(RectangleF from, RectangleF to, out RectangleSide side)
    {
        var fromCenter = new PointF(from.Left + from.Width / 2f, from.Top + from.Height / 2f);
        var toCenter = new PointF(to.Left + to.Width / 2f, to.Top + to.Height / 2f);
        var dx = toCenter.X - fromCenter.X;
        var dy = toCenter.Y - fromCenter.Y;

        if (Math.Abs(dx) > Math.Abs(dy))
        {
            side = dx >= 0 ? RectangleSide.Right : RectangleSide.Left;
            return side == RectangleSide.Right
                ? new PointF(from.Right, fromCenter.Y)
                : new PointF(from.Left, fromCenter.Y);
        }

        side = dy >= 0 ? RectangleSide.Bottom : RectangleSide.Top;
        return side == RectangleSide.Bottom
            ? new PointF(fromCenter.X, from.Bottom)
            : new PointF(fromCenter.X, from.Top);
    }

    private static PointF Offset(PointF point, RectangleSide side, float amount) => side switch
    {
        RectangleSide.Top => new(point.X, point.Y + amount),
        RectangleSide.Bottom => new(point.X, point.Y - amount),
        RectangleSide.Left => new(point.X + amount, point.Y),
        _ => new(point.X - amount, point.Y),
    };

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
            DrawEdgeOverlay(g, diagram, hoverEdge, selected: false);

        if (selectedEdge is not null)
            DrawEdgeOverlay(g, diagram, selectedEdge, selected: true);

        if (hoverNode is not null && hoverNode != selectedNode)
            DrawNodeHoverOverlay(g, project, hoverNode);

        if (selectedNode is not null)
            DrawNodeSelectionOverlay(g, project, selectedNode);
    }

    private static void DrawNodeHoverOverlay(Graphics g, UmlProject project, UmlDiagramNode node)
    {
        var rect = GetNodeBounds(project, node);
        using var fill = new SolidBrush(Color.FromArgb(36, 79, 70, 229));
        using var pen = new Pen(Color.FromArgb(160, 79, 70, 229), 1.5f)
        {
            DashStyle = System.Drawing.Drawing2D.DashStyle.Dash,
        };
        g.FillRectangle(fill, rect.X, rect.Y, rect.Width, rect.Height);
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

    private static void DrawEdgeOverlay(Graphics g, UmlDiagram diagram, UmlDiagramEdge edge, bool selected)
    {
        var sourceNode = diagram.FindNode(edge.SourceNodeId);
        var targetNode = diagram.FindNode(edge.TargetNodeId);
        if (sourceNode is null || targetNode is null)
            return;

        var start = GetConnectionPoint(sourceNode.Bounds, targetNode.Bounds, out _);
        var end = GetConnectionPoint(targetNode.Bounds, sourceNode.Bounds, out _);
        var color = selected ? Color.FromArgb(220, 30, 136, 229) : Color.FromArgb(140, 79, 70, 229);
        var width = selected ? 4f : 3f;

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
