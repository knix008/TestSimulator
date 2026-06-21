using LibGit2Sharp;
using MyGitWinV10.App.Services;

namespace HistoryProbe;

internal static class Program
{
    private static void Main()
    {
        string? discovered = Repository.Discover(@"d:\Home\Projects\TestSimulator");
        if (discovered is null)
        {
            Console.WriteLine("No repo");
            return;
        }

        using var repo = new Repository(discovered);
        string testPath = "MyGitWinV10/MyGitWinV10.App/MainForm.cs";
        Console.WriteLine($"Tree blob: {repo.Head.Tip.Tree[testPath]?.Target is Blob}");
        try
        {
            var idx = repo.Index[testPath];
            Console.WriteLine($"Index entry: {idx is not null}");
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Index ex: {ex.GetType().Name}: {ex.Message}");
        }

        try
        {
            var filter = new CommitFilter
            {
                IncludeReachableFrom = repo.Head,
                SortBy = CommitSortStrategies.Topological | CommitSortStrategies.Time
            };
            int allCount = repo.Commits.QueryBy(filter).Count();
            Console.WriteLine($"All commits: {allCount}");
            Console.WriteLine($"CanShowLog: {PathCommitHistoryService.CanShowLog(repo, testPath, false)}");
            Console.WriteLine($"File commits: {PathCommitHistoryService.GetCommits(repo, testPath, false).Count}");
            Console.WriteLine($"App dir commits: {PathCommitHistoryService.GetCommits(repo, "MyGitWinV10/MyGitWinV10.App", true).Count}");
            Console.WriteLine($"Root MyGitWinV10 dir commits: {PathCommitHistoryService.GetCommits(repo, "MyGitWinV10", true).Count}");
        }
        catch (Exception ex)
        {
            Console.WriteLine($"CanShowLog/GetCommits ex: {ex}");
        }
    }
}
