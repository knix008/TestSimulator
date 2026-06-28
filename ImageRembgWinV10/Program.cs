namespace ImageRembgWinV10;

using ImageRembgWinV10.Localization;
using ImageRembgWinV10.Services;

static class Program
{
    [STAThread]
    static void Main()
    {
        ApplicationConfiguration.Initialize();
        UserSettingsService.Load();
        LocalizationService.Initialize(UserSettingsService.Language);
        Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
        Application.ThreadException += Application_ThreadException;
        AppDomain.CurrentDomain.UnhandledException += CurrentDomain_UnhandledException;

        Application.ApplicationExit += (_, _) => RembgModelProvider.Instance.Dispose();
        Application.ApplicationExit += (_, _) => Rembg2ModelProvider.Instance.Dispose();

        Task.Run(() =>
        {
            try
            {
                Rembg2ModelProvider.Instance.EnsureReady();
            }
            catch
            {
                // Ignore — any real failure surfaces with a proper error message on first actual use.
            }
        });

        Application.Run(new ImageRembgForm());
    }

    private static void Application_ThreadException(object? sender, ThreadExceptionEventArgs e)
    {
        ErrorDialogService.ShowError(
            null,
            L.Get("Error.Unhandled"),
            L.Get("Error.UnhandledBody"),
            e.Exception,
            new Dictionary<string, string?>
            {
                [L.Get("Context.Executable")] = Application.ExecutablePath,
                [L.Get("Context.Timestamp")] = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss")
            });
    }

    private static void CurrentDomain_UnhandledException(object? sender, UnhandledExceptionEventArgs e)
    {
        if (e.ExceptionObject is Exception exception)
        {
            ErrorDialogService.ShowError(
                null,
                L.Get("Error.Fatal"),
                L.Get("Error.FatalBody"),
                exception,
                new Dictionary<string, string?>
                {
                    [L.Get("Context.Executable")] = Application.ExecutablePath,
                    [L.Get("Context.Timestamp")] = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss"),
                    [L.Get("Context.WillTerminate")] = e.IsTerminating ? L.Get("Common.Yes") : L.Get("Common.No")
                });
        }
    }
}
