namespace MyGitWinV10.App.Services;

public sealed class RepositorySummary
{
    public required string RepositoryName { get; init; }

    public required string RepositoryPath { get; init; }

    public required string CurrentBranch { get; init; }

    public string? HeadCommitSha { get; init; }

    public string? HeadCommitMessage { get; init; }

    public string? HeadCommitAuthor { get; init; }

    public DateTimeOffset? HeadCommitDate { get; init; }

    public IReadOnlyList<string> LocalBranches { get; init; } = [];

    public IReadOnlyList<string> RemoteBranches { get; init; } = [];

    public IReadOnlyList<string> Remotes { get; init; } = [];

    public IReadOnlyList<string> Tags { get; init; } = [];

    public IReadOnlyList<RepositoryReleaseSummary> Releases { get; init; } = [];

    public IReadOnlyList<RepositoryCommitSummary> RecentCommits { get; init; } = [];

    public IReadOnlyList<RepositoryChartImage> Charts { get; init; } = [];

    public DateTime GeneratedAt { get; init; } = DateTime.Now;
}

public sealed class RepositoryReleaseSummary
{
    public required string Name { get; init; }

    public required string TagName { get; init; }

    public DateTimeOffset? PublishedAt { get; init; }
}

public sealed class RepositoryCommitSummary
{
    public required string ShortSha { get; init; }

    public required string Message { get; init; }

    public required string Author { get; init; }

    public DateTimeOffset Date { get; init; }
}
