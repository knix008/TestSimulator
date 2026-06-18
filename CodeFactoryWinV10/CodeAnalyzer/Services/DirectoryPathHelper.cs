namespace CodeAnalyzer.Services;

internal static class DirectoryPathHelper
{
    public static string Normalize(string path)
    {
        if (string.IsNullOrWhiteSpace(path) || path == ".")
        {
            return ".";
        }

        return path
            .Replace(Path.AltDirectorySeparatorChar, Path.DirectorySeparatorChar)
            .TrimEnd(Path.DirectorySeparatorChar);
    }

    public static string? GetParentPath(string path)
    {
        path = Normalize(path);
        if (path == ".")
        {
            return null;
        }

        var separator = path.LastIndexOf(Path.DirectorySeparatorChar);
        return separator < 0 ? "." : Normalize(path[..separator]);
    }

    public static bool IsSamePath(string left, string right) =>
        string.Equals(Normalize(left), Normalize(right), StringComparison.OrdinalIgnoreCase);

    public static bool IsAncestorPath(string ancestor, string path)
    {
        ancestor = Normalize(ancestor);
        path = Normalize(path);
        if (ancestor == ".")
        {
            return path != ".";
        }

        if (IsSamePath(ancestor, path))
        {
            return false;
        }

        return path.StartsWith(ancestor + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase);
    }

    public static bool IsSameOrAncestorPath(string ancestor, string path) =>
        IsSamePath(ancestor, path) || IsAncestorPath(ancestor, path);

    public static bool IsStrictDescendantPath(string ancestor, string path) =>
        IsAncestorPath(ancestor, path);

    public static IReadOnlyList<string> NormalizeIncludedPaths(IEnumerable<string> paths)
    {
        var normalized = paths
            .Select(Normalize)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(path => path, StringComparer.OrdinalIgnoreCase)
            .ToList();

        var minimal = new List<string>();
        foreach (var path in normalized)
        {
            if (minimal.Any(existing => IsSameOrAncestorPath(existing, path)))
            {
                continue;
            }

            minimal.RemoveAll(existing => IsStrictDescendantPath(path, existing));
            minimal.Add(path);
        }

        return minimal;
    }
}
