namespace DiffMergeWinV10.App.Core;

public static class ConflictMarkerParser
{
    public static bool ContainsConflictMarkers(IEnumerable<string> lines) =>
        lines.Any(line => line.StartsWith("<<<<<<< ", StringComparison.Ordinal) || line == "<<<<<<<");

    public static MergeDocument Parse(IReadOnlyList<string> lines)
    {
        var doc = new MergeDocument();
        var clean = new List<string>();
        int i = 0;

        while (i < lines.Count)
        {
            string line = lines[i];
            if (!IsMarker(line, "<<<<<<<"))
            {
                clean.Add(line);
                i++;
                continue;
            }

            if (clean.Count > 0)
            {
                doc.Regions.Add(new MergeRegion { CleanLines = clean });
                clean = new List<string>();
            }

            i++;
            var local = ReadUntil(lines, ref i, "|||||||", "=======");

            var baseLines = new List<string>();
            bool hasBase = i < lines.Count && IsMarker(lines[i], "|||||||");
            if (hasBase)
            {
                i++;
                baseLines = ReadUntil(lines, ref i, "=======");
            }

            if (i < lines.Count && IsMarker(lines[i], "======="))
            {
                i++;
            }

            var remote = ReadUntil(lines, ref i, ">>>>>>>");

            if (i < lines.Count && IsMarker(lines[i], ">>>>>>>"))
            {
                i++;
            }

            doc.Regions.Add(new MergeRegion { Hunk = new ConflictHunk(baseLines, local, remote, hasBase) });
        }

        if (clean.Count > 0)
        {
            doc.Regions.Add(new MergeRegion { CleanLines = clean });
        }

        return doc;
    }

    private static List<string> ReadUntil(IReadOnlyList<string> lines, ref int i, params string[] stopMarkers)
    {
        var result = new List<string>();
        while (i < lines.Count)
        {
            string line = lines[i];
            if (stopMarkers.Any(marker => IsMarker(line, marker)))
            {
                break;
            }
            result.Add(line);
            i++;
        }
        return result;
    }

    private static bool IsMarker(string line, string marker) =>
        line.StartsWith(marker + " ", StringComparison.Ordinal) || line == marker;
}
