using System.Drawing.Printing;

namespace MyAgileBoardWinV10.Services;

public static class ReportPrinter
{
    private static FontFamily UiFontFamily => FontFamily.GenericSansSerif;

    private static Font CreateUiFont(float size, FontStyle style = FontStyle.Regular)
        => new(UiFontFamily, size, style);

    private sealed class PrintBlock
    {
        public string Text { get; init; } = string.Empty;
        public Font? Font { get; init; }
        public Brush? Brush { get; init; }
        public float SpacingAfter { get; init; }
        public bool DrawRule { get; init; }
        public Image? Image { get; init; }
        public float ImageHeight { get; init; }
    }

    public static void ShowPreview(IWin32Window owner, ProjectReportSnapshot report)
    {
        var blocks = BuildBlocks(report);
        int blockIndex = 0;

        using var doc = new PrintDocument
        {
            DocumentName = $"{report.ProjectName} — Report"
        };

        doc.PrintPage += (_, e) =>
        {
            var g = e.Graphics!;
            g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.ClearTypeGridFit;

            float y = e.MarginBounds.Top;
            float left = e.MarginBounds.Left;
            float width = e.MarginBounds.Width;
            float bottom = e.MarginBounds.Bottom;

            while (blockIndex < blocks.Count)
            {
                var block = blocks[blockIndex];
                float height = MeasureBlock(g, block, width);
                if (y + height > bottom && blockIndex > 0)
                {
                    e.HasMorePages = true;
                    return;
                }

                DrawBlock(g, block, left, y, width);
                y += height;
                blockIndex++;
            }

            e.HasMorePages = false;
        };

        doc.EndPrint += (_, _) => blockIndex = 0;

        using var preview = new PrintPreviewDialog
        {
            Document = doc,
            WindowState = FormWindowState.Maximized,
            Text = "Report 인쇄 미리보기",
            ShowIcon = false,
            StartPosition = FormStartPosition.CenterParent
        };
        preview.ShowDialog(owner);

        foreach (var block in blocks)
            block.Image?.Dispose();
    }

