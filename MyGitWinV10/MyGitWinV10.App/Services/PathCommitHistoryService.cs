using LibGit2Sharp;

namespace MyGitWinV10.App.Services;

public static class PathCommitHistoryService
{
    public static string NormalizeGitPath(string path) =>
        path.Replace('\\', '/').Trim('/');

    public static IReadOnlyList<Commit> GetCommits(
        Repository repo,
        string relativePath,
        bool isDirectory,
        Func<bool>? shouldContinue = null)
    {
        if (repo.Head?.Tip is null)
        {
            return [];
        }

        bool Continue() => shouldContinue?.Invoke() ?? true;

        string path = ResolveGitPath(repo, relativePath);
        var filter = new CommitFilter
        {
            IncludeReachableFrom = repo.Head,
            SortBy = CommitSortStrategies.Topological | CommitSortStrategies.Time
        };

        if (string.IsNullOrEmpty(path))
        {
            return repo.Commits.QueryBy(filter).ToList();
        }

        return ScanCommitsTouchingPath(repo, path, filter, Continue);
    }

    private static string ResolveGitPath(Repository repo, string relativePath)
    {
        string path = NormalizeGitPath(relativePath);
        if (string.IsNullOrEmpty(path))
        {
            return path;
        }

        Tree? headTree = repo.Head?.Tip?.Tree;
        if (headTree?[path] is not null)
        {
            return path;
        }

        if (!repo.Info.IsBare)
        {
            IndexEntry? indexMatch = repo.Index
                .FirstOrDefault(entry => string.Equals(entry.Path, path, StringComparison.OrdinalIgnoreCase));
            if (indexMatch is not null)
            {
                return indexMatch.Path;
            }
        }

        return path;
    }

    // Walks history ourselves instead of relying on LibGit2Sharp's path-limited QueryBy(path, filter):
    // that native history-simplification walk computes a full diff per commit before yielding any
    // result, so it can take tens of seconds on repositories with many commits or large trees, and it
    // can't be cancelled mid-walk. Comparing tree-entry ids directly is a cheap lookup per commit and
    // stays responsive to cancellation.
    private static List<Commit> ScanCommitsTouchingPath(
        Repository repo,
        string path,
        CommitFilter filter,
        Func<bool> shouldContinue)
    {
        var matching = new List<Commit>();

        foreach (Commit commit in repo.Commits.QueryBy(filter))
        {
            if (!shouldContinue())
            {
                break;
            }

            if (CommitTouchesPath(commit, path))
            {
                matching.Add(commit);
            }
        }

        return matching;
    }

    private static bool CommitTouchesPath(Commit commit, string path)
    {
        Commit? parent = commit.Parents.FirstOrDefault();
        TreeEntry? current = commit.Tree[path];
        if (parent is null)
        {
            return current is not null;
        }

        TreeEntry? previous = parent.Tree[path];
        ObjectId? currentId = current?.Target?.Id;
        ObjectId? previousId = previous?.Target?.Id;
        return currentId != previousId;
    }

    /// <summary>
    /// Fast check for enabling Show Log — avoids scanning full commit history on context menu open.
    /// </summary>
    public static bool CanShowLog(Repository repo, string relativePath, bool isDirectory)
    {
        if (repo.Head?.Tip is null)
        {
            return false;
        }

        string path = NormalizeGitPath(relativePath);
        if (string.IsNullOrEmpty(path))
        {
            return true;
        }

        if (repo.Info.IsBare)
        {
            return true;
        }

        return IsTrackedPath(repo, path, isDirectory);
    }

    private static bool IsTrackedPath(Repository repo, string path, bool isDirectory)
    {
        Tree headTree = repo.Head.Tip.Tree;
        string resolvedPath = ResolveGitPath(repo, path);

        if (!isDirectory)
        {
            return headTree[resolvedPath]?.Target is Blob || HasIndexEntry(repo, resolvedPath);
        }

        if (headTree[resolvedPath]?.Target is Tree)
        {
            return true;
        }

        string prefix = resolvedPath + "/";
        if (repo.Index.Any(entry => entry.Path.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)))
        {
            return true;
        }

        return TreeHasEntryWithPrefix(headTree, prefix, string.Empty);
    }

    private static bool HasIndexEntry(Repository repo, string path) =>
        repo.Index.Any(entry => string.Equals(entry.Path, path, StringComparison.OrdinalIgnoreCase));

    private static bool TreeHasEntryWithPrefix(Tree tree, string prefix, string currentPath)
    {
        foreach (TreeEntry entry in tree)
        {
            string entryPath = string.IsNullOrEmpty(currentPath) ? entry.Name : $"{currentPath}/{entry.Name}";

            if (entryPath.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }

            if (entry.Target is Tree childTree
                && prefix.StartsWith(entryPath + "/", StringComparison.OrdinalIgnoreCase)
                && TreeHasEntryWithPrefix(childTree, prefix, entryPath))
            {
                return true;
            }
        }

        return false;
    }

    private static bool PathMatches(string? candidate, string path, bool isDirectory, string directoryPrefix)
    {
        if (string.IsNullOrEmpty(candidate))
        {
            return false;
        }

        candidate = NormalizeGitPath(candidate);

        if (isDirectory)
        {
            return string.Equals(candidate, path, StringComparison.OrdinalIgnoreCase)
                || candidate.StartsWith(directoryPrefix, StringComparison.OrdinalIgnoreCase);
        }

        return string.Equals(candidate, path, StringComparison.OrdinalIgnoreCase);
    }

    public static bool PathMatchesFilter(string candidatePath, string filterPath, bool filterIsDirectory) =>
        PathMatches(candidatePath, filterPath, filterIsDirectory, filterPath + "/");
}
