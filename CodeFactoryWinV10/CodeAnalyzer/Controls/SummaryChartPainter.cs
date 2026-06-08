using System.Drawing.Drawing2D;

namespace CodeAnalyzer.Controls;

internal static class SummaryChartPainter
{
    private static readonly Color CardBack = Color.FromArgb(252, 253, 255);
    private static readonly Color CardBorder = Color.FromArgb(210, 218, 230);
    private static readonly Color TitleColor = Color.FromArgb(25, 35, 50);
    private static readonly Color TextColor = Color.FromArgb(70, 80, 95);
    private static readonly Color GridColor = Color.FromArgb(230, 235, 242);

    public static void DrawCard(Graphics graphics, Rectangle bounds, SummarySection section)
    {
        graphics.SmoothingMode = SmoothingMode.AntiAlias;
        graphics.TextRenderingHint = System.Drawing.Text.TextRenderingHint.ClearTypeGridFit;

        using var back = new SolidBrush(CardBack);
        using var border = new Pen(CardBorder, 1.2f);
        graphics.FillRectangle(back, bounds);
        graphics.DrawRectangle(border, bounds);

        var content = Rectangle.Inflate(bounds, -14, -12);
        var titleRect = new Rectangle(content.Left, content.Top, content.Width, 22);
        using var titleFont = new Font("Segoe UI Semibold", 10.5f, FontStyle.Bold);
        using var textFont = new Font("Segoe UI", 8.75f);
        using var titleBrush = new SolidBrush(TitleColor);
        using var textBrush = new SolidBrush(TextColor);

        graphics.DrawString(section.Title, titleFont, titleBrush, titleRect);

        var summaryRect = new Rectangle(content.Left, titleRect.Bottom + 4, content.Width, 34);
        DrawWrappedText(graphics, section.SummaryText, textFont, textBrush, summaryRect);

        var chartTop = summaryRect.Bottom + 8;
        var chartBounds = new Rectangle(content.Left, chartTop, content.Width, Math.Max(40, content.Bottom - chartTop));

        if (section.Kpis.Count > 0)
        {
            var kpiHeight = Math.Min(56, chartBounds.Height / 3);
            DrawKpiRow(graphics, new Rectangle(chartBounds.Left, chartBounds.Top, chartBounds.Width, kpiHeight), section.Kpis);
            chartBounds = new Rectangle(
                chartBounds.Left,
                chartBounds.Top + kpiHeight + 8,
                chartBounds.Width,
                chartBounds.Height - kpiHeight - 8);
        }

        switch (section.ChartKind)
        {
            case SummaryChartKind.VerticalBar:
                DrawVerticalBars(graphics, chartBounds, section.Bars, textFont);
                break;
            case SummaryChartKind.HorizontalBar:
                DrawHorizontalBars(graphics, chartBounds, section.Bars, textFont);
                break;
            case SummaryChartKind.Pie:
                DrawPie(graphics, chartBounds, section.Slices, textFont, donut: false);
                break;
            case SummaryChartKind.Donut:
                DrawPie(graphics, chartBounds, section.Slices, textFont, donut: true);
                break;
            case SummaryChartKind.PieGrid:
                DrawPieGrid(graphics, chartBounds, section.PieItems, textFont);
                break;
            case SummaryChartKind.Radar:
                DrawRadarChart(graphics, chartBounds, section.RadarAxes, textFont);
                break;
        }
    }

    private static void DrawKpiRow(Graphics graphics, Rectangle bounds, IReadOnlyList<SummaryKpiItem> items)
    {
        if (items.Count == 0)
        {
            return;
        }

        var cellWidth = Math.Max(72, bounds.Width / items.Count);
        using var valueFont = new Font("Segoe UI", 13f, FontStyle.Bold);
        using var labelFont = new Font("Segoe UI", 8f);
        using var valueBrush = new SolidBrush(Color.FromArgb(52, 96, 145));
        using var labelBrush = new SolidBrush(TextColor);

        for (var i = 0; i < items.Count; i++)
        {
            var cell = new Rectangle(bounds.Left + i * cellWidth, bounds.Top, cellWidth - 4, bounds.Height);
            using var cellBack = new SolidBrush(Color.FromArgb(245, 248, 252));
            using var cellBorder = new Pen(Color.FromArgb(220, 228, 238));
            graphics.FillRectangle(cellBack, cell);
            graphics.DrawRectangle(cellBorder, cell);

            var valueSize = graphics.MeasureString(items[i].Value, valueFont);
            graphics.DrawString(
                items[i].Value,
                valueFont,
                valueBrush,
                cell.Left + (cell.Width - valueSize.Width) / 2f,
                cell.Top + 6);
            var labelSize = graphics.MeasureString(items[i].Label, labelFont);
            graphics.DrawString(
                items[i].Label,
                labelFont,
                labelBrush,
                cell.Left + (cell.Width - labelSize.Width) / 2f,
                cell.Top + 30);
        }
    }

