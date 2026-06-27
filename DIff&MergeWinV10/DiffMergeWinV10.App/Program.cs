using DiffMergeWinV10.App.Dialogs;
using DiffMergeWinV10.App.Services;

namespace DiffMergeWinV10.App;

internal static class Program
{
    /// <summary>
    /// Usage:
    ///   DiffMergeWinV10.App.exe                              -> standalone, pick files via dialogs
    ///   DiffMergeWinV10.App.exe &lt;conflicted-file&gt;               -> parse &lt;&lt;&lt;&lt;&lt;&lt;&lt; markers in-place
    ///   DiffMergeWinV10.App.exe &lt;BASE&gt; &lt;LOCAL&gt; &lt;REMOTE&gt; &lt;MERGED&gt;  -> git mergetool convention
    /// Exit code 0 means the merge was saved; non-zero means it was cancelled, so
    /// `git mergetool` (with mergetool.&lt;name&gt;.trustExitCode=true) knows the file is still unresolved.
    /// </summary>
    [STAThread]
    private static int Main(string[] args)
    {
        ApplicationConfiguration.Initialize();
        Strings.Language = AppSettingsStore.Load().Language;
        Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
        Application.ThreadException += (_, e) => ErrorDialog.Show(null, e.Exception);

        MergeForm form;
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
        return form.Saved ? 0 : 1;
    }

    private static MergeForm CreateForm(string[] args)
    {
        return args.Length switch
        {
            4 => MergeForm.FromMergeTool(baseFile: args[0], localFile: args[1], remoteFile: args[2], mergedFile: args[3]),
            1 => MergeForm.FromConflictedFile(args[0]),
            0 => MergeForm.Standalone(),
            _ => throw new ArgumentException(Strings.UsageError),
        };
    }
}
