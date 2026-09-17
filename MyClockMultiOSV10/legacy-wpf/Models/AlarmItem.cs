using System.ComponentModel;
using System.Runtime.CompilerServices;

namespace MyClockWinV10.Models;

public class AlarmItem : INotifyPropertyChanged
{
    private bool _isEnabled = true;
    private TimeSpan _time;
    private string _label = "";
    private bool _isRepeat = false;
    private byte _repeatDays = 0b1111111; // Mon=bit0 … Sun=bit6

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

    public bool IsRepeat
    {
        get => _isRepeat;
        set { _isRepeat = value; OnPropertyChanged(); OnPropertyChanged(nameof(RepeatSummary)); }
    }

    public byte RepeatDays
    {
        get => _repeatDays;
        set { _repeatDays = value; OnPropertyChanged(); OnPropertyChanged(nameof(RepeatSummary)); }
    }

    public string DisplayTime => $"{Time.Hours:D2}:{Time.Minutes:D2}";

    public string RepeatSummary
    {
        get
        {
            if (!IsRepeat) return "한번";
            if (RepeatDays == 0b1111111) return "매일";
            // bit index matches DayOfWeek: Sun=0, Mon=1, ..., Sat=6
            string[] names = ["일", "월", "화", "수", "목", "금", "토"];
            var parts = new List<string>();
            for (int i = 0; i < 7; i++)
                if ((RepeatDays & (1 << i)) != 0) parts.Add(names[i]);
            return parts.Count > 0 ? string.Join("·", parts) : "매일";
        }
    }

    public event PropertyChangedEventHandler? PropertyChanged;
    protected void OnPropertyChanged([CallerMemberName] string? name = null)
        => PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
}
