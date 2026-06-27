namespace MyDiffWinV10.App.Core;

/// <summary>
/// The computed row-by-row diff between a left and right file, plus the summary
/// counts shown in the status bar.
/// </summary>
public sealed class DiffDocument
{
    public required IReadOnlyList<DiffRow> Rows { get; init; }

    public int AddedCount { get; init; }

    public int RemovedCount { get; init; }

    public int ModifiedCount { get; init; }

    public bool HasDifferences => AddedCount > 0 || RemovedCount > 0 || ModifiedCount > 0;

    public static DiffDocument FromLines(IReadOnlyList<string> left, IReadOnlyList<string> right)
    {
        var rows = LineDiff.Compute(left, right);
        int added = 0, removed = 0, modified = 0;
        foreach (var row in rows)
        {
            switch (row.Kind)
            {
                case DiffLineKind.Added: added++; break;
                case DiffLineKind.Removed: removed++; break;
                case DiffLineKind.Modified: modified++; break;
            }
        }

        return new DiffDocument { Rows = rows, AddedCount = added, RemovedCount = removed, ModifiedCount = modified };
    }
}
