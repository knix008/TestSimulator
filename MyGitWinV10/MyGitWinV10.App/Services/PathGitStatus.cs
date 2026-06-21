namespace MyGitWinV10.App.Services;

using MyGitWinV10.App.Controls;

public sealed class PathGitStatus
{
    public string? Staged { get; init; }

    public string? WorkTree { get; init; }

    public bool HasChanges =>
        !string.IsNullOrEmpty(Staged) || !string.IsNullOrEmpty(WorkTree);

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
            WorkTree = PickPrimaryLabel(current.WorkTree, incoming.WorkTree)
        };
    }

    public string Badge
    {
        get
        {
            if (!string.IsNullOrEmpty(WorkTree))
            {
                return WorkTree switch
                {
                    "Untracked" => "?",
                    "Modified" => "M",
                    "Deleted" => "D",
                    "Renamed" => "R",
                    "Type Changed" => "T",
                    _ => "~"
                };
            }

            return Staged switch
            {
                "Added" => "A",
                "Modified" => "M",
                "Deleted" => "D",
                "Renamed" => "R",
                "Type Changed" => "T",
                _ => "+"
            };
        }
    }

    public Color ForeColor
    {
        get
        {
            if (!string.IsNullOrEmpty(WorkTree))
            {
                return WorkTree switch
                {
                    "Untracked" => Color.FromArgb(5, 150, 105),
                    "Deleted" => Color.FromArgb(220, 38, 38),
                    _ => Color.FromArgb(37, 99, 235)
                };
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
        if (!HasChanges)
        {
            return isDirectory
                ? "Unchanged (no changes in this folder)"
                : "Unchanged";
        }

        if (isDirectory)
        {
            return "Contains changes";
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
                _ => GitFileTreeIconIndex.FileMixed
            };
        }

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
