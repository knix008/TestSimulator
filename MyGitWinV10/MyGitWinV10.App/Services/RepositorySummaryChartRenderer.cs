using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Drawing.Text;
using LibGit2Sharp;

namespace MyGitWinV10.App.Services;

public static class RepositorySummaryChartRenderer
{
    private static readonly Color[] Palette =
    [
        Color.FromArgb(37, 99, 235),
        Color.FromArgb(220, 38, 38),
        Color.FromArgb(5, 150, 105),
        Color.FromArgb(217, 119, 6),
        Color.FromArgb(124, 58, 237),
        Color.FromArgb(8, 145, 178),
        Color.FromArgb(236, 72, 153),
        Color.FromArgb(100, 116, 139)
    ];

    public static IReadOnlyList<RepositoryChartImage> Render(SummaryChartData data)
    {
        var charts = new List<RepositoryChartImage>();

        if (data.CommitsByMonth.Count > 0)
        {
            charts.Add(CreateChart(
                "Commit Activity (Last 12 Months)",
                "commit-activity.png",
                canvas => DrawVerticalBarChart(canvas, data.CommitsByMonth, "Month", "Commits")));
        }

        if (data.CommitsByAuthor.Count > 0)
        {
            charts.Add(CreateChart(
                "Top Contributors",
                "commits-by-author.png",
                canvas => DrawHorizontalBarChart(canvas, data.CommitsByAuthor, "Author", "Commits")));
        }

        if (data.RepositoryComposition.Any(point => point.Value > 0))
        {
            charts.Add(CreateChart(
                "Repository Overview",
                "repository-overview.png",
                canvas => DrawPieChart(canvas, data.RepositoryComposition)));
        }

        if (data.CommitGraphRows.Count > 0)
        {
            charts.Add(RenderCommitGraphChart(data.CommitGraphRows));
        }

        return charts;
    }

    private static RepositoryChartImage RenderCommitGraphChart(IReadOnlyList<CommitRow> rows)
    {
        const int rowHeight = 22;
        const int laneWidth = 16;
        const int leftMargin = 12;
        const int dotRadius = 4;
        const int messageWidth = 250;
        const int shaWidth = 56;
        const int authorWidth = 120;
        const int dateWidth = 72;

        int maxLane = rows.Max(row => row.Lane);
        int graphWidth = leftMargin + (maxLane + 1) * laneWidth + 8;
        int width = graphWidth + messageWidth + shaWidth + authorWidth + dateWidth + 40;
        int height = 56 + rows.Count * rowHeight + 20;

        using var bitmap = new Bitmap(width, height);
        using var graphics = Graphics.FromImage(bitmap);
        graphics.SmoothingMode = SmoothingMode.AntiAlias;
        graphics.TextRenderingHint = TextRenderingHint.ClearTypeGridFit;
        graphics.Clear(Color.White);
        DrawCommitGraph(graphics, rows, width, height, graphWidth, messageWidth, shaWidth, authorWidth, dateWidth, rowHeight, laneWidth, leftMargin, dotRadius);

        return new RepositoryChartImage
        {
            Title = "Commit Graph",
            FileName = "commit-graph.png",
            PngData = SavePng(bitmap)
        };
    }

    private static RepositoryChartImage CreateChart(string title, string fileName, Action<Graphics> draw)
    {
        const int width = 760;
        const int height = 320;
        using var bitmap = new Bitmap(width, height);
        using var graphics = Graphics.FromImage(bitmap);
        graphics.SmoothingMode = SmoothingMode.AntiAlias;
        graphics.TextRenderingHint = TextRenderingHint.ClearTypeGridFit;
        graphics.Clear(Color.White);
        DrawChartFrame(graphics, width, height, title);
        draw(graphics);
        return new RepositoryChartImage
        {
            Title = title,
            FileName = fileName,
            PngData = SavePng(bitmap)
        };
    }

