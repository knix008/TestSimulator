using LibGit2Sharp;

namespace MyGitWinV10.App.Services;

using MyGitWinV10.App.Controls;

public sealed class RepositoryPathStatusIndex
{
    public static readonly RepositoryPathStatusIndex Empty = new([], [], canReportStatus: false);

    private readonly Dictionary<string, PathGitStatus> _files;
    private readonly Dictionary<string, PathGitStatus> _directories;
    private readonly Func<string, bool, bool>? _isPathIgnored;

    internal RepositoryPathStatusIndex(
        Dictionary<string, PathGitStatus> files,
        Dictionary<string, PathGitStatus> directories,
        bool canReportStatus,
        Func<string, bool, bool>? isPathIgnored = null)
    {
        _files = files;
        _directories = directories;
        CanReportStatus = canReportStatus;
        _isPathIgnored = isPathIgnored;
    }

    public bool CanReportStatus { get; }

    public bool IsAvailable => _files.Count > 0 || _directories.Count > 0;

    public bool HasAnyStagedChanges =>
        CanReportStatus && _files.Values.Any(status => !string.IsNullOrEmpty(status.Staged));

    public bool HasAnyWorkTreeChanges =>
        CanReportStatus && _files.Values.Any(status => !string.IsNullOrEmpty(status.WorkTree));

    public bool HasStagedChangesAtPath(string relativePath, bool isDirectory)
    {
        if (!CanReportStatus)
        {
            return false;
        }

        string normalized = PathCommitHistoryService.NormalizeGitPath(relativePath);
        if (string.IsNullOrEmpty(normalized))
        {
            return HasAnyStagedChanges;
        }

        if (isDirectory)
        {
            return !string.IsNullOrEmpty(Get(normalized, isDirectory: true)?.Staged);
        }

        return _files.TryGetValue(normalized, out PathGitStatus? status)
            && !string.IsNullOrEmpty(status.Staged);
    }

    public bool HasWorkTreeChangesAtPath(string relativePath, bool isDirectory)
    {
        if (!CanReportStatus)
        {
            return false;
        }

        string normalized = PathCommitHistoryService.NormalizeGitPath(relativePath);
        if (string.IsNullOrEmpty(normalized))
        {
            return HasAnyWorkTreeChanges;
        }

        if (isDirectory)
        {
            PathGitStatus? status = Get(normalized, isDirectory: true);
            return status is not null
                && !status.IsIgnoredOnly
                && !string.IsNullOrEmpty(status.WorkTree);
        }

        return _files.TryGetValue(normalized, out PathGitStatus? fileStatus)
            && !fileStatus.IsIgnoredOnly
            && !string.IsNullOrEmpty(fileStatus.WorkTree);
    }

    public PathGitStatus? Get(string relativePath, bool isDirectory)
    {
        string normalized = PathCommitHistoryService.NormalizeGitPath(relativePath);
        var map = isDirectory ? _directories : _files;
        if (map.TryGetValue(normalized, out PathGitStatus? status))
        {
            return status;
        }

        if (CanReportStatus && _isPathIgnored?.Invoke(normalized, isDirectory) == true)
        {
            return PathGitStatus.Ignored;
        }

        return null;
    }

    public IEnumerable<string> GetDirectChildFilePaths(string relativePath)
    {
        string prefix = string.IsNullOrEmpty(relativePath)
            ? string.Empty
            : PathCommitHistoryService.NormalizeGitPath(relativePath) + "/";

        foreach (string path in _files.Keys)
        {
            if (!string.IsNullOrEmpty(prefix) && !path.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            string remainder = string.IsNullOrEmpty(prefix) ? path : path[prefix.Length..];
            if (string.IsNullOrEmpty(remainder) || remainder.Contains('/'))
            {
                continue;
            }

            yield return path;
        }
    }
}

public static class RepositoryPathStatusService
{
    public static RepositoryPathStatusIndex Build(Repository repo)
    {
        if (repo.Info.IsBare || string.IsNullOrWhiteSpace(repo.Info.WorkingDirectory))
        {
            return RepositoryPathStatusIndex.Empty;
        }

        var files = new Dictionary<string, PathGitStatus>(StringComparer.OrdinalIgnoreCase);
        var directories = new Dictionary<string, PathGitStatus>(StringComparer.OrdinalIgnoreCase);

        foreach (StatusEntry entry in repo.RetrieveStatus(new StatusOptions()))
        {
            var status = ToPathStatus(entry);
            if (!status.HasChanges)
            {
                continue;
            }

            string path = PathCommitHistoryService.NormalizeGitPath(entry.FilePath);
            files[path] = status;
            PropagateToParents(directories, path, status);
        }

        ApplyUnpushedPaths(repo, files, directories);

        return new RepositoryPathStatusIndex(
            files,
            directories,
            canReportStatus: true,
            (path, isDirectory) => GitIgnoreService.IsIgnored(repo, path, isDirectory));
    }

