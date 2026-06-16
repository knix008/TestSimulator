using System.Text;
using MyAgileBoardWinV10.Services;

namespace MyAgileBoardWinV10.Services;

public static class MarkdownReportExporter
{
    public static void Export(ProjectReportSnapshot report, string filePath)
    {
        var sb = new StringBuilder();
        sb.AppendLine($"# {Escape(report.ProjectName)}");
        sb.AppendLine();
        sb.AppendLine($"- **생성일**: {report.GeneratedAt:yyyy-MM-dd HH:mm}");
        if (!string.IsNullOrWhiteSpace(report.ProjectFilePath))
            sb.AppendLine($"- **프로젝트 파일**: `{report.ProjectFilePath}`");
        sb.AppendLine($"- **프로젝트 생성일**: {report.ProjectCreatedAt:yyyy-MM-dd}");
        sb.AppendLine();

        sb.AppendLine("## 요약");
        sb.AppendLine();
        sb.AppendLine("| 항목 | 값 |");
        sb.AppendLine("| --- | ---: |");
        sb.AppendLine($"| 전체 카드 | {report.TotalCards} |");
        sb.AppendLine($"| 완료 | {report.DoneCards} |");
        sb.AppendLine($"| 진행중/대기 | {report.RemainingCards} |");
        sb.AppendLine($"| 전체 포인트 | {report.TotalPoints} |");
        sb.AppendLine($"| 완료 포인트 | {report.DonePoints} |");
        sb.AppendLine($"| 기한 초과 | {report.OverdueCards} |");
        sb.AppendLine($"| 아카이브 | {report.ArchivedCount} |");
        sb.AppendLine();

        if (report.Charts.HasCharts)
        {
            var chartDir = Path.Combine(
                Path.GetDirectoryName(filePath) ?? ".",
                Path.GetFileNameWithoutExtension(filePath) + "_charts");
            Directory.CreateDirectory(chartDir);

            sb.AppendLine("## 차트");
            sb.AppendLine();

            if (report.Charts.ColumnPieChartPng.Length > 0)
            {
                string piePath = Path.Combine(chartDir, "summary_column_pie.png");
                File.WriteAllBytes(piePath, report.Charts.ColumnPieChartPng);
                sb.AppendLine("### 컬럼별 카드 분포");
                sb.AppendLine();
                sb.AppendLine($"![컬럼별 카드 분포]({ToRelativePath(filePath, piePath)})");
                sb.AppendLine();
            }

            if (report.Charts.PriorityBarChartPng.Length > 0)
            {
                string barPath = Path.Combine(chartDir, "summary_priority_bar.png");
                File.WriteAllBytes(barPath, report.Charts.PriorityBarChartPng);
                sb.AppendLine("### 우선순위별 카드 분포");
                sb.AppendLine();
                sb.AppendLine($"![우선순위별 카드 분포]({ToRelativePath(filePath, barPath)})");
                sb.AppendLine();
            }

            if (report.Charts.BurndownChartPng.Length > 0)
            {
                string burndownPath = Path.Combine(chartDir, "burndown.png");
                File.WriteAllBytes(burndownPath, report.Charts.BurndownChartPng);
                sb.AppendLine("### Burn Down 차트");
                sb.AppendLine();
                if (!string.IsNullOrWhiteSpace(report.Charts.BurndownCaption))
                    sb.AppendLine($"- {report.Charts.BurndownCaption}");
                sb.AppendLine();
                sb.AppendLine($"![Burn Down 차트]({ToRelativePath(filePath, burndownPath)})");
                sb.AppendLine();
            }
        }

        foreach (var column in report.Columns)
        {
            sb.AppendLine($"## {Escape(column.Name)}");
            sb.AppendLine();
            sb.AppendLine($"- 컬럼 색상: `{column.HeaderColorHex}`");
            sb.AppendLine($"- 완료 컬럼: {(column.IsCompletionColumn ? "예" : "아니오")}");
            sb.AppendLine($"- 카드 수: {column.Cards.Count}");
            sb.AppendLine();

            if (column.Cards.Count == 0)
            {
                sb.AppendLine("_카드 없음_");
                sb.AppendLine();
                continue;
            }

            foreach (var card in column.Cards)
            {
                sb.AppendLine($"### {Escape(card.Title)}");
                sb.AppendLine();
                sb.AppendLine($"- **우선순위**: {card.Priority}");
                sb.AppendLine($"- **포인트**: {card.Points}");
                if (!string.IsNullOrWhiteSpace(card.Assignee))
                    sb.AppendLine($"- **담당자**: {Escape(card.Assignee)}");
                if (!string.IsNullOrWhiteSpace(card.DueDate))
                    sb.AppendLine($"- **기한**: {card.DueDate}");
                if (!string.IsNullOrWhiteSpace(card.Tags))
                    sb.AppendLine($"- **태그**: {Escape(card.Tags)}");
                sb.AppendLine($"- **카드 색상**: `{card.CardColorHex}`");
                if (!string.IsNullOrWhiteSpace(card.CompletedAt))
                    sb.AppendLine($"- **완료일**: {card.CompletedAt}");
                if (!string.IsNullOrWhiteSpace(card.Description))
                {
                    sb.AppendLine();
                    sb.AppendLine(Escape(card.Description));
                }
                sb.AppendLine();
            }
        }

        File.WriteAllText(filePath, sb.ToString(), new UTF8Encoding(encoderShouldEmitUTF8Identifier: true));
    }

    private static string ToRelativePath(string baseFile, string targetFile)
    {
        var baseDir = Path.GetDirectoryName(baseFile) ?? ".";
        return Path.GetRelativePath(baseDir, targetFile).Replace('\\', '/');
    }

    private static string Escape(string text)
        => text.Replace("|", "\\|", StringComparison.Ordinal);
}