    private static void DrawVerticalBars(Graphics graphics, Rectangle bounds, IReadOnlyList<SummaryBarItem> bars, Font labelFont)
    {
        if (bars.Count == 0)
        {
            DrawEmptyChart(graphics, bounds, "표시할 데이터가 없습니다.");
            return;
        }

        var max = bars.Max(bar => bar.Value);
        if (max <= 0)
        {
            max = 1;
        }

        var plot = new Rectangle(bounds.Left, bounds.Top + 6, bounds.Width, bounds.Height - 28);
        var slotWidth = Math.Max(24, plot.Width / bars.Count);
        using var labelBrush = new SolidBrush(TextColor);
        using var valueFont = new Font("Segoe UI", 7.5f, FontStyle.Bold);

        for (var i = 0; i < bars.Count; i++)
        {
            var slot = new Rectangle(plot.Left + i * slotWidth + 6, plot.Top, slotWidth - 12, plot.Height);
            var barHeight = (int)(slot.Height * (bars[i].Value / max));
            var barRect = new Rectangle(slot.Left, slot.Bottom - barHeight, slot.Width, barHeight);
            using var fill = new SolidBrush(bars[i].Color);
            graphics.FillRectangle(fill, barRect);

            var valueText = bars[i].Value >= 1000 ? $"{bars[i].Value / 1000.0:0.#}k" : bars[i].Value.ToString("0");
            var valueSize = graphics.MeasureString(valueText, valueFont);
            graphics.DrawString(valueText, valueFont, labelBrush, slot.Left + (slot.Width - valueSize.Width) / 2f, barRect.Top - 16);

            DrawWrappedText(
                graphics,
                bars[i].Label,
                labelFont,
                labelBrush,
                new Rectangle(slot.Left - 4, plot.Bottom + 2, slot.Width + 8, 22),
                center: true);
        }
    }

    private static void DrawHorizontalBars(Graphics graphics, Rectangle bounds, IReadOnlyList<SummaryBarItem> bars, Font labelFont)
    {
        if (bars.Count == 0)
        {
            DrawEmptyChart(graphics, bounds, "표시할 데이터가 없습니다.");
            return;
        }

        var max = bars.Max(bar => bar.Value);
        if (max <= 0)
        {
            max = 1;
        }

        var rowHeight = Math.Max(22, (bounds.Height - 8) / bars.Count);
        var labelWidth = Math.Min(140, bounds.Width / 3);
        var valueWidth = 42;
        var barLeft = bounds.Left + labelWidth + 6;
        var barWidth = Math.Max(40, bounds.Width - labelWidth - valueWidth - 10);
        using var labelBrush = new SolidBrush(TextColor);
        using var valueFont = new Font("Segoe UI", 8f, FontStyle.Bold);

        for (var i = 0; i < bars.Count; i++)
        {
            var rowTop = bounds.Top + i * rowHeight;
            var labelRect = new Rectangle(bounds.Left, rowTop + 2, labelWidth, rowHeight - 4);
            DrawWrappedText(graphics, bars[i].Label, labelFont, labelBrush, labelRect);

            var fillWidth = (int)(barWidth * (bars[i].Value / max));
            var track = new Rectangle(barLeft, rowTop + rowHeight / 2 - 5, barWidth, 10);
            using var trackBrush = new SolidBrush(GridColor);
            graphics.FillRectangle(trackBrush, track);
            using var fill = new SolidBrush(bars[i].Color);
            graphics.FillRectangle(fill, new Rectangle(track.Left, track.Top, fillWidth, track.Height));

            var valueText = bars[i].Value >= 1000 ? $"{bars[i].Value / 1000.0:0.#}k" : bars[i].Value.ToString("0");
            graphics.DrawString(valueText, valueFont, labelBrush, barLeft + barWidth + 6, rowTop + 4);
        }
    }

