namespace SVGEditorWinV10.Ui;

public static class AppIcons
{
    public static Icon? LoadApplicationIcon()
    {
        var candidates = new[]
        {
            Path.Combine(AppContext.BaseDirectory, "Assets", "AppIcon.ico"),
            Path.Combine(AppContext.BaseDirectory, "AppIcon.ico")
        };

        foreach (var path in candidates)
        {
            if (!File.Exists(path))
                continue;

            return new Icon(path);
        }

        return Icon.ExtractAssociatedIcon(Application.ExecutablePath);
    }
}
