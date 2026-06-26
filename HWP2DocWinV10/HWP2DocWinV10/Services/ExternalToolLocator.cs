namespace HWP2DocWinV10.Services;

internal sealed class ExternalToolLocator
{
    private readonly string _relativePath;
    private string? _resolvedPath;

    public ExternalToolLocator(string relativePathFromToolsFolder)
    {
        _relativePath = relativePathFromToolsFolder.Replace('/', Path.DirectorySeparatorChar);
    }

    public string RelativePath => _relativePath;

    public void Refresh() => _resolvedPath = null;

    public bool IsAvailable() => TryGetExecutablePath(out _);

    public string GetExecutablePath()
    {
        if (!TryGetExecutablePath(out string? path))
        {
            throw new FileNotFoundException(
                $"변환 도구를 찾을 수 없습니다. Tools\\{_relativePath} 가 있는지 확인하세요.");
        }

        return path;
    }

    public bool TryGetExecutablePath(out string path)
    {
        if (!string.IsNullOrEmpty(_resolvedPath) && File.Exists(_resolvedPath))
        {
            path = _resolvedPath;
            return true;
        }

        foreach (string candidate in EnumerateCandidatePaths())
        {
            if (!File.Exists(candidate))
                continue;

            _resolvedPath = candidate;
            path = candidate;
            return true;
        }

        _resolvedPath = null;
        path = Path.Combine(AppContext.BaseDirectory, "Tools", _relativePath);
        return false;
    }

    private IEnumerable<string> EnumerateCandidatePaths()
    {
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (string candidate in GetRawCandidatePaths())
        {
            string fullPath = Path.GetFullPath(candidate);
            if (seen.Add(fullPath))
                yield return fullPath;
        }
    }

    private IEnumerable<string> GetRawCandidatePaths()
    {
        yield return Path.Combine(AppContext.BaseDirectory, "Tools", _relativePath);

        string? directory = AppContext.BaseDirectory;
        for (int depth = 0; depth < 8 && directory != null; depth++)
        {
            yield return Path.Combine(directory, "Tools", _relativePath);
            directory = Directory.GetParent(directory)?.FullName;
        }
    }
}
