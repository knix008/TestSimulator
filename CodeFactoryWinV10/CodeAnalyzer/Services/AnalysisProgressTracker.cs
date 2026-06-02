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

        _progress?.Report(new AnalysisProgressReport
        {
            Percent = percent,
            Message = message,
            EstimatedRemaining = EstimateRemaining()
        });
    }

    public void ReportComplete(string message)
    {
        _completedSteps = _totalSteps;
        _progress?.Report(new AnalysisProgressReport
        {
            Percent = 100,
            Message = message,
            EstimatedRemaining = null
        });
    }

    private TimeSpan? EstimateRemaining()
    {
        if (_completedSteps < 2 || _completedSteps >= _totalSteps)
        {
            return null;
        }

        var elapsedSeconds = _stopwatch.Elapsed.TotalSeconds;
        if (elapsedSeconds <= 0)
        {
            return null;
        }

        var secondsPerStep = elapsedSeconds / _completedSteps;
        var remainingSteps = _totalSteps - _completedSteps;
        return TimeSpan.FromSeconds(secondsPerStep * remainingSteps);
    }
}
