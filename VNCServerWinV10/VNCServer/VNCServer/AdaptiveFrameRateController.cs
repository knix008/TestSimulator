using System.Diagnostics;
using VNCServer.Settings;

namespace VNCServer.VNCServer;

/// <summary>
/// 프레임 전송 시간을 측정해 네트워크 여유에 맞게 FPS를 동적으로 조절합니다.
/// </summary>
public sealed class AdaptiveFrameRateController
{
    private readonly object _lock = new();
    private ServerSettings _settings;
    private double _currentFps;
    private long _lastFrameTicks;
    private double _avgSendMs;
    private int _slowStreak;
    private int _fastStreak;

    public int CurrentFps { get; private set; }

    public AdaptiveFrameRateController(ServerSettings settings)
    {
        _settings = settings;
        _currentFps = Math.Clamp(settings.GetEffectiveMaxFrameRate(), settings.MinFrameRate, settings.GetEffectiveMaxFrameRate());
        CurrentFps = (int)Math.Round(_currentFps);
        _lastFrameTicks = Stopwatch.GetTimestamp();
    }

    public void ApplySettings(ServerSettings settings)
    {
        lock (_lock)
        {
            _settings = settings;
            var effectiveMax = settings.GetEffectiveMaxFrameRate();
            _currentFps = Math.Clamp(_currentFps, settings.MinFrameRate, effectiveMax);
            CurrentFps = (int)Math.Round(_currentFps);
        }
    }

    public void WaitForNextFrameSlot()
    {
        var intervalMs = GetIntervalMs();
        var elapsedMs = GetElapsedMsSinceLastFrame();

        var waitMs = (int)Math.Max(0, intervalMs - elapsedMs);
        if (waitMs > 0)
        {
            Thread.Sleep(waitMs);
        }

        lock (_lock)
        {
            _lastFrameTicks = Stopwatch.GetTimestamp();
        }
    }

    public void RecordFrame(long sendDurationMs, int bytesSent)
    {
        if (!_settings.EnableAdaptiveFrameRate)
        {
            return;
        }

        lock (_lock)
        {
            AdjustAfterFrame(sendDurationMs, bytesSent);
        }
    }

    private void AdjustAfterFrame(long sendMs, int bytesSent)
    {
        var maxFps = _settings.GetEffectiveMaxFrameRate();
        var minFps = _settings.MinFrameRate;
        var intervalMs = 1000.0 / Math.Max(1, _currentFps);

        _avgSendMs = _avgSendMs <= 0
            ? sendMs
            : _avgSendMs * 0.8 + sendMs * 0.2;

        var congested = sendMs > intervalMs * 0.85 || sendMs > 100;
        var hasHeadroom = sendMs < intervalMs * 0.4 && _avgSendMs < intervalMs * 0.55;

        if (congested)
        {
            _slowStreak++;
            _fastStreak = 0;

            if (_slowStreak >= 2)
            {
                var step = Math.Max(1, _currentFps * 0.12);
                _currentFps = Math.Max(minFps, _currentFps - step);
                _slowStreak = 0;
            }
        }
        else if (hasHeadroom)
        {
            _fastStreak++;
            _slowStreak = 0;

            if (_fastStreak >= 4)
            {
                var step = Math.Max(1, _currentFps * 0.08);
                _currentFps = Math.Min(maxFps, _currentFps + step);
                _fastStreak = 0;
            }
        }
        else
        {
            _slowStreak = Math.Max(0, _slowStreak - 1);
            _fastStreak = Math.Max(0, _fastStreak - 1);
        }

        // 대용량 프레임이 오래 걸리면 추가 하향
        if (bytesSent > 400_000 && sendMs > intervalMs * 0.55)
        {
            _currentFps = Math.Max(minFps, _currentFps - 2);
        }

        CurrentFps = (int)Math.Round(_currentFps);
    }

    private double GetIntervalMs()
    {
        lock (_lock)
        {
            var effectiveMax = _settings.GetEffectiveMaxFrameRate();
            var fps = _settings.EnableAdaptiveFrameRate
                ? _currentFps
                : effectiveMax;
            fps = Math.Clamp(fps, _settings.MinFrameRate, effectiveMax);
            return 1000.0 / Math.Max(1, fps);
        }
    }

    private double GetElapsedMsSinceLastFrame()
    {
        lock (_lock)
        {
            var delta = Stopwatch.GetTimestamp() - _lastFrameTicks;
            return delta * 1000.0 / Stopwatch.Frequency;
        }
    }
}
