using CodeAnalyzer.Models;

namespace CodeAnalyzer.Controls;

internal static class FileRelationDiagramRenderer
{
    public static DiagramBoxNode CreateDirectoryBox(DirectoryRelationNode directory)
    {
        var displayName = directory.DisplayName;
        if (string.IsNullOrWhiteSpace(displayName))
        {
            displayName = directory.FullName;
        }

        return new DiagramBoxNode
        {
            Id = directory.Id,
            Title = displayName,
            Subtitle = "디렉터리",
            TypeKind = "directory",
            IsUmlStyle = false,
            Attributes = [$"{directory.FileCount}개 파일", $"{directory.FunctionCount}개 함수"],
            Operations = [],
            Lines = [directory.FullName]
        };
    }

    public static DiagramBoxNode CreateBox(FileRelationNode file)
    {
        var directory = Path.GetDirectoryName(file.FilePath) ?? string.Empty;
        var folder = string.IsNullOrWhiteSpace(directory) ? string.Empty : Path.GetFileName(directory);
        if (string.IsNullOrWhiteSpace(folder))
        {
            folder = directory;
        }

        return new DiagramBoxNode
        {
            Id = file.Id,
            Title = file.DisplayName,
            Subtitle = "파일",
            TypeKind = "file",
            IsUmlStyle = false,
            Attributes = [folder, $"{file.FunctionCount}개 함수"],
            Operations = [],
            Lines = [file.FullName]
        };
    }

    public static void DrawFileBox(Graphics graphics, DiagramBoxNode box, bool isHighlight, bool isCurrent)
    {
        var bounds = box.Bounds;
        var fill = isCurrent
            ? Color.FromArgb(255, 243, 224)
            : isHighlight
                ? Color.FromArgb(255, 251, 235)
                : Color.FromArgb(252, 253, 255);
        var border = isCurrent
            ? Color.FromArgb(211, 84, 0)
            : Color.FromArgb(52, 73, 94);

        using var fillBrush = new SolidBrush(fill);
        using var borderPen = new Pen(border, isCurrent ? 2.2f : 1.5f);
        using var titleFont = new Font("Segoe UI", 9.5f, FontStyle.Bold);
        using var subFont = new Font("Segoe UI", 8f);
        using var pathFont = new Font("Segoe UI", 7.5f);
        using var titleBrush = new SolidBrush(Color.FromArgb(25, 35, 50));
        using var subBrush = new SolidBrush(Color.FromArgb(90, 100, 115));

        graphics.FillRectangle(fillBrush, bounds);
        graphics.DrawRectangle(borderPen, bounds);

        graphics.DrawString(box.Title, titleFont, titleBrush, bounds.Left + 10, bounds.Top + 8);

        var y = bounds.Top + 26;
        foreach (var line in box.Attributes)
        {
            graphics.DrawString(line, subFont, subBrush, bounds.Left + 10, y);
            y += 14;
        }

        graphics.DrawLine(new Pen(Color.FromArgb(210, 218, 228)), bounds.Left, y + 2, bounds.Right, y + 2);
        y += 8;

        var path = box.Lines.FirstOrDefault() ?? string.Empty;
        if (path.Length > 36)
        {
            path = path[..33] + "...";
        }

        graphics.DrawString(path, pathFont, subBrush, bounds.Left + 10, y);
    }

    public static void DrawFileEdge(
        Graphics graphics,
        DiagramBoxNode from,
        DiagramBoxNode to,
        string label,
        ConnectionLineStyle lineStyle,
        GraphLayoutDirection layoutDirection)
    {
        var start = layoutDirection == GraphLayoutDirection.TopToBottom
            ? new Point(from.Bounds.Left + from.Bounds.Width / 2, from.Bounds.Bottom)
            : new Point(from.Bounds.Right, from.Bounds.Top + from.Bounds.Height / 2);

        var end = layoutDirection == GraphLayoutDirection.TopToBottom
            ? new Point(to.Bounds.Left + to.Bounds.Width / 2, to.Bounds.Top)
            : new Point(to.Bounds.Left, to.Bounds.Top + to.Bounds.Height / 2);

        // Fallback for overlapped / reverse layout cases.
        if (layoutDirection == GraphLayoutDirection.TopToBottom && from.Bounds.Top > to.Bounds.Bottom)
        {
            start = new Point(from.Bounds.Left + from.Bounds.Width / 2, from.Bounds.Bottom);
            end = new Point(to.Bounds.Left + to.Bounds.Width / 2, to.Bounds.Bottom);
        }
        else if (layoutDirection == GraphLayoutDirection.LeftToRight && from.Bounds.Right > to.Bounds.Left)
        {
            start = new Point(from.Bounds.Left, from.Bounds.Top + from.Bounds.Height / 2);
            end = new Point(to.Bounds.Right, to.Bounds.Top + to.Bounds.Height / 2);
        }

        using var pen = new Pen(Color.FromArgb(52, 73, 94), 1.6f)
        {
            EndCap = System.Drawing.Drawing2D.LineCap.ArrowAnchor,
            CustomEndCap = new System.Drawing.Drawing2D.AdjustableArrowCap(5, 5)
        };
        using var font = new Font("Segoe UI", 7.5f, FontStyle.Bold);
        using var brush = new SolidBrush(Color.FromArgb(52, 73, 94));

        switch (lineStyle)
        {
            case ConnectionLineStyle.Straight:
                graphics.DrawLine(pen, start, end);
                break;
            case ConnectionLineStyle.Bezier:
                DrawBezierEdge(graphics, pen, start, end);
                break;
            default:
                DrawOrthogonalEdge(graphics, pen, start, end, layoutDirection);
                break;
        }

        var labelSize = graphics.MeasureString(label, font);
        graphics.DrawString(
            label,
            font,
            brush,
            (start.X + end.X) / 2f - labelSize.Width / 2f,
            (start.Y + end.Y) / 2f - labelSize.Height - 4);
    }

    private static void DrawOrthogonalEdge(
        Graphics graphics,
        Pen pen,
        Point start,
        Point end,
        GraphLayoutDirection layoutDirection)
    {
        if (Math.Abs(end.X - start.X) < 8 || Math.Abs(end.Y - start.Y) < 8)
        {
            graphics.DrawLine(pen, start, end);
            return;
        }

        var path = layoutDirection == GraphLayoutDirection.TopToBottom
            ? new[]
            {
                start,
                new Point(start.X, (start.Y + end.Y) / 2),
                new Point(end.X, (start.Y + end.Y) / 2),
                end
            }
            : new[]
            {
                start,
                new Point((start.X + end.X) / 2, start.Y),
                new Point((start.X + end.X) / 2, end.Y),
                end
            };
        graphics.DrawLines(pen, path);
    }

    private static void DrawBezierEdge(Graphics graphics, Pen pen, Point start, Point end)
    {
        var dx = Math.Abs(end.X - start.X);
        var dy = Math.Abs(end.Y - start.Y);
        var controlOffset = Math.Max(36, Math.Max(dx, dy) / 2);

        Point control1;
        Point control2;

        if (dx >= dy)
        {
            control1 = new Point(start.X + controlOffset, start.Y);
            control2 = new Point(end.X - controlOffset, end.Y);
        }
        else
        {
            control1 = new Point(start.X, start.Y + controlOffset);
            control2 = new Point(end.X, end.Y - controlOffset);
        }

        graphics.DrawBezier(pen, start, control1, control2, end);
    }
}
