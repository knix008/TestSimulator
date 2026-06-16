using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using MyAgileBoardWinV10.Models;

namespace MyAgileBoardWinV10.Services;

public static class ReportChartRenderer
{
    private static readonly Color[] SummaryChartColors =
    [
        Color.FromArgb(68, 114, 196),
        Color.FromArgb(237, 125, 49),
        Color.FromArgb(112, 173, 71),
        Color.FromArgb(158, 73, 211),
        Color.FromArgb(231, 76, 60),
        Color.FromArgb(26, 188, 156),
        Color.FromArgb(241, 196, 15),
        Color.FromArgb(52, 152, 219),
    ];

    private sealed record BurndownDay(DateTime Date, int PointsCompleted, int CumulativeCompleted);

    public static ReportChartImages Build(KanbanProject project)
    {
        using var pie = RenderColumnPieChart(project);
        using var bar = RenderPriorityBarChart(project);
        var (burndown, caption) = RenderBurndownChart(project);
        using (burndown)
        {
            return new ReportChartImages
            {
                ColumnPieChartPng = ToPng(pie),
                PriorityBarChartPng = ToPng(bar),
                BurndownChartPng = ToPng(burndown),
                BurndownCaption = caption
            };
        }
    }

    private static byte[] ToPng(Bitmap bitmap)
    {
        using var ms = new MemoryStream();
        bitmap.Save(ms, ImageFormat.Png);
        return ms.ToArray();
    }

    public static Bitmap RenderColumnPieChart(KanbanProject project)
    {
        const int width = 520;
        const int height = 280;
        var bmp = new Bitmap(width, height);
        using var g = Graphics.FromImage(bmp);
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.ClearTypeGridFit;
        g.Clear(Color.White);

        int size = Math.Min(220, height - 40);
        var rect = new Rectangle(20, 20, size, size);
        int total = project.Columns.Sum(c => c.Cards.Count);

        if (total == 0)
        {
            using var brush = new SolidBrush(Color.LightGray);
            g.FillEllipse(brush, rect);
            using var font = new Font("Segoe UI", 10F);
            g.DrawString("카드 없음", font, Brushes.Gray, rect.X + 40, rect.Y + size / 2 - 8);
            return bmp;
        }

        float startAngle = -90f;
        int colorIdx = 0;
        int legendY = 24;

        foreach (var col in project.Columns)
        {
            if (col.Cards.Count == 0) { colorIdx++; continue; }
            float sweep = 360f * col.Cards.Count / total;
            var color = SummaryChartColors[colorIdx % SummaryChartColors.Length];

            using var brush = new SolidBrush(color);
            g.FillPie(brush, rect, startAngle, sweep);
            using var pen = new Pen(Color.White, 1.5f);
            g.DrawPie(pen, rect, startAngle, sweep);
            DrawPieSliceLabel(g, rect, col.Name, col.Cards.Count, total, startAngle, sweep, color);

            int lx = size + 36;
            g.FillRectangle(brush, lx, legendY, 12, 12);
            using var legendFont = new Font("Segoe UI", 8.5F);
            g.DrawString($"{col.Name} ({col.Cards.Count})", legendFont, Brushes.Black, lx + 16, legendY - 1);

            startAngle += sweep;
            colorIdx++;
            legendY += 20;
        }

        using var titleFont = new Font("Segoe UI", 10F, FontStyle.Bold);
        g.DrawString("컬럼별 카드 분포", titleFont, Brushes.Black, 20, 4);
        return bmp;
    }

    public static Bitmap RenderPriorityBarChart(KanbanProject project)
    {
        const int width = 520;
        const int height = 180;
        var bmp = new Bitmap(width, height);
        using var g = Graphics.FromImage(bmp);
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.Clear(Color.White);

        using var titleFont = new Font("Segoe UI", 10F, FontStyle.Bold);
        g.DrawString("우선순위별 카드 분포", titleFont, Brushes.Black, 16, 8);

        var allCards = project.Columns.SelectMany(c => c.Cards).ToList();
        int total = allCards.Count;
        if (total == 0)
        {
            using var font = new Font("Segoe UI", 9F);
            g.DrawString("카드 없음", font, Brushes.Gray, 20, 60);
            return bmp;
        }

        var priorities = Enum.GetValues<Priority>().Reverse().ToArray();
        var priorityColors = new Dictionary<Priority, Color>
        {
            { Priority.Critical, Color.Red },
            { Priority.High, Color.OrangeRed },
            { Priority.Medium, Color.DarkOrange },
            { Priority.Low, Color.SeaGreen },
        };

        int maxCount = priorities.Max(p => allCards.Count(c => c.Priority == p));
        if (maxCount == 0) return bmp;

        int barHeight = 28;
        int barMaxWidth = width - 140;
        int startY = 40;
        int startX = 90;
        using var labelFont = new Font("Segoe UI", 8.5F);

        foreach (var priority in priorities)
        {
            int count = allCards.Count(c => c.Priority == priority);
            int barWidth = count * barMaxWidth / maxCount;

            using var brush = new SolidBrush(priorityColors[priority]);
            var barRect = new Rectangle(startX, startY, Math.Max(barWidth, 2), barHeight - 6);
            g.FillRectangle(brush, barRect);

            g.DrawString(priority.ToString(), labelFont, Brushes.Black, 16, startY + 5);
            g.DrawString(count.ToString(), labelFont, Brushes.DimGray, startX + barWidth + 6, startY + 5);
            startY += barHeight;
        }

        return bmp;
    }

