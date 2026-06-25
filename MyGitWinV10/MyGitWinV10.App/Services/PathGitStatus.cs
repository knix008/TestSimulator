namespace MyGitWinV10.App.Services;

using MyGitWinV10.App.Controls;

public sealed class PathGitStatus
{
    public string? Staged { get; init; }

    public string? WorkTree { get; init; }

    public bool IsUnpushed { get; init; }

    public bool HasWorkingTreeChanges =>
        !string.IsNullOrEmpty(Staged) || !string.IsNullOrEmpty(WorkTree);

    public bool HasChanges =>
        HasWorkingTreeChanges || IsUnpushed;

    public bool IsIgnoredOnly =>
        string.Equals(WorkTree, IgnoredWorkTree, StringComparison.Ordinal) && string.IsNullOrEmpty(Staged);

    public const string IgnoredWorkTree = "Ignored";
    public const string ChangedBadge = "\u00B1";
    public const string UnpushedBadge = "P";

    public static PathGitStatus Ignored { get; } = new() { WorkTree = IgnoredWorkTree };

    public static PathGitStatus Unpushed { get; } = new() { IsUnpushed = true };

    public static PathGitStatus Merge(PathGitStatus? current, PathGitStatus incoming)
    {
        if (!incoming.HasChanges)
        {
            return current ?? Empty;
        }

        if (current is null || !current.HasChanges)
        {
            return incoming;
        }

        return new PathGitStatus
        {
            Staged = PickPrimaryLabel(current.Staged, incoming.Staged),
            WorkTree = PickPrimaryLabel(current.WorkTree, incoming.WorkTree),
            IsUnpushed = current.IsUnpushed || incoming.IsUnpushed,
        };
    }

    public string Badge
    {
        get
        {
            if (IsIgnoredOnly)
            {
                return "X";
            }

            if (!string.IsNullOrEmpty(WorkTree))
            {
                return WorkTree switch
                {
                    "Untracked" => "U",
                    "Deleted" => "D",
                    "Renamed" => "R",
                    "Type Changed" => "T",
                    "Conflicted" => "!",
                    _ => ChangedBadge
                };
            }

            if (!string.IsNullOrEmpty(Staged))
            {
                return Staged switch
                {
                    "Deleted" => "D",
                    "Renamed" => "R",
                    "Type Changed" => "T",
                    _ => ChangedBadge
                };
            }

            if (IsUnpushed)
            {
                return UnpushedBadge;
            }

            return string.Empty;
        }
    }

    public Color ForeColor
    {
        get
        {
            if (IsIgnoredOnly)
            {
                return Color.FromArgb(100, 116, 139);
            }

            if (!string.IsNullOrEmpty(WorkTree))
            {
                return WorkTree switch
                {
                    "Untracked" => Color.FromArgb(5, 150, 105),
                    "Deleted" or "Conflicted" => Color.FromArgb(220, 38, 38),
                    "Renamed" or "Type Changed" => Color.FromArgb(37, 99, 235),
                    "Mixed" => Color.FromArgb(217, 119, 6),
                    _ => Color.FromArgb(37, 99, 235)
                };
            }

            if (!string.IsNullOrEmpty(Staged))
            {
                return Color.FromArgb(124, 58, 237);
            }

            if (IsUnpushed)
            {
                return Color.FromArgb(220, 38, 38);
            }

            return Color.FromArgb(124, 58, 237);
        }
    }

    public string FormatToolTip(string relativePath)
    {
        if (!HasChanges)
        {
            return relativePath;
        }

        var lines = new List<string>();
        if (!string.IsNullOrEmpty(relativePath))
        {
            lines.Add(relativePath);
        }

        lines.Add($"Status: {GetSummaryLabel(isDirectory: false)}");
        lines.Add($"Staged: {FormatDisplayValue(Staged)}");
        lines.Add($"Work tree: {FormatDisplayValue(WorkTree)}");

        return string.Join(Environment.NewLine, lines);
    }

    public string GetSummaryLabel(bool isDirectory)
    {
        if (IsIgnoredOnly)
        {
            return isDirectory ? "Ignored folder" : "Ignored";
        }

        if (!HasChanges)
        {
            return isDirectory
                ? "Unchanged (no changes in this folder)"
                : "Unchanged";
        }

        if (isDirectory)
        {
            if (IsUnpushed && !HasWorkingTreeChanges)
            {
                return "Contains unpushed commits";
            }

            return "Contains changes";
        }

        if (IsUnpushed && !HasWorkingTreeChanges)
        {
            return "Committed (not pushed)";
        }

        if (!string.IsNullOrEmpty(Staged) && !string.IsNullOrEmpty(WorkTree)
            && !string.Equals(Staged, WorkTree, StringComparison.OrdinalIgnoreCase))
        {
            return "Mixed";
        }

        return WorkTree ?? Staged ?? "Changed";
    }

    public static string FormatDisplayValue(string? value) =>
        string.IsNullOrEmpty(value) ? "—" : value;

    public GitFileTreeIconIndex GetFileIconIndex()
    {
        if (IsIgnoredOnly)
        {
            return GitFileTreeIconIndex.FileIgnored;
        }

        if (!string.IsNullOrEmpty(Staged) && !string.IsNullOrEmpty(WorkTree)
            && !string.Equals(Staged, WorkTree, StringComparison.OrdinalIgnoreCase))
        {
            return GitFileTreeIconIndex.FileMixed;
        }

        if (!string.IsNullOrEmpty(WorkTree))
        {
            return WorkTree switch
            {
                "Untracked" => GitFileTreeIconIndex.FileUntracked,
                "Modified" => GitFileTreeIconIndex.FileModified,
                "Deleted" => GitFileTreeIconIndex.FileDeleted,
                "Renamed" => GitFileTreeIconIndex.FileRenamed,
                "Type Changed" => GitFileTreeIconIndex.FileModified,
                "Conflicted" => GitFileTreeIconIndex.FileConflicted,
                _ => GitFileTreeIconIndex.FileMixed
            };
        }

        if (!string.IsNullOrEmpty(Staged))
        {
            return Staged switch
            {
                "Added" => GitFileTreeIconIndex.FileAdded,
                "Modified" => GitFileTreeIconIndex.FileStaged,
                "Deleted" => GitFileTreeIconIndex.FileDeleted,
                "Renamed" => GitFileTreeIconIndex.FileRenamed,
                "Type Changed" => GitFileTreeIconIndex.FileStaged,
                _ => GitFileTreeIconIndex.FileStaged
            };
        }

        if (IsUnpushed)
        {
            return GitFileTreeIconIndex.File;
        }

        return GitFileTreeIconIndex.File;
    }

    public static PathGitStatus Empty { get; } = new();

    private static string? PickPrimaryLabel(string? current, string? incoming)
    {
        if (string.IsNullOrEmpty(current))
        {
            return incoming;
        }

        if (string.IsNullOrEmpty(incoming))
        {
            return current;
        }

        if (string.Equals(current, incoming, StringComparison.OrdinalIgnoreCase))
        {
            return current;
        }

        return "Mixed";
    }
}
