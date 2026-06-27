namespace MyDiffWinV10.App.Core;

/// <summary>
/// Loads the left/right files for one diff session and computes the resulting
/// <see cref="DiffDocument"/>.
/// </summary>
public sealed class DiffSession
{
    public required string LeftPath { get; init; }

    public required string RightPath { get; init; }

    public required DiffDocument Document { get; init; }

    public static DiffSession Load(string leftPath, string rightPath)
    {
        var leftLines = ReadLines(leftPath);
        var rightLines = ReadLines(rightPath);
        return new DiffSession
        {
            LeftPath = leftPath,
            RightPath = rightPath,
            Document = DiffDocument.FromLines(leftLines, rightLines),
        };
    }

    private static string[] ReadLines(string path)
    {
        string text = File.ReadAllText(path);
        return text.Length == 0 ? [] : text.Replace("\r\n", "\n").Split('\n');
    }
}
