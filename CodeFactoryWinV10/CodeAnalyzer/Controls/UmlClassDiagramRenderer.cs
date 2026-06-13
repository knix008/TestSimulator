using System.Drawing.Text;
using CodeAnalyzer.Models;

namespace CodeAnalyzer.Controls;

internal static class UmlClassDiagramRenderer
{
    private const int MinWidth = 180;
    private const int HorizontalPadding = 12;
    private const int NameHeight = 30;
    private const int StereotypeHeight = 16;
    private const int LineHeight = 17;
    private const int SeparatorHeight = 1;
    private const int HorizontalGap = 80;
    private const int InterDepthGap = 160;
    private const int IntraDepthGap = 80;
    private const int MaxDisplayedMembers = 12;
    private const int MaxNodesPerRow = 5;
    private const int TextMeasurePadding = 4;

    public static DiagramBoxNode CreateBox(StructureTypeNode type)
    {
        var attributes = type.Attributes.Count > 0
            ? type.Attributes
            : type.Members.Take(6).ToList();
        var operations = type.Operations;

        return new DiagramBoxNode
        {
            Id = type.Id,
            Title = type.DisplayName,
            Subtitle = type.Kind,
            IsUmlStyle = true,
            TypeKind = type.Kind,
            IsAbstract = type.IsAbstract,
            Attributes = attributes,
            Operations = operations,
            Lines = []
        };
    }

    private const int ComponentVerticalGap = 96;

    public static Size Layout(
        IReadOnlyList<DiagramBoxNode> nodes,
        IReadOnlyDictionary<string, int> depthById,
        IReadOnlyList<DiagramEdge>? relationEdges = null)
    {
        if (nodes.Count == 0)
        {
            return new Size(400, 300);
        }

        foreach (var node in nodes)
        {
            MeasureNode(node);
        }

        var adjacency = ClassDiagramRelationLayout.BuildUndirectedAdjacency(
            nodes.Select(node => node.Id),
            relationEdges ?? []);
        var partitioned = ClassDiagramRelationLayout.PartitionConnectedComponents(nodes, adjacency);
        var components = new List<List<DiagramBoxNode>>(
            partitioned.Where(component => component.Count > 1));
        var orphans = partitioned.Where(component => component.Count == 1).SelectMany(component => component).ToList();
        if (orphans.Count > 0)
        {
            components.Add(orphans);
        }

        var bounds = Rectangle.Empty;
        var componentY = 36;

        foreach (var component in components)
        {
            var componentDepths = component.ToDictionary(
                node => node.Id,
                node => depthById.TryGetValue(node.Id, out var depth) ? depth : 0,
                StringComparer.Ordinal);
            var orderedLayers = ClassDiagramRelationLayout.OrderLayersByRelation(
                component,
                componentDepths,
                adjacency);

            var componentBounds = LayoutOrderedLayers(orderedLayers, componentY);
            bounds = bounds == Rectangle.Empty ? componentBounds : Rectangle.Union(bounds, componentBounds);
            componentY = bounds.Bottom + ComponentVerticalGap;
        }

        return new Size(Math.Max(bounds.Right + 48, 400), Math.Max(bounds.Bottom + 48, 300));
    }

