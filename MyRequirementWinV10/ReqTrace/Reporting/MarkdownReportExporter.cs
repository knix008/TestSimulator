using System.Text;
using ReqTrace.Localization;

namespace ReqTrace.Reporting;

public class MarkdownReportExporter : IReportExporter
{
    public string DefaultFileExtension => ".md";

    public void Export(TraceabilityReportData data, string outputFilePath)
    {
        var sb = new StringBuilder();
        sb.AppendLine($"# {data.ProjectName} — {Loc.T("Dlg_ExportReport")}");
        sb.AppendLine();
        sb.AppendLine(Loc.T("Export_GeneratedAt", data.GeneratedUtc.ToLocalTime().ToString("yyyy-MM-dd HH:mm")));
        sb.AppendLine();

        AppendSummary(sb, data);
        AppendRequirementsTable(sb, data);
        AppendTestCasesTable(sb, data);
        AppendTraceabilityTable(sb, data);
        AppendTestCaseStepsTable(sb, data);
        AppendCategoryTable(sb, data);

        File.WriteAllText(outputFilePath, sb.ToString());
    }

    private static void AppendSummary(StringBuilder sb, TraceabilityReportData data)
    {
        sb.AppendLine($"## {Loc.T("Export_Section_Summary")}");
        sb.AppendLine();
        sb.AppendLine("| Metric | Value |");
        sb.AppendLine("|---|---|");
        sb.AppendLine($"| {Loc.T("Export_TotalRequirements")} | {data.Summary.TotalRequirements} |");
        sb.AppendLine($"| {Loc.T("Export_RequirementsWithTests")} | {data.Summary.RequirementsWithTests} |");
        sb.AppendLine($"| {Loc.T("Export_RequirementsWithoutTests")} | {data.Summary.RequirementsWithoutTests} |");
        sb.AppendLine($"| {Loc.T("Export_TotalTestCases")} | {data.Summary.TotalTestCases} |");
        sb.AppendLine($"| {Loc.Enum(Models.TestRunStatus.Pass)} | {data.Summary.PassCount} |");
        sb.AppendLine($"| {Loc.Enum(Models.TestRunStatus.Fail)} | {data.Summary.FailCount} |");
        sb.AppendLine($"| {Loc.Enum(Models.TestRunStatus.Blocked)} | {data.Summary.BlockedCount} |");
        sb.AppendLine($"| {Loc.Enum(Models.TestRunStatus.NotRun)} | {data.Summary.NotRunCount} |");
        sb.AppendLine($"| {Loc.T("Export_CoveragePercent")} | {data.Summary.CoveragePercent:F1}% |");
        sb.AppendLine($"| {Loc.T("Export_PassRatePercent")} | {data.Summary.PassRatePercent:F1}% |");
        sb.AppendLine();
    }

    private static void AppendTable(StringBuilder sb, string sectionTitle, string[] headers, IEnumerable<string[]> rows)
    {
        sb.AppendLine($"## {sectionTitle}");
        sb.AppendLine();
        sb.AppendLine("| " + string.Join(" | ", headers) + " |");
        sb.AppendLine("| " + string.Join(" | ", headers.Select(_ => "---")) + " |");

        foreach (var values in rows)
            sb.AppendLine("| " + string.Join(" | ", values.Select(Escape)) + " |");

        sb.AppendLine();
    }

    private static void AppendRequirementsTable(StringBuilder sb, TraceabilityReportData data) =>
        AppendTable(sb, Loc.T("Export_Section_Requirements"), ReportExportColumns.RequirementHeaders(),
            data.Requirements.Select(ReportExportColumns.RequirementValues));

    private static void AppendTestCasesTable(StringBuilder sb, TraceabilityReportData data)
    {
        sb.AppendLine($"## {Loc.T("Export_Section_TestCases")}");
        sb.AppendLine();
        var headers = ReportExportColumns.TestCaseHeaders();
        sb.AppendLine("| " + string.Join(" | ", headers) + " |");
        sb.AppendLine("| " + string.Join(" | ", headers.Select(_ => "---")) + " |");

        foreach (var row in data.TestCases)
        {
            var values = ReportExportColumns.TestCaseValues(row).Select(Escape);
            sb.AppendLine("| " + string.Join(" | ", values) + " |");

            foreach (var run in row.History)
            {
                sb.AppendLine($"> {row.Code} history: {Escape(Loc.Enum(run.Status))} — " +
                              $"{run.ExecutedUtc.ToLocalTime():yyyy-MM-dd HH:mm} ({Escape(run.ExecutedBy)})");
            }
        }

        sb.AppendLine();
    }

    private static void AppendTraceabilityTable(StringBuilder sb, TraceabilityReportData data) =>
        AppendTable(sb, Loc.T("Export_Section_Traceability"), ReportExportColumns.TraceabilityHeaders(),
            data.TraceabilityMatrix.Select(ReportExportColumns.TraceabilityValues));

    private static void AppendTestCaseStepsTable(StringBuilder sb, TraceabilityReportData data) =>
        AppendTable(sb, Loc.T("Export_Section_TestCaseSteps"), ReportExportColumns.TestCaseStepHeaders(),
            data.TestCaseSteps.Select(ReportExportColumns.TestCaseStepValues));

    private static void AppendCategoryTable(StringBuilder sb, TraceabilityReportData data)
    {
        sb.AppendLine($"## {Loc.T("Export_Section_ByCategory")}");
        sb.AppendLine();
        sb.AppendLine($"| {Loc.T("Col_Category")} | {Loc.T("Export_RequirementsCount")} | {Loc.T("Export_TestCasesCount")} | {Loc.T("Export_CoveragePercent")} | {Loc.T("Export_PassRatePercent")} |");
        sb.AppendLine("|---|---|---|---|---|");
        foreach (var cat in data.Categories)
            sb.AppendLine($"| {Escape(cat.Category)} | {cat.RequirementCount} | {cat.TestCaseCount} | {cat.CoveragePercent:F1}% | {cat.PassRatePercent:F1}% |");
    }

    private static string Escape(string text) => text.Replace("|", "\\|").Replace("\n", " ");
}
