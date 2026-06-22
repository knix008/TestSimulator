using ReqTrace.Localization;
using ReqTrace.Models;

namespace ReqTrace.Reporting;

public static class ReportDataBuilder
{
    public static TraceabilityReportData Build(ProjectData project, ExportScope scope, bool includeHistory)
    {
        var requirements = scope == ExportScope.OnlyWithTestCases
            ? project.Requirements.Where(r => r.TestCases.Count > 0).ToList()
            : project.Requirements.ToList();

        var byId = requirements.ToDictionary(r => r.Id);
        var data = new TraceabilityReportData
        {
            ProjectName = project.ProjectName
        };

        foreach (var req in OrderForExport(requirements))
        {
            var requirementRow = CreateRequirementRow(req, byId);
            data.Requirements.Add(requirementRow);

            if (req.TestCases.Count == 0)
            {
                data.TraceabilityMatrix.Add(CreateMatrixRow(req.Code, requirementRow, null));
                continue;
            }

            foreach (var testCase in req.TestCases.OrderBy(t => t.Code, StringComparer.OrdinalIgnoreCase))
            {
                var testCaseRow = CreateTestCaseRow(req.Code, testCase, includeHistory);
                data.TestCases.Add(testCaseRow);
                data.TraceabilityMatrix.Add(CreateMatrixRow(req.Code, requirementRow, testCaseRow));

                foreach (var step in testCase.Steps.OrderBy(s => s.Order))
                {
                    data.TestCaseSteps.Add(new TestCaseStepRow
                    {
                        RequirementCode = req.Code,
                        TestCaseCode = testCase.Code,
                        StepOrder = step.Order,
                        Action = step.Action,
                        ExpectedOutcome = step.ExpectedOutcome
                    });
                }
            }
        }

        var allCases = requirements.SelectMany(r => r.TestCases).ToList();
        data.Summary = new SummaryStats
        {
            TotalRequirements = requirements.Count,
            RequirementsWithTests = requirements.Count(r => r.TestCases.Count > 0),
            RequirementsWithoutTests = requirements.Count(r => r.TestCases.Count == 0),
            TotalTestCases = allCases.Count,
            PassCount = allCases.Count(tc => tc.LatestStatus == TestRunStatus.Pass),
            FailCount = allCases.Count(tc => tc.LatestStatus == TestRunStatus.Fail),
            BlockedCount = allCases.Count(tc => tc.LatestStatus == TestRunStatus.Blocked),
            NotRunCount = allCases.Count(tc => tc.LatestStatus == TestRunStatus.NotRun),
            CoveragePercent = requirements.Count == 0 ? 0 : 100.0 * requirements.Count(r => r.TestCases.Count > 0) / requirements.Count,
            PassRatePercent = allCases.Count == 0 ? 0 : 100.0 * allCases.Count(tc => tc.LatestStatus == TestRunStatus.Pass) / allCases.Count
        };

        foreach (var group in requirements.GroupBy(r => string.IsNullOrWhiteSpace(r.Category) ? Loc.T("Export_Uncategorized") : r.Category).OrderBy(g => g.Key))
        {
            var groupCases = group.SelectMany(r => r.TestCases).ToList();
            data.Categories.Add(new CategorySummary
            {
                Category = group.Key,
                RequirementCount = group.Count(),
                TestCaseCount = groupCases.Count,
                CoveragePercent = group.Count() == 0 ? 0 : 100.0 * group.Count(r => r.TestCases.Count > 0) / group.Count(),
                PassRatePercent = groupCases.Count == 0 ? 0 : 100.0 * groupCases.Count(tc => tc.LatestStatus == TestRunStatus.Pass) / groupCases.Count
            });
        }

        return data;
    }

    private static IEnumerable<Requirement> OrderForExport(IReadOnlyList<Requirement> requirements)
    {
        return requirements
            .OrderBy(r => string.IsNullOrWhiteSpace(r.Category) ? Loc.T("Export_Uncategorized") : r.Category, StringComparer.OrdinalIgnoreCase)
            .ThenBy(r => r.Code, StringComparer.OrdinalIgnoreCase);
    }

