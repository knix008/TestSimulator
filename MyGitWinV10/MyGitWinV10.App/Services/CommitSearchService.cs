using LibGit2Sharp;

namespace MyGitWinV10.App.Services;

public sealed record CommitSearchResult(
    string Sha,
    string ShortSha,
    string MessageShort,
    string Author,
    string DateDisplay);

public static class CommitSearchService
{
    public const int DefaultMaxResults = 200;
    public const int MinimumQueryLength = 2;

    public static IReadOnlyList<CommitSearchResult> Search(
        Repository repo,
        string query,
        int maxResults = DefaultMaxResults,
        CancellationToken cancellationToken = default)
    {
        string trimmed = query.Trim();
        if (trimmed.Length < MinimumQueryLength || repo.Head?.Tip is null)
        {
            return [];
        }

        bool shaSearch = IsLikelyShaSearch(trimmed);
        var results = new List<CommitSearchResult>(Math.Min(maxResults, 32));

        foreach (Commit commit in repo.Commits.QueryBy(new CommitFilter
        {
            IncludeReachableFrom = repo.Head,
            SortBy = CommitSortStrategies.Topological | CommitSortStrategies.Time
        }))
        {
            cancellationToken.ThrowIfCancellationRequested();

            if (!Matches(commit, trimmed, shaSearch))
            {
                continue;
            }

            results.Add(ToResult(commit));
            if (results.Count >= maxResults)
            {
                break;
            }
        }

        return results;
    }

    private static bool IsLikelyShaSearch(string query) =>
        query.Length >= 4 && query.All(static c => char.IsAsciiHexDigit(c));

    private static bool Matches(Commit commit, string query, bool shaSearch)
    {
        if (shaSearch
            && commit.Sha.StartsWith(query, StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        if (commit.MessageShort.Contains(query, StringComparison.OrdinalIgnoreCase)
            || commit.Message.Contains(query, StringComparison.OrdinalIgnoreCase)
            || commit.Author.Name.Contains(query, StringComparison.OrdinalIgnoreCase)
            || commit.Author.Email.Contains(query, StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        return false;
    }

    private static CommitSearchResult ToResult(Commit commit) =>
        new(
            commit.Sha,
            commit.Sha.Length <= 7 ? commit.Sha : commit.Sha[..7],
            commit.MessageShort.Trim(),
            commit.Author.Name,
            commit.Author.When.ToString("yyyy-MM-dd HH:mm"));
}
