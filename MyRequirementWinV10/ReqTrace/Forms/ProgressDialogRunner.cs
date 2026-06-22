using System.Diagnostics;
using ReqTrace.Importing;
using ReqTrace.Localization;

namespace ReqTrace.Forms;

internal static class ProgressDialogRunner
{
    public static ProgressDialogResult<T> Run<T>(Form? owner, string title, string message, Func<IProgress<ImportProgressReport>, CancellationToken, Task<T>> work)
    {
        using var cts = new CancellationTokenSource();
        using var progressDialog = new ProgressDialog(title, message, allowCancel: true, showElapsedTime: true);
        var progress = new Progress<ImportProgressReport>(report => progressDialog.SetProgress(report));
        progressDialog.CancelRequested += () => cts.Cancel();
        var uiContext = SynchronizationContext.Current;

        var stopwatch = Stopwatch.StartNew();
        var task = Task.Run(async () => await work(progress, cts.Token).ConfigureAwait(false));
        RegisterCloseOnCompletion(progressDialog, task, uiContext);

        try
        {
            progressDialog.ShowDialog(GetProgressOwner(owner));
        }
        finally
        {
            stopwatch.Stop();
            EnsureClosed(progressDialog, uiContext);
        }

        return new ProgressDialogResult<T>(task.GetAwaiter().GetResult(), stopwatch.Elapsed);
    }

    public static T Run<T>(Form? owner, string title, string message, Func<IProgress<int>, T> work)
    {
        using var progressDialog = new ProgressDialog(title, message);
        var progress = new Progress<int>(progressDialog.SetProgress);
        var uiContext = SynchronizationContext.Current;
        var task = Task.Run(() => work(progress));

        RegisterCloseOnCompletion(progressDialog, task, uiContext);

        try
        {
            progressDialog.ShowDialog(GetProgressOwner(owner));
        }
        finally
        {
            EnsureClosed(progressDialog, uiContext);
        }

        return task.GetAwaiter().GetResult();
    }

    public static void RunUi(Form owner, string title, string message, Action<IProgress<int>> work)
    {
        using var progressDialog = new ProgressDialog(title, message);
        var progress = new Progress<int>(percent =>
        {
            progressDialog.SetProgress(percent);
            progressDialog.Refresh();
        });
        var uiContext = SynchronizationContext.Current;

        progressDialog.Shown += (_, _) =>
        {
            try
            {
                work(progress);
                progressDialog.SetProgress(100);
            }
            finally
            {
                EnsureClosed(progressDialog, uiContext);
            }
        };

        try
        {
            progressDialog.ShowDialog(GetProgressOwner(owner));
        }
        finally
        {
            EnsureClosed(progressDialog, uiContext);
        }
    }

    private static IWin32Window? GetProgressOwner(Form? owner)
    {
        if (owner is { IsDisposed: false, Visible: true })
            return owner;

        return owner;
    }

    private static void RegisterCloseOnCompletion(ProgressDialog progressDialog, Task task, SynchronizationContext? uiContext)
    {
        task.ContinueWith(
            _ => EnsureClosed(progressDialog, uiContext),
            CancellationToken.None,
            TaskContinuationOptions.None,
            TaskScheduler.Default);
    }

    private static void EnsureClosed(ProgressDialog progressDialog, SynchronizationContext? uiContext = null)
    {
        if (progressDialog.IsDisposed)
            return;

        void CloseOnUiThread()
        {
            if (progressDialog.IsDisposed)
                return;

            progressDialog.MarkWorkCompleted(scheduleAutoCloseFallback: false);
            progressDialog.CloseDialog();
        }

        if (uiContext is not null)
        {
            try
            {
                uiContext.Send(_ => CloseOnUiThread(), null);
                return;
            }
            catch (InvalidOperationException)
            {
                // UI context is no longer available; fall back to control invoke.
            }
        }

        if (progressDialog.InvokeRequired)
        {
            try
            {
                progressDialog.Invoke(CloseOnUiThread);
            }
            catch (ObjectDisposedException)
            {
                // Dialog already torn down.
            }

            return;
        }

        CloseOnUiThread();
    }
}
