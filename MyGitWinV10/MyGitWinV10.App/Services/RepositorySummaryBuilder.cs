using LibGit2Sharp;

namespace MyGitWinV10.App.Services;

public static class RepositorySummaryBuilder
{
    private const int DefaultRecentCommitCount = 25;

    public static RepositorySummary Build(
        Repository repo,
        string repositoryPath,
        IReadOnlyList<RepositoryReleaseSummary>? releases = null,
        int recentCommitCount = DefaultRecentCommitCount)
    {
        string trimmedPath = repositoryPath.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        string name = Path.GetFileName(trimmedPath);
        if (string.IsNullOrEmpty(name))
        {
            name = trimmedPath;
        }

        var head = repo.Head?.Tip;
        var localBranches = repo.Branches
            .Where(b => !b.IsRemote)
            .OrderBy(b => b.FriendlyName)
            .Select(FormatBranchLine)
            .ToList();

        var remoteBranches = repo.Branches
            .Where(b => b.IsRemote)
            .OrderBy(b => b.FriendlyName)
            .Select(FormatBranchLine)
            .ToList();

        var remotes = repo.Network.Remotes
            .OrderBy(r => r.Name)
            .Select(r => $"{r.Name}  ({r.Url})")
            .ToList();

        var tags = repo.Tags
            .OrderBy(t => t.FriendlyName)
            .Select(t => t.FriendlyName)
            .ToList();

        var recentCommits = repo.Commits.QueryBy(new CommitFilter
        {
            IncludeReachableFrom = repo.Head,
            SortBy = CommitSortStrategies.Topological | CommitSortStrategies.Time
        })
            .Take(recentCommitCount)
            .Select(commit => new RepositoryCommitSummary
            {
                ShortSha = commit.Sha[..7],
                Message = commit.MessageShort,
                Author = commit.Author.Name,
                Date = commit.Author.When
            })
            .ToList();

        return new RepositorySummary
        {
            RepositoryName = name,
            RepositoryPath = repositoryPath,
            CurrentBranch = repo.Head?.FriendlyName ?? "(no branch)",
            HeadCommitSha = head?.Sha[..10],
            HeadCommitMessage = head?.MessageShort,
            HeadCommitAuthor = head is null ? null : $"{head.Author.Name} <{head.Author.Email}>",
            HeadCommitDate = head?.Author.When,
            LocalBranches = localBranches,
            RemoteBranches = remoteBranches,
            Remotes = remotes,
            Tags = tags,
            Releases = releases ?? [],
            RecentCommits = recentCommits,
            GeneratedAt = DateTime.Now
        };
    }

    private static string FormatBranchLine(Branch branch)
    {
        string current = branch.IsCurrentRepositoryHead ? " *" : string.Empty;
        string tip = branch.Tip is { } commit ? $"  ({commit.Sha[..7]}  {commit.MessageShort})" : string.Empty;
        return $"{branch.FriendlyName}{current}{tip}";
    }
}
