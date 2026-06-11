namespace MyClockWinV10.Services;

public enum ScreensaverLaunchMode
{
    Application,
    Fullscreen,
    Configure,
    Preview
}

public readonly record struct ScreensaverLaunchInfo(
    ScreensaverLaunchMode Mode,
    IntPtr PreviewWindowHandle = default);

public static class ScreensaverCommandLine
{
    public static ScreensaverLaunchInfo Parse(string[] args)
    {
        if (args.Length == 0)
            return new ScreensaverLaunchInfo(ScreensaverLaunchMode.Application);

        string first = args[0].Trim();
        string lower = first.ToLowerInvariant();

        if (lower is "/s" or "-s" or "s")
            return new ScreensaverLaunchInfo(ScreensaverLaunchMode.Fullscreen);

        if (lower is "/c" or "-c" or "c")
            return new ScreensaverLaunchInfo(ScreensaverLaunchMode.Configure);

        if (lower.StartsWith("/p") || lower.StartsWith("-p"))
        {
            string hwndText = first.Length > 2
                ? first[2..]
                : args.Length > 1 ? args[1] : "";
            if (long.TryParse(hwndText, out long hwnd))
                return new ScreensaverLaunchInfo(ScreensaverLaunchMode.Preview, new IntPtr(hwnd));
        }

        return new ScreensaverLaunchInfo(ScreensaverLaunchMode.Application);
    }
}
