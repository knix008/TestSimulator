using CodeAnalyzer.Models;

namespace CodeAnalyzer.Controls;

internal static class UmlClassDiagramRenderer
{
    private const int MinWidth = 180;
    private const int MaxWidth = 360;
    private const int HorizontalPadding = 12;
    private const int NameHeight = 30;
    private const int StereotypeHeight = 16;
    private const int LineHeight = 17;
    private const int SeparatorHeight = 1;
    private const int HorizontalGap = 80;
    private const int InterDepthGap = 160;
    private const int IntraDepthGap = 80;
    private const int MaxDisplayedMembers = 8;
    private const int MaxNodesPerRow = 5;

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

    public static Size Layout(
        IReadOnlyList<DiagramBoxNode> nodes,
        IReadOnlyDictionary<string, int> depthById)
    {
        if (nodes.Count == 0)
        {
            return new Size(400, 300);
        }

        foreach (var node in nodes)
        {
            MeasureNode(node);
        }

        var grouped = nodes
            .GroupBy(node => depthById.TryGetValue(node.Id, out var depth) ? depth : 0)
            .OrderBy(group => group.Key)
            .ToList();

        var bounds = Rectangle.Empty;
        var y = 36;

        foreach (var depthGroup in grouped)
        {
            var sorted = depthGroup.OrderBy(n => n.Title, StringComparer.OrdinalIgnoreCase).ToList();
            var isLastDepth = ReferenceEquals(depthGroup, grouped.Last().AsEnumerable());

            for (var rowStart = 0; rowStart < sorted.Count; rowStart += MaxNodesPerRow)
            {
                var rowNodes = sorted.Skip(rowStart).Take(MaxNodesPerRow).ToList();
                var rowHeight = rowNodes.Max(n => n.Bounds.Height);
                var x = 36;

                foreach (var node in rowNodes)
                {
                    node.Bounds = new Rectangle(x, y, node.Bounds.Width, node.Bounds.Height);
                    bounds = bounds == Rectangle.Empty ? node.Bounds : Rectangle.Union(bounds, node.Bounds);
                    x += node.Bounds.Width + HorizontalGap;
                }

                var isLastSubRow = rowStart + MaxNodesPerRow >= sorted.Count;
                y += rowHeight + (isLastSubRow ? InterDepthGap : IntraDepthGap);
            }
        }

        return new Size(Math.Max(bounds.Right + 48, 400), Math.Max(bounds.Bottom + 48, 300));
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

        var nameFontStyle = box.TypeKind == "interface"
            ? FontStyle.Italic
            : box.IsAbstract
                ? FontStyle.Bold | FontStyle.Italic
                : FontStyle.Bold;

        using var nameFont = new Font("Segoe UI", 9.5f, nameFontStyle);
        using var memberFont = new Font("Segoe UI", 8.25f);
        using var stereotypeFont = new Font("Segoe UI", 7.5f, FontStyle.Italic);
        using var moreFont = new Font("Segoe UI", 7.5f, FontStyle.Italic);

        var y = bounds.Top;

        // Stereotype row
        if (stereotype is not null)
        {
            var sz = graphics.MeasureString(stereotype, stereotypeFont);
            graphics.DrawString(
                stereotype, stereotypeFont, stereotypeBrush,
                bounds.Left + (bounds.Width - sz.Width) / 2f, y + 3);
            y += StereotypeHeight;
        }

        // Class name
        var titleSz = graphics.MeasureString(box.Title, nameFont);
        graphics.DrawString(
            box.Title, nameFont, nameBrush,
            bounds.Left + (bounds.Width - titleSz.Width) / 2f, y + 5);
        y += NameHeight;

        // Separator between header and body
        graphics.DrawLine(separatorPen, bounds.Left + 1, y, bounds.Right - 1, y);
        y += SeparatorHeight + 5;

        // --- Attributes ---
        var attrSlice = box.Attributes.Take(MaxDisplayedMembers).ToList();
        if (attrSlice.Count > 0)
        {
            foreach (var line in attrSlice)
            {
                graphics.DrawString(TruncateLine(line), memberFont, memberBrush, bounds.Left + HorizontalPadding, y);
                y += LineHeight;
            }

            if (box.Attributes.Count > MaxDisplayedMembers)
            {
                graphics.DrawString(
                    $"  ⋯ +{box.Attributes.Count - MaxDisplayedMembers}",
                    moreFont, Brushes.DimGray, bounds.Left + HorizontalPadding, y);
                y += LineHeight;
            }
        }
        else if (box.TypeKind is not "interface" and not "enum")
        {
            y += LineHeight; // empty placeholder so the section is visible
        }

        // --- Operations ---
        if (box.Operations.Count > 0 || box.TypeKind == "interface")
        {
            graphics.DrawLine(separatorPen, bounds.Left + 1, y, bounds.Right - 1, y);
            y += SeparatorHeight + 5;

            var opsSlice = box.Operations.Take(MaxDisplayedMembers).ToList();
            if (opsSlice.Count > 0)
            {
                foreach (var line in opsSlice)
                {
                    graphics.DrawString(TruncateLine(line), memberFont, memberBrush, bounds.Left + HorizontalPadding, y);
                    y += LineHeight;
                }

                if (box.Operations.Count > MaxDisplayedMembers)
                {
                    graphics.DrawString(
                        $"  ⋯ +{box.Operations.Count - MaxDisplayedMembers}",
                        moreFont, Brushes.DimGray, bounds.Left + HorizontalPadding, y);
                }
            }
            else
            {
                y += LineHeight; // empty placeholder for interface with no operations yet
            }
        }
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
        var stereotype = GetStereotype(node.TypeKind);
        var attrSlice = node.Attributes.Take(MaxDisplayedMembers).ToList();
        var hasAttrMore = node.Attributes.Count > MaxDisplayedMembers;
        var opsSlice = node.Operations.Take(MaxDisplayedMembers).ToList();
        var hasOpsMore = node.Operations.Count > MaxDisplayedMembers;

        // Width: based on longest text
        var allLines = new List<string> { node.Title };
        if (stereotype is not null) allLines.Add(stereotype);
        allLines.AddRange(attrSlice);
        allLines.AddRange(opsSlice);
        var maxChars = allLines.Max(l => l.Length);
        var width = Math.Clamp(maxChars * 7 + HorizontalPadding * 2, MinWidth, MaxWidth);

        // Height
        var height = 8;
        if (stereotype is not null) height += StereotypeHeight;
        height += NameHeight + SeparatorHeight + 5;

        // Attributes section
        var attrRows = attrSlice.Count > 0 ? attrSlice.Count : (node.TypeKind is "interface" or "enum" ? 0 : 1);
        height += attrRows * LineHeight;
        if (hasAttrMore) height += LineHeight;

        // Operations section
        if (node.Operations.Count > 0 || node.TypeKind == "interface")
        {
            height += SeparatorHeight + 5;
            var opsRows = opsSlice.Count > 0 ? opsSlice.Count : 1; // at least 1 placeholder
            height += opsRows * LineHeight;
            if (hasOpsMore) height += LineHeight;
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

    private static string TruncateLine(string line) =>
        line.Length > 44 ? line[..41] + "…" : line;
}
