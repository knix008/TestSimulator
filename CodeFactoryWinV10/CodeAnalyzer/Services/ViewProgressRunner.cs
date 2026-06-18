using CodeAnalyzer.Controls;
using CodeAnalyzer.Models;

namespace CodeAnalyzer.Services;

/// <summary>뷰 구성 작업을 백그라운드에서 실행하고 지연 후 진행률 대화상자를 표시합니다.</summary>
public static class ViewProgressRunner
{
    public static Task RunBackgroundAsync(
        IWin32Window? owner,
        string title,
        Action<IProgress<AnalysisProgressReport>> work,
        int showDelayMs = DeferredProgressRunner.DefaultShowDelayMs)
    {
        return RunBackgroundAsync(
            owner,
            title,
            progress =>
            {
                work(progress);
                return true;
            },
            showDelayMs);
    }

    public static Task<T> RunBackgroundAsync<T>(
        IWin32Window? owner,
        string title,
        Func<IProgress<AnalysisProgressReport>, T> work,
        int showDelayMs = DeferredProgressRunner.DefaultShowDelayMs)
    {
        return DeferredProgressRunner.RunAsync(
            owner,
            title,
            (progress, cancellationToken) => Task.Run(() =>
            {
                using var _ = ViewProgressReporter.Attach(progress, cancellationToken);
                cancellationToken.ThrowIfCancellationRequested();
                return work(progress);
            }, cancellationToken),
            showDelayMs);
    }

    public static Task RunUiAsync(
        IWin32Window? owner,
        string title,
        Func<IProgress<AnalysisProgressReport>, Task> work,
        int showDelayMs = DeferredProgressRunner.DefaultShowDelayMs)
    {
        return DeferredProgressRunner.RunAsync(
            owner,
            title,
            async (progress, cancellationToken) =>
            {
                using var _ = ViewProgressReporter.Attach(progress, cancellationToken);
                cancellationToken.ThrowIfCancellationRequested();
                await work(progress).ConfigureAwait(false);
                return true;
            },
            showDelayMs);
    }
}
