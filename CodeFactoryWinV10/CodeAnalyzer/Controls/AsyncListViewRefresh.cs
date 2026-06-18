using CodeAnalyzer.Models;
using CodeAnalyzer.Services;

namespace CodeAnalyzer.Controls;

internal static class AsyncListViewRefresh
{
    public static async Task RunAsync<T>(
        Control owner,
        string title,
        int capturedGeneration,
        Func<int> getCurrentGeneration,
        Func<IProgress<AnalysisProgressReport>, T> build,
        Action<T> apply)
    {
        var snapshot = await ViewProgressRunner.RunBackgroundAsync(
            owner.FindForm(),
            title,
            build).ConfigureAwait(true);

        if (capturedGeneration != getCurrentGeneration() || owner.IsDisposed)
        {
            return;
        }

        apply(snapshot);
    }
}
