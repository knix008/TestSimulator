namespace DeskSearch;

internal static class SettingsColorPalette
{
    /// <summary>배경·테두리용 추천 색 (색상환 전체를 덮는 파스텔 20색)</summary>
    public static readonly string[] BackgroundSwatches =
    [
        "#FFB3BA", // pastel red
        "#FFC5A8", // pastel coral
        "#FFD8B1", // pastel orange
        "#FFE8B3", // pastel amber
        "#FFF5BA", // pastel yellow
        "#F1F0A8", // pastel lime-yellow
        "#DCEDC1", // pastel lime
        "#C1F0C1", // pastel green
        "#B4F8C8", // pastel mint
        "#A8E6CF", // pastel teal
        "#A0E7E5", // pastel cyan
        "#B5E2FA", // pastel sky
        "#B3D4FF", // pastel blue
        "#C7CEEA", // pastel periwinkle
        "#C3B1E1", // pastel indigo
        "#D8BFD8", // pastel purple
        "#E0BBE4", // pastel lavender
        "#F5C6E0", // pastel magenta
        "#FFC8DD", // pastel pink
        "#FFB6C1", // pastel rose
        "#D7C4A3", // pastel brown
        "#CBD5D8"  // pastel gray
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
