using System.Drawing.Drawing2D;
using MyAgileBoardWinV10.Models;
using MyAgileBoardWinV10.Utils;

namespace MyAgileBoardWinV10.Services;

public static class ColumnImageRenderer
{
    public static Bitmap RenderCard(KanbanCard card, int columnWidth)
    {
        var (width, height) = card.ResolveDisplaySize(columnWidth);
        width = Math.Max(width, CardSizeDefaults.MinWidth);
        height = Math.Max(height, CardSizeDefaults.MinHeight);

        var titleStyle = card.TitleStyle ?? new CardTextStyle();
        using var titleFont = titleStyle.CreateFont();
        var bmp = new Bitmap(width, height);
        using (var g = Graphics.FromImage(bmp))
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            CardShapePainter.PaintCardToBitmap(g, card, width, height, titleFont);
        }
        return bmp;
    }

    public static Bitmap RenderColumn(KanbanColumn column, int columnWidth)
    {
        int innerWidth = Math.Max(CardSizeDefaults.MinWidth, columnWidth - 16);
        int maxBottom = CardCanvasHelper.CanvasPadding;

        if (column.Cards.Count == 0)
            return CreateEmptyColumnBitmap(innerWidth, 120, column.Name);

        foreach (var card in column.Cards)
        {
            var (w, h) = card.ResolveDisplaySize(innerWidth);
            int y = card.HasCanvasPosition() ? card.CanvasY + h : maxBottom + h;
            maxBottom = Math.Max(maxBottom, y);
        }

        int canvasHeight = Math.Max(160, maxBottom + CardCanvasHelper.CanvasPadding);
        var bmp = new Bitmap(innerWidth + CardCanvasHelper.CanvasPadding * 2, canvasHeight);
        using (var g = Graphics.FromImage(bmp))
        {
            g.Clear(column.GetCanvasColor());
            g.SmoothingMode = SmoothingMode.AntiAlias;

            using var headerFont = new Font("Segoe UI", 9.5f, FontStyle.Bold);
            var headerColor = ColorTranslator.FromHtml(column.HeaderColorHex);
            using var headerBrush = new SolidBrush(headerColor);
            g.FillRectangle(headerBrush, 0, 0, bmp.Width, 28);
            TextRenderer.DrawText(g, column.Name, headerFont, new Rectangle(8, 4, bmp.Width - 16, 22),
                column.ResolveTitleColor(headerColor),
                TextFormatFlags.Left | TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis);

            using (var canvasBrush = new SolidBrush(column.GetCanvasColor()))
                g.FillRectangle(canvasBrush, 0, 28, bmp.Width, bmp.Height - 28);

            int fallbackY = 36;
            foreach (var card in column.Cards.OrderBy(c => c.ZIndex).ThenBy(c => c.Title))
            {
                var (w, h) = card.ResolveDisplaySize(innerWidth);
                int x = CardCanvasHelper.CanvasPadding;
                int y = fallbackY;
                if (card.HasCanvasPosition())
                {
                    x = card.CanvasX;
                    y = card.CanvasY;
                }

                using var titleFont = (card.TitleStyle ?? new CardTextStyle()).CreateFont();
                CardShapePainter.PaintCard(g, new Rectangle(x, y, w, h), card, titleFont, hovered: false);
                fallbackY = y + h + 12;
            }
        }

        return bmp;
    }

    private static Bitmap CreateEmptyColumnBitmap(int width, int height, string columnName)
    {
        var bmp = new Bitmap(width + 16, height);
        using var g = Graphics.FromImage(bmp);
        g.Clear(Color.WhiteSmoke);
        using var font = new Font("Segoe UI", 10f, FontStyle.Bold);
        TextRenderer.DrawText(g, $"{columnName} (카드 없음)", font, new Rectangle(8, 8, bmp.Width - 16, 24),
            Color.DimGray, TextFormatFlags.Left);
        return bmp;
    }
}