    private static Rectangle LayoutOrderedLayers(
        Dictionary<int, List<DiagramBoxNode>> orderedLayers,
        int startY)
    {
        var bounds = Rectangle.Empty;
        var y = startY;
        var depths = orderedLayers.Keys.OrderBy(depth => depth).ToList();

        for (var depthIndex = 0; depthIndex < depths.Count; depthIndex++)
        {
            var depth = depths[depthIndex];
            if (!orderedLayers.TryGetValue(depth, out var sorted) || sorted.Count == 0)
            {
                continue;
            }

            var isLastDepth = depthIndex == depths.Count - 1;

            for (var rowStart = 0; rowStart < sorted.Count; rowStart += MaxNodesPerRow)
            {
                var rowNodes = sorted.Skip(rowStart).Take(MaxNodesPerRow).ToList();
                var rowHeight = rowNodes.Max(node => node.Bounds.Height);
                var x = 36;

                foreach (var node in rowNodes)
                {
                    node.Bounds = new Rectangle(x, y, node.Bounds.Width, node.Bounds.Height);
                    bounds = bounds == Rectangle.Empty ? node.Bounds : Rectangle.Union(bounds, node.Bounds);
                    x += node.Bounds.Width + HorizontalGap;
                }

                var isLastSubRow = rowStart + MaxNodesPerRow >= sorted.Count;
                y += rowHeight + (isLastSubRow && isLastDepth ? 0 : isLastSubRow ? InterDepthGap : IntraDepthGap);
            }
        }

        return bounds;
    }

    public static void DrawClass(Graphics graphics, DiagramBoxNode box, bool isHighlight, bool isCurrent)
    {
        var bounds = box.Bounds;
        var stereotype = GetStereotype(box.TypeKind);

        var headerColor = isCurrent
            ? Color.FromArgb(255, 228, 180)
            : GetHeaderColor(box.TypeKind, box.IsAbstract);
        var bodyColor = isCurrent
            ? Color.FromArgb(255, 248, 232)
            : isHighlight
                ? Color.FromArgb(255, 252, 238)
                : Color.White;
        var borderColor = isCurrent
            ? Color.FromArgb(210, 100, 10)
            : Color.FromArgb(50, 60, 78);

        // --- Measure header height to split box ---
        var headerHeight = 8
            + (stereotype is not null ? StereotypeHeight : 0)
            + NameHeight
            + SeparatorHeight;

        var headerRect = new Rectangle(bounds.Left, bounds.Top, bounds.Width, headerHeight);
        var bodyRect = new Rectangle(bounds.Left, bounds.Top + headerHeight, bounds.Width, bounds.Height - headerHeight);

        using var headerBrush = new SolidBrush(headerColor);
        using var bodyBrush = new SolidBrush(bodyColor);
        using var borderPen = new Pen(borderColor, isCurrent ? 2.5f : 1.5f);
        using var separatorPen = new Pen(Color.FromArgb(170, 182, 200));
        using var nameBrush = new SolidBrush(Color.FromArgb(15, 25, 45));
        using var memberBrush = new SolidBrush(Color.FromArgb(40, 50, 68));
        using var stereotypeBrush = new SolidBrush(Color.FromArgb(65, 75, 110));

        graphics.FillRectangle(headerBrush, headerRect);
        graphics.FillRectangle(bodyBrush, bodyRect);
        graphics.DrawRectangle(borderPen, bounds);

        using var nameFont = CreateNameFont(box);
        using var memberFont = new Font("Segoe UI", 8.25f);
        using var stereotypeFont = new Font("Segoe UI", 7.5f, FontStyle.Italic);
        using var moreFont = new Font("Segoe UI", 7.5f, FontStyle.Italic);

        var contentWidth = Math.Max(1, bounds.Width - HorizontalPadding * 2);
        var textClip = new Rectangle(
            bounds.Left + 1,
            bounds.Top + headerHeight + 1,
            bounds.Width - 2,
            bounds.Height - headerHeight - 2);

        var y = bounds.Top;

        if (stereotype is not null)
        {
            var stereotypeText = FitText(graphics, stereotype, stereotypeFont, bounds.Width - 8);
            var sz = MeasureText(graphics, stereotypeText, stereotypeFont);
            graphics.DrawString(
                stereotypeText, stereotypeFont, stereotypeBrush,
                bounds.Left + (bounds.Width - sz.Width) / 2f, y + 3);
            y += StereotypeHeight;
        }

        var titleText = FitText(graphics, box.Title, nameFont, bounds.Width - 8);
        var titleSz = MeasureText(graphics, titleText, nameFont);
        graphics.DrawString(
            titleText, nameFont, nameBrush,
            bounds.Left + (bounds.Width - titleSz.Width) / 2f, y + 5);

        graphics.DrawLine(separatorPen, bounds.Left + 1, bounds.Top + headerHeight - 1, bounds.Right - 1, bounds.Top + headerHeight - 1);

        var bodyClipState = graphics.Save();
        graphics.SetClip(textClip);
        y = bounds.Top + headerHeight + 5;

        // --- Attributes ---
        var showAttributeSection = box.TypeKind is not "interface";
        var attrSlice = box.Attributes.Take(MaxDisplayedMembers).ToList();
        if (showAttributeSection)
        {
            foreach (var line in attrSlice)
            {
                DrawMemberLine(graphics, line, memberFont, memberBrush, bounds.Left + HorizontalPadding, y, contentWidth);
                y += LineHeight;
            }

            if (box.Attributes.Count > MaxDisplayedMembers)
            {
                var moreText = $"  ⋯ +{box.Attributes.Count - MaxDisplayedMembers}";
                DrawMemberLine(graphics, moreText, moreFont, Brushes.DimGray, bounds.Left + HorizontalPadding, y, contentWidth);
                y += LineHeight;
            }
            else if (attrSlice.Count == 0 && box.TypeKind is not "enum")
            {
                DrawMemberLine(graphics, "—", memberFont, Brushes.LightGray, bounds.Left + HorizontalPadding, y, contentWidth);
                y += LineHeight;
            }
        }

        // --- Operations ---
        var showOperationSection = box.TypeKind is "class" or "struct" or "interface";
        if (showOperationSection)
        {
            var separatorState = graphics.Save();
            graphics.ResetClip();
            graphics.DrawLine(separatorPen, bounds.Left + 1, y, bounds.Right - 1, y);
            graphics.Restore(separatorState);
            y += SeparatorHeight + 5;

            var opsSlice = box.Operations.Take(MaxDisplayedMembers).ToList();
            if (opsSlice.Count > 0)
            {
                foreach (var line in opsSlice)
                {
                    DrawMemberLine(graphics, line, memberFont, memberBrush, bounds.Left + HorizontalPadding, y, contentWidth);
                    y += LineHeight;
                }

                if (box.Operations.Count > MaxDisplayedMembers)
                {
                    var moreText = $"  ⋯ +{box.Operations.Count - MaxDisplayedMembers}";
                    DrawMemberLine(graphics, moreText, moreFont, Brushes.DimGray, bounds.Left + HorizontalPadding, y, contentWidth);
                }
            }
            else
            {
                DrawMemberLine(graphics, "—", memberFont, Brushes.LightGray, bounds.Left + HorizontalPadding, y, contentWidth);
            }
        }

        graphics.Restore(bodyClipState);
    }

