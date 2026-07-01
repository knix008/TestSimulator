using DeskSearch.Models;

namespace DeskSearch.Services;

public sealed class IndexInclusionPolicy : IEquatable<IndexInclusionPolicy>
{
    public static IndexInclusionPolicy Empty { get; } = new([], [], []);

    private readonly HashSet<string> _includedDriveRoots;
    private readonly List<string> _includedDirectoryPrefixes;
    private readonly List<string> _excludedDirectoryPrefixes;
    private readonly IReadOnlyList<string> _scanRoots;

    public IndexInclusionPolicy(
        IEnumerable<string> includedDrives,
        IEnumerable<string> includedDirectories,
        IEnumerable<string>? legacyExcludedDirectories = null)
    {
        _includedDriveRoots = includedDrives
            .Select(NormalizeDriveRoot)
            .Where(static root => root is not null)
            .Cast<string>()
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        _includedDirectoryPrefixes = includedDirectories
            .Select(NormalizeDirectoryPrefix)
            .Where(static prefix => prefix is not null)
            .Cast<string>()
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderByDescending(static prefix => prefix.Length)
            .ToList();

        _excludedDirectoryPrefixes = (legacyExcludedDirectories ?? [])
            .Select(NormalizeDirectoryPrefix)
            .Where(static prefix => prefix is not null)
            .Cast<string>()
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderByDescending(static prefix => prefix.Length)
            .ToList();

        _scanRoots = BuildScanRoots();
    }

    public static IndexInclusionPolicy FromSettings(AppSettings settings) =>
        new(
            settings.IncludedDrives ?? [],
            settings.IncludedDirectories ?? [],
            settings.ExcludedDirectories ?? []);

    public IReadOnlyCollection<string> IncludedDriveRoots => _includedDriveRoots;

    public IReadOnlyList<string> IncludedDirectoryPrefixes => _includedDirectoryPrefixes;

    public IReadOnlyList<string> LegacyExcludedDirectoryPrefixes => _excludedDirectoryPrefixes;

    public IReadOnlyList<string> ScanRoots => _scanRoots;

    public bool IsPathInScope(string? fullPath)
    {
        if (string.IsNullOrWhiteSpace(fullPath))
            return false;

        if (_scanRoots.Count == 0)
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

        var prefix = normalized.TrimEnd('\\') + "\\";
        var included = false;
        foreach (var root in _scanRoots)
        {
            var rootPrefix = root.EndsWith('\\')
                ? root
                : root.TrimEnd('\\') + "\\";

            if (prefix.StartsWith(rootPrefix, StringComparison.OrdinalIgnoreCase)
                || normalized.Equals(root.TrimEnd('\\'), StringComparison.OrdinalIgnoreCase))
            {
                included = true;
                break;
            }
        }

        if (!included)
            return false;

        foreach (var excludedPrefix in _excludedDirectoryPrefixes)
        {
            if (prefix.StartsWith(excludedPrefix, StringComparison.OrdinalIgnoreCase)
                || normalized.Equals(excludedPrefix.TrimEnd('\\'), StringComparison.OrdinalIgnoreCase))
            {
                return false;
            }
        }

        return true;
    }

    public bool IsPathExcluded(string? fullPath) => !IsPathInScope(fullPath);

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

    public static IReadOnlyList<string> GetAllReadyDriveRoots()
    {
        var roots = new List<string>();

        foreach (var drive in DriveInfo.GetDrives())
        {
            try
            {
                if (!drive.IsReady)
                    continue;

                var root = NormalizeDriveRoot(drive.Name);
                if (root is not null)
                    roots.Add(root);
            }
            catch (IOException)
            {
                // 드라이브 정보를 읽을 수 없음
            }
            catch (UnauthorizedAccessException)
            {
                // 드라이브 접근 불가
            }
        }

        return roots.OrderBy(static r => r, StringComparer.OrdinalIgnoreCase).ToList();
    }

    private IReadOnlyList<string> BuildScanRoots()
    {
        var roots = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var drive in _includedDriveRoots)
            roots.Add(drive);

        foreach (var directory in _includedDirectoryPrefixes)
            roots.Add(directory.TrimEnd('\\'));

        return roots.OrderBy(static r => r, StringComparer.OrdinalIgnoreCase).ToList();
    }

    public bool Equals(IndexInclusionPolicy? other)
    {
        if (other is null)
            return false;

        if (_includedDriveRoots.Count != other._includedDriveRoots.Count
            || _includedDirectoryPrefixes.Count != other._includedDirectoryPrefixes.Count
            || _excludedDirectoryPrefixes.Count != other._excludedDirectoryPrefixes.Count)
        {
            return false;
        }

        return _includedDriveRoots.SetEquals(other._includedDriveRoots)
            && _includedDirectoryPrefixes.SequenceEqual(
                other._includedDirectoryPrefixes,
                StringComparer.OrdinalIgnoreCase)
            && _excludedDirectoryPrefixes.SequenceEqual(
                other._excludedDirectoryPrefixes,
                StringComparer.OrdinalIgnoreCase);
    }

    public override bool Equals(object? obj) => Equals(obj as IndexInclusionPolicy);

    public override int GetHashCode()
    {
        var hash = new HashCode();
        foreach (var drive in _includedDriveRoots.OrderBy(static d => d, StringComparer.OrdinalIgnoreCase))
            hash.Add(drive, StringComparer.OrdinalIgnoreCase);

        foreach (var directory in _includedDirectoryPrefixes)
            hash.Add(directory, StringComparer.OrdinalIgnoreCase);

        foreach (var directory in _excludedDirectoryPrefixes)
            hash.Add(directory, StringComparer.OrdinalIgnoreCase);

        return hash.ToHashCode();
    }
}