    private static void DrawChartFrame(Graphics graphics, int width, int height, string title)
    {
        using var border = new Pen(Color.FromArgb(203, 213, 225));
        using var titleFont = new Font("Segoe UI", 11f, FontStyle.Bold);
        using var titleBrush = new SolidBrush(Color.FromArgb(30, 41, 59));
        graphics.DrawRectangle(border, 0, 0, width - 1, height - 1);
        graphics.DrawString(title, titleFont, titleBrush, 16, 12);
    }

    private static void DrawVerticalBarChart(
        Graphics graphics,
        IReadOnlyList<ChartSeriesPoint> points,
        string xLabel,
        string yLabel)
    {
        var plot = new Rectangle(70, 52, 660, 230);
        DrawPlotArea(graphics, plot);

        double maxValue = Math.Max(1, points.Max(point => point.Value));
        using var axisFont = new Font("Segoe UI", 8f);
        using var labelFont = new Font("Segoe UI", 7.5f);
        using var axisBrush = new SolidBrush(Color.FromArgb(100, 116, 139));
        using var valueBrush = new SolidBrush(Color.FromArgb(51, 65, 85));

        for (int tick = 0; tick <= 4; tick++)
        {
            int y = plot.Bottom - (int)(plot.Height * (tick / 4f));
            graphics.DrawLine(Pens.Gainsboro, plot.Left, y, plot.Right, y);
            double value = maxValue * tick / 4d;
            graphics.DrawString(value.ToString("0"), axisFont, axisBrush, 24, y - 8);
        }

        float barWidth = plot.Width / (float)points.Count * 0.65f;
        float gap = plot.Width / (float)points.Count * 0.35f;
        float x = plot.Left + gap / 2f;

        for (int i = 0; i < points.Count; i++)
        {
            var point = points[i];
            float barHeight = (float)(point.Value / maxValue * plot.Height);
            var barRect = new RectangleF(x, plot.Bottom - barHeight, barWidth, barHeight);
            using var brush = new SolidBrush(Palette[i % Palette.Length]);
            graphics.FillRectangle(brush, barRect);
            graphics.DrawString(point.Label, labelFont, valueBrush, x - 4, plot.Bottom + 6);
            if (point.Value > 0)
            {
                graphics.DrawString(point.Value.ToString("0"), labelFont, valueBrush, x + 2, barRect.Top - 16);
            }

            x += barWidth + gap;
        }

        DrawAxisCaptions(graphics, plot, xLabel, yLabel);
    }

    private static void DrawHorizontalBarChart(
        Graphics graphics,
        IReadOnlyList<ChartSeriesPoint> points,
        string xLabel,
        string yLabel)
    {
        var plot = new Rectangle(150, 52, 560, 230);
        DrawPlotArea(graphics, plot);

        double maxValue = Math.Max(1, points.Max(point => point.Value));
        using var labelFont = new Font("Segoe UI", 8f);
        using var valueFont = new Font("Segoe UI", 8f, FontStyle.Bold);
        using var labelBrush = new SolidBrush(Color.FromArgb(51, 65, 85));

        float rowHeight = plot.Height / (float)points.Count;
        for (int i = 0; i < points.Count; i++)
        {
            var point = points[i];
            float y = plot.Top + i * rowHeight + rowHeight * 0.18f;
            float barHeight = rowHeight * 0.64f;
            float barWidth = (float)(point.Value / maxValue * plot.Width);
            graphics.DrawString(TrimLabel(point.Label, 16), labelFont, labelBrush, 16, y);
            using var brush = new SolidBrush(Palette[i % Palette.Length]);
            graphics.FillRectangle(brush, plot.Left, y, barWidth, barHeight);
            graphics.DrawString(point.Value.ToString("0"), valueFont, labelBrush, plot.Left + barWidth + 6, y);
        }

        DrawAxisCaptions(graphics, plot, xLabel, yLabel);
    }