    private static List<PrintBlock> BuildBlocks(ProjectReportSnapshot report)
    {
        var titleFont = CreateUiFont(18, FontStyle.Bold);
        var sectionFont = CreateUiFont(13, FontStyle.Bold);
        var cardTitleFont = CreateUiFont(11, FontStyle.Bold);
        var bodyFont = CreateUiFont(10);
        var metaFont = CreateUiFont(9);
        var metaBrush = Brushes.DimGray;

        var blocks = new List<PrintBlock>
        {
            new() { Text = report.ProjectName, Font = titleFont, SpacingAfter = 6 },
            new() { Text = $"생성일: {report.GeneratedAt:yyyy-MM-dd HH:mm}", Font = bodyFont },
        };

        if (!string.IsNullOrWhiteSpace(report.ProjectFilePath))
            blocks.Add(new() { Text = $"프로젝트 파일: {report.ProjectFilePath}", Font = bodyFont });
        blocks.Add(new() { Text = $"프로젝트 생성일: {report.ProjectCreatedAt:yyyy-MM-dd}", Font = bodyFont, SpacingAfter = 8 });
        blocks.Add(new() { Text = "요약", Font = sectionFont, SpacingAfter = 4 });
        blocks.Add(new()
        {
            Text = $"전체 카드: {report.TotalCards}   완료: {report.DoneCards}   진행중/대기: {report.RemainingCards}",
            Font = bodyFont
        });
        blocks.Add(new()
        {
            Text = $"전체 포인트: {report.TotalPoints}   완료 포인트: {report.DonePoints}   기한 초과: {report.OverdueCards}   아카이브: {report.ArchivedCount}",
            Font = bodyFont,
            SpacingAfter = 10
        });

        if (report.Charts.HasCharts)
        {
            blocks.Add(new() { Text = "차트", Font = sectionFont, SpacingAfter = 6 });

            if (report.Charts.ColumnPieChartPng.Length > 0)
            {
                blocks.Add(new() { Text = "컬럼별 카드 분포", Font = cardTitleFont, SpacingAfter = 4 });
                blocks.Add(CreateImageBlock(report.Charts.ColumnPieChartPng, 280));
            }

            if (report.Charts.PriorityBarChartPng.Length > 0)
            {
                blocks.Add(new() { Text = "우선순위별 카드 분포", Font = cardTitleFont, SpacingAfter = 4 });
                blocks.Add(CreateImageBlock(report.Charts.PriorityBarChartPng, 180));
            }

            if (report.Charts.BurndownChartPng.Length > 0)
            {
                blocks.Add(new() { Text = "Burn Down 차트", Font = cardTitleFont, SpacingAfter = 2 });
                if (!string.IsNullOrWhiteSpace(report.Charts.BurndownCaption))
                    blocks.Add(new() { Text = report.Charts.BurndownCaption, Font = metaFont, Brush = metaBrush, SpacingAfter = 4 });
                blocks.Add(CreateImageBlock(report.Charts.BurndownChartPng, 320));
            }

            blocks.Add(new() { SpacingAfter = 8 });
        }

        foreach (var column in report.Columns)
        {
            blocks.Add(new() { Text = column.Name, Font = sectionFont, SpacingAfter = 2 });
            blocks.Add(new()
            {
                Text = $"카드 {column.Cards.Count}개 · {(column.IsCompletionColumn ? "완료 컬럼" : "일반 컬럼")}",
                Font = metaFont,
                Brush = metaBrush,
                SpacingAfter = 6
            });

            if (column.Cards.Count == 0)
            {
                blocks.Add(new() { Text = "(카드 없음)", Font = metaFont, Brush = metaBrush, SpacingAfter = 8 });
                continue;
            }

            foreach (var card in column.Cards)
            {
                blocks.Add(new() { Text = card.Title, Font = cardTitleFont, SpacingAfter = 2 });

                var meta = $"우선순위: {card.Priority}   포인트: {card.Points}";
                if (!string.IsNullOrWhiteSpace(card.Assignee))
                    meta += $"   담당자: {card.Assignee}";
                if (!string.IsNullOrWhiteSpace(card.DueDate))
                    meta += $"   기한: {card.DueDate}";
                blocks.Add(new() { Text = meta, Font = metaFont, Brush = metaBrush });

                if (!string.IsNullOrWhiteSpace(card.Tags))
                    blocks.Add(new() { Text = $"태그: {card.Tags}", Font = metaFont, Brush = metaBrush });
                if (!string.IsNullOrWhiteSpace(card.CompletedAt))
                    blocks.Add(new() { Text = $"완료일: {card.CompletedAt}", Font = metaFont, Brush = metaBrush });

                if (!string.IsNullOrWhiteSpace(card.Description))
                    blocks.Add(new() { Text = card.Description, Font = bodyFont, SpacingAfter = 2 });

                blocks.Add(new() { DrawRule = true, SpacingAfter = 6 });
            }

            blocks.Add(new() { SpacingAfter = 6 });
        }

        blocks.Add(new()
        {
            Text = $"MyAgileBoard — {report.GeneratedAt:yyyy-MM-dd HH:mm}",
            Font = metaFont,
            Brush = metaBrush
        });

        return blocks;
    }

    private static PrintBlock CreateImageBlock(byte[] pngBytes, float targetHeight)
    {
        using var ms = new MemoryStream(pngBytes);
        var src = Image.FromStream(ms);
        float aspect = src.Width / (float)src.Height;
        float height = targetHeight;
        float width = height * aspect;
        var bmp = new Bitmap((int)width, (int)height);
        using (var g = Graphics.FromImage(bmp))
        {
            g.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
            g.DrawImage(src, 0, 0, width, height);
        }
        return new PrintBlock { Image = bmp, ImageHeight = height, SpacingAfter = 8 };
    }

    private static float MeasureBlock(Graphics g, PrintBlock block, float width)
    {
        if (block.Image != null)
            return block.ImageHeight + block.SpacingAfter;

        if (block.DrawRule)
            return 6 + block.SpacingAfter;

        var font = block.Font ?? CreateUiFont(10);
        float textHeight = string.IsNullOrEmpty(block.Text)
            ? 0
            : g.MeasureString(block.Text, font, (int)width).Height;
        return textHeight + block.SpacingAfter;
    }

    private static void DrawBlock(Graphics g, PrintBlock block, float left, float y, float width)
    {
        if (block.Image != null)
        {
            float drawWidth = Math.Min(width, block.Image.Width);
            float drawHeight = block.ImageHeight;
            g.DrawImage(block.Image, left, y, drawWidth, drawHeight);
            return;
        }

        if (block.DrawRule)
        {
            using var pen = new Pen(Color.LightGray);
            g.DrawLine(pen, left, y + 2, left + width, y + 2);
            return;
        }

        if (string.IsNullOrEmpty(block.Text)) return;

        var font = block.Font ?? CreateUiFont(10);
        var brush = block.Brush ?? Brushes.Black;
        g.DrawString(block.Text, font, brush, new RectangleF(left, y, width, 10000));
    }
}
