using LibGit2Sharp;

namespace MyGitWinV10.App.Services;

public static class PathCommitHistoryService
{
    public static string NormalizeGitPath(string path) =>
        path.Replace('\\', '/').Trim('/');

    public static IReadOnlyList<Commit> GetCommits(Repository repo, string relativePath, bool isDirectory)
    {
        if (repo.Head?.Tip is null)
        {
            return [];
        }

        string path = NormalizeGitPath(relativePath);
        var commits = repo.Commits.QueryBy(new CommitFilter
        {
            IncludeReachableFrom = repo.Head,
            SortBy = CommitSortStrategies.Topological | CommitSortStrategies.Time
        });

        if (string.IsNullOrEmpty(path))
        {
            return commits.ToList();
        }

        return commits.Where(commit => CommitTouchesPath(repo, commit, path, isDirectory)).ToList();
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

        if (!isDirectory)
        {
            return headTree[path]?.Target is Blob || repo.Index[path] is not null;
        }

        if (headTree[path]?.Target is Tree)
        {
            return true;
        }

        string prefix = path + "/";
        foreach (IndexEntry entry in repo.Index)
        {
            if (entry.Path.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
        }

        return TreeHasEntryWithPrefix(headTree, prefix, string.Empty);
    }

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

    private static bool CommitTouchesPath(Repository repo, Commit commit, string path, bool isDirectory)
    {
        if (commit.Parents.FirstOrDefault() is not Commit parent)
        {
            return PathExistsInTree(commit.Tree, path, isDirectory);
        }

        TreeChanges changes = repo.Diff.Compare<TreeChanges>(parent.Tree, commit.Tree);
        string directoryPrefix = path + "/";

        foreach (TreeEntryChanges change in changes)
        {
            if (PathMatches(change.Path, path, isDirectory, directoryPrefix)
                || PathMatches(change.OldPath, path, isDirectory, directoryPrefix))
            {
                return true;
            }
        }

        return false;
    }

    private static bool PathExistsInTree(Tree tree, string path, bool isDirectory)
    {
        if (string.IsNullOrEmpty(path))
        {
            return true;
        }

        if (isDirectory)
        {
            return tree[path]?.Target is Tree || TreeHasEntryWithPrefix(tree, path + "/", string.Empty);
        }

        return tree[path]?.Target is Blob;
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
}
