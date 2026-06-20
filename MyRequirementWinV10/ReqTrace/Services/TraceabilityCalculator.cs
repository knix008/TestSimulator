using ReqTrace.Models;

namespace ReqTrace.Services;

public static class TraceabilityCalculator
{
    public static int TotalTestCases(ProjectData project) =>
        project.Requirements.Sum(r => r.TestCases.Count);

    public static int RequirementsWithTests(ProjectData project) =>
        project.Requirements.Count(r => r.TestCases.Count > 0);

    public static double CoveragePercent(ProjectData project)
    {
        if (project.Requirements.Count == 0)
            return 0;
        return 100.0 * RequirementsWithTests(project) / project.Requirements.Count;
    }

    public static double PassRatePercent(ProjectData project)
    {
        var allCases = project.Requirements.SelectMany(r => r.TestCases).ToList();
        if (allCases.Count == 0)
            return 0;
        var passCount = allCases.Count(tc => tc.LatestStatus == TestRunStatus.Pass);
        return 100.0 * passCount / allCases.Count;
    }
}
