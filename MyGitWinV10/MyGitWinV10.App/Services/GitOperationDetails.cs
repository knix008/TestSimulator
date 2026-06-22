using LibGit2Sharp;

namespace MyGitWinV10.App.Services;

public readonly record struct GitOperationDetailItem(string Label, string Value);

public static class GitOperationDetails
{
    private const int MaxListedPaths = 40;

    public static IReadOnlyList<GitOperationDetailItem> CommonRepository(Repository repo) =>
    [
        new("Repository", FormatRepositoryPath(repo)),
        new("Branch", repo.Head?.FriendlyName ?? "(detached)")
    ];

    public static IReadOnlyList<GitOperationDetailItem> ForReset(
        Repository repo,
        string relativePath,
        IReadOnlyList<string> unstagedPaths)
    {
        var details = new List<GitOperationDetailItem>(CommonRepository(repo))
        {
            new("Path", FormatPathScope(relativePath)),
            new("Unstaged paths", FormatPathList(unstagedPaths))
        };
        return details;
    }

    public static IReadOnlyList<GitOperationDetailItem> ForDiscard(
        Repository repo,
        string relativePath,
        IReadOnlyList<GitStatusEntry> discardedEntries)
    {
        var details = new List<GitOperationDetailItem>(CommonRepository(repo))
        {
            new("Path", FormatPathScope(relativePath)),
            new("Discarded changes", FormatStatusEntries(discardedEntries))
        };
        return details;
    }

    public static IReadOnlyList<GitOperationDetailItem> ForCommit(Repository repo, Commit commit)
    {
        var details = new List<GitOperationDetailItem>(CommonRepository(repo))
        {
            new("Commit", commit.Sha),
            new("Short SHA", FormatSha(commit.Sha)),
            new("Author", $"{commit.Author.Name} <{commit.Author.Email}>"),
            new("Date", commit.Author.When.ToString("yyyy-MM-dd HH:mm:ss zzz")),
            new("Message", commit.Message.Trim()),
            new("Parent", commit.Parents.FirstOrDefault()?.Sha is { } parentSha ? FormatSha(parentSha) : "(root commit)")
        };

        IReadOnlyList<string> changedPaths = GetCommitChangedPaths(repo, commit);
        details.Add(new("Changed files", FormatPathList(changedPaths)));
        return details;
    }

    public static IReadOnlyList<GitOperationDetailItem> ForFetch(
        Repository repo,
        IReadOnlyDictionary<string, string> remoteTipsBefore,
        IReadOnlyDictionary<string, string> remoteTipsAfter)
    {
        var details = new List<GitOperationDetailItem>(CommonRepository(repo))
        {
            new("Remote", "origin"),
            new("Remote URL", FormatOriginUrl(repo)),
            new("Updates", FormatRemoteTipChanges(remoteTipsBefore, remoteTipsAfter))
        };
        return details;
    }

    public static IReadOnlyList<GitOperationDetailItem> ForPull(
        Repository repo,
        MergeResult result,
        string? headShaBefore,
        string? headShaAfter)
    {
        var details = new List<GitOperationDetailItem>(CommonRepository(repo))
        {
            new("Remote", "origin"),
            new("Remote URL", FormatOriginUrl(repo)),
            new("Result", DescribeMergeResult(result)),
            new("HEAD before", FormatSha(headShaBefore)),
            new("HEAD after", FormatSha(headShaAfter))
        };

        if (result.Commit is { } mergeCommit)
        {
            details.Add(new("Merge commit", $"{FormatSha(mergeCommit.Sha)} — {mergeCommit.MessageShort.Trim()}"));
        }

        return details;
    }

    public static IReadOnlyList<GitOperationDetailItem> ForPush(
        Repository repo,
        IReadOnlyList<Commit> pushedCommits)
    {
        var details = new List<GitOperationDetailItem>(CommonRepository(repo))
        {
            new("Remote", "origin"),
            new("Remote URL", FormatOriginUrl(repo)),
            new("Ref", repo.Head?.CanonicalName ?? "(unknown)"),
            new("Commits pushed", FormatCommitList(pushedCommits))
        };
        return details;
    }

    public static IReadOnlyList<GitOperationDetailItem> ForStash(
        Repository repo,
        string stashMessage,
        IReadOnlyList<GitStatusEntry> stashedEntries,
        int stashCount)
    {
        var details = new List<GitOperationDetailItem>(CommonRepository(repo))
        {
            new("Stash message", stashMessage),
            new("Stash entries", stashCount.ToString()),
            new("Stashed changes", FormatStatusEntries(stashedEntries))
        };
        return details;
    }

    public static IReadOnlyList<GitOperationDetailItem> ForStashPop(
        Repository repo,
        string stashMessage,
        int remainingStashCount)
    {
        var details = new List<GitOperationDetailItem>(CommonRepository(repo))
        {
            new("Applied stash", stashMessage),
            new("Remaining stashes", remainingStashCount.ToString())
        };
        return details;
    }

    public static Dictionary<string, string> SnapshotOriginBranchTips(Repository repo) =>
        repo.Branches
            .Where(branch => branch.IsRemote && branch.FriendlyName.StartsWith("origin/", StringComparison.OrdinalIgnoreCase))
            .ToDictionary(
                branch => branch.FriendlyName,
                branch => branch.Tip?.Sha ?? string.Empty,
                StringComparer.OrdinalIgnoreCase);

