namespace MyClockWinV10.Models;

public enum DigitalStyle
{
    SevenSegment,
    LcdText,
    Minimal,
    Retro,
    Neon,
    DotMatrix
}

public enum AnalogStyle
{
    Classic,
    Minimal,
    Roman,
    Indices,
    Railroad,
    Bauhaus,
    Dots,
    Aviator
}

public readonly record struct ClockStyleOption(string Id, string Label);

public static class ClockStyleCatalog
{
    public static IReadOnlyList<ClockStyleOption> Digital { get; } =
    [
        new(nameof(DigitalStyle.SevenSegment), "7-세그먼트"),
        new(nameof(DigitalStyle.LcdText),       "LCD"),
        new(nameof(DigitalStyle.Minimal),     "미니멀"),
        new(nameof(DigitalStyle.Retro),       "레트로"),
        new(nameof(DigitalStyle.Neon),        "네온"),
        new(nameof(DigitalStyle.DotMatrix),   "도트"),
    ];

    public static IReadOnlyList<ClockStyleOption> Analog { get; } =
    [
        new(nameof(AnalogStyle.Classic),  "클래식"),
        new(nameof(AnalogStyle.Minimal),  "미니멀"),
        new(nameof(AnalogStyle.Roman),    "로마 숫자"),
        new(nameof(AnalogStyle.Indices),  "인덱스"),
        new(nameof(AnalogStyle.Railroad), "철도"),
        new(nameof(AnalogStyle.Bauhaus),  "바우하우스"),
        new(nameof(AnalogStyle.Dots),     "도트"),
        new(nameof(AnalogStyle.Aviator),  "파일럿"),
    ];
}
