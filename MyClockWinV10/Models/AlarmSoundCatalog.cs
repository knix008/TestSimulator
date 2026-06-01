namespace MyClockWinV10.Models;

public readonly record struct AlarmSoundOption(string Id, string Label);

public static class AlarmSoundCatalog
{
    public static IReadOnlyList<AlarmSoundOption> All { get; } =
    [
        new("Classic",  "클래식"),
        new("Chime",    "차임"),
        new("Bell",     "벨"),
        new("Digital",  "디지털"),
        new("Gentle",   "부드러운"),
        new("Urgent",   "긴급"),
        new("Bird",     "새소리"),
        new("Pulse",    "펄스"),
    ];

    public static string DefaultId => "Classic";

    public static bool IsValid(string? id)
        => !string.IsNullOrEmpty(id) && All.Any(s => s.Id == id);
}
