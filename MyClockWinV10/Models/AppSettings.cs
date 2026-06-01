namespace MyClockWinV10.Models;

public class AppSettings
{
    public bool Use24h { get; set; } = false;
    public bool WorldUse24h { get; set; } = false;
    public string Theme { get; set; } = "DarkTheme";
    public int Brightness { get; set; } = 100;
    public string DigitColor { get; set; } = "#58A6FF";
    public bool IsDigital { get; set; } = true;
    public string DigitalStyleName { get; set; } = "SevenSegment";
    public string AnalogStyleName  { get; set; } = "Classic";
    public double? WindowLeft { get; set; } = null;
    public double? WindowTop { get; set; } = null;
    public double WindowWidth { get; set; } = 300;
    public double WindowHeight { get; set; } = 300;
    public List<AlarmDto> Alarms { get; set; } = new();

    public int TimerHours { get; set; } = 0;
    public int TimerMinutes { get; set; } = 5;
    public int TimerSeconds { get; set; } = 0;
    public string AlarmSoundId { get; set; } = "Classic";
    public int AlarmVolume { get; set; } = 100;
}

public class AlarmDto
{
    public string Time { get; set; } = "07:00";
    public string Label { get; set; } = "";
    public bool IsEnabled { get; set; } = true;
    public bool IsRepeat { get; set; } = false;
    public byte RepeatDays { get; set; } = 0b1111111;
}
