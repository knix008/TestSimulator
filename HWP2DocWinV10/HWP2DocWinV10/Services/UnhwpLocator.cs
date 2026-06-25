namespace HWP2DocWinV10.Services;

internal static class UnhwpLocator
{
    public static string GetExecutablePath()
    {
        string candidate = Path.Combine(AppContext.BaseDirectory, "Tools", "unhwp", "unhwp.exe");
        if (!File.Exists(candidate))
            throw new FileNotFoundException("HWP 변환 도구(unhwp.exe)를 찾을 수 없습니다.", candidate);

        return candidate;
    }
}
