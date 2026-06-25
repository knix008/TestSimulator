namespace HWP2DocWinV10;

static class Program
{
    [STAThread]
    static void Main()
    {
        ApplicationConfiguration.Initialize();
        Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
        Application.ThreadException += (_, e) =>
        {
            ErrorDialog.Show(
                null,
                "오류",
                "예기치 않은 오류가 발생했습니다.",
                e.Exception);
        };

        Application.Run(new HWP2DocForm());
    }
}
