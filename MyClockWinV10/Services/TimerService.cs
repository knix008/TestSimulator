using System.Windows.Threading;

namespace MyClockWinV10.Services;

public enum TimerRunState { Idle, Running, Paused }

public sealed class TimerService
{
    private readonly DispatcherTimer _tick = new() { Interval = TimeSpan.FromMilliseconds(100) };
    private DateTime _endUtc;
    private TimeSpan _pausedRemaining;

    public TimerRunState State { get; private set; } = TimerRunState.Idle;
    public TimeSpan Duration { get; private set; }
    public TimeSpan Remaining { get; private set; }

    public event Action<TimeSpan>? RemainingChanged;
    public event Action? Completed;
    public event Action<TimerRunState>? StateChanged;

    public TimerService()
    {
        _tick.Tick += (_, _) => OnTick();
    }

    public void SetDuration(TimeSpan duration)
    {
        if (State != TimerRunState.Idle) return;
        Duration  = duration < TimeSpan.Zero ? TimeSpan.Zero : duration;
        Remaining = Duration;
        RemainingChanged?.Invoke(Remaining);
    }

    public void Start()
    {
        if (Duration <= TimeSpan.Zero) return;

        if (State == TimerRunState.Paused)
        {
            _endUtc = DateTime.UtcNow + _pausedRemaining;
        }
        else
        {
            Remaining = Duration;
            _endUtc   = DateTime.UtcNow + Remaining;
        }

        SetState(TimerRunState.Running);
        _tick.Start();
        OnTick();
    }

    public void Pause()
    {
        if (State != TimerRunState.Running) return;
        _tick.Stop();
        Remaining = _endUtc > DateTime.UtcNow ? _endUtc - DateTime.UtcNow : TimeSpan.Zero;
        _pausedRemaining = Remaining;
        SetState(TimerRunState.Paused);
        RemainingChanged?.Invoke(Remaining);
    }

    public void Stop()
    {
        _tick.Stop();
        Remaining = Duration;
        _pausedRemaining = Duration;
        SetState(TimerRunState.Idle);
        RemainingChanged?.Invoke(Remaining);
    }

    public bool IsDisplayingCountdown =>
        State != TimerRunState.Idle || Remaining != Duration;

    private void OnTick()
    {
        if (State != TimerRunState.Running) return;

        Remaining = _endUtc > DateTime.UtcNow ? _endUtc - DateTime.UtcNow : TimeSpan.Zero;
        RemainingChanged?.Invoke(Remaining);

        if (Remaining <= TimeSpan.Zero)
        {
            Remaining = TimeSpan.Zero;
            _tick.Stop();
            SetState(TimerRunState.Idle);
            Completed?.Invoke();
        }
    }

    private void SetState(TimerRunState state)
    {
        if (State == state) return;
        State = state;
        StateChanged?.Invoke(state);
    }
}
