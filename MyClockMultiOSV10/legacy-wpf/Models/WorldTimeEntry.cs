using System;
using System.ComponentModel;
using System.Runtime.CompilerServices;

namespace MyClockWinV10.Models;

public class WorldTimeEntry : INotifyPropertyChanged
{
    private string _displayTime = "--:--";
    private DateTime _localDateTime = DateTime.Now;

    public string City { get; set; } = "";
    public string Region { get; set; } = "";
    public string TimeZoneId { get; set; } = "";

    public string DisplayTime
    {
        get => _displayTime;
        set { _displayTime = value; OnPropertyChanged(); }
    }

    public DateTime LocalDateTime
    {
        get => _localDateTime;
        set { _localDateTime = value; OnPropertyChanged(); }
    }

    public event PropertyChangedEventHandler? PropertyChanged;
    protected void OnPropertyChanged([CallerMemberName] string? name = null)
        => PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
}
