using System;
using System.Collections.ObjectModel;
using System.Diagnostics;

namespace MyClockWinV10.Services;

public class LapEntry
{
    public int      Number      { get; init; }
    public TimeSpan Time        { get; init; }
    public string   NumberLabel => $"#{Number:D2}";
    public string   Display     =>
        $"{(int)Time.TotalHours:D2}:{Time.Minutes:D2}:{Time.Seconds:D2}.{Time.Milliseconds / 10:D2}";
}

public class StopwatchService
{
    private readonly Stopwatch _sw = new();

    public ObservableCollection<LapEntry> Laps { get; } = new();

    public bool     IsRunning => _sw.IsRunning;
    public TimeSpan Elapsed   => _sw.Elapsed;

    public void Start() => _sw.Start();

    public void RecordLap()
        => Laps.Insert(0, new LapEntry { Number = Laps.Count + 1, Time = _sw.Elapsed });

    public void Stop() => _sw.Stop();

    public void Reset()
    {
        _sw.Reset();
        Laps.Clear();
    }
}