    private static RequirementListRow CreateRequirementRow(Requirement req, IReadOnlyDictionary<Guid, Requirement> byId) =>
        new()
        {
            Code = FormatExportCode(req, byId),
            Category = req.Category,
            Title = req.Title,
            Description = req.Description,
            Priority = Loc.Enum(req.Priority),
            RequirementStatus = Loc.Enum(req.Status),
            TestStatus = Loc.Enum(req.AggregateStatus),
            AggregateTestStatus = req.AggregateStatus,
            Source = req.Source,
            ParentCode = GetParentCode(req, byId)
        };

    private static TestCaseReportRow CreateTestCaseRow(string requirementCode, TestCase testCase, bool includeHistory) =>
        new()
        {
            RequirementCode = requirementCode,
            Code = testCase.Code,
            Title = testCase.Title,
            Preconditions = testCase.Preconditions,
            Steps = testCase.Steps.Count.ToString(),
            StepsDetail = FormatStepsDetail(testCase.Steps),
            ExpectedResult = testCase.ExpectedResult,
            LatestStatus = Loc.Enum(testCase.LatestStatus),
            LatestStatusValue = testCase.LatestStatus,
            LastRun = testCase.LatestRun?.ExecutedUtc.ToLocalTime().ToString("yyyy-MM-dd HH:mm") ?? "-",
            LastRunBy = testCase.LatestRun?.ExecutedBy ?? "-",
            History = includeHistory
                ? testCase.Runs.OrderByDescending(r => r.ExecutedUtc).ToList()
                : []
        };

    private static TraceabilityMatrixRow CreateMatrixRow(string requirementCode, RequirementListRow requirement, TestCaseReportRow? testCase)
    {
        var row = new TraceabilityMatrixRow
        {
            RequirementCode = requirementCode,
            Category = requirement.Category,
            RequirementTitle = requirement.Title,
            Description = requirement.Description,
            Priority = requirement.Priority,
            RequirementStatus = requirement.RequirementStatus,
            RequirementTestStatus = requirement.TestStatus,
            RequirementAggregateStatus = requirement.AggregateTestStatus,
            Source = requirement.Source,
            ParentCode = requirement.ParentCode
        };

        if (testCase is null)
        {
            row.TestCaseCode = Loc.T("Export_NoTestCase");
            return row;
        }

        row.TestCaseCode = testCase.Code;
        row.TestCaseTitle = testCase.Title;
        row.Preconditions = testCase.Preconditions;
        row.Steps = testCase.Steps;
        row.StepsDetail = testCase.StepsDetail;
        row.ExpectedResult = testCase.ExpectedResult;
        row.LatestStatus = testCase.LatestStatus;
        row.LatestStatusValue = testCase.LatestStatusValue;
        row.LastRun = testCase.LastRun;
        row.LastRunBy = testCase.LastRunBy;
        return row;
    }

    private static string FormatStepsDetail(IReadOnlyList<TestStep> steps)
    {
        if (steps.Count == 0)
            return string.Empty;

        return string.Join(
            Environment.NewLine,
            steps
                .OrderBy(step => step.Order)
                .Select(step => $"{step.Order}. {step.Action} => {step.ExpectedOutcome}"));
    }

    private static string GetParentCode(Requirement requirement, IReadOnlyDictionary<Guid, Requirement> byId) =>
        requirement.ParentId is { } parentId && byId.TryGetValue(parentId, out var parent)
            ? parent.Code
            : string.Empty;

    private static string FormatExportCode(Requirement requirement, IReadOnlyDictionary<Guid, Requirement> byId)
    {
        var depth = GetHierarchyDepth(requirement, byId);
        return depth > 0
            ? new string(' ', depth * 3) + "↳ " + requirement.Code
            : requirement.Code;
    }

    private static int GetHierarchyDepth(Requirement requirement, IReadOnlyDictionary<Guid, Requirement> byId)
    {
        var depth = 0;
        var current = requirement;
        var visited = new HashSet<Guid> { requirement.Id };

        while (current.ParentId is Guid parentId
               && byId.TryGetValue(parentId, out var parent)
               && visited.Add(parent.Id))
        {
            depth++;
            current = parent;
        }

        return depth;
    }
}
