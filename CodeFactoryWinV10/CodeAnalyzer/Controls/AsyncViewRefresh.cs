using CodeAnalyzer.Models;
using CodeAnalyzer.Services;

namespace CodeAnalyzer.Controls;

internal static class AsyncViewRefresh
{
    public static Task RunUiRebuildAsync(Control owner, DiagramViewKind viewKind, Action rebuild)
    {
        var title = DiagramViewDisplayNames.Get(viewKind);
        return ViewProgressRunner.RunUiAsync(
            owner.FindForm(),
            title,
            async progress =>
            {
                progress.Report(new AnalysisProgressReport
                {
                    Percent = 15,
                    Message = "뷰를 준비하는 중...",
                    Elapsed = TimeSpan.Zero
                });
                rebuild();
                progress.Report(new AnalysisProgressReport
                {
                    Percent = 100,
                    Message = "완료",
                    Elapsed = TimeSpan.Zero
                });
                await Task.CompletedTask.ConfigureAwait(true);
            });
    }
}
