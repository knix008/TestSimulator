using System.Drawing.Drawing2D;
using System.Drawing.Text;
using MyAgileBoardWinV10.Models;

namespace MyAgileBoardWinV10.Utils;

/// <summary>카드 직사각형 도형 및 텍스트를 GDI+로 직접 그립니다.</summary>
public static class CardShapePainter
{
    private const int PadX = 5;
    private const int PadTop = 4;
    private const int FoldSize = 12;

    public static int MeasureHeight(KanbanCard card, int width, Font titleFont)
    {
        int innerW = Math.Max(40, width - PadX * 2);
        int h = PadTop + MeasureTitleHeight(card.Title, titleFont, innerW) + 4;

        var desc = GetDescriptionPlain(card);
        if (!string.IsNullOrEmpty(desc))
            h = Math.Max(h, PadTop + MeasureTitleHeight(card.Title, titleFont, innerW) + 2 + 14 + 4);

        h = Math.Max(h, PadTop + 36 + 18);
        return Math.Max(h, CardSizeDefaults.MinHeight);
    }

    public static void PaintCard(Graphics g, Rectangle cardRect, KanbanCard card, Font titleFont, bool hovered)
    {
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.TextRenderingHint = TextRenderingHint.ClearTypeGridFit;

        var cardColor = card.CardColor;
        int w = cardRect.Width;
        int h = cardRect.Height;

        using (var fill = new SolidBrush(cardColor))
            g.FillRectangle(fill, cardRect);

        using (var border = new Pen(Color.FromArgb(hovered ? 140 : 90, 0, 0, 0), 1f))
            g.DrawRectangle(border, cardRect.X, cardRect.Y, w - 1, h - 1);

        DrawStickyFold(g, cardRect, cardColor);

        bool compact = h < 82;
        bool medium = h < 105;
        int innerW = Math.Max(40, w - PadX * 2);
        int metaY = h - 16;
        int bottomReserve = 18;

        int titleH = Math.Max(18, h - bottomReserve - PadTop - 4);
        var desc = GetDescriptionPlain(card);
        if (!compact && !string.IsNullOrEmpty(desc))
            titleH = Math.Min(titleH, 36);

        var titleStyle = card.TitleStyle ?? new CardTextStyle();
        var titleFlags = TextFormatFlags.Left | TextFormatFlags.Top | TextFormatFlags.EndEllipsis | TextFormatFlags.NoPadding;
        var titleRect = new Rectangle(cardRect.X + PadX, cardRect.Y + PadTop, innerW, titleH);
        TextRenderer.DrawText(g, card.Title, titleFont, titleRect, titleStyle.GetTextColor(), titleFlags);

        int y = titleRect.Bottom + 2;
        if (!compact && !string.IsNullOrEmpty(desc))
        {
            int descAvailable = metaY - y - 3;
            if (descAvailable >= 14)
            {
                using var descFont = new Font("Segoe UI", 7.5f);
                var descRect = new Rectangle(cardRect.X + PadX, cardRect.Y + y, innerW, 14);
                TextRenderer.DrawText(g, desc, descFont, descRect, Color.DimGray,
                    TextFormatFlags.Left | TextFormatFlags.Top | TextFormatFlags.EndEllipsis | TextFormatFlags.NoPadding);
                y = descRect.Bottom + 2;
            }
        }

        string priorityText = card.Points > 0
            ? $"{card.Priority}  [{card.Points}pt]"
            : card.Priority.ToString();
        using var metaFont = new Font("Segoe UI", 7.5f, FontStyle.Bold);
        var priorityRect = new Rectangle(cardRect.X + PadX, cardRect.Y + metaY, innerW, 14);
        TextRenderer.DrawText(g, priorityText, metaFont, priorityRect, GetPriorityColor(card.Priority),
            TextFormatFlags.Left | TextFormatFlags.Top | TextFormatFlags.NoPadding);

        if (!compact && !string.IsNullOrEmpty(card.Assignee))
        {
            using var assigneeFont = new Font("Segoe UI", 7.5f);
            int ay = Math.Min(metaY, y);
            TextRenderer.DrawText(g, $"\U0001f464 {card.Assignee}", assigneeFont,
                new Rectangle(cardRect.X + PadX, cardRect.Y + ay, innerW, 14), Color.DimGray,
                TextFormatFlags.Left | TextFormatFlags.Top | TextFormatFlags.EndEllipsis | TextFormatFlags.NoPadding);
        }

        if (!compact && !medium && card.DueDate.HasValue)
        {
            bool overdue = card.DueDate.Value.Date < DateTime.Today;
            using var dueFont = new Font("Segoe UI", 7.5f);
            int dy = cardRect.Y + metaY + 14;
            TextRenderer.DrawText(g, $"\U0001f4c5 {card.DueDate.Value:yyyy-MM-dd}", dueFont,
                new Rectangle(cardRect.X + PadX, dy, innerW, 14),
                overdue ? Color.Red : Color.DimGray,
                TextFormatFlags.Left | TextFormatFlags.Top | TextFormatFlags.NoPadding);
        }

        if (!string.IsNullOrEmpty(card.Tags) && h >= 100)
        {
            using var tagsFont = new Font("Segoe UI", 7f);
            int ty = cardRect.Y + h - 28;
            TextRenderer.DrawText(g, card.Tags, tagsFont,
                new Rectangle(cardRect.X + PadX, ty, innerW, 13), Color.SlateGray,
                TextFormatFlags.Left | TextFormatFlags.Top | TextFormatFlags.EndEllipsis | TextFormatFlags.NoPadding);
        }
    }

