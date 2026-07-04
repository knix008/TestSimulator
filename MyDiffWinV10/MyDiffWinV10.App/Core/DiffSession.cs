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

    /// <summary>
    /// Loads a diff when one side may be missing (directory compare left-only / right-only entries).
    /// </summary>
    public static DiffSession LoadFlexible(string leftPath, string rightPath)
    {
        bool leftExists = !string.IsNullOrWhiteSpace(leftPath) && File.Exists(leftPath);
        bool rightExists = !string.IsNullOrWhiteSpace(rightPath) && File.Exists(rightPath);

        if (!leftExists && !rightExists)
        {
            throw new FileNotFoundException(leftPath);
        }

        if (leftExists && rightExists)
        {
            return Load(leftPath, rightPath);
        }

        if (leftExists)
        {
            return LoadOneSide(existingPath: leftPath, missingPath: rightPath, existingIsLeft: true);
        }

        return LoadOneSide(existingPath: rightPath, missingPath: leftPath, existingIsLeft: false);
    }

    private static DiffSession LoadOneSide(string existingPath, string missingPath, bool existingIsLeft)
    {
        byte[] existingBytes = File.ReadAllBytes(existingPath);
        if (BinaryDetector.IsBinary(existingBytes))
        {
            byte[] leftBytes = existingIsLeft ? existingBytes : [];
            byte[] rightBytes = existingIsLeft ? [] : existingBytes;
            return new DiffSession
            {
                LeftPath = existingIsLeft ? existingPath : missingPath,
                RightPath = existingIsLeft ? missingPath : existingPath,
                Mode = DiffMode.Binary,
                BinaryDocument = BinaryDiffDocument.FromBytes(leftBytes, rightBytes),
            };
        }

        var existingLines = ReadTextLines(existingPath);
        var leftLines = existingIsLeft ? existingLines : Array.Empty<string>();
        var rightLines = existingIsLeft ? Array.Empty<string>() : existingLines;
        return new DiffSession
        {
            LeftPath = existingIsLeft ? existingPath : missingPath,
            RightPath = existingIsLeft ? missingPath : existingPath,
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