    private static void DrawPieGrid(
        Graphics graphics,
        Rectangle bounds,
        IReadOnlyList<SummaryMiniPieItem> items,
        Font labelFont)
    {
        if (items.Count == 0)
        {
            DrawEmptyChart(graphics, bounds, "표시할 데이터가 없습니다.");
            return;
        }

        var columns = Math.Max(2, (int)Math.Ceiling(Math.Sqrt(items.Count * bounds.Width / (double)Math.Max(1, bounds.Height))));
        var rows = (int)Math.Ceiling(items.Count / (double)columns);
        var cellWidth = Math.Max(72, bounds.Width / columns);
        var cellHeight = Math.Max(72, bounds.Height / rows);
        using var labelBrush = new SolidBrush(TextColor);
        using var percentFont = new Font("Segoe UI", 8.5f, FontStyle.Bold);
        using var nameFont = new Font("Segoe UI", 7.25f);

        for (var i = 0; i < items.Count; i++)
        {
            var column = i % columns;
            var row = i / columns;
            var cell = new Rectangle(
                bounds.Left + column * cellWidth,
                bounds.Top + row * cellHeight,
                cellWidth,
                cellHeight);
            var pieSize = Math.Min(cellWidth - 10, cellHeight - 24);
            if (pieSize < 28)
            {
                continue;
            }

            var pieRect = new Rectangle(
                cell.Left + (cell.Width - pieSize) / 2,
                cell.Top + 2,
                pieSize,
                pieSize);
            DrawMiniRatioPie(graphics, pieRect, items[i], percentFont);

            var labelRect = new Rectangle(cell.Left + 2, pieRect.Bottom + 2, cell.Width - 4, cell.Bottom - pieRect.Bottom - 4);
            DrawWrappedText(graphics, items[i].Label, nameFont, labelBrush, labelRect, center: true);
        }
    }

    private static void DrawMiniRatioPie(
        Graphics graphics,
        Rectangle pieRect,
        SummaryMiniPieItem item,
        Font percentFont)
    {
        var total = Math.Max(1, item.Total);
        var value = Math.Clamp(item.Value, 0, total);
        var ratio = value / total;
        var remainderColor = Color.FromArgb(228, 234, 242);
        using var remainderBrush = new SolidBrush(remainderColor);
        using var valueBrush = new SolidBrush(item.Color);
        graphics.FillPie(remainderBrush, pieRect, 0f, 360f);
        if (ratio > 0.001)
        {
            graphics.FillPie(valueBrush, pieRect, -90f, (float)(ratio * 360.0));
        }

        var inner = Math.Max(12, pieRect.Width / 3);
        var innerRect = new Rectangle(
            pieRect.Left + (pieRect.Width - inner) / 2,
            pieRect.Top + (pieRect.Height - inner) / 2,
            inner,
            inner);
        using var hole = new SolidBrush(CardBack);
        graphics.FillEllipse(hole, innerRect);

        var percentText = $"{ratio * 100:0.#}%";
        using var centerBrush = new SolidBrush(TitleColor);
        var size = graphics.MeasureString(percentText, percentFont);
        graphics.DrawString(
            percentText,
            percentFont,
            centerBrush,
            pieRect.Left + (pieRect.Width - size.Width) / 2f,
            pieRect.Top + (pieRect.Height - size.Height) / 2f);
    }

