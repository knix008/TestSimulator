namespace HWP2DocWinV10.Services;

internal static class RhwpLocator
{
    public static bool IsAvailable()
    {
        return TryGetExecutablePath(out _);
    }

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
        path = Path.Combine(AppContext.BaseDirectory, "Tools", "rhwp", "rhwp.exe");
        return File.Exists(path);
    }
}
