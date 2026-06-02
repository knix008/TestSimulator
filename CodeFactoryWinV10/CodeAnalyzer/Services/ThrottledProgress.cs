namespace CodeAnalyzer.Services;

/// <summary>
/// Limits how often progress is forwarded so the UI message loop is not flooded.
/// </summary>
public sealed class ThrottledProgress<T> : IProgress<T>
{
    private readonly IProgress<T> _inner;
    private readonly int _intervalMs;
    private readonly object _lock = new();
    private long _lastReportTick;
    private T? _pending;
    private int _flushScheduled;

    public ThrottledProgress(IProgress<T> inner, int intervalMs = 100)
    {
        _inner = inner;
        _intervalMs = Math.Max(16, intervalMs);
    }

    public void Report(T value)
    {
        lock (_lock)
        {
            _pending = value;
            var now = Environment.TickCount64;
            if (now - _lastReportTick >= _intervalMs)
            {
                FlushLocked(now);
                return;
            }

            if (_flushScheduled != 0)
            {
                return;
            }

            _flushScheduled = 1;
            var delayMs = (int)Math.Max(1, _intervalMs - (now - _lastReportTick));
            _ = ScheduleFlushAsync(delayMs);
        }
    }

    private async Task ScheduleFlushAsync(int delayMs)
    {
        await Task.Delay(delayMs).ConfigureAwait(false);

        lock (_lock)
        {
            _flushScheduled = 0;
            if (_pending is not null)
            {
                FlushLocked(Environment.TickCount64);
            }
        }
    }

    private void FlushLocked(long now)
    {
        if (_pending is null)
        {
            return;
        }

        _lastReportTick = now;
        var value = _pending;
        _pending = default;
        _inner.Report(value!);
    }
}
