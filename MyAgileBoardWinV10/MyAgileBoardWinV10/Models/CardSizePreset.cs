namespace MyAgileBoardWinV10.Models;

public enum CardSizePreset
{
    Auto,
    Small,
    Medium,
    Large,
    Wide,
    Custom
}

public static class CardSizeDefaults
{
    public const int MinWidth = 80;
    public const int MinHeight = 56;
    public const int MaxOffsetX = 48;

    public static (int Width, int Height) GetPresetSize(CardSizePreset preset) => preset switch
    {
        CardSizePreset.Small => (110, 70),
        CardSizePreset.Medium => (150, 92),
        CardSizePreset.Large => (195, 120),
        CardSizePreset.Wide => (0, 96),
        _ => (0, 0)
    };
}