    public static string FormatNodeToolTip(RepositoryFileNodeTag tag, PathGitStatus? status, bool canReportStatus)
    {
        string pathLabel = string.IsNullOrEmpty(tag.RelativePath)
            ? tag.DisplayName
            : tag.RelativePath;

        var lines = new List<string>();
        if (!string.IsNullOrEmpty(pathLabel))
        {
            lines.Add(pathLabel);
        }

        if (!canReportStatus)
        {
            lines.Add(Localization.T("Status.Path.Unavailable"));
            return string.Join(Environment.NewLine, lines);
        }

        if (tag.IsMissingFromWorkTree)
        {
            lines.Add(Localization.T("Status.Tooltip.DeletedStatus"));
            lines.Add(Localization.Tf("Status.Tooltip.StagedLine", PathGitStatus.FormatDisplayValue(null)));
            lines.Add(Localization.T("Status.Tooltip.WorkTreeDeleted"));
            return string.Join(Environment.NewLine, lines);
        }

        PathGitStatus effectiveStatus = status ?? PathGitStatus.Empty;
        if (effectiveStatus.IsIgnoredOnly)
        {
            lines.Add(Localization.Tf("Status.Tooltip.StatusLine", Localization.T("Status.Path.Ignored")));
            lines.Add(Localization.T("Status.Tooltip.ListedInGitignore"));
            return string.Join(Environment.NewLine, lines);
        }

        lines.Add(Localization.Tf("Status.Tooltip.StatusLine", effectiveStatus.GetSummaryLabel(tag.IsDirectory)));
        lines.Add(Localization.Tf("Status.Tooltip.StagedLine", PathGitStatus.FormatDisplayValue(effectiveStatus.Staged)));
        lines.Add(Localization.Tf("Status.Tooltip.WorkTreeLine", PathGitStatus.FormatDisplayValue(effectiveStatus.WorkTree)));
        if (effectiveStatus.IsUnpushed && !effectiveStatus.HasWorkingTreeChanges)
        {
            lines.Add(Localization.T("Status.Tooltip.PushPending"));
        }

        return string.Join(Environment.NewLine, lines);
    }

    public static void ApplyToNode(
        TreeNode node,
        RepositoryPathStatusIndex? statusIndex,
        GitFileTreeImageList? icons)
    {
        if (node.Tag is not RepositoryFileNodeTag tag || tag.IsPlaceholder)
        {
            return;
        }

        bool canReportStatus = statusIndex?.CanReportStatus == true;
        PathGitStatus? status = canReportStatus
            ? statusIndex!.Get(tag.RelativePath, tag.IsDirectory)
            : null;

        node.Text = tag.DisplayName;
        node.ForeColor = SystemColors.ControlText;

        if (icons is not null)
        {
            int imageIndex = icons.GetImageIndex(tag.IsDirectory, status);
            node.ImageIndex = imageIndex;
            node.SelectedImageIndex = imageIndex;
        }

        node.ToolTipText = FormatNodeToolTip(tag, status, canReportStatus);
    }

    public static void ApplyToTree(
        TreeView treeView,
        RepositoryPathStatusIndex? statusIndex,
        GitFileTreeImageList? icons)
    {
        foreach (TreeNode node in treeView.Nodes)
        {
            ApplyToSubtree(node, statusIndex, icons);
        }
    }

    public static void ApplyToSubtree(
        TreeNode node,
        RepositoryPathStatusIndex? statusIndex,
        GitFileTreeImageList? icons)
    {
        ApplyToNode(node, statusIndex, icons);
        foreach (TreeNode child in node.Nodes)
        {
            ApplyToSubtree(child, statusIndex, icons);
        }
    }

    private static PathGitStatus ToPathStatus(StatusEntry entry) =>
        new()
        {
            Staged = FormatIndexStatus(entry.State),
            WorkTree = FormatWorkTreeStatus(entry.State)
        };

    private static string FormatIndexStatus(FileStatus state)
    {
        if (state.HasFlag(FileStatus.NewInIndex))
        {
            return "Added";
        }

        if (state.HasFlag(FileStatus.ModifiedInIndex))
        {
            return "Modified";
        }

        if (state.HasFlag(FileStatus.DeletedFromIndex))
        {
            return "Deleted";
        }

        if (state.HasFlag(FileStatus.RenamedInIndex))
        {
            return "Renamed";
        }

        if (state.HasFlag(FileStatus.TypeChangeInIndex))
        {
            return "Type Changed";
        }

        return string.Empty;
    }

    private static string FormatWorkTreeStatus(FileStatus state)
    {
        if (state.HasFlag(FileStatus.Conflicted))
        {
            return "Conflicted";
        }

        if (state.HasFlag(FileStatus.NewInWorkdir))
        {
            return "Untracked";
        }

        if (state.HasFlag(FileStatus.ModifiedInWorkdir))
        {
            return "Modified";
        }

        if (state.HasFlag(FileStatus.DeletedFromWorkdir))
        {
            return "Deleted";
        }

        if (state.HasFlag(FileStatus.RenamedInWorkdir))
        {
            return "Renamed";
        }

        if (state.HasFlag(FileStatus.TypeChangeInWorkdir))
        {
            return "Type Changed";
        }

        return string.Empty;
    }

    private static void PropagateToParents(
        Dictionary<string, PathGitStatus> directories,
        string filePath,
        PathGitStatus status)
    {
        directories[string.Empty] = PathGitStatus.Merge(directories.GetValueOrDefault(string.Empty), status);

        int separatorIndex = filePath.IndexOf('/');
        while (separatorIndex >= 0)
        {
            string directoryPath = filePath[..separatorIndex];
            directories[directoryPath] = PathGitStatus.Merge(directories.GetValueOrDefault(directoryPath), status);
            separatorIndex = filePath.IndexOf('/', separatorIndex + 1);
        }
    }

    private static void ApplyUnpushedPaths(
        Repository repo,
        Dictionary<string, PathGitStatus> files,
        Dictionary<string, PathGitStatus> directories)
    {
        foreach (string path in GitOperationDetails.GetUnpushedFilePaths(repo))
        {
            if (files.TryGetValue(path, out PathGitStatus? existing) && existing.HasWorkingTreeChanges)
            {
                continue;
            }

            files[path] = PathGitStatus.Unpushed;
            PropagateToParents(directories, path, PathGitStatus.Unpushed);
        }
    }
}
