namespace DeskSearch;

internal static class SettingsColorPalette
{
    /// <summary>배경·테두리용 추천 색 (밝은 톤 + 다크 톤)</summary>
    public static readonly string[] BackgroundSwatches =
    [
        // Light
        "#FFFFFF",
        "#FAFAFA",
        "#F5F5F5",
        "#FFF8F0",
        "#FFFDE7",
        "#E3F2FD",
        "#E8F5E9",
        "#F3E5F5",
        "#FFE0B2",
        "#FFCDD2",
        "#B2DFDB",
        "#CFD8DC",
        // Dark
        "#212121",
        "#2D2D2D",
        "#37474F",
        "#263238",
        "#1A237E",
        "#0D47A1",
        "#1B5E20",
        "#004D40",
        "#311B92",
        "#4A148C",
        "#3E2723",
        "#1B1B1E"
    ];

    /// <summary>글자색용 추천 색 (어두운 톤 + 밝은 톤)</summary>
    public static readonly string[] TextSwatches =
    [
        // Dark (for light backgrounds)
        "#212121",
        "#37474F",
        "#455A64",
        "#5D4037",
        "#33691E",
        "#1565C0",
        "#4527A0",
        "#C62828",
        // Light (for dark backgrounds)
        "#FFFFFF",
        "#F5F5F5",
        "#ECEFF1",
        "#CFD8DC",
        "#B0BEC5",
        "#90CAF9",
        "#80DEEA",
        "#A5D6A7",
        "#FFE082",
        "#FFAB91",
        "#CE93D8",
        "#BCAAA4"
    ];
}
