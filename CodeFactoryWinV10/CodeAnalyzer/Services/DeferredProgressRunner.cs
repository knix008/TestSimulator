using CodeAnalyzer.Controls;
using CodeAnalyzer.Models;

namespace CodeAnalyzer.Services;

public static class DeferredProgressRunner
{
    public const int DefaultShowDelayMs = 500;

    public static async Task<T> RunAsync<T>(
        IWin32Window? owner,
        string title,
        Func<IProgress<AnalysisProgressReport>, Task<T>> work,
        int showDelayMs = DefaultShowDelayMs)
    {
        using var dialog = new DeferredProgressDialog(title);
        var stopwatch = System.Diagnostics.Stopwatch.StartNew();
        var progress = new Progress<AnalysisProgressReport>(report =>
        {
            if (dialog.IsHandleCreated)
            {
                dialog.UpdateProgress(report);
            }
        });

        var workTask = work(progress);
        var delayTask = Task.Delay(Math.Max(0, showDelayMs));

        await Task.WhenAny(workTask, delayTask).ConfigureAwait(true);

        if (!workTask.IsCompleted)
        {
            dialog.UpdateProgress(new AnalysisProgressReport
            {
                Percent = 0,
                Message = "작업을 처리하는 중...",
                Elapsed = stopwatch.Elapsed
            });
            dialog.Show(owner);
        }

        try
        {
            return await workTask.ConfigureAwait(true);
        }
        finally
        {
            if (dialog.Visible)
            {
                dialog.Close();
            }
        }
    }
}
