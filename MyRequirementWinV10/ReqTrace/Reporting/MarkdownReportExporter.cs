using System.Text;

namespace ReqTrace.Reporting;

public class MarkdownReportExporter : IReportExporter
{
    public string DefaultFileExtension => ".md";

    public void Export(TraceabilityReportData data, string outputFilePath)
    {
        var sb = new StringBuilder();
        sb.AppendLine($"# {data.ProjectName} — Traceability Report");
        sb.AppendLine();
        sb.AppendLine($"Generated: {data.GeneratedUtc.ToLocalTime():yyyy-MM-dd HH:mm}");
        sb.AppendLine();

        sb.AppendLine("## Summary");
        sb.AppendLine();
        sb.AppendLine("| Metric | Value |");
        sb.AppendLine("|---|---|");
        sb.AppendLine($"| Total Requirements | {data.Summary.TotalRequirements} |");
        sb.AppendLine($"| Requirements With Tests | {data.Summary.RequirementsWithTests} |");
        sb.AppendLine($"| Requirements Without Tests | {data.Summary.RequirementsWithoutTests} |");
        sb.AppendLine($"| Total Test Cases | {data.Summary.TotalTestCases} |");
        sb.AppendLine($"| Pass | {data.Summary.PassCount} |");
        sb.AppendLine($"| Fail | {data.Summary.FailCount} |");
        sb.AppendLine($"| Blocked | {data.Summary.BlockedCount} |");
        sb.AppendLine($"| Not Run | {data.Summary.NotRunCount} |");
        sb.AppendLine($"| Coverage | {data.Summary.CoveragePercent:F1}% |");
        sb.AppendLine($"| Pass Rate | {data.Summary.PassRatePercent:F1}% |");
        sb.AppendLine();

        sb.AppendLine("## Traceability Matrix");
        sb.AppendLine();
        sb.AppendLine("| Req Code | Req Title | Category | Priority | Test Case | Status | Last Run |");
        sb.AppendLine("|---|---|---|---|---|---|---|");
        foreach (var row in data.Rows)
        {
            sb.AppendLine($"| {row.RequirementCode} | {Escape(row.RequirementTitle)} | {row.Category} | {row.Priority} | " +
                          $"{(string.IsNullOrEmpty(row.TestCaseCode) ? "(no test case)" : $"{row.TestCaseCode} - {Escape(row.TestCaseTitle)}")} | " +
                          $"{row.LatestRunStatus} | {(row.LatestRunDate.HasValue ? row.LatestRunDate.Value.ToLocalTime().ToString("yyyy-MM-dd HH:mm") : "-")} |");

            if (row.History.Count > 0)
            {
                foreach (var run in row.History)
                    sb.AppendLine($"|   |   |   |   | _history_ | {run.Status} | {run.ExecutedUtc.ToLocalTime():yyyy-MM-dd HH:mm} ({run.ExecutedBy}) |");
            }
        }
        sb.AppendLine();

        sb.AppendLine("## Coverage by Category");
        sb.AppendLine();
        sb.AppendLine("| Category | Requirements | Test Cases | Coverage | Pass Rate |");
        sb.AppendLine("|---|---|---|---|---|");
        foreach (var cat in data.Categories)
            sb.AppendLine($"| {cat.Category} | {cat.RequirementCount} | {cat.TestCaseCount} | {cat.CoveragePercent:F1}% | {cat.PassRatePercent:F1}% |");

        File.WriteAllText(outputFilePath, sb.ToString());
    }

    private static string Escape(string text) => text.Replace("|", "\\|").Replace("\n", " ");
}
