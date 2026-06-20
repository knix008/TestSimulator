using ReqTrace.Models;

namespace ReqTrace.Reporting;

public enum ExportScope
{
    All,
    OnlyWithTestCases
}

public class SummaryStats
{
    public int TotalRequirements { get; set; }
    public int RequirementsWithTests { get; set; }
    public int RequirementsWithoutTests { get; set; }
    public int TotalTestCases { get; set; }
    public int PassCount { get; set; }
    public int FailCount { get; set; }
    public int BlockedCount { get; set; }
    public int NotRunCount { get; set; }
    public double CoveragePercent { get; set; }
    public double PassRatePercent { get; set; }
}

public class RequirementReportRow
{
    public string RequirementCode { get; set; } = string.Empty;
    public string RequirementTitle { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty;
    public Priority Priority { get; set; }
    public RequirementStatus RequirementStatus { get; set; }
    public string TestCaseCode { get; set; } = string.Empty;
    public string TestCaseTitle { get; set; } = string.Empty;
    public TestRunStatus LatestRunStatus { get; set; }
    public DateTime? LatestRunDate { get; set; }
    public List<TestRun> History { get; set; } = new();
}

public class CategorySummary
{
    public string Category { get; set; } = string.Empty;
    public int RequirementCount { get; set; }
    public int TestCaseCount { get; set; }
    public double CoveragePercent { get; set; }
    public double PassRatePercent { get; set; }
}

public class TraceabilityReportData
{
    public string ProjectName { get; set; } = string.Empty;
    public DateTime GeneratedUtc { get; set; } = DateTime.UtcNow;
    public SummaryStats Summary { get; set; } = new();
    public List<RequirementReportRow> Rows { get; set; } = new();
    public List<CategorySummary> Categories { get; set; } = new();
}