    public static (Bitmap Chart, string Caption) RenderBurndownChart(KanbanProject project)
    {
        var start = DateTime.Today.AddDays(-13);
        var end = DateTime.Today;
        var chartColors = AppSettings.GetBurndownChartColors();

        int activePoints = project.Columns.Sum(c => c.Cards.Sum(k => k.Points));
        int archivedPoints = project.ArchivedCards.Sum(a => a.Card.Points);
        int totalPoints = activePoints + archivedPoints;

        var fromDoneColumns = project.Columns
            .Where(c => c.IsCompletionColumn)
            .SelectMany(c => c.Cards)
            .Where(k => k.CompletedAt.HasValue
                     && k.CompletedAt.Value.Date >= start
                     && k.CompletedAt.Value.Date <= end)
            .Select(k => (Date: k.CompletedAt!.Value.Date, Points: k.Points));

        var fromArchive = project.ArchivedCards
            .Where(a => a.ArchivedAt.Date >= start && a.ArchivedAt.Date <= end)
            .Select(a => (Date: a.ArchivedAt.Date, Points: a.Card.Points));

        var completedByDay = fromDoneColumns
            .Concat(fromArchive)
            .GroupBy(x => x.Date)
            .ToDictionary(g => g.Key, g => g.Sum(x => x.Points));

        var chartData = new List<BurndownDay>();
        int cumulative = 0;
        for (var d = start; d <= end; d = d.AddDays(1))
        {
            int pts = completedByDay.TryGetValue(d, out var v) ? v : 0;
            cumulative += pts;
            chartData.Add(new BurndownDay(d, pts, cumulative));
        }

        int remaining = Math.Max(0, totalPoints - cumulative);
        string caption = $"기간: {start:yyyy-MM-dd} ~ {end:yyyy-MM-dd}  |  완료: {cumulative}pt / 전체: {totalPoints}pt  |  잔여: {remaining}pt";

        const int width = 640;
        const int height = 340;
        var bmp = new Bitmap(width, height);
        using var g = Graphics.FromImage(bmp);
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.Clear(Color.White);

        using var titleFont = new Font("Segoe UI", 10F, FontStyle.Bold);
        g.DrawString("Burn Down 차트", titleFont, Brushes.Black, 16, 8);
        using var captionFont = new Font("Segoe UI", 8F);
        g.DrawString(caption, captionFont, Brushes.DimGray, 16, 26);

        const int marginL = 55;
        const int marginR = 20;
        const int marginT = 52;
        const int marginB = 36;

        int chartW = width - marginL - marginR;
        int chartH = height - marginT - marginB;

        if (chartData.Count == 0 || totalPoints == 0)
        {
            using var emptyFont = new Font("Segoe UI", 10F);
            g.DrawString("데이터가 없습니다.", emptyFont, Brushes.DimGray, marginL, marginT + 20);
            return (bmp, caption);
        }

        using var gridPen = new Pen(Color.FromArgb(220, 220, 220), 1f) { DashStyle = DashStyle.Dot };
        using var axisPen = new Pen(Color.DimGray, 1.5f);
        using var axisFont = new Font("Segoe UI", 7.5f);

        g.DrawLine(axisPen, marginL, marginT, marginL, marginT + chartH);
        g.DrawLine(axisPen, marginL, marginT + chartH, marginL + chartW, marginT + chartH);

        int maxY = totalPoints;
        int yDivs = Math.Min(maxY, 10);
        for (int i = 0; i <= yDivs; i++)
        {
            int val = (int)Math.Round((double)maxY * i / yDivs);
            int y = marginT + chartH - (int)((double)chartH * i / yDivs);
            g.DrawLine(gridPen, marginL, y, marginL + chartW, y);
            var label = val.ToString();
            var sz = g.MeasureString(label, axisFont);
            g.DrawString(label, axisFont, Brushes.DimGray, marginL - sz.Width - 3, y - sz.Height / 2);
        }

        int days = chartData.Count;
        float stepX = (float)chartW / Math.Max(days - 1, 1);
        int xStep = Math.Max(1, days / 12);
        for (int i = 0; i < days; i += xStep)
        {
            float x = marginL + i * stepX;
            var label = chartData[i].Date.ToString("MM/dd");
            var sz = g.MeasureString(label, axisFont);
            g.DrawString(label, axisFont, Brushes.DimGray, x - sz.Width / 2, marginT + chartH + 4);
        }

        var idealColor = ColorFromHex(chartColors.IdealLineHex, Color.FromArgb(160, 160, 160));
        using var idealPen = new Pen(Color.FromArgb(180, idealColor), 1.5f) { DashStyle = DashStyle.Dash };
        g.DrawLine(idealPen, marginL, marginT, marginL + chartW, marginT + chartH);

        float barW = Math.Max(2f, stepX * 0.45f);
        var barColor = ColorFromHex(chartColors.DailyBarHex, Color.FromArgb(34, 139, 71));
        using var barBrush = new SolidBrush(barColor);
        using var barBorderPen = new Pen(Darken(barColor, 0.85f), 1f);
        for (int i = 0; i < days; i++)
        {
            if (chartData[i].PointsCompleted <= 0) continue;
            float bh = (float)chartH * chartData[i].PointsCompleted / maxY;
            float bx = marginL + i * stepX - barW / 2;
            float by = marginT + chartH - bh;
            var barRect = new RectangleF(bx, by, barW, bh);
            g.FillRectangle(barBrush, barRect);
            g.DrawRectangle(barBorderPen, barRect.X, barRect.Y, barRect.Width, barRect.Height);
        }

        var remainingColor = ColorFromHex(chartColors.RemainingLineHex, Color.FromArgb(220, 60, 60));
        using var actualPen = new Pen(remainingColor, 2.2f);
        using var actualBrush = new SolidBrush(remainingColor);
        var burnPts = new PointF[days];
        for (int i = 0; i < days; i++)
        {
            int rem = Math.Max(0, totalPoints - chartData[i].CumulativeCompleted);
            burnPts[i] = new PointF(
                marginL + i * stepX,
                marginT + chartH - (float)chartH * rem / maxY);
        }
        if (burnPts.Length > 1) g.DrawLines(actualPen, burnPts);
        foreach (var pt in burnPts)
            g.FillEllipse(actualBrush, pt.X - 3.5f, pt.Y - 3.5f, 7, 7);

        using var legendFont = new Font("Segoe UI", 8f);
        int lx = marginL + chartW - 160;
        int ly = marginT + 8;
        g.FillRectangle(barBrush, lx, ly + 2, 20, 10);
        g.DrawRectangle(barBorderPen, lx, ly + 2, 20, 10);
        g.DrawString("일별 완료", legendFont, Brushes.DimGray, lx + 24, ly);
        g.DrawLine(idealPen, lx, ly + 22, lx + 20, ly + 22);
        g.DrawString("이상 소진선", legendFont, Brushes.DimGray, lx + 24, ly + 15);
        g.DrawLine(actualPen, lx, ly + 38, lx + 20, ly + 38);
        g.DrawString("실제 잔여량", legendFont, actualBrush, lx + 24, ly + 31);

        return (bmp, caption);
    }

