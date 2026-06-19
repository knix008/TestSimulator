namespace MyGitWinV10.App;

internal static class AppInfo
{
    public const string Title = "MyGit V1.0.0";

    public static Icon LoadIcon()
    {
        if (Application.ExecutablePath is { Length: > 0 } executablePath)
        {
            Icon? icon = Icon.ExtractAssociatedIcon(executablePath);
            if (icon is not null)
            {
                return icon;
            }
        }

        string assetPath = Path.Combine(AppContext.BaseDirectory, "Assets", "MyGit.ico");
        if (File.Exists(assetPath))
        {
            return new Icon(assetPath);
        }

        return SystemIcons.Application;
    }
}
