using CodeAnalyzer.Models;

namespace CodeAnalyzer.Services;

public static class DirectoryScopeSettings
{
    /// <summary>구버전 포함(화이트리스트) 설정을 제외 목록으로 변환합니다.</summary>
    public static void MigrateLegacyIncludedPaths(UserAnalysisSettings settings, IReadOnlyList<string> knownSubdirectories)
    {
        if (settings.IncludedDirectoryPaths.Count == 0 || knownSubdirectories.Count == 0)
        {
            return;
        }

        var included = new HashSet<string>(settings.IncludedDirectoryPaths, StringComparer.OrdinalIgnoreCase);
        var excluded = new HashSet<string>(settings.ExcludedDirectoryPaths, StringComparer.OrdinalIgnoreCase);

        foreach (var path in knownSubdirectories)
        {
            if (!included.Contains(path))
            {
                excluded.Add(path);
            }
        }

        settings.ExcludedDirectoryPaths = excluded.OrderBy(path => path, StringComparer.OrdinalIgnoreCase).ToList();
        settings.IncludedDirectoryPaths = [];
    }

    public static List<string> CollectExcludedPaths(IReadOnlyList<string> allPaths, Func<int, bool> isChecked)
    {
        var excluded = new List<string>();
        for (var i = 0; i < allPaths.Count; i++)
        {
            if (!isChecked(i))
            {
                excluded.Add(allPaths[i]);
            }
        }

        return excluded;
    }

    public static List<string> CollectIncludedPaths(IReadOnlyList<string> allPaths, Func<int, bool> isChecked)
    {
        var included = new List<string>();
        for (var i = 0; i < allPaths.Count; i++)
        {
            if (isChecked(i))
            {
                included.Add(allPaths[i]);
            }
        }

        return included;
    }

    public static List<string> ResolveIncludedPathsForSidebar(
        IReadOnlyList<string> knownPaths,
        IReadOnlyList<string> includedPaths,
        IReadOnlyList<string> excludedPaths)
    {
        if (includedPaths.Count > 0)
        {
            return includedPaths
                .Select(NormalizeRelativePath)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .OrderBy(path => path, StringComparer.OrdinalIgnoreCase)
                .ToList();
        }

        if (excludedPaths.Count == 0)
        {
            return knownPaths
                .Select(NormalizeRelativePath)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .OrderBy(path => path, StringComparer.OrdinalIgnoreCase)
                .ToList();
        }

        var excluded = new HashSet<string>(
            excludedPaths.Select(NormalizeRelativePath),
            StringComparer.OrdinalIgnoreCase);

        return knownPaths
            .Select(NormalizeRelativePath)
            .Where(path => !excluded.Contains(path))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(path => path, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    private static string NormalizeRelativePath(string path)
    {
        if (string.IsNullOrWhiteSpace(path) || path == ".")
        {
            return ".";
        }

        return path
            .Replace(Path.AltDirectorySeparatorChar, Path.DirectorySeparatorChar)
            .TrimEnd(Path.DirectorySeparatorChar);
    }
}
