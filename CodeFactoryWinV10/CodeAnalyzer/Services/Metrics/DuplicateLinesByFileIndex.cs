using CodeAnalyzer.Models;

namespace CodeAnalyzer.Services.Metrics;

internal static class DuplicateLinesByFileIndex
{
    public static IReadOnlyDictionary<string, int> Build(DuplicateCodeResult duplicates)
    {
        var counts = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);

        foreach (var group in duplicates.Groups)
        {
            foreach (var fragment in group.Fragments)
            {
                var lines = Math.Max(1, fragment.EndLine - fragment.StartLine + 1);
                counts.TryGetValue(fragment.FilePath, out var existing);
                counts[fragment.FilePath] = existing + lines;
            }
        }

        return counts;
    }
}
