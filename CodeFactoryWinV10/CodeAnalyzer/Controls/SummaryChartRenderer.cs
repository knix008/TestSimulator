using System.Drawing.Imaging;

namespace CodeAnalyzer.Controls;

internal static class SummaryChartRenderer
{
    public static byte[]? RenderToPng(SummarySection section, int width, int height)
    {
        if (section.ChartKind == SummaryChartKind.None || width <= 0 || height <= 0)
        {
            return null;
        }

        using var bitmap = new Bitmap(width, height);
        using var graphics = Graphics.FromImage(bitmap);
        graphics.Clear(Color.FromArgb(238, 242, 248));
        SummaryChartPainter.DrawCard(graphics, new Rectangle(0, 0, width, height), section);

        using var stream = new MemoryStream();
        bitmap.Save(stream, ImageFormat.Png);
        return stream.ToArray();
    }
}