    public static void DrawRelation(
        Graphics graphics,
        DiagramBoxNode from,
        DiagramBoxNode to,
        DiagramEdge edge,
        ConnectionLineStyle lineStyle = ConnectionLineStyle.Straight)
    {
        var start = GetConnectionPoint(from, to);
        var end = GetConnectionPoint(to, from);

        using var pen = new Pen(Color.FromArgb(55, 65, 80), 1.6f);

        switch (edge.RelationKind)
        {
            case StructureRelationKind.Inheritance:
                pen.Color = Color.FromArgb(28, 58, 128);
                pen.Width = 2f;
                DrawGeneralization(graphics, pen, start, end, lineStyle);
                break;

            case StructureRelationKind.Implementation:
                pen.DashStyle = System.Drawing.Drawing2D.DashStyle.Dash;
                pen.Color = Color.FromArgb(88, 52, 148);
                pen.Width = 1.8f;
                DrawRealization(graphics, pen, start, end, lineStyle);
                DrawMidLabel(graphics, start, end, "implements");
                break;

            case StructureRelationKind.Dependency:
                pen.DashStyle = System.Drawing.Drawing2D.DashStyle.Dot;
                pen.Color = Color.FromArgb(100, 112, 130);
                DrawDependency(graphics, pen, start, end, lineStyle);
                break;

            default:
                DrawRoutedLine(graphics, pen, start, end, lineStyle);
                DrawOpenArrow(graphics, pen, start, end);
                break;
        }
    }

