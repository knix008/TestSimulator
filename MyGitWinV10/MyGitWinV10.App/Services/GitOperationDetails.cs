using LibGit2Sharp;

namespace MyGitWinV10.App.Services;

public readonly record struct GitOperationDetailItem(string Label, string Value);

public static class GitOperationDetails
{
    private const int MaxListedPaths = 40;

    private static GitOperationDetailItem Detail(string labelKey, string value) =>
        new(Localization.T(labelKey), value);

    public static IReadOnlyList<GitOperationDetailItem> CommonRepository(Repository repo) =>
    [
        Detail("Detail.Repository", FormatRepositoryPath(repo)),
        Detail("Detail.Branch", repo.Head?.FriendlyName ?? Localization.T("Detail.Value.Detached"))
    ];

    public static IReadOnlyList<GitOperationDetailItem> ForReset(
        Repository repo,
        string relativePath,
        IReadOnlyList<string> unstagedPaths)
    {
        var details = new List<GitOperationDetailItem>(CommonRepository(repo))
        {
            Detail("Detail.Path", FormatPathScope(relativePath)),
            Detail("Detail.UnstagedPaths", FormatPathList(unstagedPaths))
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
            Detail("Detail.Path", FormatPathScope(relativePath)),
            Detail("Detail.DiscardedChanges", FormatStatusEntries(discardedEntries))
        };
        return details;
    }

    public static IReadOnlyList<GitOperationDetailItem> ForCommit(Repository repo, Commit commit)
    {
        var details = new List<GitOperationDetailItem>(CommonRepository(repo))
        {
            Detail("Detail.Commit", commit.Sha),
            Detail("Detail.ShortSha", FormatSha(commit.Sha)),
            Detail("Detail.Author", $"{commit.Author.Name} <{commit.Author.Email}>"),
            Detail("Detail.Date", commit.Author.When.ToString("yyyy-MM-dd HH:mm:ss zzz")),
            Detail("Detail.Message", commit.Message.Trim()),
            Detail("Detail.Parent", commit.Parents.FirstOrDefault()?.Sha is { } parentSha
                ? FormatSha(parentSha)
                : Localization.T("Detail.Value.RootCommit"))
        };

        IReadOnlyList<string> changedPaths = GetCommitChangedPaths(repo, commit);
        details.Add(Detail("Detail.ChangedFiles", FormatPathList(changedPaths)));
        return details;
    }

    public static IReadOnlyList<GitOperationDetailItem> ForFetch(
        Repository repo,
        IReadOnlyDictionary<string, string> remoteTipsBefore,
        IReadOnlyDictionary<string, string> remoteTipsAfter)
    {
        var details = new List<GitOperationDetailItem>(CommonRepository(repo))
        {
            Detail("Detail.Remote", "origin"),
            Detail("Detail.RemoteUrl", FormatOriginUrl(repo)),
            Detail("Detail.Updates", FormatRemoteTipChanges(remoteTipsBefore, remoteTipsAfter))
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
            Detail("Detail.Remote", "origin"),
            Detail("Detail.RemoteUrl", FormatOriginUrl(repo)),
            Detail("Detail.Result", DescribeMergeResult(result)),
            Detail("Detail.HeadBefore", FormatSha(headShaBefore)),
            Detail("Detail.HeadAfter", FormatSha(headShaAfter))
        };

        if (result.Commit is { } mergeCommit)
        {
            details.Add(Detail("Detail.MergeCommit", $"{FormatSha(mergeCommit.Sha)} — {mergeCommit.MessageShort.Trim()}"));
        }

        return details;
    }