    public static IReadOnlyList<string> GetStagedPathsAtScope(
        Repository repo,
        string relativePath,
        bool isDirectory) =>
        GitWorkflowService.GetStatusEntries(repo, relativePath, isDirectory)
            .Where(entry => !string.IsNullOrEmpty(entry.Staged))
            .Select(entry => entry.FilePath)
            .OrderBy(path => path, StringComparer.OrdinalIgnoreCase)
            .ToList();

    public static IReadOnlyList<GitStatusEntry> GetWorkTreeEntriesAtScope(
        Repository repo,
        string relativePath,
        bool isDirectory) =>
        GitWorkflowService.GetStatusEntries(repo, relativePath, isDirectory)
            .Where(entry => !string.IsNullOrEmpty(entry.WorkTree))
            .OrderBy(entry => entry.FilePath, StringComparer.OrdinalIgnoreCase)
            .ToList();

    public static IReadOnlyList<Commit> GetCommitsAheadOfTracked(Repository repo)
    {
        Branch? head = repo.Head;
        if (head?.Tip is null)
        {
            return [];
        }

        Branch? tracked = head.TrackedBranch;
        if (tracked?.Tip is null)
        {
            return [head.Tip];
        }

        return repo.Commits.QueryBy(new CommitFilter
        {
            IncludeReachableFrom = head,
            ExcludeReachableFrom = tracked,
            SortBy = CommitSortStrategies.Topological | CommitSortStrategies.Time
        }).ToList();
    }

    public static string FormatPathScope(string relativePath) =>
        string.IsNullOrEmpty(relativePath) ? "(repository)" : relativePath;

    public static string FormatRepositoryPath(Repository repo) =>
        repo.Info.WorkingDirectory?.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar)
        ?? "(bare repository)";

    public static string FormatOriginUrl(Repository repo) =>
        repo.Network.Remotes["origin"]?.Url ?? "(not configured)";

    public static string FormatSha(string? sha) =>
        string.IsNullOrWhiteSpace(sha) ? "(none)" : sha.Length <= 7 ? sha : sha[..7];

    private static IReadOnlyList<string> GetCommitChangedPaths(Repository repo, Commit commit)
    {
        Tree? parentTree = commit.Parents.FirstOrDefault()?.Tree;
        Tree commitTree = commit.Tree;

        if (parentTree is null)
        {
            return commitTree
                .Select(entry => entry.Path)
                .OrderBy(path => path, StringComparer.OrdinalIgnoreCase)
                .ToList();
        }

        return repo.Diff.Compare<TreeChanges>(parentTree, commitTree)
            .Select(change => change.Path)
            .OrderBy(path => path, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    private static string DescribeMergeResult(MergeResult result) => result.Status switch
    {
        MergeStatus.UpToDate => "Already up to date",
        MergeStatus.FastForward => "Fast-forward",
        MergeStatus.NonFastForward => "Merge commit created",
        MergeStatus.Conflicts => "Completed with conflicts resolved",
        _ => result.Status.ToString()
    };

    private static string FormatRemoteTipChanges(
        IReadOnlyDictionary<string, string> before,
        IReadOnlyDictionary<string, string> after)
    {
        var lines = new List<string>();
        foreach (var pair in after.OrderBy(entry => entry.Key, StringComparer.OrdinalIgnoreCase))
        {
            if (!before.TryGetValue(pair.Key, out string? previousSha)
                || !string.Equals(previousSha, pair.Value, StringComparison.OrdinalIgnoreCase))
            {
                lines.Add($"{pair.Key}: {FormatSha(previousSha)} → {FormatSha(pair.Value)}");
            }
        }

        if (lines.Count == 0)
        {
            return "Remote-tracking branches are already up to date.";
        }

        return FormatLines(lines);
    }

    private static string FormatCommitList(IReadOnlyList<Commit> commits)
    {
        if (commits.Count == 0)
        {
            return "Everything up-to-date (no new commits).";
        }

        var lines = commits
            .Select(commit => $"{FormatSha(commit.Sha)}  {commit.MessageShort.Trim()}");
        return FormatLines(lines);
    }

    private static string FormatStatusEntries(IReadOnlyList<GitStatusEntry> entries)
    {
        if (entries.Count == 0)
        {
            return "(none)";
        }

        var lines = entries.Select(entry =>
        {
            string status = !string.IsNullOrEmpty(entry.Staged) ? entry.Staged : entry.WorkTree;
            return $"{entry.FilePath} ({status})";
        });
        return FormatLines(lines);
    }

    private static string FormatPathList(IEnumerable<string> paths)
    {
        var list = paths.ToList();
        if (list.Count == 0)
        {
            return "(none)";
        }

        return FormatLines(list.Select(path => path));
    }

    private static string FormatLines(IEnumerable<string> lines)
    {
        var list = lines.ToList();
        var visible = list.Take(MaxListedPaths).Select(line => $"  • {line}");
        var text = string.Join(Environment.NewLine, visible);
        if (list.Count > MaxListedPaths)
        {
            text += Environment.NewLine + $"  • ... and {list.Count - MaxListedPaths} more";
        }

        return text;
    }
}
