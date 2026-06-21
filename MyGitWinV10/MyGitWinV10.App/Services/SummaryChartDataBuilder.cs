using LibGit2Sharp;

namespace MyGitWinV10.App.Services;

public static class SummaryChartDataBuilder
{
    private const int ChartCommitSampleSize = 500;
    private const int MaxCommitGraphRows = 40;
    private const int MaxAuthors = 8;
    private const int ActivityMonthCount = 12;

    public static SummaryChartData Build(Repository repo, RepositorySummary summary)
    {
        var commits = repo.Commits.QueryBy(new CommitFilter
        {
            IncludeReachableFrom = repo.Head,
            SortBy = CommitSortStrategies.Topological | CommitSortStrategies.Time
        })
            .Take(ChartCommitSampleSize)
            .ToList();

        var graphRows = CommitGraphBuilder.Build(commits).Take(MaxCommitGraphRows).ToList();

        return new SummaryChartData
        {
            CommitsByMonth = BuildCommitsByMonth(commits),
            CommitsByAuthor = BuildCommitsByAuthor(commits),
            RepositoryComposition = BuildRepositoryComposition(summary),
            CommitGraphRows = graphRows
        };
    }

    private static IReadOnlyList<ChartSeriesPoint> BuildCommitsByMonth(IReadOnlyList<Commit> commits)
    {
        if (commits.Count == 0)
        {
            return [];
        }

        var monthCounts = commits
            .GroupBy(commit => new DateTime(commit.Author.When.Year, commit.Author.When.Month, 1))
            .ToDictionary(group => group.Key, group => group.Count());

        var latestMonth = monthCounts.Keys.Max();
        var points = new List<ChartSeriesPoint>();
        for (int i = ActivityMonthCount - 1; i >= 0; i--)
        {
            var month = latestMonth.AddMonths(-i);
            monthCounts.TryGetValue(month, out int count);
            points.Add(new ChartSeriesPoint
            {
                Label = month.ToString("yyyy-MM"),
                Value = count
            });
        }

        return points;
    }

    private static IReadOnlyList<ChartSeriesPoint> BuildCommitsByAuthor(IReadOnlyList<Commit> commits) =>
        commits
            .GroupBy(commit => commit.Author.Name)
            .OrderByDescending(group => group.Count())
            .Take(MaxAuthors)
            .Select(group => new ChartSeriesPoint
            {
                Label = group.Key,
                Value = group.Count()
            })
            .ToList();

    private static IReadOnlyList<ChartSeriesPoint> BuildRepositoryComposition(RepositorySummary summary) =>
    [
        new() { Label = "Local branches", Value = summary.LocalBranches.Count },
        new() { Label = "Remote branches", Value = summary.RemoteBranches.Count },
        new() { Label = "Tags", Value = summary.Tags.Count },
        new() { Label = "Releases", Value = summary.Releases.Count }
    ];
}
