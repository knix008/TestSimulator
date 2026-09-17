namespace MyClockWinV10.Models;

public class AppSettings
{
    public bool AlwaysOnTop { get; set; } = false;
    public bool Use24h { get; set; } = false;
    public bool WorldUse24h { get; set; } = false;
    public string Theme { get; set; } = "DarkTheme";
    public int Brightness { get; set; } = 50;
    public string DigitColor { get; set; } = "#58A6FF";
    public string AmPmColor { get; set; } = "#89B4FA";
    public bool IsDigital { get; set; } = true;
    public string DigitalStyleName { get; set; } = "SevenSegment";
    public string AnalogStyleName  { get; set; } = "Classic";
    public double? WindowLeft { get; set; } = null;
    public double? WindowTop { get; set; } = null;
    public double WindowWidth { get; set; } = 300;
    public double WindowHeight { get; set; } = 300;
    // Per-mode geometry (null = not yet saved for that mode)
    public double? DigitalWindowWidth  { get; set; } = null;
    public double? DigitalWindowHeight { get; set; } = null;
    public double? DigitalWindowLeft   { get; set; } = null;
    public double? DigitalWindowTop    { get; set; } = null;
    public double? AnalogWindowWidth   { get; set; } = null;
    public double? AnalogWindowHeight  { get; set; } = null;
    public double? AnalogWindowLeft    { get; set; } = null;
    public double? AnalogWindowTop     { get; set; } = null;
    public List<AlarmDto> Alarms { get; set; } = new();
    public List<WorldTimeCityDto>? WorldCities { get; set; }
    public List<TimerDto> Timers { get; set; } = [new TimerDto()];
    public string AlarmSoundId { get; set; } = "Marimba";
    public int AlarmVolume { get; set; } = 50;
}

public class WorldTimeCityDto
{
    public string City { get; set; } = "";
    public string Region { get; set; } = "";
    public string TimeZoneId { get; set; } = "";
}

public class AlarmDto
{
    public string Time { get; set; } = "07:00";
    public string Label { get; set; } = "";
    public bool IsEnabled { get; set; } = true;
    public bool IsRepeat { get; set; } = false;
    public byte RepeatDays { get; set; } = 0b1111111;
}

public class TimerDto
{
    public string Label { get; set; } = "";
    public int Hours { get; set; } = 0;
    public int Minutes { get; set; } = 5;
    public int Seconds { get; set; } = 0;
}
