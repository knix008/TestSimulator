namespace DiffMergeWinV10.App.Core;

/// <summary>
/// Classic diff3-style 3-way merge: find base lines that align unchanged with both
/// local and remote (LCS against each), use them as sync anchors, and resolve the
/// slices between anchors as clean (only one side changed, or both changed identically)
/// or conflicting (both sides changed differently).
/// </summary>
public static class ThreeWayDiff
{
    public static MergeDocument Merge(IReadOnlyList<string> baseLines, IReadOnlyList<string> localLines, IReadOnlyList<string> remoteLines)
    {
        var localMatches = LcsMatch(baseLines, localLines);
        var remoteMatches = LcsMatch(baseLines, remoteLines);

        var anchors = new List<int> { -1 };
        anchors.AddRange(localMatches.Keys.Where(remoteMatches.ContainsKey).OrderBy(x => x));
        anchors.Add(baseLines.Count);

        var doc = new MergeDocument();

        for (int a = 0; a < anchors.Count - 1; a++)
        {
            int prevBase = anchors[a];
            int curBase = anchors[a + 1];
            bool curIsRealAnchor = curBase < baseLines.Count;

            int prevLocal = prevBase == -1 ? -1 : localMatches[prevBase];
            int prevRemote = prevBase == -1 ? -1 : remoteMatches[prevBase];
            int curLocal = curIsRealAnchor ? localMatches[curBase] : localLines.Count;
            int curRemote = curIsRealAnchor ? remoteMatches[curBase] : remoteLines.Count;

            var baseSlice = Slice(baseLines, prevBase + 1, curBase);
            var localSlice = Slice(localLines, prevLocal + 1, curLocal);
            var remoteSlice = Slice(remoteLines, prevRemote + 1, curRemote);

            AppendSlice(doc, baseSlice, localSlice, remoteSlice);

            if (curIsRealAnchor)
            {
                doc.Regions.Add(new MergeRegion { CleanLines = new List<string> { baseLines[curBase] } });
            }
        }

        return doc;
    }

    private static void AppendSlice(MergeDocument doc, List<string> baseSlice, List<string> localSlice, List<string> remoteSlice)
    {
        if (baseSlice.Count == 0 && localSlice.Count == 0 && remoteSlice.Count == 0)
        {
            return;
        }

        bool localUnchanged = LinesEqual(baseSlice, localSlice);
        bool remoteUnchanged = LinesEqual(baseSlice, remoteSlice);

        if (localUnchanged && remoteUnchanged)
        {
            if (baseSlice.Count > 0)
            {
                doc.Regions.Add(new MergeRegion { CleanLines = baseSlice });
            }
            return;
        }

        if (remoteUnchanged)
        {
            if (localSlice.Count > 0)
            {
                doc.Regions.Add(new MergeRegion { CleanLines = localSlice });
            }
            return;
        }

        if (localUnchanged)
        {
            if (remoteSlice.Count > 0)
            {
                doc.Regions.Add(new MergeRegion { CleanLines = remoteSlice });
            }
            return;
        }

        if (LinesEqual(localSlice, remoteSlice))
        {
            doc.Regions.Add(new MergeRegion { CleanLines = localSlice });
            return;
        }

        doc.Regions.Add(new MergeRegion { Hunk = new ConflictHunk(baseSlice, localSlice, remoteSlice, hasBase: true) });
    }

    private static bool LinesEqual(List<string> a, List<string> b)
    {
        if (a.Count != b.Count)
        {
            return false;
        }
        for (int i = 0; i < a.Count; i++)
        {
            if (a[i] != b[i])
            {
                return false;
            }
        }
        return true;
    }

    private static List<string> Slice(IReadOnlyList<string> lines, int start, int endExclusive)
    {
        var result = new List<string>();
        for (int i = Math.Max(start, 0); i < Math.Min(endExclusive, lines.Count); i++)
        {
            result.Add(lines[i]);
        }
        return result;
    }

    /// <summary>
    /// Longest common subsequence alignment between base and other: returns a map of
    /// baseIndex -&gt; otherIndex for the matched (equal-content) lines that form the LCS.
    /// </summary>
    private static Dictionary<int, int> LcsMatch(IReadOnlyList<string> baseLines, IReadOnlyList<string> otherLines)
    {
        int n = baseLines.Count, m = otherLines.Count;
        var lengths = new int[n + 1, m + 1];
        for (int i = n - 1; i >= 0; i--)
        {
            for (int j = m - 1; j >= 0; j--)
            {
                lengths[i, j] = baseLines[i] == otherLines[j]
                    ? lengths[i + 1, j + 1] + 1
                    : Math.Max(lengths[i + 1, j], lengths[i, j + 1]);
            }
        }

        var matches = new Dictionary<int, int>();
        int bi = 0, oi = 0;
        while (bi < n && oi < m)
        {
            if (baseLines[bi] == otherLines[oi])
            {
                matches[bi] = oi;
                bi++;
                oi++;
            }
            else if (lengths[bi + 1, oi] >= lengths[bi, oi + 1])
            {
                bi++;
            }
            else
            {
                oi++;
            }
        }
        return matches;
    }
}
