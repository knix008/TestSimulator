namespace RemoteDesktopWinV10.App;

static class Program
{
    [STAThread]
    static void Main()
    {
        ApplicationConfiguration.Initialize();
        Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
        Application.ThreadException += (_, e) => ShowFatalError(e.Exception);
        AppDomain.CurrentDomain.UnhandledException += (_, e) =>
        {
            if (e.ExceptionObject is Exception ex)
            {
                ShowFatalError(ex);
            }
        };

        try
        {
            Application.Run(new MainForm());
        }
        catch (Exception ex)
        {
            ShowFatalError(ex);
        }
    }

    private static void ShowFatalError(Exception ex)
    {
        try
        {
            ErrorDialog.Show(
                null,
                ExceptionMessageFormatter.Format(ex, "프로그램 실행 중 오류가 발생했습니다."),
                "Remote VNC Desktop",
                MessageBoxIcon.Error);
        }
        catch
        {
            MessageBox.Show(
                ex.ToString(),
                "Remote VNC Desktop",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
        }
    }
}
