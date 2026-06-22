using QuestPDF.Infrastructure;

namespace MyGitWinV10.App;

internal static class Program
{
    [STAThread]
    private static void Main()
    {
        QuestPDF.Settings.License = LicenseType.Community;
        ApplicationConfiguration.Initialize();
        Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
        Application.ThreadException += OnThreadException;
        AppDomain.CurrentDomain.UnhandledException += OnUnhandledException;
        TaskScheduler.UnobservedTaskException += OnUnobservedTaskException;
        Application.Run(new MainForm());
    }

    private static void OnThreadException(object sender, ThreadExceptionEventArgs e) =>
        ReportFatalStartupIssue(e.Exception);

    private static void OnUnhandledException(object sender, UnhandledExceptionEventArgs e)
    {
        if (e.ExceptionObject is Exception ex)
        {
            ReportFatalStartupIssue(ex);
        }
    }

    private static void OnUnobservedTaskException(object? sender, UnobservedTaskExceptionEventArgs e)
    {
        e.SetObserved();
        if (e.Exception.InnerException is not null)
        {
            ReportFatalStartupIssue(e.Exception.InnerException);
        }
    }

    private static void ReportFatalStartupIssue(Exception ex)
    {
        try
        {
            MessageBox.Show(
                ex.ToString(),
                AppInfo.Title,
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
        }
        catch
        {
            // Best-effort diagnostics only.
        }
    }
}
