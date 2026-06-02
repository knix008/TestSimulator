using System.Diagnostics;
using CodeAnalyzer.Models;

namespace CodeAnalyzer.Services;

public sealed class AnalysisProgressTracker
{
    private readonly IProgress<AnalysisProgressReport>? _progress;
    private readonly Stopwatch _stopwatch = Stopwatch.StartNew();
    private int _completedSteps;
    private readonly int _totalSteps;
    private double _smoothedSecondsPerStep;

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
            UpdateSmoothedRate();
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
            Elapsed = _stopwatch.Elapsed,
            EstimatedRemaining = null
        });
    }

    private void Publish(string message, int percent)
    {
        _progress?.Report(new AnalysisProgressReport
        {
            Percent = percent,
            Message = message,
            Elapsed = _stopwatch.Elapsed,
            EstimatedRemaining = EstimateRemaining(percent)
        });
    }

    private void UpdateSmoothedRate()
    {
        if (_completedSteps <= 0)
        {
            return;
        }

        var currentRate = _stopwatch.Elapsed.TotalSeconds / _completedSteps;
        _smoothedSecondsPerStep = _completedSteps == 1
            ? currentRate
            : _smoothedSecondsPerStep * 0.75 + currentRate * 0.25;
    }

    private TimeSpan? EstimateRemaining(int percent)
    {
        if (_completedSteps >= 1 && _completedSteps < _totalSteps)
        {
            var secondsPerStep = _smoothedSecondsPerStep > 0
                ? _smoothedSecondsPerStep
                : _stopwatch.Elapsed.TotalSeconds / _completedSteps;
            var remainingSteps = _totalSteps - _completedSteps;
            return TimeSpan.FromSeconds(Math.Max(1, secondsPerStep * remainingSteps));
        }

        if (percent is >= 1 and < 99 && _stopwatch.Elapsed.TotalSeconds >= 2)
        {
            var totalEstimatedSeconds = _stopwatch.Elapsed.TotalSeconds * 100.0 / percent;
            var remainingSeconds = totalEstimatedSeconds - _stopwatch.Elapsed.TotalSeconds;
            if (remainingSeconds >= 1)
            {
                return TimeSpan.FromSeconds(remainingSeconds);
            }
        }

        return null;
    }
}