    private static void DrawPieSliceLabel(
        Graphics g, Rectangle pieRect, string name, int count, int total,
        float startAngle, float sweep, Color sliceColor)
    {
        if (sweep < 8f) return;

        int percent = (int)Math.Round(100f * count / total);
        float midAngle = startAngle + sweep / 2f;
        double midRad = midAngle * Math.PI / 180.0;

        float cx = pieRect.X + pieRect.Width / 2f;
        float cy = pieRect.Y + pieRect.Height / 2f;
        float labelRadius = pieRect.Width / 2f * (sweep >= 22f ? 0.58f : 0.68f);
        float lx = cx + (float)(labelRadius * Math.Cos(midRad));
        float ly = cy + (float)(labelRadius * Math.Sin(midRad));

        string label = sweep >= 20f
            ? $"{TruncateLabel(name, 8)}\n{count} ({percent}%)"
            : $"{percent}%";

        float fontSize = sweep >= 28f ? 8f : sweep >= 16f ? 7f : 6.5f;
        using var font = new Font("Segoe UI", fontSize, FontStyle.Bold);
        using var textBrush = new SolidBrush(GetContrastTextColor(sliceColor));

        var textRect = new RectangleF(lx - 42, ly - 18, 84, 36);
        using var format = new StringFormat
        {
            Alignment = StringAlignment.Center,
            LineAlignment = StringAlignment.Center,
            Trimming = StringTrimming.EllipsisCharacter,
            FormatFlags = StringFormatFlags.NoClip
        };
        g.DrawString(label, font, textBrush, textRect, format);
    }

    private static string TruncateLabel(string text, int maxChars)
        => text.Length <= maxChars ? text : text[..(maxChars - 1)] + "…";

    private static Color GetContrastTextColor(Color bg)
    {
        double lum = (0.299 * bg.R + 0.587 * bg.G + 0.114 * bg.B) / 255;
        return lum < 0.55 ? Color.White : Color.FromArgb(45, 45, 45);
    }

    private static Color ColorFromHex(string hex, Color fallback)
    {
        try { return ColorTranslator.FromHtml(hex); }
        catch { return fallback; }
    }

    private static Color Darken(Color color, float factor)
    {
        factor = Math.Clamp(factor, 0f, 1f);
        return Color.FromArgb(
            color.A,
            (int)(color.R * factor),
            (int)(color.G * factor),
            (int)(color.B * factor));
    }
}
