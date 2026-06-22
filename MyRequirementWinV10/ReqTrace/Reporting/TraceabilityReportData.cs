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

public class RequirementListRow
{
    public string Code { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string Priority { get; set; } = string.Empty;
    public string RequirementStatus { get; set; } = string.Empty;
    public string TestStatus { get; set; } = string.Empty;
    public TestRunStatus AggregateTestStatus { get; set; } = TestRunStatus.NotRun;
    public string Source { get; set; } = string.Empty;
    public string ParentCode { get; set; } = string.Empty;
}

public class TestCaseReportRow
{
    public string RequirementCode { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string Preconditions { get; set; } = string.Empty;
    public string Steps { get; set; } = string.Empty;
    public string StepsDetail { get; set; } = string.Empty;
    public string ExpectedResult { get; set; } = string.Empty;
    public string LatestStatus { get; set; } = string.Empty;
    public TestRunStatus LatestStatusValue { get; set; } = TestRunStatus.NotRun;
    public string LastRun { get; set; } = string.Empty;
    public string LastRunBy { get; set; } = string.Empty;
    public List<TestRun> History { get; set; } = new();
}

public class TraceabilityMatrixRow
{
    public string RequirementCode { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty;
    public string RequirementTitle { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string Priority { get; set; } = string.Empty;
    public string RequirementStatus { get; set; } = string.Empty;
    public string RequirementTestStatus { get; set; } = string.Empty;
    public TestRunStatus RequirementAggregateStatus { get; set; } = TestRunStatus.NotRun;
    public string Source { get; set; } = string.Empty;
    public string ParentCode { get; set; } = string.Empty;
    public string TestCaseCode { get; set; } = string.Empty;
    public string TestCaseTitle { get; set; } = string.Empty;
    public string Preconditions { get; set; } = string.Empty;
    public string Steps { get; set; } = string.Empty;
    public string StepsDetail { get; set; } = string.Empty;
    public string ExpectedResult { get; set; } = string.Empty;
    public string LatestStatus { get; set; } = string.Empty;
    public TestRunStatus LatestStatusValue { get; set; } = TestRunStatus.NotRun;
    public string LastRun { get; set; } = string.Empty;
    public string LastRunBy { get; set; } = string.Empty;
}

public class TestCaseStepRow
{
    public string RequirementCode { get; set; } = string.Empty;
    public string TestCaseCode { get; set; } = string.Empty;
    public int StepOrder { get; set; }
    public string Action { get; set; } = string.Empty;
    public string ExpectedOutcome { get; set; } = string.Empty;
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
    public List<RequirementListRow> Requirements { get; set; } = new();
    public List<TestCaseReportRow> TestCases { get; set; } = new();
    public List<TraceabilityMatrixRow> TraceabilityMatrix { get; set; } = new();
    public List<TestCaseStepRow> TestCaseSteps { get; set; } = new();
    public List<CategorySummary> Categories { get; set; } = new();
}
