namespace MyDiffWinV10.App.Core;

/// <summary>
/// Fixed column layout for binary hex dump lines shared by diff formatting and pane rendering.
/// </summary>
public static class BinaryHexLayout
{
    public const int LineLength = 77;

    public const int AsciiStart = 61;

    private static readonly int[] HexStarts =
    [
        10, 13, 16, 19, 22, 25, 28, 31,
        35, 38, 41, 44, 47, 50, 53, 56,
    ];

    public static int HexStart(int byteIndex) => HexStarts[byteIndex];

    public static int AsciiIndex(int byteIndex) => AsciiStart + byteIndex;
}
