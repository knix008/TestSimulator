using CodeAnalyzer.Models;

namespace CodeAnalyzer.Controls;

internal static class SummaryChartHitTester
{
    public static IReadOnlyList<SummaryChartHitRegion> BuildRegions(Rectangle cardBounds, SummarySection section)
    {
        if (cardBounds.Width <= 0 || cardBounds.Height <= 0)
        {
            return [];
        }

        var regions = new List<SummaryChartHitRegion>();
        var defaultView = section.TargetViewKind;
        var defaultTooltip = BuildCardTooltip(section, defaultView);

        regions.Add(new SummaryChartHitRegion(cardBounds, defaultTooltip, defaultView));

        var content = Rectangle.Inflate(cardBounds, -14, -12);
        var titleRect = new Rectangle(content.Left, content.Top, content.Width, 22);
        var summaryRect = new Rectangle(content.Left, titleRect.Bottom + 4, content.Width, 34);
        var chartTop = summaryRect.Bottom + 8;
        var chartBounds = new Rectangle(content.Left, chartTop, content.Width, Math.Max(40, content.Bottom - chartTop));

        if (section.Kpis.Count > 0)
        {
            var kpiHeight = Math.Min(56, chartBounds.Height / 3);
            var kpiBounds = new Rectangle(chartBounds.Left, chartBounds.Top, chartBounds.Width, kpiHeight);
            AddKpiRegions(regions, section, kpiBounds, defaultView);
            chartBounds = new Rectangle(
                chartBounds.Left,
                chartBounds.Top + kpiHeight + 8,
                chartBounds.Width,
                chartBounds.Height - kpiHeight - 8);
        }

        switch (section.ChartKind)
        {
            case SummaryChartKind.VerticalBar:
                AddVerticalBarRegions(regions, section, chartBounds, defaultView);
                break;
            case SummaryChartKind.HorizontalBar:
                AddHorizontalBarRegions(regions, section, chartBounds, defaultView);
                break;
            case SummaryChartKind.Pie:
            case SummaryChartKind.Donut:
                AddPieRegions(regions, section, chartBounds, defaultView, section.ChartKind == SummaryChartKind.Donut);
                break;
            case SummaryChartKind.PieGrid:
                AddPieGridRegions(regions, section, chartBounds, defaultView);
                break;
            case SummaryChartKind.Radar:
                AddRadarRegions(regions, section, chartBounds);
                break;
        }

        return regions;
    }

    public static SummaryChartHitRegion? HitTest(Point location, IReadOnlyList<SummaryChartHitRegion> regions)
    {
        for (var i = regions.Count - 1; i >= 0; i--)
        {
            if (regions[i].Bounds.Contains(location))
            {
                return regions[i];
            }
        }

        return null;
    }

    private static void AddKpiRegions(
        List<SummaryChartHitRegion> regions,
        SummarySection section,
        Rectangle bounds,
        DiagramViewKind? defaultView)
    {
        if (section.Kpis.Count == 0)
        {
            return;
        }

        var cellWidth = Math.Max(72, bounds.Width / section.Kpis.Count);
        for (var i = 0; i < section.Kpis.Count; i++)
        {
            var cell = new Rectangle(bounds.Left + i * cellWidth, bounds.Top, cellWidth - 4, bounds.Height);
            var kpi = section.Kpis[i];
            var tooltip = string.IsNullOrWhiteSpace(kpi.Hint)
                ? $"{kpi.Label}: {kpi.Value}\n{ViewLinkLine(defaultView)}"
                : $"{kpi.Label}: {kpi.Value}\n{kpi.Hint}\n{ViewLinkLine(defaultView)}";
            regions.Add(new SummaryChartHitRegion(cell, tooltip, defaultView));
        }
    }

    private static void AddVerticalBarRegions(
        List<SummaryChartHitRegion> regions,
        SummarySection section,
        Rectangle bounds,
        DiagramViewKind? defaultView)
    {
        if (section.Bars.Count == 0)
        {
            return;
        }

        var plot = new Rectangle(bounds.Left, bounds.Top + 6, bounds.Width, bounds.Height - 28);
        var slotWidth = Math.Max(24, plot.Width / section.Bars.Count);
        for (var i = 0; i < section.Bars.Count; i++)
        {
            var slot = new Rectangle(plot.Left + i * slotWidth + 6, plot.Top, slotWidth - 12, plot.Height + 24);
            var bar = section.Bars[i];
            regions.Add(new SummaryChartHitRegion(
                slot,
                $"{bar.Label}: {FormatValue(bar.Value)}\n{ViewLinkLine(defaultView)}",
                defaultView));
        }
    }

