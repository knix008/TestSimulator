namespace MyDiffWinV10.App.Core;

public enum DiffLineKind
{
    Same,
    Added,
    Removed,
    Modified,
}

/// <summary>
/// One aligned row across the two panes. A blank side (<see langword="null"/>) keeps the
/// left/right panes vertically aligned line-for-line so synced scrolling lines up visually.
/// </summary>
public sealed record DiffRow(string? LeftText, string? RightText, DiffLineKind Kind);

/// <summary>
/// Two-way line diff: LCS-align the left and right line lists to find matching
/// (unchanged) lines as anchors, then classify each gap between anchors as
/// Removed-only (left has lines, right doesn't), Added-only (right has lines, left
/// doesn't), or Modified (both sides have lines in the gap, paired index-for-index).
/// </summary>
public static class LineDiff
{
    public static List<DiffRow> Compute(IReadOnlyList<string> left, IReadOnlyList<string> right)
    {
        var matches = LcsMatch(left, right);
        var rows = new List<DiffRow>();

        int li = 0, ri = 0;
        foreach (var (leftIndex, rightIndex) in matches.OrderBy(m => m.Key).Select(m => (m.Key, m.Value)))
        {
            AppendGap(rows, left, right, li, leftIndex, ri, rightIndex);
            rows.Add(new DiffRow(left[leftIndex], right[rightIndex], DiffLineKind.Same));
            li = leftIndex + 1;
            ri = rightIndex + 1;
        }

        AppendGap(rows, left, right, li, left.Count, ri, right.Count);
        return rows;
    }

    private static void AppendGap(
        List<DiffRow> rows,
        IReadOnlyList<string> left,
        IReadOnlyList<string> right,
        int leftStart,
        int leftEnd,
        int rightStart,
        int rightEnd)
    {
        int leftCount = leftEnd - leftStart;
        int rightCount = rightEnd - rightStart;
        int pairCount = Math.Min(leftCount, rightCount);

        for (int i = 0; i < pairCount; i++)
        {
            rows.Add(new DiffRow(left[leftStart + i], right[rightStart + i], DiffLineKind.Modified));
        }

        for (int i = pairCount; i < leftCount; i++)
        {
            rows.Add(new DiffRow(left[leftStart + i], null, DiffLineKind.Removed));
        }

        for (int i = pairCount; i < rightCount; i++)
        {
            rows.Add(new DiffRow(null, right[rightStart + i], DiffLineKind.Added));
        }
    }

    /// <summary>
    /// Longest common subsequence alignment between left and right: returns a map of
    /// leftIndex -&gt; rightIndex for the matched (equal-content) lines that form the LCS.
    /// </summary>
    private static Dictionary<int, int> LcsMatch(IReadOnlyList<string> left, IReadOnlyList<string> right)
    {
        int n = left.Count, m = right.Count;
        var lengths = new int[n + 1, m + 1];
        for (int i = n - 1; i >= 0; i--)
        {
            for (int j = m - 1; j >= 0; j--)
            {
                lengths[i, j] = left[i] == right[j]
                    ? lengths[i + 1, j + 1] + 1
                    : Math.Max(lengths[i + 1, j], lengths[i, j + 1]);
            }
        }

        var matches = new Dictionary<int, int>();
        int li = 0, ri = 0;
        while (li < n && ri < m)
        {
            if (left[li] == right[ri])
            {
                matches[li] = ri;
                li++;
                ri++;
            }
            else if (lengths[li + 1, ri] >= lengths[li, ri + 1])
            {
                li++;
            }
            else
            {
                ri++;
            }
        }

        return matches;
    }
}
