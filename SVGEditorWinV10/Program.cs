namespace SVGEditorWinV10;

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
                ShowFatalError(ex);
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

    private static void ShowFatalError(Exception exception)
    {
        try
        {
            Ui.EditorErrorDialog.Show(
                null,
                "SVG Editor 오류",
                exception,
                "예기치 않은 오류가 발생했습니다.");
        }
        catch
        {
            MessageBox.Show(
                Ui.EditorErrorDialog.FormatException(exception),
                "SVG Editor 오류",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
        }
    }
}
