using CodeAnalyzer.Models;

namespace CodeAnalyzer.Controls;

internal static class ErdDiagramRenderer
{
    private const int MinWidth = 200;
    private const int MaxWidth = 560;
    private const int HorizontalPadding = 10;
    private const int HeaderHeight = 32;
    private const int LineHeight = 16;
    private const int SeparatorHeight = 1;
    private const int HorizontalGap = 72;
    private const int VerticalGap = 56;

    public static DiagramBoxNode CreateTableBox(DatabaseTable table)
    {
        var dialect = table.Dialect switch
        {
            DatabaseDialect.MySql => "MySQL",
            DatabaseDialect.MariaDb => "MariaDB",
            DatabaseDialect.PostgreSql => "PostgreSQL",
            DatabaseDialect.Sqlite => "SQLite",
            _ => "SQL"
        };

        var lines = table.Columns.Select(FormatColumn).ToList();

        var title = string.IsNullOrWhiteSpace(table.Schema)
            ? table.Name
            : $"{table.Schema}.{table.Name}";

        return new DiagramBoxNode
        {
            Id = table.Id,
            Title = title,
            Subtitle = dialect,
            Lines = lines,
            IsUmlStyle = false,
            TypeKind = "table"
        };
    }

    public static Size Layout(IReadOnlyList<DiagramBoxNode> nodes, IReadOnlyList<DatabaseRelation> relations)
    {
        if (nodes.Count == 0)
        {
            return new Size(400, 300);
        }

        foreach (var node in nodes)
        {
            MeasureNode(node);
        }

        var depth = ComputeDepth(nodes, relations);
        var grouped = nodes
            .GroupBy(n => depth.TryGetValue(n.Id, out var d) ? d : 0)
            .OrderBy(g => g.Key)
            .ToList();

        var bounds = Rectangle.Empty;
        var y = 32;

        foreach (var group in grouped)
        {
            var row = group.OrderBy(n => n.Title, StringComparer.OrdinalIgnoreCase).ToList();
            var rowHeight = row.Max(n => n.Bounds.Height);
            var x = 32;

            foreach (var node in row)
            {
                node.Bounds = new Rectangle(x, y, node.Bounds.Width, node.Bounds.Height);
                bounds = bounds == Rectangle.Empty ? node.Bounds : Rectangle.Union(bounds, node.Bounds);
                x += node.Bounds.Width + HorizontalGap;
            }

            y += rowHeight + VerticalGap;
        }

        return new Size(Math.Max(bounds.Right + 48, 480), Math.Max(bounds.Bottom + 48, 320));
    }

    public static void DrawTable(Graphics graphics, DiagramBoxNode box, bool isHighlight, bool isCurrent)
    {
        var bounds = box.Bounds;
        var headerColor = isCurrent
            ? Color.FromArgb(255, 228, 180)
            : Color.FromArgb(198, 226, 255);
        var bodyColor = isCurrent
            ? Color.FromArgb(255, 248, 232)
            : isHighlight
                ? Color.FromArgb(245, 252, 255)
                : Color.White;
        var borderColor = isCurrent
            ? Color.FromArgb(210, 100, 10)
            : Color.FromArgb(45, 85, 135);

        var headerRect = new Rectangle(bounds.Left, bounds.Top, bounds.Width, HeaderHeight);

        using var headerBrush = new SolidBrush(headerColor);
        using var bodyBrush = new SolidBrush(bodyColor);
        using var borderPen = new Pen(borderColor, isCurrent ? 2.5f : 1.5f);
        using var separatorPen = new Pen(Color.FromArgb(170, 190, 210));
        using var titleFont = new Font("Segoe UI", 9.5f, FontStyle.Bold);
        using var subFont = new Font("Segoe UI", 7.5f);
        using var colFont = new Font("Consolas", 8.25f);
        using var titleBrush = new SolidBrush(Color.FromArgb(20, 45, 85));
        using var colBrush = new SolidBrush(Color.FromArgb(35, 50, 70));

        graphics.FillRectangle(headerBrush, headerRect);
        graphics.FillRectangle(bodyBrush, new Rectangle(bounds.Left, bounds.Top + HeaderHeight, bounds.Width, bounds.Height - HeaderHeight));
        graphics.DrawRectangle(borderPen, bounds);

        graphics.DrawString(box.Title, titleFont, titleBrush, bounds.Left + HorizontalPadding, bounds.Top + 6);
        graphics.DrawString(box.Subtitle, subFont, Brushes.DimGray, bounds.Right - 52, bounds.Top + 9);

        graphics.DrawLine(separatorPen, bounds.Left, bounds.Top + HeaderHeight, bounds.Right, bounds.Top + HeaderHeight);

        var y = bounds.Top + HeaderHeight + 6;
        foreach (var line in box.Lines)
        {
            graphics.DrawString(line, colFont, colBrush, bounds.Left + HorizontalPadding, y);
            y += LineHeight;
        }
    }