    private static void AddHorizontalBarRegions(
        List<SummaryChartHitRegion> regions,
        SummarySection section,
        Rectangle bounds,
        DiagramViewKind? defaultView)
    {
        if (section.Bars.Count == 0)
        {
            return;
        }

        var rowHeight = Math.Max(22, (bounds.Height - 8) / section.Bars.Count);
        for (var i = 0; i < section.Bars.Count; i++)
        {
            var row = new Rectangle(bounds.Left, bounds.Top + i * rowHeight, bounds.Width, rowHeight);
            var bar = section.Bars[i];
            regions.Add(new SummaryChartHitRegion(
                row,
                $"{bar.Label}: {FormatValue(bar.Value)}\n{ViewLinkLine(defaultView)}",
                defaultView));
        }
    }

    private static void AddPieRegions(
        List<SummaryChartHitRegion> regions,
        SummarySection section,
        Rectangle bounds,
        DiagramViewKind? defaultView,
        bool donut)
    {
        if (section.Slices.Count == 0)
        {
            return;
        }

        var positiveTotal = section.Slices.Where(slice => slice.Value > 0).Sum(slice => slice.Value);
        const int maxRowsPerColumn = 14;
        var columnCount = Math.Max(1, (int)Math.Ceiling(section.Slices.Count / (double)maxRowsPerColumn));
        var columnWidth = Math.Max(150, Math.Min(220, (bounds.Width - 220) / columnCount));
        var legendWidth = columnCount * columnWidth + 8;
        var pieSize = Math.Min(bounds.Height - 8, Math.Max(120, bounds.Width - legendWidth - 12));
        var pieRect = new Rectangle(bounds.Left, bounds.Top + (bounds.Height - pieSize) / 2, pieSize, pieSize);
        var legendRect = new Rectangle(pieRect.Right + 10, bounds.Top + 4, legendWidth, bounds.Height - 8);

        if (positiveTotal > 0)
        {
            float startAngle = -90f;
            foreach (var slice in section.Slices.Where(s => s.Value > 0))
            {
                var sweep = (float)(slice.Value / positiveTotal * 360.0);
                var sliceBounds = WedgeBounds(pieRect, startAngle, sweep);
                var percent = slice.Value / positiveTotal * 100.0;
                regions.Add(new SummaryChartHitRegion(
                    sliceBounds,
                    $"{slice.Label}: {FormatValue(slice.Value)} ({percent:0.#}%)\n{ViewLinkLine(defaultView)}",
                    defaultView));
                startAngle += sweep;
            }
        }
        else
        {
            regions.Add(new SummaryChartHitRegion(
                pieRect,
                $"검출된 항목이 없습니다.\n{ViewLinkLine(defaultView)}",
                defaultView));
        }

        if (donut && positiveTotal > 0)
        {
            var inner = pieSize / 3;
            var innerRect = new Rectangle(
                pieRect.Left + (pieSize - inner) / 2,
                pieRect.Top + (pieSize - inner) / 2,
                inner,
                inner);
            regions.Add(new SummaryChartHitRegion(
                innerRect,
                $"전체 {FormatValue(positiveTotal)}\n{section.SummaryText}\n{ViewLinkLine(defaultView)}",
                defaultView));
        }

        for (var column = 0; column < columnCount; column++)
        {
            var columnLeft = legendRect.Left + column * columnWidth;
            var y = legendRect.Top;
            var startIndex = column * maxRowsPerColumn;
            var endIndex = Math.Min(section.Slices.Count, startIndex + maxRowsPerColumn);

            for (var i = startIndex; i < endIndex; i++)
            {
                var slice = section.Slices[i];
                var row = new Rectangle(columnLeft, y, columnWidth - 4, 18);
                var percent = positiveTotal > 0 && slice.Value > 0
                    ? slice.Value / positiveTotal * 100.0
                    : 0;
                var valueText = slice.Value >= 1000 ? $"{slice.Value / 1000.0:0.#}k" : slice.Value.ToString("0.#");
                var detail = positiveTotal > 0 && slice.Value > 0
                    ? $"{slice.Label}: {valueText} ({percent:0.#}%)"
                    : $"{slice.Label}: {valueText}";
                regions.Add(new SummaryChartHitRegion(
                    row,
                    $"{detail}\n{ViewLinkLine(defaultView)}",
                    defaultView));
                y += 18;
            }
        }
    }

