using MyDiffWinV10.App.Dialogs;
using MyDiffWinV10.App.Services;

namespace MyDiffWinV10.App;

internal static class Program
{
    /// <summary>
    /// Usage:
    ///   MyDiffWinV10.App.exe                 -> directory compare home screen
    ///   MyDiffWinV10.App.exe &lt;LEFT&gt; &lt;RIGHT&gt;   -> file diff directly
    ///                                            (git difftool / MyGitWinV10 external diff)
    /// </summary>
    [STAThread]
    private static int Main(string[] args)
    {
        ApplicationConfiguration.Initialize();
        Strings.Language = AppSettingsStore.Load().Language;
        Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
        Application.ThreadException += (_, e) => ErrorDialog.Show(null, e.Exception);
        AppDomain.CurrentDomain.UnhandledException += (_, e) =>
        {
            if (e.ExceptionObject is Exception ex)
            {
                ErrorDialog.Show(null, ex);
            }
        };

        Form form;
        try
        {
            form = CreateForm(args);
        }
        catch (Exception ex)
        {
            ErrorDialog.Show(null, ex);
            return 1;
        }

        Application.Run(form);
        return 0;
    }

    private static Form CreateForm(string[] args)
    {
        return args.Length switch
        {
            2 => MainForm.FromFiles(leftFile: args[0], rightFile: args[1]),
            0 => MainForm.Standalone(),
            _ => throw new ArgumentException(Strings.UsageError),
        };
    }
}
