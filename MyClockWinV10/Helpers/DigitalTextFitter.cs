using System.Windows;
using System.Windows.Controls;

namespace MyClockWinV10.Helpers;

internal static class DigitalTextFitter
{
    public static double FitSingleLine(TextBlock target, string text, double maxWidth,
                                       double preferredSize, double minSize = 8)
    {
        target.Text          = text;
        target.TextWrapping  = TextWrapping.NoWrap;
        target.TextAlignment = TextAlignment.Center;

        preferredSize = Math.Max(minSize, preferredSize);
        maxWidth      = Math.Max(20, maxWidth);

        for (double size = preferredSize; size >= minSize; size -= 0.5)
        {
            target.FontSize = size;
            target.Measure(new Size(double.PositiveInfinity, double.PositiveInfinity));
            if (target.DesiredSize.Width <= maxWidth)
                return size;
        }

        target.FontSize = minSize;
        return minSize;
    }
}
