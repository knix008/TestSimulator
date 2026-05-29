using System.IO;
using System.Windows;

namespace MyMindWin;

public partial class App : Application
{
    public static string? StartupFilePath { get; private set; }

    public static void ClearStartupFilePath() => StartupFilePath = null;

    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        if (e.Args.Length > 0)
        {
            var path = e.Args[0].Trim().Trim('"');
            if (File.Exists(path))
                StartupFilePath = path;
        }
    }
}