    // -------------------------------------------------------------------------
    // Measurement
    // -------------------------------------------------------------------------

    private static void MeasureNode(DiagramBoxNode node)
    {
        using var measureBitmap = new Bitmap(1, 1);
        using var graphics = Graphics.FromImage(measureBitmap);
        graphics.TextRenderingHint = TextRenderingHint.ClearTypeGridFit;

        var stereotype = GetStereotype(node.TypeKind);
        var attrSlice = node.Attributes.Take(MaxDisplayedMembers).ToList();
        var hasAttrMore = node.Attributes.Count > MaxDisplayedMembers;
        var opsSlice = node.Operations.Take(MaxDisplayedMembers).ToList();
        var hasOpsMore = node.Operations.Count > MaxDisplayedMembers;

        using var nameFont = CreateNameFont(node);
        using var memberFont = new Font("Segoe UI", 8.25f);
        using var stereotypeFont = new Font("Segoe UI", 7.5f, FontStyle.Italic);
        using var moreFont = new Font("Segoe UI", 7.5f, FontStyle.Italic);

        var maxTextWidth = MeasureText(graphics, node.Title, nameFont).Width;
        if (stereotype is not null)
        {
            maxTextWidth = Math.Max(maxTextWidth, MeasureText(graphics, stereotype, stereotypeFont).Width);
        }

        foreach (var line in attrSlice)
        {
            maxTextWidth = Math.Max(maxTextWidth, MeasureText(graphics, line, memberFont).Width);
        }

        if (hasAttrMore)
        {
            var moreText = $"  ⋯ +{node.Attributes.Count - MaxDisplayedMembers}";
            maxTextWidth = Math.Max(maxTextWidth, MeasureText(graphics, moreText, moreFont).Width);
        }

        foreach (var line in opsSlice)
        {
            maxTextWidth = Math.Max(maxTextWidth, MeasureText(graphics, line, memberFont).Width);
        }

        if (hasOpsMore)
        {
            var moreText = $"  ⋯ +{node.Operations.Count - MaxDisplayedMembers}";
            maxTextWidth = Math.Max(maxTextWidth, MeasureText(graphics, moreText, moreFont).Width);
        }

        var width = Math.Max(MinWidth, (int)Math.Ceiling(maxTextWidth) + HorizontalPadding * 2 + TextMeasurePadding);

        var height = 8;
        if (stereotype is not null)
        {
            height += StereotypeHeight;
        }

        height += NameHeight + SeparatorHeight + 5;

        if (node.TypeKind is not "interface")
        {
            var attrRows = Math.Max(attrSlice.Count, node.TypeKind is "enum" ? 0 : 1);
            height += attrRows * LineHeight;
            if (hasAttrMore)
            {
                height += LineHeight;
            }
        }

        if (node.TypeKind is "class" or "struct" or "interface")
        {
            height += SeparatorHeight + 5;
            var opsRows = Math.Max(opsSlice.Count, 1);
            height += opsRows * LineHeight;
            if (hasOpsMore)
            {
                height += LineHeight;
            }
        }

        height += 8;
        node.Bounds = new Rectangle(0, 0, width, height);
    }

    // -------------------------------------------------------------------------
    // Connection points — pick the cardinal direction toward the other node
    // -------------------------------------------------------------------------

