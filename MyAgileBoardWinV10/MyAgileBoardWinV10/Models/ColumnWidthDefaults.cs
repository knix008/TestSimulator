namespace MyAgileBoardWinV10.Models;

public static class ColumnWidthDefaults
{
    public const int Default = 250;
    public const int Min = 160;
    public const int Max = 720;
    public const int GripWidth = 6;
    public const int AddColumnButtonWidth = 54;

    public static int Clamp(int width)
        => Math.Clamp(width > 0 ? width : Default, Min, Max);
}