    public static IReadOnlyList<GitOperationDetailItem> ForPush(
        Repository repo,
        IReadOnlyList<Commit> pushedCommits)
    {
        var details = new List<GitOperationDetailItem>(CommonRepository(repo))
        {
            Detail("Detail.Remote", "origin"),
            Detail("Detail.RemoteUrl", FormatOriginUrl(repo)),
            Detail("Detail.Ref", repo.Head?.CanonicalName ?? Localization.T("Detail.Value.Unknown")),
            Detail("Detail.CommitsPushed", FormatCommitList(pushedCommits))
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
            Detail("Detail.StashMessage", stashMessage),
            Detail("Detail.StashEntries", stashCount.ToString()),
            Detail("Detail.StashedChanges", FormatStatusEntries(stashedEntries))
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
            Detail("Detail.AppliedStash", stashMessage),
            Detail("Detail.RemainingStashes", remainingStashCount.ToString())
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

    public static Branch? ResolveUpstreamBranch(Repository repo)
    {
        Branch? head = repo.Head;
        if (head is null)
        {
            return null;
        }

        if (head.TrackedBranch is not null)
        {
            return head.TrackedBranch;
        }

        if (!GitWorkflowService.HasOriginRemote(repo))
        {
            return null;
        }

        return repo.Branches[$"origin/{head.FriendlyName}"];
    }

    public static IReadOnlyList<Commit> GetCommitsAheadOfTracked(Repository repo)
    {
        Branch? head = repo.Head;
        if (head?.Tip is null)
        {
            return [];
        }

        Branch? upstream = ResolveUpstreamBranch(repo);
        if (upstream?.Tip is null)
        {
            return [];
        }

        if (string.Equals(head.Tip.Sha, upstream.Tip.Sha, StringComparison.OrdinalIgnoreCase))
        {
            return [];
        }

        return repo.Commits.QueryBy(new CommitFilter
        {
            IncludeReachableFrom = head,
            ExcludeReachableFrom = upstream,
            SortBy = CommitSortStrategies.Topological | CommitSortStrategies.Time
        }).ToList();
    }

    public static IReadOnlyList<Commit> GetCommitsBehindTracked(Repository repo)
    {
        Branch? head = repo.Head;
        if (head?.Tip is null)
        {
            return [];
        }

        Branch? upstream = ResolveUpstreamBranch(repo);
        if (upstream?.Tip is null)
        {
            return [];
        }

        if (string.Equals(head.Tip.Sha, upstream.Tip.Sha, StringComparison.OrdinalIgnoreCase))
        {
            return [];
        }

        return repo.Commits.QueryBy(new CommitFilter
        {
            IncludeReachableFrom = upstream,
            ExcludeReachableFrom = head,
            SortBy = CommitSortStrategies.Topological | CommitSortStrategies.Time
        }).ToList();
    }

    public static IReadOnlyCollection<string> GetUnpushedFilePaths(Repository repo)
    {
        if (!GitWorkflowService.HasOriginRemote(repo))
        {
            return [];
        }

        var paths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (Commit commit in GetCommitsAheadOfTracked(repo))
        {
            foreach (string path in GetCommitChangedPaths(repo, commit))
            {
                paths.Add(PathCommitHistoryService.NormalizeGitPath(path));
            }
        }

        return paths;
    }

    public static string FormatPathScope(string relativePath) =>
        string.IsNullOrEmpty(relativePath)
            ? Localization.T("Detail.Value.Repository")
            : relativePath;

    public static string FormatRepositoryPath(Repository repo) =>
        repo.Info.WorkingDirectory?.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar)
        ?? Localization.T("Detail.Value.BareRepository");

    public static string FormatOriginUrl(Repository repo) =>
        repo.Network.Remotes["origin"]?.Url ?? Localization.T("Detail.Value.NotConfigured");

    public static string FormatSha(string? sha) =>
        string.IsNullOrWhiteSpace(sha)
            ? Localization.T("Detail.Value.None")
            : sha.Length <= 7 ? sha : sha[..7];

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
        MergeStatus.UpToDate => Localization.T("Merge.UpToDate"),
        MergeStatus.FastForward => Localization.T("Merge.FastForward"),
        MergeStatus.NonFastForward => Localization.T("Merge.NonFastForward"),
        MergeStatus.Conflicts => Localization.T("Merge.Conflicts"),
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
            return Localization.T("Detail.Value.RemoteUpToDate");
        }

        return FormatLines(lines);
    }

    private static string FormatCommitList(IReadOnlyList<Commit> commits)
    {
        if (commits.Count == 0)
        {
            return Localization.T("Detail.Value.UpToDate");
        }

        var lines = commits
            .Select(commit => $"{FormatSha(commit.Sha)}  {commit.MessageShort.Trim()}");
        return FormatLines(lines);
    }

    private static string FormatStatusEntries(IReadOnlyList<GitStatusEntry> entries)
    {
        if (entries.Count == 0)
        {
            return Localization.T("Detail.Value.None");
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
            return Localization.T("Detail.Value.None");
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
            text += Environment.NewLine + Localization.Tf("Detail.Value.AndMore", list.Count - MaxListedPaths);
        }

        return text;
    }
}
