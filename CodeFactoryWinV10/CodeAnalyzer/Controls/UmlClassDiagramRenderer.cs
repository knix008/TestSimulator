using CodeAnalyzer.Models;

namespace CodeAnalyzer.Controls;

internal static class UmlClassDiagramRenderer
{
    private const int MinWidth = 160;
    private const int MaxWidth = 320;
    private const int HorizontalPadding = 10;
    private const int NameHeight = 28;
    private const int StereotypeHeight = 14;
    private const int LineHeight = 16;
    private const int SeparatorHeight = 1;
    private const int HorizontalGap = 56;
    private const int VerticalGap = 72;

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
        var y = 32;

        foreach (var group in grouped)
        {
            var rowHeight = group.Max(node => node.Bounds.Height);
            var x = 32;
            foreach (var node in group.OrderBy(n => n.Title, StringComparer.OrdinalIgnoreCase))
            {
                node.Bounds = new Rectangle(x, y, node.Bounds.Width, node.Bounds.Height);
                bounds = bounds == Rectangle.Empty ? node.Bounds : Rectangle.Union(bounds, node.Bounds);
                x += node.Bounds.Width + HorizontalGap;
            }

            y += rowHeight + VerticalGap;
        }

        return new Size(Math.Max(bounds.Right + 48, 400), Math.Max(bounds.Bottom + 48, 300));
    }

    public static void DrawClass(Graphics graphics, DiagramBoxNode box, bool isHighlight, bool isCurrent)
    {
        var bounds = box.Bounds;
        var fill = isCurrent
            ? Color.FromArgb(255, 249, 230)
            : isHighlight
                ? Color.FromArgb(255, 252, 235)
                : Color.White;
        var border = isCurrent
            ? Color.FromArgb(230, 126, 34)
            : Color.FromArgb(45, 55, 72);

        using var fillBrush = new SolidBrush(fill);
        using var borderPen = new Pen(border, isCurrent ? 2.2f : 1.5f);
        using var separatorPen = new Pen(Color.FromArgb(180, 190, 200));
        using var nameBrush = new SolidBrush(Color.FromArgb(25, 35, 50));
        using var memberBrush = new SolidBrush(Color.FromArgb(45, 55, 70));
        using var stereotypeBrush = new SolidBrush(Color.FromArgb(90, 100, 115));

        var nameFontStyle = box.TypeKind == "interface"
            ? FontStyle.Italic
            : box.IsAbstract
                ? FontStyle.Bold | FontStyle.Italic
                : FontStyle.Bold;
        using var nameFont = new Font("Segoe UI", 9.5f, nameFontStyle);
        using var memberFont = new Font("Segoe UI", 8.25f);
        using var stereotypeFont = new Font("Segoe UI", 7.5f, FontStyle.Italic);

        graphics.FillRectangle(fillBrush, bounds);
        graphics.DrawRectangle(borderPen, bounds);

        var y = bounds.Top;
        var stereotype = GetStereotype(box.TypeKind);
        if (!string.IsNullOrEmpty(stereotype))
        {
            var stereoSize = graphics.MeasureString(stereotype, stereotypeFont);
            graphics.DrawString(
                stereotype,
                stereotypeFont,
                stereotypeBrush,
                bounds.Left + (bounds.Width - stereoSize.Width) / 2f,
                y + 4);
            y += StereotypeHeight;
        }

        var title = box.IsAbstract && box.TypeKind == "class" ? $"{box.Title}" : box.Title;
        var titleSize = graphics.MeasureString(title, nameFont);
        graphics.DrawString(
            title,
            nameFont,
            nameBrush,
            bounds.Left + (bounds.Width - titleSize.Width) / 2f,
            y + 6);
        y += NameHeight;

        graphics.DrawLine(separatorPen, bounds.Left, y, bounds.Right, y);
        y += SeparatorHeight + 4;

        if (box.Attributes.Count > 0)
        {
            foreach (var line in box.Attributes.Take(10))
            {
                graphics.DrawString(TruncateLine(line), memberFont, memberBrush, bounds.Left + HorizontalPadding, y);
                y += LineHeight;
            }
        }
        else if (box.TypeKind is not "interface")
        {
            graphics.DrawString(" ", memberFont, memberBrush, bounds.Left + HorizontalPadding, y);
            y += LineHeight;
        }

        if (box.Operations.Count > 0 || box.TypeKind == "interface")
        {
            graphics.DrawLine(separatorPen, bounds.Left, y, bounds.Right, y);
            y += SeparatorHeight + 4;

            if (box.Operations.Count > 0)
            {
                foreach (var line in box.Operations.Take(10))
                {
                    graphics.DrawString(TruncateLine(line), memberFont, memberBrush, bounds.Left + HorizontalPadding, y);
                    y += LineHeight;
                }
            }
            else
            {
                graphics.DrawString(" ", memberFont, memberBrush, bounds.Left + HorizontalPadding, y);
            }
        }
    }

    public static void DrawRelation(Graphics graphics, DiagramBoxNode from, DiagramBoxNode to, DiagramEdge edge, ConnectionLineStyle lineStyle = ConnectionLineStyle.Straight)
    {
        var start = GetConnectionPoint(from, to, isSource: true);
        var end = GetConnectionPoint(to, from, isSource: false);

        var color = Color.FromArgb(55, 65, 80);
        using var pen = new Pen(color, 1.5f);

        switch (edge.RelationKind)
        {
            case StructureRelationKind.Inheritance:
                pen.Color = Color.FromArgb(35, 45, 60);
                DrawGeneralization(graphics, pen, start, end, lineStyle);
                break;
            case StructureRelationKind.Implementation:
                pen.DashStyle = System.Drawing.Drawing2D.DashStyle.Dash;
                pen.Color = Color.FromArgb(90, 70, 120);
                DrawRealization(graphics, pen, start, end, lineStyle);
                break;
            case StructureRelationKind.Dependency:
                pen.DashStyle = System.Drawing.Drawing2D.DashStyle.Dash;
                pen.Color = Color.FromArgb(110, 120, 130);
                DrawDependency(graphics, pen, start, end, lineStyle);
                break;
            default:
                DrawRoutedLine(graphics, pen, start, end, lineStyle);
                DrawOpenArrow(graphics, pen, start, end);
                break;
        }
    }

    private static void MeasureNode(DiagramBoxNode node)
    {
        var lines = new List<string> { node.Title };
        if (!string.IsNullOrEmpty(GetStereotype(node.TypeKind)))
        {
            lines.Add(GetStereotype(node.TypeKind)!);
        }

        lines.AddRange(node.Attributes);
        if (node.Operations.Count > 0 || node.TypeKind == "interface")
        {
            lines.AddRange(node.Operations);
        }

        var maxChars = lines.DefaultIfEmpty(node.Title).Max(line => line.Length);
        var width = Math.Clamp(maxChars * 7 + HorizontalPadding * 2, MinWidth, MaxWidth);

        var height = 8;
        if (!string.IsNullOrEmpty(GetStereotype(node.TypeKind)))
        {
            height += StereotypeHeight;
        }

        height += NameHeight + SeparatorHeight + 4;
        height += Math.Max(1, node.Attributes.Count > 0 ? node.Attributes.Count : 1) * LineHeight;

        if (node.Operations.Count > 0 || node.TypeKind == "interface")
        {
            height += SeparatorHeight + 4;
            height += Math.Max(1, node.Operations.Count) * LineHeight;
        }

        height += 8;
        node.Bounds = new Rectangle(0, 0, width, height);
    }

    private static Point GetConnectionPoint(DiagramBoxNode box, DiagramBoxNode other, bool isSource)
    {
        var centerX = box.Bounds.Left + box.Bounds.Width / 2;
        var centerY = box.Bounds.Top + box.Bounds.Height / 2;
        var otherCenterY = other.Bounds.Top + other.Bounds.Height / 2;

        if (isSource)
        {
            return otherCenterY < centerY
                ? new Point(centerX, box.Bounds.Top)
                : new Point(centerX, box.Bounds.Bottom);
        }

        return otherCenterY < centerY
            ? new Point(centerX, box.Bounds.Bottom)
            : new Point(centerX, box.Bounds.Top);
    }

    private static void DrawGeneralization(Graphics graphics, Pen pen, Point start, Point end, ConnectionLineStyle lineStyle)
    {
        var lineEnd = OffsetFromTip(end, start, 12);
        DrawRoutedLine(graphics, pen, start, lineEnd, lineStyle);
        DrawHollowTriangle(graphics, pen, end, start);
    }

    private static void DrawRealization(Graphics graphics, Pen pen, Point start, Point end, ConnectionLineStyle lineStyle)
    {
        var lineEnd = OffsetFromTip(end, start, 12);
        DrawRoutedLine(graphics, pen, start, lineEnd, lineStyle);
        DrawHollowTriangle(graphics, pen, end, start);
    }

    private static void DrawDependency(Graphics graphics, Pen pen, Point start, Point end, ConnectionLineStyle lineStyle)
    {
        var lineEnd = OffsetFromTip(end, start, 10);
        DrawRoutedLine(graphics, pen, start, lineEnd, lineStyle);
        DrawOpenArrow(graphics, pen, start, end);
    }

    private static void DrawRoutedLine(Graphics graphics, Pen pen, Point start, Point end, ConnectionLineStyle lineStyle)
    {
        switch (lineStyle)
        {
            case ConnectionLineStyle.Bezier:
                var dx = Math.Abs(end.X - start.X);
                var dy = Math.Abs(end.Y - start.Y);
                var offset = Math.Max(36, Math.Max(dx, dy) / 2);
                Point c1, c2;
                if (dy >= dx)
                {
                    c1 = new Point(start.X, start.Y + offset);
                    c2 = new Point(end.X, end.Y - offset);
                }
                else
                {
                    c1 = new Point(start.X + offset, start.Y);
                    c2 = new Point(end.X - offset, end.Y);
                }
                graphics.DrawBezier(pen, start, c1, c2, end);
                break;
            case ConnectionLineStyle.Orthogonal:
                var midY = (start.Y + end.Y) / 2;
                graphics.DrawLines(pen, new Point[] { start, new Point(start.X, midY), new Point(end.X, midY), end });
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
        if (len < 1f)
        {
            return tip;
        }

        return new Point(
            (int)(tip.X - dx / len * distance),
            (int)(tip.Y - dy / len * distance));
    }

    private static void DrawHollowTriangle(Graphics graphics, Pen pen, Point tip, Point from)
    {
        var dx = tip.X - from.X;
        var dy = tip.Y - from.Y;
        var len = MathF.Sqrt(dx * dx + dy * dy);
        if (len < 1f)
        {
            return;
        }

        var ux = dx / len;
        var uy = dy / len;
        var baseCenterX = tip.X - ux * 14;
        var baseCenterY = tip.Y - uy * 14;
        var perpX = -uy * 6;
        var perpY = ux * 6;

        var points = new[]
        {
            tip,
            new Point((int)(baseCenterX + perpX), (int)(baseCenterY + perpY)),
            new Point((int)(baseCenterX - perpX), (int)(baseCenterY - perpY))
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
        if (len < 1f)
        {
            return;
        }

        var ux = dx / len;
        var uy = dy / len;
        var tip = end;
        var left = new Point((int)(tip.X - ux * 10 - uy * 4), (int)(tip.Y - uy * 10 + ux * 4));
        var right = new Point((int)(tip.X - ux * 10 + uy * 4), (int)(tip.Y - uy * 10 - ux * 4));
        graphics.DrawLine(pen, tip, left);
        graphics.DrawLine(pen, tip, right);
    }

    private static string? GetStereotype(string typeKind) => typeKind switch
    {
        "interface" => "<<interface>>",
        "enum" => "<<enumeration>>",
        "struct" => "<<struct>>",
        _ => null
    };

    private static string TruncateLine(string line) =>
        line.Length > 42 ? line[..39] + "..." : line;
}
