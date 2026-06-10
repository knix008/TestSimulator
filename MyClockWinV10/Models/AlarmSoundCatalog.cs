namespace MyClockWinV10.Models;

public readonly record struct AlarmSoundOption(string Id, string Label);

public static class AlarmSoundCatalog
{
    public static IReadOnlyList<AlarmSoundOption> All { get; } =
    [
        new("Marimba",   "마림바"),
        new("Radar",     "레이더"),
        new("Beacon",    "비콘"),
        new("Circuit",   "서킷"),
        new("Crystals",  "크리스탈"),
        new("Hillside",  "힐사이드"),
        new("Sencha",    "센차"),
        new("Silk",      "실크"),
        new("SlowRise",  "슬로 라이즈"),
        new("Stargaze",  "스타게이즈"),
        new("Summit",    "서밋"),
        new("Dawn",      "새벽"),
        new("Galaxy",    "갤럭시"),
        new("Orbit",     "오르빗"),
        new("Ripple",    "리플"),
        new("Classic",   "클래식"),
        new("Chime",     "차임"),
        new("Bell",      "벨"),
        new("Digital",   "디지털"),
        new("Piano",     "피아노"),
        new("Harp",      "하프"),
        new("Fanfare",   "팬파레"),
        new("Ladder",    "래더"),
        new("Echo",      "에코"),
        new("Wave",      "웨이브"),
        new("Gentle",    "부드러운"),
        new("Pulse",     "펄스"),
        new("Bird",      "새소리"),
        new("Clock",     "시계"),
        new("Breeze",    "브리즈"),
        new("Siren",     "사이렌"),
        new("Urgent",    "긴급"),
    ];

    public static string DefaultId => "Marimba";

    public static bool IsValid(string? id)
        => !string.IsNullOrEmpty(id) && All.Any(s => s.Id == id);
}
