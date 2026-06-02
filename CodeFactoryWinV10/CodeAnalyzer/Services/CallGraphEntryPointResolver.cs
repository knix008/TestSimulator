using CodeAnalyzer.Models;

namespace CodeAnalyzer.Services;

public static class CallGraphEntryPointResolver
{
    private static readonly Dictionary<string, string[]> EntryPointNames = new(StringComparer.OrdinalIgnoreCase)
    {
        ["csharp"] = ["Main"],
        ["vbnet"] = ["Main"],
        ["python"] = ["main"],
        ["java"] = ["main"],
        ["kotlin"] = ["main"],
        ["cpp"] = ["main", "wmain", "WinMain"],
        ["go"] = ["main"],
        ["rust"] = ["main"],
        ["swift"] = ["main"],
        ["javascript"] = ["main"],
        ["ruby"] = [],
        ["php"] = []
    };

    public static IReadOnlyList<CallGraphNode> FindEntryPoints(CallGraphResult result)
    {
        var entryPoints = new List<CallGraphNode>();

        foreach (var languageId in GetLanguageIds(result.Nodes))
        {
            if (!EntryPointNames.TryGetValue(languageId, out var names) || names.Length == 0)
            {
                continue;
            }

            var languageNodes = result.Nodes
                .Where(node => GetLanguageId(node) == languageId)
                .ToList();

            var match = FindBestEntryPoint(languageNodes, names, result);
            if (match is not null)
            {
                entryPoints.Add(match);
            }
        }

        return entryPoints
            .OrderBy(node => node.FullName, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    public static CallGraphNode? FindFallbackRoot(CallGraphResult result)
    {
        return result.Nodes
            .OrderByDescending(node => result.Outgoing.TryGetValue(node.Id, out var children) ? children.Count : 0)
            .ThenBy(node => node.FullName, StringComparer.OrdinalIgnoreCase)
            .FirstOrDefault();
    }

    private static CallGraphNode? FindBestEntryPoint(
        IReadOnlyList<CallGraphNode> nodes,
        IReadOnlyList<string> entryNames,
        CallGraphResult result)
    {
        var candidates = nodes
            .Where(node => entryNames.Any(name =>
                string.Equals(node.DisplayName, name, StringComparison.OrdinalIgnoreCase)))
            .ToList();

        if (candidates.Count == 0)
        {
            return null;
        }

        return candidates
            .OrderByDescending(node => result.Outgoing.TryGetValue(node.Id, out var children) ? children.Count : 0)
            .ThenBy(node => node.FilePath, StringComparer.OrdinalIgnoreCase)
            .ThenBy(node => node.LineNumber)
            .First();
    }

    private static IEnumerable<string> GetLanguageIds(IEnumerable<CallGraphNode> nodes)
    {
        return nodes
            .Select(GetLanguageId)
            .Where(languageId => languageId.Length > 0)
            .Distinct(StringComparer.OrdinalIgnoreCase);
    }

    private static string GetLanguageId(CallGraphNode node)
    {
        var separatorIndex = node.Id.IndexOf(':');
        return separatorIndex > 0 ? node.Id[..separatorIndex] : string.Empty;
    }
}
