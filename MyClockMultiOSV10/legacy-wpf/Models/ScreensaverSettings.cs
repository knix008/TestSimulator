namespace MyClockWinV10.Models;

public class ScreensaverSettings
{
    public bool IsDigital { get; set; } = true;
    /// <summary>Clock size as percent of the smaller screen dimension (15–75).</summary>
    public int ClockSizePercent { get; set; } = 40;
    public bool UseAppSettings { get; set; } = true;
    public string Theme { get; set; } = "DarkTheme";
    public string DigitalStyleName { get; set; } = "SevenSegment";
    public string AnalogStyleName { get; set; } = "Classic";
    public bool Use24h { get; set; } = false;
    public string DigitColor { get; set; } = "#58A6FF";
    public string AmPmColor { get; set; } = "#89B4FA";
}