    private static void DrawPie(
        Graphics graphics,
        Rectangle bounds,
        IReadOnlyList<SummaryChartSlice> slices,
        Font labelFont,
        bool donut)
    {
        var total = slices.Sum(slice => slice.Value);
        if (total <= 0 || slices.Count == 0)
        {
            DrawEmptyChart(graphics, bounds, "표시할 데이터가 없습니다.");
            return;
        }

        var legendWidth = Math.Min(170, bounds.Width / 2);
        var pieSize = Math.Min(bounds.Height - 8, bounds.Width - legendWidth - 12);
        var pieRect = new Rectangle(bounds.Left, bounds.Top + (bounds.Height - pieSize) / 2, pieSize, pieSize);
        var legendRect = new Rectangle(pieRect.Right + 10, bounds.Top + 4, legendWidth, bounds.Height - 8);

        float startAngle = -90f;
        foreach (var slice in slices.Where(s => s.Value > 0))
        {
            var sweep = (float)(slice.Value / total * 360.0);
            using var brush = new SolidBrush(slice.Color);
            graphics.FillPie(brush, pieRect, startAngle, sweep);
            startAngle += sweep;
        }

        if (donut)
        {
            var inner = pieSize / 3;
            var innerRect = new Rectangle(
                pieRect.Left + (pieSize - inner) / 2,
                pieRect.Top + (pieSize - inner) / 2,
                inner,
                inner);
            using var hole = new SolidBrush(CardBack);
            graphics.FillEllipse(hole, innerRect);
            using var centerFont = new Font("Segoe UI", 10f, FontStyle.Bold);
            using var centerBrush = new SolidBrush(TitleColor);
            var centerText = total >= 1000 ? $"{total / 1000.0:0.#}k" : total.ToString("0");
            var centerSize = graphics.MeasureString(centerText, centerFont);
            graphics.DrawString(
                centerText,
                centerFont,
                centerBrush,
                pieRect.Left + (pieSize - centerSize.Width) / 2f,
                pieRect.Top + (pieSize - centerSize.Height) / 2f);
        }

        using var labelBrush = new SolidBrush(TextColor);
        var y = legendRect.Top;
        foreach (var slice in slices.Where(s => s.Value > 0))
        {
            var swatch = new Rectangle(legendRect.Left, y + 3, 10, 10);
            using var swatchBrush = new SolidBrush(slice.Color);
            graphics.FillRectangle(swatchBrush, swatch);
            var percent = slice.Value / total * 100.0;
            var text = $"{slice.Label}  {slice.Value:0} ({percent:0.#}%)";
            graphics.DrawString(text, labelFont, labelBrush, legendRect.Left + 16, y);
            y += 18;
        }
    }

