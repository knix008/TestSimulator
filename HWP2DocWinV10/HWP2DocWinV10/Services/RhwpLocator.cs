namespace HWP2DocWinV10.Services;

internal static class RhwpLocator
{
    private static string? _resolvedPath;

    /// <summary>다음 조회 시 설치 경로를 다시 검색합니다.</summary>
    public static void Refresh() => _resolvedPath = null;

    public static bool IsAvailable()
        => TryGetExecutablePath(out _);

    public static string GetExecutablePath()
    {
        if (!TryGetExecutablePath(out string? path))
        {
            throw new FileNotFoundException(
                "HWP 변환 도구(rhwp.exe)를 찾을 수 없습니다. Tools\\rhwp\\rhwp.exe가 배포되어 있는지 확인하세요.");
        }

        return path;
    }

    public static bool TryGetExecutablePath(out string path)
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
        path = Path.Combine(AppContext.BaseDirectory, "Tools", "rhwp", "rhwp.exe");
        return false;
    }

    private static IEnumerable<string> EnumerateCandidatePaths()
    {
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (string candidate in GetRawCandidatePaths())
        {
            string fullPath = Path.GetFullPath(candidate);
            if (seen.Add(fullPath))
                yield return fullPath;
        }
    }

    private static IEnumerable<string> GetRawCandidatePaths()
    {
        yield return Path.Combine(AppContext.BaseDirectory, "Tools", "rhwp", "rhwp.exe");

        // 개발 환경: bin\...\net10.0-windows 에서 상위로 올라가며 Tools\rhwp 탐색
        string? directory = AppContext.BaseDirectory;
        for (int depth = 0; depth < 8 && directory != null; depth++)
        {
            yield return Path.Combine(directory, "Tools", "rhwp", "rhwp.exe");
            directory = Directory.GetParent(directory)?.FullName;
        }
    }
}