    public static void DrawRelation(
        Graphics graphics,
        DiagramBoxNode from,
        DiagramBoxNode to,
        string? label,
        ConnectionLineStyle lineStyle)
    {
        var connection = DiagramSideAnchor.GetConnectionPair(from.Bounds, to.Bounds);

        using var pen = new Pen(Color.FromArgb(70, 110, 160), 1.8f)
        {
            EndCap = System.Drawing.Drawing2D.LineCap.ArrowAnchor,
            CustomEndCap = new System.Drawing.Drawing2D.AdjustableArrowCap(5, 5)
        };

        DrawRoutedLine(
            graphics,
            pen,
            connection.From,
            connection.To,
            connection.FromSide,
            connection.ToSide,
            lineStyle);

        if (!string.IsNullOrWhiteSpace(label))
        {
            using var font = new Font("Segoe UI", 7.5f);
            using var brush = new SolidBrush(Color.FromArgb(50, 80, 120));
            var mx = (connection.From.X + connection.To.X) / 2f;
            var my = (connection.From.Y + connection.To.Y) / 2f;
            var sz = graphics.MeasureString(label, font);
            graphics.DrawString(label, font, brush, mx - sz.Width / 2f, my - sz.Height - 4);
        }
    }

    private static Dictionary<string, int> ComputeDepth(
        IReadOnlyList<DiagramBoxNode> nodes,
        IReadOnlyList<DatabaseRelation> relations)
    {
        var outgoing = new Dictionary<string, List<string>>(StringComparer.OrdinalIgnoreCase);
        foreach (var relation in relations)
        {
            if (!outgoing.TryGetValue(relation.FromTableId, out var list))
            {
                list = [];
                outgoing[relation.FromTableId] = list;
            }

            list.Add(relation.ToTableId);
        }

        var depths = nodes.ToDictionary(n => n.Id, _ => 0, StringComparer.OrdinalIgnoreCase);
        var changed = true;

        while (changed)
        {
            changed = false;
            foreach (var relation in relations)
            {
                if (!depths.TryGetValue(relation.FromTableId, out var fromDepth)
                    || !depths.TryGetValue(relation.ToTableId, out var toDepth))
                {
                    continue;
                }

                var next = fromDepth + 1;
                if (toDepth < next)
                {
                    depths[relation.ToTableId] = next;
                    changed = true;
                }
            }
        }

        return depths;
    }

    private static void MeasureNode(DiagramBoxNode node)
    {
        var maxChars = Math.Max(
            node.Title.Length,
            node.Lines.Count > 0 ? node.Lines.Max(line => line.Length) : 0);
        var width = Math.Clamp(maxChars * 7 + HorizontalPadding * 2, MinWidth, MaxWidth);
        var height = HeaderHeight + SeparatorHeight + 8 + Math.Max(1, node.Lines.Count) * LineHeight + 8;
        node.Bounds = new Rectangle(0, 0, width, height);
    }

    private static void DrawRoutedLine(
        Graphics graphics,
        Pen pen,
        Point start,
        Point end,
        BoxSide startSide,
        BoxSide endSide,
        ConnectionLineStyle style)
    {
        if (style == ConnectionLineStyle.Orthogonal)
        {
            var startExitsHorizontally = startSide is BoxSide.Left or BoxSide.Right;
            var endExitsHorizontally = endSide is BoxSide.Left or BoxSide.Right;

            if (startExitsHorizontally && endExitsHorizontally)
            {
                var midX = (start.X + end.X) / 2;
                graphics.DrawLines(pen, new[] { start, new Point(midX, start.Y), new Point(midX, end.Y), end });
            }
            else if (!startExitsHorizontally && !endExitsHorizontally)
            {
                var midY = (start.Y + end.Y) / 2;
                graphics.DrawLines(pen, new[] { start, new Point(start.X, midY), new Point(end.X, midY), end });
            }
            else if (startExitsHorizontally)
            {
                graphics.DrawLines(pen, new[] { start, new Point(end.X, start.Y), end });
            }
            else
            {
                graphics.DrawLines(pen, new[] { start, new Point(start.X, end.Y), end });
            }

            return;
        }

        graphics.DrawLine(pen, start, end);
    }

    private static string FormatColumn(DatabaseColumn column)
    {
        var markers = new List<string>();
        if (column.IsPrimaryKey)
        {
            markers.Add("PK");
        }

        if (column.IsForeignKey)
        {
            markers.Add("FK");
        }

        var suffix = markers.Count > 0 ? $" [{string.Join(",", markers)}]" : string.Empty;
        var type = string.IsNullOrWhiteSpace(column.DataType) ? string.Empty : $" {column.DataType}";
        return $"{column.Name}{type}{suffix}";
    }
}
