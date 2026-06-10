using CodeAnalyzer.Controls;

namespace CodeAnalyzer;

static class Program
{
    /// <summary>
    ///  The main entry point for the application.
    /// </summary>
    [STAThread]
    static void Main(string[] args)
    {
        if (args.Length > 0 && args[0] == "--verify-export")
        {
            Environment.Exit(Services.CallGraphExportRoundTripVerifier.Run() ? 0 : 1);
        }

        if (args.Length > 0 && args[0] == "--verify-project")
        {
            Environment.Exit(Services.ProjectFileRoundTripVerifier.Run() ? 0 : 1);
        }

        ApplicationConfiguration.Initialize();
        Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
        Application.ThreadException += OnThreadException;
        AppDomain.CurrentDomain.UnhandledException += OnUnhandledException;

        Application.Run(new MainForm());
    }

    private static void OnThreadException(object sender, ThreadExceptionEventArgs e)
    {
        TryWriteCrashLog("Application.ThreadException", e.Exception);
        ShowFatalError("처리되지 않은 UI 오류", e.Exception);
    }

    private static void OnUnhandledException(object sender, UnhandledExceptionEventArgs e)
    {
        if (e.ExceptionObject is Exception ex)
        {
            TryWriteCrashLog("AppDomain.UnhandledException", ex);
            ShowFatalError("처리되지 않은 오류", ex);
        }
    }

    private static void TryWriteCrashLog(string source, Exception exception)
    {
        try
        {
            var path = Path.Combine(Path.GetTempPath(), "CodeAnalyzer-crash.log");
            var text =
                $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] {source}{Environment.NewLine}" +
                $"{exception}{Environment.NewLine}{new string('-', 72)}{Environment.NewLine}";
            File.AppendAllText(path, text);
        }
        catch
        {
            // ignore logging failures
        }
    }

    private static void ShowFatalError(string title, Exception exception)
    {
        try
        {
            DetailedErrorDialog.Show(
                null,
                title,
                exception,
                "예기치 않은 오류가 발생했습니다. 아래 상세 내용을 확인하고 필요 시 복사하세요.");
        }
        catch
        {
            MessageBox.Show(
                $"{exception.GetType().FullName}: {exception.Message}",
                title,
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
        }
    }
}