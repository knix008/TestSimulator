using System.ComponentModel;
using System.Runtime.CompilerServices;

namespace MyClockWinV10.Models;

public class AlarmItem : INotifyPropertyChanged
{
    private bool _isEnabled = true;
    private TimeSpan _time;
    private string _label = "";

    public Guid Id { get; } = Guid.NewGuid();

    public TimeSpan Time
    {
        get => _time;
        set { _time = value; OnPropertyChanged(); OnPropertyChanged(nameof(DisplayTime)); }
    }

    public string Label
    {
        get => _label;
        set { _label = value; OnPropertyChanged(); }
    }

    public bool IsEnabled
    {
        get => _isEnabled;
        set { _isEnabled = value; OnPropertyChanged(); }
    }

    public string DisplayTime => $"{Time.Hours:D2}:{Time.Minutes:D2}";

    public event PropertyChangedEventHandler? PropertyChanged;
    protected void OnPropertyChanged([CallerMemberName] string? name = null)
        => PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
}
