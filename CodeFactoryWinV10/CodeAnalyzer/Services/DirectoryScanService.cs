namespace CodeAnalyzer.Services;

public static class DirectoryScanService
{
    private static readonly HashSet<string> DefaultExcludedNames = new(StringComparer.OrdinalIgnoreCase)
    {
        "bin", "obj", ".git", ".vs", ".idea", "node_modules", "packages", "__pycache__", ".venv", "venv", "dist", "build", "target"
    };

    public static IReadOnlyList<string> ScanSubdirectories(string rootPath)
    {
        if (!Directory.Exists(rootPath))
        {
            return [];
        }

        var directories = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var directory in EnumerateAccessibleDirectories(rootPath, rootPath))
        {
            directories.Add(directory);
        }

        return directories.OrderBy(path => path, StringComparer.OrdinalIgnoreCase).ToList();
    }

    public static bool ShouldExcludeByDefault(string relativePath)
    {
        return ContainsExcludedSegment(relativePath);
    }

    public static IEnumerable<string> GetSourceFiles(
        string rootPath,
        IEnumerable<string> excludedDirectories,
        IEnumerable<string> extensions)
    {
        if (!Directory.Exists(rootPath))
        {
            yield break;
        }

        var extensionSet = NormalizeExtensions(extensions);
        if (extensionSet.Count == 0)
        {
            yield break;
        }

        var excluded = NormalizeExcludedPaths(excludedDirectories);

        foreach (var file in EnumerateSourceFilesRecursive(rootPath, rootPath, excluded, extensionSet))
        {
            yield return file;
        }
    }

    public static int CountSourceFiles(
        string rootPath,
        IEnumerable<string> excludedDirectories,
        IEnumerable<string> extensions)
    {
        return GetSourceFiles(rootPath, excludedDirectories, extensions).Count();
    }

    private static IEnumerable<string> EnumerateSourceFilesRecursive(
        string rootPath,
        string currentDirectory,
        HashSet<string> excluded,
        HashSet<string> extensions)
    {
        var relativeDirectory = NormalizeRelativePath(Path.GetRelativePath(rootPath, currentDirectory));

        if (!IsDirectoryIncluded(relativeDirectory, excluded))
        {
            yield break;
        }

        IEnumerable<string> files;
        try
        {
            files = Directory.EnumerateFiles(currentDirectory);
        }
        catch (UnauthorizedAccessException)
        {
            yield break;
        }

        foreach (var file in files)
        {
            if (extensions.Contains(Path.GetExtension(file)))
            {
                yield return file;
            }
        }

        IEnumerable<string> subdirectories;
        try
        {
            subdirectories = Directory.EnumerateDirectories(currentDirectory);
        }
        catch (UnauthorizedAccessException)
        {
            yield break;
        }

        foreach (var subdirectory in subdirectories)
        {
            var directoryName = Path.GetFileName(subdirectory);
            if (DefaultExcludedNames.Contains(directoryName))
            {
                continue;
            }

            foreach (var file in EnumerateSourceFilesRecursive(rootPath, subdirectory, excluded, extensions))
            {
                yield return file;
            }
        }
    }

    private static IEnumerable<string> EnumerateAccessibleDirectories(string rootPath, string currentDirectory)
    {
        var relativeDirectory = NormalizeRelativePath(Path.GetRelativePath(rootPath, currentDirectory));
        if (relativeDirectory != "." && ContainsExcludedSegment(relativeDirectory))
        {
            yield break;
        }

        if (relativeDirectory != ".")
        {
            yield return relativeDirectory;
        }

        IEnumerable<string> subdirectories;
        try
        {
            subdirectories = Directory.EnumerateDirectories(currentDirectory);
        }
        catch (UnauthorizedAccessException)
        {
            yield break;
        }

        foreach (var subdirectory in subdirectories)
        {
            var directoryName = Path.GetFileName(subdirectory);
            if (DefaultExcludedNames.Contains(directoryName))
            {
                continue;
            }

            foreach (var nested in EnumerateAccessibleDirectories(rootPath, subdirectory))
            {
                yield return nested;
            }
        }
    }

    private static bool IsDirectoryIncluded(string relativeDirectory, HashSet<string> excluded)
    {
        if (ContainsExcludedSegment(relativeDirectory))
        {
            return false;
        }

        return !IsExcluded(relativeDirectory, excluded);
    }

    private static bool ContainsExcludedSegment(string relativePath)
    {
        foreach (var segment in relativePath.Split(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar))
        {
            if (string.IsNullOrWhiteSpace(segment) || segment == ".")
            {
                continue;
            }

            if (DefaultExcludedNames.Contains(segment))
            {
                return true;
            }
        }

        return false;
    }

    private static bool IsExcluded(string relativeDirectory, HashSet<string> excluded)
    {
        relativeDirectory = NormalizeRelativePath(relativeDirectory);

        if (excluded.Contains("."))
        {
            return true;
        }

        foreach (var excludedPath in excluded)
        {
            if (relativeDirectory.Equals(excludedPath, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }

            if (relativeDirectory.StartsWith(excludedPath + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
        }

        return false;
    }

    private static HashSet<string> NormalizeExtensions(IEnumerable<string> extensions)
    {
        var set = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var extension in extensions)
        {
            if (string.IsNullOrWhiteSpace(extension))
            {
                continue;
            }

            set.Add(extension.StartsWith('.') ? extension : "." + extension);
        }

        return set;
    }

    private static HashSet<string> NormalizeExcludedPaths(IEnumerable<string> excludedDirectories)
    {
        var set = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var path in excludedDirectories)
        {
            if (string.IsNullOrWhiteSpace(path))
            {
                continue;
            }

            set.Add(NormalizeRelativePath(path));
        }

        return set;
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