    private static Point GetConnectionPoint(DiagramBoxNode box, DiagramBoxNode other)
    {
        var cx = box.Bounds.Left + box.Bounds.Width / 2;
        var cy = box.Bounds.Top + box.Bounds.Height / 2;
        var ox = other.Bounds.Left + other.Bounds.Width / 2;
        var oy = other.Bounds.Top + other.Bounds.Height / 2;
        var dx = ox - cx;
        var dy = oy - cy;

        // Use horizontal exit/entry when the connection is more horizontal than vertical
        if (Math.Abs(dx) >= Math.Abs(dy))
        {
            return dx >= 0
                ? new Point(box.Bounds.Right, cy)
                : new Point(box.Bounds.Left, cy);
        }

        return dy >= 0
            ? new Point(cx, box.Bounds.Bottom)
            : new Point(cx, box.Bounds.Top);
    }

    // -------------------------------------------------------------------------
    // Relation drawing
    // -------------------------------------------------------------------------

    private static void DrawGeneralization(Graphics g, Pen pen, Point start, Point end, ConnectionLineStyle style)
    {
        var lineEnd = OffsetFromTip(end, start, 20);
        DrawRoutedLine(g, pen, start, lineEnd, style);
        DrawHollowTriangle(g, pen, end, start);
    }

    private static void DrawRealization(Graphics g, Pen pen, Point start, Point end, ConnectionLineStyle style)
    {
        var lineEnd = OffsetFromTip(end, start, 20);
        DrawRoutedLine(g, pen, start, lineEnd, style);
        DrawHollowTriangle(g, pen, end, start);
    }

    private static void DrawDependency(Graphics g, Pen pen, Point start, Point end, ConnectionLineStyle style)
    {
        var lineEnd = OffsetFromTip(end, start, 14);
        DrawRoutedLine(g, pen, start, lineEnd, style);
        DrawOpenArrow(g, pen, start, end);
    }

    private static void DrawMidLabel(Graphics graphics, Point start, Point end, string label)
    {
        var mx = (start.X + end.X) / 2f;
        var my = (start.Y + end.Y) / 2f;
        using var font = new Font("Segoe UI", 7.5f, FontStyle.Italic);
        using var brush = new SolidBrush(Color.FromArgb(95, 55, 145));
        var sz = graphics.MeasureString(label, font);
        graphics.DrawString(label, font, brush, mx - sz.Width / 2f, my - sz.Height - 2);
    }

    private static void DrawRoutedLine(Graphics graphics, Pen pen, Point start, Point end, ConnectionLineStyle style)
    {
        switch (style)
        {
            case ConnectionLineStyle.Bezier:
                var sdx = end.X - start.X;
                var sdy = end.Y - start.Y;
                var adx = Math.Abs(sdx);
                var ady = Math.Abs(sdy);
                var rawOff = Math.Max(40, Math.Max(adx, ady) / 2);
                Point c1, c2;
                if (ady >= adx)
                {
                    var off = Math.Max(1, Math.Min(rawOff, ady / 2));
                    c1 = new Point(start.X, start.Y + Math.Sign(sdy) * off);
                    c2 = new Point(end.X, end.Y - Math.Sign(sdy) * off);
                }
                else
                {
                    var off = Math.Max(1, Math.Min(rawOff, adx / 2));
                    c1 = new Point(start.X + Math.Sign(sdx) * off, start.Y);
                    c2 = new Point(end.X - Math.Sign(sdx) * off, end.Y);
                }
                graphics.DrawBezier(pen, start, c1, c2, end);
                break;

            case ConnectionLineStyle.Orthogonal:
                if (Math.Abs(end.Y - start.Y) >= Math.Abs(end.X - start.X))
                {
                    // Vertical dominant: mid horizontal bar
                    var midY = (start.Y + end.Y) / 2;
                    graphics.DrawLines(pen, new PointF[]
                        { start, new PointF(start.X, midY), new PointF(end.X, midY), end });
                }
                else
                {
                    // Horizontal dominant: mid vertical bar
                    var midX = (start.X + end.X) / 2;
                    graphics.DrawLines(pen, new PointF[]
                        { start, new PointF(midX, start.Y), new PointF(midX, end.Y), end });
                }
                break;

            default:
                graphics.DrawLine(pen, start, end);
                break;
        }
    }

