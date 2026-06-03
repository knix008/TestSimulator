using System;
using System.ComponentModel;
using System.Runtime.CompilerServices;
using MyClockWinV10.Services;

namespace MyClockWinV10.Models;

public sealed class TimerItem : INotifyPropertyChanged
{
    public event PropertyChangedEventHandler? PropertyChanged;
    public event Action<TimerItem>? Completed;

    public TimerService Service { get; } = new();

    private string _label = "";
    private int _hours, _minutes, _seconds;
    private string _displayRemaining = "00:00:00.00";

    public string Label
    {
        get => _label;
        set { _label = value; Notify(); }
    }

    public int Hours
    {
        get => _hours;
        set { _hours = Math.Clamp(value, 0, 99); Notify(); Notify(nameof(HoursText)); }
    }
    public int Minutes
    {
        get => _minutes;
        set { _minutes = Math.Clamp(value, 0, 59); Notify(); Notify(nameof(MinutesText)); }
    }
    public int Seconds
    {
        get => _seconds;
        set { _seconds = Math.Clamp(value, 0, 59); Notify(); Notify(nameof(SecondsText)); }
    }

    public string HoursText   => _hours.ToString("D2");
    public string MinutesText => _minutes.ToString("D2");
    public string SecondsText => _seconds.ToString("D2");

    public string DisplayRemaining
    {
        get => _displayRemaining;
        private set { _displayRemaining = value; Notify(); }
    }

    public bool IsIdle    => Service.State == TimerRunState.Idle;
    public bool IsRunning => Service.State == TimerRunState.Running;
    public bool IsPaused  => Service.State == TimerRunState.Paused;
    public bool CanStart  => Service.State != TimerRunState.Running;
    public bool CanStop   => Service.State != TimerRunState.Idle;
    public string StartLabel => IsPaused ? "재개" : "시작";

    public TimerItem(int hours = 0, int minutes = 5, int seconds = 0, string label = "")
    {
        _hours = hours; _minutes = minutes; _seconds = seconds; _label = label;
        Service.SetDuration(new TimeSpan(hours, minutes, seconds));
        Service.RemainingChanged += UpdateDisplay;
        Service.StateChanged     += _ => NotifyStateProps();
        Service.Completed        += () => Completed?.Invoke(this);
        UpdateDisplay(Service.Remaining);
    }

    public void ApplyDuration()
    {
        if (!IsIdle) return;
        Service.SetDuration(new TimeSpan(_hours, _minutes, _seconds));
        UpdateDisplay(Service.Remaining);
    }

    private void UpdateDisplay(TimeSpan r)
    {
        int cs = r.Milliseconds / 10;
        DisplayRemaining = $"{(int)r.TotalHours:D2}:{r.Minutes:D2}:{r.Seconds:D2}.{cs:D2}";
    }

    private void NotifyStateProps()
    {
        Notify(nameof(IsIdle));
        Notify(nameof(IsRunning));
        Notify(nameof(IsPaused));
        Notify(nameof(CanStart));
        Notify(nameof(CanStop));
        Notify(nameof(StartLabel));
    }

    private void Notify([CallerMemberName] string? name = null)
        => PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
}
