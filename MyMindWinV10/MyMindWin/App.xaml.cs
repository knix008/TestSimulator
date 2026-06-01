using System.ComponentModel;
using System.IO;
using System.Windows;
using MyMindWin.Diagnostics;
using QuestPDF.Infrastructure;

namespace MyMindWin;

public partial class App : Application
{
    public static string? StartupFilePath { get; private set; }

    public static void ClearStartupFilePath() => StartupFilePath = null;

    /// <summary>예외를 상세 팝업으로 표시합니다 (다른 모듈에서 호출).</summary>
    public static void ReportError(Exception exception, string? context = null)
        => ExceptionReporter.Show(exception, context);

    static App()
    {
        if (LicenseManager.UsageMode != LicenseUsageMode.Designtime)
            QuestPDF.Settings.License = LicenseType.Community;
    }

    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);
        ExceptionReporter.RegisterApplicationHandlers();

        if (e.Args.Length > 0)
        {
            var path = e.Args[0].Trim().Trim('"');
            if (File.Exists(path))
                StartupFilePath = path;
        }
    }
}