    private static void AddPieGridRegions(
        List<SummaryChartHitRegion> regions,
        SummarySection section,
        Rectangle bounds,
        DiagramViewKind? defaultView)
    {
        if (section.PieItems.Count == 0)
        {
            return;
        }

        var columns = Math.Max(2, (int)Math.Ceiling(Math.Sqrt(section.PieItems.Count * bounds.Width / (double)Math.Max(1, bounds.Height))));
        var rows = (int)Math.Ceiling(section.PieItems.Count / (double)columns);
        var cellWidth = Math.Max(72, bounds.Width / columns);
        var cellHeight = Math.Max(72, bounds.Height / rows);

        for (var i = 0; i < section.PieItems.Count; i++)
        {
            var item = section.PieItems[i];
            var column = i % columns;
            var row = i / columns;
            var cell = new Rectangle(
                bounds.Left + column * cellWidth,
                bounds.Top + row * cellHeight,
                cellWidth,
                cellHeight);
            if (cell.Width < 28 || cell.Height < 28)
            {
                continue;
            }

            var axisView = SummaryAreaNavigation.GetRadarAxisViewKind(item.Label) ?? defaultView;
            var total = Math.Max(1, item.Total);
            var ratio = Math.Clamp(item.Value, 0, total) / total * 100.0;
            regions.Add(new SummaryChartHitRegion(
                cell,
                $"{item.Label}: {item.Value:0.#} / {total:0.#} ({ratio:0.#}%)\n{ViewLinkLine(axisView)}",
                axisView));
        }
    }

    private static void AddRadarRegions(
        List<SummaryChartHitRegion> regions,
        SummarySection section,
        Rectangle bounds)
    {
        if (section.RadarAxes.Count == 0)
        {
            return;
        }

        var legendWidth = Math.Min(220, Math.Max(140, bounds.Width / 3));
        var plotBounds = new Rectangle(bounds.Left, bounds.Top, Math.Max(120, bounds.Width - legendWidth - 10), bounds.Height);
        var legendBounds = new Rectangle(plotBounds.Right + 8, bounds.Top + 2, legendWidth, bounds.Height - 4);

        if (section.RadarAxes.Count >= 3)
        {
            regions.Add(new SummaryChartHitRegion(
                plotBounds,
                $"품질 개선 레이더\n{section.SummaryText}\n축·범례를 클릭하면 해당 뷰로 이동합니다.",
                null));
        }

        var legendY = (float)legendBounds.Top;
        var rowHeight = Math.Max(34f, legendBounds.Height / Math.Max(1, section.RadarAxes.Count));
        foreach (var axis in section.RadarAxes)
        {
            var row = new RectangleF(legendBounds.Left, legendY, legendBounds.Width, rowHeight - 2f);
            var targetView = SummaryAreaNavigation.GetRadarAxisViewKind(axis.Label);
            var detail = string.IsNullOrWhiteSpace(axis.Detail) ? axis.Label : axis.Detail;
            regions.Add(new SummaryChartHitRegion(
                Rectangle.Round(row),
                $"{axis.Label}: {axis.Score:0.#}점 / 100\n{detail}\n{ViewLinkLine(targetView)}",
                targetView));
            legendY += rowHeight;
        }
    }

    private static Rectangle WedgeBounds(Rectangle pieRect, float startAngle, float sweep)
    {
        if (sweep >= 359.5f)
        {
            return pieRect;
        }

        var midAngle = (startAngle + sweep / 2f) * Math.PI / 180f;
        var radius = pieRect.Width / 2f;
        var cx = pieRect.Left + radius;
        var cy = pieRect.Top + radius;
        var size = Math.Max(24, (int)(radius * 0.55f));
        return new Rectangle(
            (int)(cx + Math.Cos(midAngle) * radius * 0.45f - size / 2f),
            (int)(cy + Math.Sin(midAngle) * radius * 0.45f - size / 2f),
            size,
            size);
    }

    private static string BuildCardTooltip(SummarySection section, DiagramViewKind? viewKind)
    {
        var link = ViewLinkLine(viewKind);
        return string.IsNullOrWhiteSpace(link)
            ? $"{section.Title}\n{section.SummaryText}"
            : $"{section.Title}\n{section.SummaryText}\n{link}";
    }

    private static string ViewLinkLine(DiagramViewKind? viewKind) =>
        viewKind is { } view
            ? $"클릭하면 「{SummaryAreaNavigation.GetViewLabel(view)}」 뷰로 이동합니다."
            : string.Empty;

    private static string FormatValue(double value) =>
        value >= 1000 ? $"{value / 1000.0:0.#}k" : value.ToString("0.#");
}
