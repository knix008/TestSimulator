namespace CodeAnalyzer.Services;

internal static class AnalysisExportPathHelper
{
    public static string ToStoredPath(string? path, string rootDirectory)
    {
        if (string.IsNullOrWhiteSpace(path))
        {
            return string.Empty;
        }

        if (string.IsNullOrWhiteSpace(rootDirectory))
        {
            return path;
        }

        try
        {
            var fullPath = Path.GetFullPath(path);
            var rootFullPath = Path.GetFullPath(rootDirectory);
            if (!rootFullPath.EndsWith(Path.DirectorySeparatorChar))
            {
                rootFullPath += Path.DirectorySeparatorChar;
            }

            if (fullPath.StartsWith(rootFullPath, StringComparison.OrdinalIgnoreCase))
            {
                return fullPath[rootFullPath.Length..].TrimStart(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
            }
        }
        catch (IOException)
        {
        }
        catch (UnauthorizedAccessException)
        {
        }

        return path;
    }

    public static string ToAbsolutePath(string? storedPath, string rootDirectory)
    {
        if (string.IsNullOrWhiteSpace(storedPath))
        {
            return string.Empty;
        }

        if (Path.IsPathRooted(storedPath) || string.IsNullOrWhiteSpace(rootDirectory))
        {
            return storedPath;
        }

        try
        {
            return Path.GetFullPath(Path.Combine(rootDirectory, storedPath));
        }
        catch (IOException)
        {
            return storedPath;
        }
        catch (UnauthorizedAccessException)
        {
            return storedPath;
        }
    }
}
