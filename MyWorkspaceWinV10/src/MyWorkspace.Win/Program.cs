namespace MyWorkspace.Win;

static class Program
{
    [STAThread]
    static void Main()
    {
        ApplicationConfiguration.Initialize();
        Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
        Application.ThreadException += (_, e) =>
            Forms.ErrorDetailForm.Show(null, Localization.Get(K.ErrorTitle), e.Exception);

        AppConfig.LoadUiPreferences();

        Application.Run(new Forms.MainForm());
    }
}
