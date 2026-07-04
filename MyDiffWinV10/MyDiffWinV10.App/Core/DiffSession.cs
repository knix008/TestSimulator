namespace MyDiffWinV10.App.Core;

public enum DiffMode
{
    Text,
    Binary,
}

/// <summary>
/// Loads the left/right files for one diff session and computes the resulting diff document.
/// </summary>
public sealed class DiffSession
{
    public required string LeftPath { get; init; }

    public required string RightPath { get; init; }

    public required DiffMode Mode { get; init; }

    public DiffDocument? TextDocument { get; init; }

    public BinaryDiffDocument? BinaryDocument { get; init; }

    public static DiffSession Load(string leftPath, string rightPath)
    {
        byte[] leftBytes = File.ReadAllBytes(leftPath);
        byte[] rightBytes = File.ReadAllBytes(rightPath);

        if (BinaryDetector.IsBinary(leftBytes) || BinaryDetector.IsBinary(rightBytes))
        {
            return new DiffSession
            {
                LeftPath = leftPath,
                RightPath = rightPath,
                Mode = DiffMode.Binary,
                BinaryDocument = BinaryDiffDocument.FromBytes(leftBytes, rightBytes),
            };
        }

        var leftLines = ReadTextLines(leftPath);
        var rightLines = ReadTextLines(rightPath);
        return new DiffSession
        {
            LeftPath = leftPath,
            RightPath = rightPath,
            Mode = DiffMode.Text,
            TextDocument = DiffDocument.FromLines(leftLines, rightLines),
        };
    }

    private static string[] ReadTextLines(string path)
    {
        string text = File.ReadAllText(path);
        return text.Length == 0 ? [] : text.Replace("\r\n", "\n").Split('\n');
    }
}