    private static void DrawPieChart(Graphics graphics, IReadOnlyList<ChartSeriesPoint> points)
    {
        double total = points.Sum(point => point.Value);
        if (total <= 0)
        {
            return;
        }

        var bounds = new Rectangle(500, 70, 210, 210);
        float startAngle = -90f;
        using var labelFont = new Font("Segoe UI", 9f);
        using var labelBrush = new SolidBrush(Color.FromArgb(51, 65, 85));

        for (int i = 0; i < points.Count; i++)
        {
            var point = points[i];
            if (point.Value <= 0)
            {
                continue;
            }

            float sweep = (float)(point.Value / total * 360d);
            using var brush = new SolidBrush(Palette[i % Palette.Length]);
            graphics.FillPie(brush, bounds, startAngle, sweep);
            graphics.DrawPie(Pens.White, bounds, startAngle, sweep);
            startAngle += sweep;
        }

        float legendY = 78;
        for (int i = 0; i < points.Count; i++)
        {
            var point = points[i];
            using var swatch = new SolidBrush(Palette[i % Palette.Length]);
            graphics.FillRectangle(swatch, 36, legendY, 14, 14);
            string percent = total > 0 ? (point.Value / total * 100d).ToString("0.#") : "0";
            graphics.DrawString($"{point.Label} ({point.Value}, {percent}%)", labelFont, labelBrush, 58, legendY - 2);
            legendY += 24;
        }
    }

    private static void DrawCommitGraph(
        Graphics graphGraphics,
        IReadOnlyList<CommitRow> rows,
        int width,
        int height,
        int graphWidth,
        int messageWidth,
        int shaWidth,
        int authorWidth,
        int dateWidth,
        int rowHeight,
        int laneWidth,
        int leftMargin,
        int dotRadius)
    {
        using var border = new Pen(Color.FromArgb(203, 213, 225));
        using var titleFont = new Font("Segoe UI", 11f, FontStyle.Bold);
        using var headerFont = new Font("Segoe UI", 8f, FontStyle.Bold);
        using var cellFont = new Font("Segoe UI", 8f);
        using var titleBrush = new SolidBrush(Color.FromArgb(30, 41, 59));
        using var textBrush = new SolidBrush(Color.FromArgb(30, 30, 35));
        using var metaBrush = new SolidBrush(Color.FromArgb(100, 116, 139));
        using var headerBack = new SolidBrush(Color.FromArgb(245, 243, 255));

        graphGraphics.DrawRectangle(border, 0, 0, width - 1, height - 1);
        graphGraphics.DrawString("Commit Graph", titleFont, titleBrush, 16, 12);
        graphGraphics.FillRectangle(headerBack, 16, 38, width - 32, 20);
        graphGraphics.DrawString("Graph", headerFont, titleBrush, 20, 41);
        graphGraphics.DrawString("Message", headerFont, titleBrush, graphWidth + 8, 41);
        graphGraphics.DrawString("SHA", headerFont, titleBrush, graphWidth + messageWidth + 8, 41);
        graphGraphics.DrawString("Author", headerFont, titleBrush, graphWidth + messageWidth + shaWidth + 8, 41);
        graphGraphics.DrawString("Date", headerFont, titleBrush, graphWidth + messageWidth + shaWidth + authorWidth + 8, 41);

        int LaneX(int lane) => 20 + leftMargin + lane * laneWidth;
        int top = 62;

        for (int i = 0; i < rows.Count; i++)
        {
            var row = rows[i];
            int rowTop = top + i * rowHeight;
            int rowMid = rowTop + rowHeight / 2;
            int rowBottom = rowTop + rowHeight;

            if (i % 2 == 1)
            {
                using var alt = new SolidBrush(Color.FromArgb(252, 252, 253));
                graphGraphics.FillRectangle(alt, 16, rowTop, width - 32, rowHeight);
            }

            using var ownPen = new Pen(Palette[row.Lane % Palette.Length], 1.6f);
            graphGraphics.DrawLine(ownPen, LaneX(row.Lane), rowTop, LaneX(row.Lane), rowMid);
            if (row.ContinuesDown)
            {
                graphGraphics.DrawLine(ownPen, LaneX(row.Lane), rowMid, LaneX(row.Lane), rowBottom);
            }

            foreach (int lane in row.PassThroughLanes)
            {
                using var passPen = new Pen(Palette[lane % Palette.Length], 1.4f);
                graphGraphics.DrawLine(passPen, LaneX(lane), rowTop, LaneX(lane), rowBottom);
            }

            foreach (int lane in row.ForkLanes)
            {
                using var forkPen = new Pen(Palette[lane % Palette.Length], 1.4f);
                graphGraphics.DrawLine(forkPen, LaneX(row.Lane), rowMid, LaneX(lane), rowBottom);
            }

            foreach (int lane in row.MergeLanes)
            {
                using var mergePen = new Pen(Palette[lane % Palette.Length], 1.4f);
                graphGraphics.DrawLine(mergePen, LaneX(lane), rowTop, LaneX(row.Lane), rowMid);
            }

            using var dotBrush = new SolidBrush(Palette[row.Lane % Palette.Length]);
            graphGraphics.FillEllipse(dotBrush, LaneX(row.Lane) - dotRadius, rowMid - dotRadius, dotRadius * 2, dotRadius * 2);

            DrawClippedText(graphGraphics, row.Commit.MessageShort, cellFont, textBrush, graphWidth + 8, rowTop + 4, messageWidth - 12);
            DrawClippedText(graphGraphics, row.Commit.Sha[..7], cellFont, metaBrush, graphWidth + messageWidth + 8, rowTop + 4, shaWidth - 8);
            DrawClippedText(graphGraphics, row.Commit.Author.Name, cellFont, metaBrush, graphWidth + messageWidth + shaWidth + 8, rowTop + 4, authorWidth - 8);
            DrawClippedText(graphGraphics, row.Commit.Author.When.ToString("yyyy-MM-dd"), cellFont, metaBrush, graphWidth + messageWidth + shaWidth + authorWidth + 8, rowTop + 4, dateWidth - 8);
        }
    }

