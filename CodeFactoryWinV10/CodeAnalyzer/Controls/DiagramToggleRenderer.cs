namespace CodeAnalyzer.Controls;

internal static class DiagramToggleRenderer
{
    public static void Draw(Graphics graphics, Rectangle toggleBounds, bool isExpanded)
    {
        if (toggleBounds.IsEmpty)
        {
            return;
        }

        using var toggleBack = new SolidBrush(Color.FromArgb(74, 108, 155));
        using var toggleBorder = new Pen(Color.FromArgb(50, 80, 120));
        using var symbolBrush = new SolidBrush(Color.White);
        using var font = new Font("Segoe UI", 10f, FontStyle.Bold);

        graphics.FillRectangle(toggleBack, toggleBounds);
        graphics.DrawRectangle(toggleBorder, toggleBounds);

        var symbol = isExpanded ? "−" : "+";
        var symbolSize = graphics.MeasureString(symbol, font);
        graphics.DrawString(
            symbol,
            font,
            symbolBrush,
            toggleBounds.Left + (toggleBounds.Width - symbolSize.Width) / 2,
            toggleBounds.Top + (toggleBounds.Height - symbolSize.Height) / 2);
    }
}