    private static void DrawRadarChart(
        Graphics graphics,
        Rectangle bounds,
        IReadOnlyList<SummaryRadarAxisItem> axes,
        Font labelFont)
    {
        if (axes.Count < 3)
        {
            DrawEmptyChart(graphics, bounds, "레이더 차트를 표시하려면 3개 이상의 개선 목표가 필요합니다.");
            return;
        }

        var legendWidth = Math.Min(220, Math.Max(140, bounds.Width / 3));
        var plotBounds = new Rectangle(bounds.Left, bounds.Top, Math.Max(120, bounds.Width - legendWidth - 10), bounds.Height);
        var legendBounds = new Rectangle(plotBounds.Right + 8, bounds.Top + 2, legendWidth, bounds.Height - 4);

        var center = new PointF(plotBounds.Left + plotBounds.Width / 2f, plotBounds.Top + plotBounds.Height / 2f + 4f);
        var radius = Math.Min(plotBounds.Width, plotBounds.Height) / 2f - 24f;
        if (radius <= 20f)
        {
            DrawEmptyChart(graphics, bounds, "표시 공간이 부족합니다.");
            return;
        }

        using var gridPen = new Pen(GridColor, 1f);
        using var axisPen = new Pen(Color.FromArgb(205, 212, 224), 1f);
        using var fillBrush = new SolidBrush(Color.FromArgb(90, 74, 108, 155));
        using var outlinePen = new Pen(Color.FromArgb(74, 108, 155), 2f);
        using var pointBrush = new SolidBrush(Color.FromArgb(52, 96, 145));
        using var labelBrush = new SolidBrush(TextColor);
        using var detailBrush = new SolidBrush(Color.FromArgb(110, 120, 135));
        using var scoreFont = new Font("Segoe UI", 7.5f, FontStyle.Bold);
        using var detailFont = new Font("Segoe UI", 6.75f);

        foreach (var level in new[] { 0.25f, 0.5f, 0.75f, 1f })
        {
            DrawRadarRing(graphics, center, radius * level, axes.Count, gridPen);
        }

        var points = new PointF[axes.Count];
        for (var i = 0; i < axes.Count; i++)
        {
            var angle = -Math.PI / 2 + i * 2 * Math.PI / axes.Count;
            var axisEnd = new PointF(
                center.X + (float)(Math.Cos(angle) * radius),
                center.Y + (float)(Math.Sin(angle) * radius));
            graphics.DrawLine(axisPen, center, axisEnd);

            var scoreRadius = radius * Math.Clamp(axes[i].Score, 0f, 100f) / 100f;
            points[i] = new PointF(
                center.X + (float)(Math.Cos(angle) * scoreRadius),
                center.Y + (float)(Math.Sin(angle) * scoreRadius));

            var labelRadius = radius + 14f;
            var labelPoint = new PointF(
                center.X + (float)(Math.Cos(angle) * labelRadius),
                center.Y + (float)(Math.Sin(angle) * labelRadius));
            var label = axes[i].Label;
            var labelSize = graphics.MeasureString(label, labelFont);
            var scoreText = $"{axes[i].Score:0.#}";
            var scoreSize = graphics.MeasureString(scoreText, scoreFont);
            var drawX = labelPoint.X - labelSize.Width / 2f;
            var drawY = labelPoint.Y - labelSize.Height / 2f;
            if (Math.Abs(Math.Cos(angle)) > 0.35)
            {
                drawX += Math.Sign(Math.Cos(angle)) * 4f;
            }

            if (Math.Sin(angle) > 0.35)
            {
                drawY += 6f;
            }

            graphics.DrawString(label, labelFont, labelBrush, drawX, drawY);
            graphics.DrawString(
                scoreText,
                scoreFont,
                pointBrush,
                labelPoint.X - scoreSize.Width / 2f,
                drawY + labelSize.Height - 2f);
        }

        if (points.Length >= 3)
        {
            graphics.FillPolygon(fillBrush, points);
            graphics.DrawPolygon(outlinePen, points);
        }

        foreach (var point in points)
        {
            graphics.FillEllipse(pointBrush, point.X - 3f, point.Y - 3f, 6f, 6f);
        }

        var legendY = (float)legendBounds.Top;
        var rowHeight = Math.Max(34f, legendBounds.Height / Math.Max(1, axes.Count));
        foreach (var axis in axes)
        {
            var row = new RectangleF(legendBounds.Left, legendY, legendBounds.Width, rowHeight - 2f);
            using var rowBack = new SolidBrush(Color.FromArgb(248, 250, 254));
            graphics.FillRectangle(rowBack, row);
            graphics.DrawString(axis.Label, labelFont, labelBrush, row.Left + 2f, row.Top + 2f);
            if (!string.IsNullOrWhiteSpace(axis.Detail))
            {
                graphics.DrawString(axis.Detail, detailFont, detailBrush, row.Left + 2f, row.Top + 16f);
            }

            var scoreText = $"{axis.Score:0.#}점";
            var scoreSize = graphics.MeasureString(scoreText, scoreFont);
            graphics.DrawString(
                scoreText,
                scoreFont,
                pointBrush,
                row.Right - scoreSize.Width - 2f,
                row.Top + 4f);
            legendY += rowHeight;
        }
    }

    private static void DrawRadarRing(Graphics graphics, PointF center, float radius, int axisCount, Pen pen)
    {
        if (axisCount < 3 || radius <= 0)
        {
            return;
        }

        var ring = new PointF[axisCount];
        for (var i = 0; i < axisCount; i++)
        {
            var angle = -Math.PI / 2 + i * 2 * Math.PI / axisCount;
            ring[i] = new PointF(
                center.X + (float)(Math.Cos(angle) * radius),
                center.Y + (float)(Math.Sin(angle) * radius));
        }

        ring = ring.Concat(ring.Take(1)).ToArray();
        graphics.DrawPolygon(pen, ring);
    }

    private static void DrawEmptyChart(Graphics graphics, Rectangle bounds, string message)
    {
        using var font = new Font("Segoe UI", 9f, FontStyle.Italic);
        using var brush = new SolidBrush(Color.FromArgb(130, 140, 155));
        var size = graphics.MeasureString(message, font);
        graphics.DrawString(
            message,
            font,
            brush,
            bounds.Left + (bounds.Width - size.Width) / 2f,
            bounds.Top + (bounds.Height - size.Height) / 2f);
    }

    private static void DrawWrappedText(
        Graphics graphics,
        string text,
        Font font,
        Brush brush,
        Rectangle bounds,
        bool center = false)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return;
        }

        var format = new StringFormat
        {
            Trimming = StringTrimming.EllipsisCharacter,
            FormatFlags = StringFormatFlags.LineLimit
        };
        if (center)
        {
            format.Alignment = StringAlignment.Center;
        }

        graphics.DrawString(text, font, brush, bounds, format);
    }
}