    private static void DrawPlotArea(Graphics graphics, Rectangle plot)
    {
        using var plotBack = new SolidBrush(Color.FromArgb(248, 250, 252));
        using var border = new Pen(Color.FromArgb(226, 232, 240));
        graphics.FillRectangle(plotBack, plot);
        graphics.DrawRectangle(border, plot);
    }

    private static void DrawAxisCaptions(Graphics graphics, Rectangle plot, string xLabel, string yLabel)
    {
        using var captionFont = new Font("Segoe UI", 8f, FontStyle.Italic);
        using var captionBrush = new SolidBrush(Color.FromArgb(100, 116, 139));
        graphics.DrawString(xLabel, captionFont, captionBrush, plot.Left + plot.Width / 2f - 20, plot.Bottom + 28);
        var state = graphics.Save();
        graphics.TranslateTransform(18, plot.Top + plot.Height / 2f);
        graphics.RotateTransform(-90);
        graphics.DrawString(yLabel, captionFont, captionBrush, 0, 0);
        graphics.Restore(state);
    }

    private static void DrawClippedText(Graphics graphics, string text, Font font, Brush brush, float x, float y, float maxWidth)
    {
        var format = new StringFormat { Trimming = StringTrimming.EllipsisCharacter, FormatFlags = StringFormatFlags.NoWrap };
        graphics.DrawString(text, font, brush, new RectangleF(x, y, maxWidth, font.Height + 4), format);
    }

    private static string TrimLabel(string value, int maxLength) =>
        value.Length <= maxLength ? value : value[..Math.Max(0, maxLength - 1)] + "…";

    private static byte[] SavePng(Bitmap bitmap)
    {
        using var stream = new MemoryStream();
        bitmap.Save(stream, ImageFormat.Png);
        return stream.ToArray();
    }
}
