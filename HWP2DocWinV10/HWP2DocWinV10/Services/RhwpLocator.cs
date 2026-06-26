namespace HWP2DocWinV10.Services;

internal static class RhwpLocator
{
    private static readonly ExternalToolLocator Tool = new(@"rhwp\rhwp.exe");

    public static void Refresh() => Tool.Refresh();

    public static bool IsAvailable() => Tool.IsAvailable();

    public static string GetExecutablePath() => Tool.GetExecutablePath();

    public static bool TryGetExecutablePath(out string path) => Tool.TryGetExecutablePath(out path);
}
