using System.ComponentModel;
using System.IO;
using System.Windows;
using QuestPDF.Infrastructure;

namespace MyMindWin;

public partial class App : Application
{
    public static string? StartupFilePath { get; private set; }

    public static void ClearStartupFilePath() => StartupFilePath = null;

    static App()
    {
        if (LicenseManager.UsageMode != LicenseUsageMode.Designtime)
            QuestPDF.Settings.License = LicenseType.Community;
    }

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
