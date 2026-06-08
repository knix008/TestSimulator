namespace CodeAnalyzer.Controls;

internal static class DiagramCallGraphStyleNodeRenderer
{
    public static void Draw(
        Graphics graphics,
        Rectangle bounds,
        string title,
        string subtitle,
        bool isRoot,
        bool isHighlight,
        bool isCurrent)
    {
        var fillColor = isRoot
            ? Color.FromArgb(225, 237, 252)
            : isCurrent
                ? Color.FromArgb(255, 236, 179)
                : isHighlight
                    ? Color.FromArgb(255, 249, 219)
                    : Color.FromArgb(245, 248, 252);
        var borderColor = isRoot
            ? Color.FromArgb(41, 128, 185)
            : isCurrent
                ? Color.FromArgb(230, 126, 34)
                : isHighlight
                    ? Color.FromArgb(241, 196, 15)
                    : Color.FromArgb(74, 108, 155);
        var borderWidth = isRoot ? 2.5f : isCurrent ? 2.5f : isHighlight ? 2f : 1.5f;

        using var fillBrush = new SolidBrush(fillColor);
        using var borderPen = new Pen(borderColor, borderWidth);
        using var textBrush = new SolidBrush(Color.FromArgb(30, 40, 55));
        using var subTextBrush = new SolidBrush(Color.FromArgb(100, 110, 125));
        using var font = new Font("Segoe UI", 9f, FontStyle.Bold);
        using var subFont = new Font("Segoe UI", 7.5f);

        graphics.FillRectangle(fillBrush, bounds);
        graphics.DrawRectangle(borderPen, bounds);

        const int textPadding = 8;
        var titleRect = new Rectangle(bounds.Left + textPadding, bounds.Top + 6, bounds.Width - textPadding * 2, 18);
        graphics.DrawString(title, font, textBrush, titleRect, StringFormat.GenericDefault);
        graphics.DrawString(
            Truncate(subtitle, 28),
            subFont,
            subTextBrush,
            new Rectangle(bounds.Left + textPadding, bounds.Top + 24, bounds.Width - textPadding * 2, 14));
    }

    public static void Draw(Graphics graphics, DiagramBoxNode box, bool isRoot, bool isHighlight, bool isCurrent)
    {
        var subtitle = box.Lines.FirstOrDefault();
        if (string.IsNullOrWhiteSpace(subtitle))
        {
            subtitle = box.Subtitle;
        }

        Draw(graphics, box.Bounds, box.Title, subtitle, isRoot, isHighlight, isCurrent);
    }

    private static string Truncate(string value, int maxLength) =>
        value.Length > maxLength ? value[..(maxLength - 3)] + "..." : value;
}
