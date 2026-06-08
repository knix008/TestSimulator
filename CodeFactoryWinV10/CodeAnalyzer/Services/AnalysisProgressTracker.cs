using System.Diagnostics;
using CodeAnalyzer.Models;

namespace CodeAnalyzer.Services;

public sealed class AnalysisProgressTracker
{
    private readonly IProgress<AnalysisProgressReport>? _progress;
    private readonly Stopwatch _stopwatch = Stopwatch.StartNew();
    private int _completedSteps;
    private readonly int _totalSteps;

    public AnalysisProgressTracker(IProgress<AnalysisProgressReport>? progress, int totalSteps)
    {
        _progress = progress;
        _totalSteps = Math.Max(totalSteps, 1);
    }

    public void Report(string message, int? stepDelta = 1)
    {
        if (stepDelta is > 0)
        {
            _completedSteps += stepDelta.Value;
        }

        var percent = (int)Math.Round(_completedSteps * 100.0 / _totalSteps);
        percent = Math.Clamp(percent, 0, 99);

        Publish(message, percent);
    }

    public void ReportComplete(string message)
    {
        _completedSteps = _totalSteps;
        _progress?.Report(new AnalysisProgressReport
        {
            Percent = 100,
            Message = message,
            Elapsed = _stopwatch.Elapsed
        });
    }

    private void Publish(string message, int percent)
    {
        _progress?.Report(new AnalysisProgressReport
        {
            Percent = percent,
            Message = message,
            Elapsed = _stopwatch.Elapsed
        });
    }
}
