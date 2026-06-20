using ReqTrace.Models;

namespace ReqTrace.Reporting;

public static class ReportDataBuilder
{
    public static TraceabilityReportData Build(ProjectData project, ExportScope scope, bool includeHistory)
    {
        var requirements = scope == ExportScope.OnlyWithTestCases
            ? project.Requirements.Where(r => r.TestCases.Count > 0).ToList()
            : project.Requirements.ToList();

        var data = new TraceabilityReportData
        {
            ProjectName = project.ProjectName
        };

        foreach (var req in requirements.OrderBy(r => r.Code))
        {
            if (req.TestCases.Count == 0)
            {
                data.Rows.Add(new RequirementReportRow
                {
                    RequirementCode = req.Code,
                    RequirementTitle = req.Title,
                    Category = req.Category,
                    Priority = req.Priority,
                    RequirementStatus = req.Status,
                    LatestRunStatus = TestRunStatus.NotRun
                });
                continue;
            }

            foreach (var tc in req.TestCases.OrderBy(t => t.Code))
            {
                data.Rows.Add(new RequirementReportRow
                {
                    RequirementCode = req.Code,
                    RequirementTitle = req.Title,
                    Category = req.Category,
                    Priority = req.Priority,
                    RequirementStatus = req.Status,
                    TestCaseCode = tc.Code,
                    TestCaseTitle = tc.Title,
                    LatestRunStatus = tc.LatestStatus,
                    LatestRunDate = tc.LatestRun?.ExecutedUtc,
                    History = includeHistory ? tc.Runs.OrderByDescending(r => r.ExecutedUtc).ToList() : new List<TestRun>()
                });
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

        foreach (var group in requirements.GroupBy(r => string.IsNullOrWhiteSpace(r.Category) ? "(Uncategorized)" : r.Category).OrderBy(g => g.Key))
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
}