    public static void PaintCardToBitmap(Graphics g, KanbanCard card, int width, int height, Font titleFont)
    {
        g.Clear(Color.Transparent);
        PaintCard(g, new Rectangle(0, 0, width, height), card, titleFont, hovered: false);
    }

    private static void DrawStickyFold(Graphics g, Rectangle r, Color baseColor)
    {
        var foldColor = Color.FromArgb(
            Math.Min(baseColor.R + 40, 255),
            Math.Min(baseColor.G + 40, 255),
            Math.Min(baseColor.B + 40, 255));
        using var foldBrush = new SolidBrush(foldColor);
        g.FillPolygon(foldBrush,
        [
            new Point(r.Right - FoldSize - 1, r.Top),
            new Point(r.Right - FoldSize - 1, r.Top + FoldSize),
            new Point(r.Right - 1, r.Top + FoldSize)
        ]);
        using var creasePen = new Pen(Color.FromArgb(50, 0, 0, 0), 1f);
        g.DrawLine(creasePen, r.Right - FoldSize - 1, r.Top, r.Right - 1, r.Top + FoldSize);
    }

    private static int MeasureTitleHeight(string title, Font font, int maxWidth)
    {
        if (string.IsNullOrEmpty(title)) return 18;
        var size = TextRenderer.MeasureText(title, font, new Size(maxWidth, int.MaxValue),
            TextFormatFlags.WordBreak | TextFormatFlags.Left | TextFormatFlags.Top);
        return Math.Clamp(size.Height, 18, 36);
    }

    public static string GetDescriptionPlain(KanbanCard card)
    {
        var text = CardTextHelper.ExtractPlainText(card.DescriptionRtf, card.Description);
        if (string.IsNullOrEmpty(text)) return string.Empty;
        return string.Join(" ",
            text.Split(['\n', '\r'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries));
    }

    private static Color GetPriorityColor(Priority p) => p switch
    {
        Priority.Critical => Color.Red,
        Priority.High => Color.OrangeRed,
        Priority.Medium => Color.DarkOrange,
        Priority.Low => Color.SeaGreen,
        _ => Color.Gray
    };
}
