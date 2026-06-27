using MyDiffWinV10.App.Dialogs;
using MyDiffWinV10.App.Services;

namespace MyDiffWinV10.App;

internal static class Program
{
    /// <summary>
    /// Usage:
    ///   MyDiffWinV10.App.exe                 -> standalone, pick Left/Right via dialogs
    ///   MyDiffWinV10.App.exe &lt;LEFT&gt; &lt;RIGHT&gt;   -> diff the two files directly
    ///                                            (git difftool convention / MyGitWinV10
    ///                                            external-diff-tool convention)
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

        DiffForm form;
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

    private static DiffForm CreateForm(string[] args)
    {
        return args.Length switch
        {
            2 => DiffForm.FromFiles(leftFile: args[0], rightFile: args[1]),
            0 => DiffForm.Standalone(),
            _ => throw new ArgumentException(Strings.UsageError),
        };
    }
}