    private static Point OffsetFromTip(Point tip, Point from, float distance)
    {
        var dx = tip.X - from.X;
        var dy = tip.Y - from.Y;
        var len = MathF.Sqrt(dx * dx + dy * dy);
        if (len < 1f) return tip;
        return new Point(
            (int)(tip.X - dx / len * distance),
            (int)(tip.Y - dy / len * distance));
    }

    private static void DrawHollowTriangle(Graphics graphics, Pen pen, Point tip, Point from)
    {
        var dx = tip.X - from.X;
        var dy = tip.Y - from.Y;
        var len = MathF.Sqrt(dx * dx + dy * dy);
        if (len < 1f) return;

        var ux = dx / len;
        var uy = dy / len;
        const float length = 22f;
        const float halfWidth = 10f;
        var bcx = tip.X - ux * length;
        var bcy = tip.Y - uy * length;

        var points = new[]
        {
            tip,
            new Point((int)(bcx + -uy * halfWidth), (int)(bcy + ux * halfWidth)),
            new Point((int)(bcx - -uy * halfWidth), (int)(bcy - ux * halfWidth))
        };

        using var fill = new SolidBrush(Color.White);
        graphics.FillPolygon(fill, points);
        graphics.DrawPolygon(pen, points);
    }

    private static void DrawOpenArrow(Graphics graphics, Pen pen, Point start, Point end)
    {
        var dx = end.X - start.X;
        var dy = end.Y - start.Y;
        var len = MathF.Sqrt(dx * dx + dy * dy);
        if (len < 1f) return;

        var ux = dx / len;
        var uy = dy / len;
        var left = new Point((int)(end.X - ux * 14 - uy * 6), (int)(end.Y - uy * 14 + ux * 6));
        var right = new Point((int)(end.X - ux * 14 + uy * 6), (int)(end.Y - uy * 14 - ux * 6));
        graphics.DrawLine(pen, end, left);
        graphics.DrawLine(pen, end, right);
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private static Font CreateNameFont(DiagramBoxNode box)
    {
        var style = box.TypeKind == "interface"
            ? FontStyle.Italic
            : box.IsAbstract
                ? FontStyle.Bold | FontStyle.Italic
                : FontStyle.Bold;

        return new Font("Segoe UI", 9.5f, style);
    }

    private static void DrawMemberLine(
        Graphics graphics,
        string text,
        Font font,
        Brush brush,
        float x,
        float y,
        int maxWidth)
    {
        var fitted = FitText(graphics, text, font, maxWidth);
        graphics.DrawString(fitted, font, brush, x, y);
    }

    private static SizeF MeasureText(Graphics graphics, string text, Font font) =>
        graphics.MeasureString(text, font, int.MaxValue, StringFormat.GenericTypographic);

    private static string FitText(Graphics graphics, string text, Font font, int maxWidth)
    {
        if (string.IsNullOrEmpty(text) || maxWidth <= 0)
        {
            return string.Empty;
        }

        if (MeasureText(graphics, text, font).Width <= maxWidth)
        {
            return text;
        }

        const string ellipsis = "…";
        for (var length = text.Length - 1; length > 0; length--)
        {
            var candidate = text[..length] + ellipsis;
            if (MeasureText(graphics, candidate, font).Width <= maxWidth)
            {
                return candidate;
            }
        }

        return ellipsis;
    }

    private static Color GetHeaderColor(string typeKind, bool isAbstract) => typeKind switch
    {
        "interface" => Color.FromArgb(218, 202, 248),
        "struct"    => Color.FromArgb(196, 238, 212),
        "enum"      => Color.FromArgb(250, 226, 192),
        _ when isAbstract => Color.FromArgb(212, 214, 232),
        _           => Color.FromArgb(206, 224, 250)
    };

    private static string? GetStereotype(string typeKind) => typeKind switch
    {
        "interface" => "«interface»",
        "enum"      => "«enumeration»",
        "struct"    => "«struct»",
        _ => null
    };
}
