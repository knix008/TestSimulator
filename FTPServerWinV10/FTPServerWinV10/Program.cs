namespace FTPServerWinV10;

static class Program
{
    [STAThread]
    static void Main()
    {
        ApplicationConfiguration.Initialize();
        Application.ThreadException += (_, e) =>
            ErrorDialog.ShowError(null, "처리되지 않은 오류",
                "예기치 않은 오류가 발생했습니다.", e.Exception);
        AppDomain.CurrentDomain.UnhandledException += (_, e) =>
        {
            if (e.ExceptionObject is Exception ex)
                ErrorDialog.ShowError(null, "치명적 오류",
                    "프로그램을 계속 실행할 수 없습니다.", ex);
        };
        Application.Run(new MainForm());
    }
}