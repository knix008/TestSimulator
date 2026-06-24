using DeskSearch.Models;

namespace DeskSearch.Services;

public sealed class IndexExclusionPolicy : IEquatable<IndexExclusionPolicy>
{
    public static IndexExclusionPolicy Empty { get; } = new([], []);

    private readonly HashSet<string> _excludedDriveRoots;
    private readonly List<string> _excludedDirectoryPrefixes;

    public IndexExclusionPolicy(IEnumerable<string> excludedDrives, IEnumerable<string> excludedDirectories)
    {
        _excludedDriveRoots = excludedDrives
            .Select(NormalizeDriveRoot)
            .Where(static root => root is not null)
            .Cast<string>()
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        _excludedDirectoryPrefixes = excludedDirectories
            .Select(NormalizeDirectoryPrefix)
            .Where(static prefix => prefix is not null)
            .Cast<string>()
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderByDescending(static prefix => prefix.Length)
            .ToList();
    }

    public static IndexExclusionPolicy FromSettings(AppSettings settings) =>
        new(settings.ExcludedDrives ?? [], settings.ExcludedDirectories ?? []);

    public bool IsDriveExcluded(string driveRoot)
    {
        var normalized = NormalizeDriveRoot(driveRoot);
        return normalized is not null && _excludedDriveRoots.Contains(normalized);
    }

    public bool IsPathExcluded(string? fullPath)
    {
        if (string.IsNullOrWhiteSpace(fullPath))
            return false;

        string normalized;
        try
        {
            normalized = Path.GetFullPath(fullPath.Trim().TrimEnd('\\', '/'));
        }
        catch
        {
            return false;
        }

        var root = Path.GetPathRoot(normalized);
        if (root is not null && IsDriveExcluded(root))
            return true;

        var prefix = normalized.TrimEnd('\\') + "\\";
        return _excludedDirectoryPrefixes.Any(excluded =>
            prefix.StartsWith(excluded, StringComparison.OrdinalIgnoreCase));
    }

    public static string? NormalizeDriveRoot(string drive)
    {
        if (string.IsNullOrWhiteSpace(drive))
            return null;

        var trimmed = drive.Trim().TrimEnd('\\', '/');
        if (trimmed.Length < 2 || trimmed[1] != ':')
            return null;

        return char.ToUpperInvariant(trimmed[0]) + ":\\";
    }

    public static string? NormalizeDirectoryPrefix(string path)
    {
        if (string.IsNullOrWhiteSpace(path))
            return null;

        try
        {
            var full = Path.GetFullPath(path.Trim().TrimEnd('\\', '/'));
            if (string.IsNullOrWhiteSpace(Path.GetPathRoot(full)))
                return null;

            return full.TrimEnd('\\') + "\\";
        }
        catch
        {
            return null;
        }
    }

    public static string? NormalizeDirectoryDisplay(string path)
    {
        var prefix = NormalizeDirectoryPrefix(path);
        return prefix?.TrimEnd('\\');
    }

    public bool Equals(IndexExclusionPolicy? other)
    {
        if (other is null)
            return false;

        if (_excludedDriveRoots.Count != other._excludedDriveRoots.Count
            || _excludedDirectoryPrefixes.Count != other._excludedDirectoryPrefixes.Count)
        {
            return false;
        }

        return _excludedDriveRoots.SetEquals(other._excludedDriveRoots)
            && _excludedDirectoryPrefixes.SequenceEqual(
                other._excludedDirectoryPrefixes,
                StringComparer.OrdinalIgnoreCase);
    }

    public override bool Equals(object? obj) => Equals(obj as IndexExclusionPolicy);

    public override int GetHashCode()
    {
        var hash = new HashCode();
        foreach (var drive in _excludedDriveRoots.OrderBy(static d => d, StringComparer.OrdinalIgnoreCase))
            hash.Add(drive, StringComparer.OrdinalIgnoreCase);

        foreach (var directory in _excludedDirectoryPrefixes)
            hash.Add(directory, StringComparer.OrdinalIgnoreCase);

        return hash.ToHashCode();
    }
}
