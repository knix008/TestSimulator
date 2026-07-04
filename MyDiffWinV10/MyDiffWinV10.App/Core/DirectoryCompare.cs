namespace MyDiffWinV10.App.Core;

public enum FileCompareStatus
{
    Same,
    Different,
    LeftOnly,
    RightOnly,
}

public sealed class DirectoryCompareEntry
{
    public required string RelativePath { get; init; }

    public FileCompareStatus? LeftStatus { get; init; }

    public FileCompareStatus? RightStatus { get; init; }
}

public sealed class DirectoryCompareResult
{
    public required string LeftDirectory { get; init; }

    public required string RightDirectory { get; init; }

    public required IReadOnlyList<DirectoryCompareEntry> Entries { get; init; }

    public int SameCount { get; init; }

    public int DifferentCount { get; init; }

    public int LeftOnlyCount { get; init; }

    public int RightOnlyCount { get; init; }
}

/// <summary>
/// Recursively compares two directory trees by relative file path.
/// </summary>
public static class DirectoryCompareService
{
    private const int FileBufferSize = 81920;

    public static DirectoryCompareResult Compare(string leftDirectory, string rightDirectory)
    {
        if (!Directory.Exists(leftDirectory))
        {
            throw new DirectoryNotFoundException(leftDirectory);
        }

        if (!Directory.Exists(rightDirectory))
        {
            throw new DirectoryNotFoundException(rightDirectory);
        }

        var leftFiles = EnumerateRelativeFiles(leftDirectory);
        var rightFiles = EnumerateRelativeFiles(rightDirectory);

        int same = 0;
        int different = 0;
        int leftOnly = 0;
        int rightOnly = 0;
        var leftStatus = new Dictionary<string, FileCompareStatus>(StringComparer.OrdinalIgnoreCase);
        var rightStatus = new Dictionary<string, FileCompareStatus>(StringComparer.OrdinalIgnoreCase);

        foreach (string rel in leftFiles.Keys.Union(rightFiles.Keys, StringComparer.OrdinalIgnoreCase).OrderBy(path => path, StringComparer.OrdinalIgnoreCase))
        {
            bool inLeft = leftFiles.ContainsKey(rel);
            bool inRight = rightFiles.ContainsKey(rel);

            if (inLeft && inRight)
            {
                string leftPath = leftFiles[rel];
                string rightPath = rightFiles[rel];
                if (FilesEqual(leftPath, rightPath))
                {
                    same++;
                    leftStatus[rel] = FileCompareStatus.Same;
                    rightStatus[rel] = FileCompareStatus.Same;
                }
                else
                {
                    different++;
                    leftStatus[rel] = FileCompareStatus.Different;
                    rightStatus[rel] = FileCompareStatus.Different;
                }
            }
            else if (inLeft)
            {
                leftOnly++;
                leftStatus[rel] = FileCompareStatus.LeftOnly;
            }
            else
            {
                rightOnly++;
                rightStatus[rel] = FileCompareStatus.RightOnly;
            }
        }

        var entries = leftStatus.Keys
            .Union(rightStatus.Keys, StringComparer.OrdinalIgnoreCase)
            .OrderBy(path => path, StringComparer.OrdinalIgnoreCase)
            .Select(rel =>
            {
                leftStatus.TryGetValue(rel, out FileCompareStatus left);
                rightStatus.TryGetValue(rel, out FileCompareStatus right);
                return new DirectoryCompareEntry
                {
                    RelativePath = rel,
                    LeftStatus = leftStatus.ContainsKey(rel) ? left : null,
                    RightStatus = rightStatus.ContainsKey(rel) ? right : null,
                };
            })
            .ToList();

        return new DirectoryCompareResult
        {
            LeftDirectory = leftDirectory,
            RightDirectory = rightDirectory,
            Entries = entries,
            SameCount = same,
            DifferentCount = different,
            LeftOnlyCount = leftOnly,
            RightOnlyCount = rightOnly,
        };
    }

    private static Dictionary<string, string> EnumerateRelativeFiles(string rootDirectory)
    {
        var files = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (string path in Directory.EnumerateFiles(rootDirectory, "*", SearchOption.AllDirectories))
        {
            string rel = Path.GetRelativePath(rootDirectory, path);
            files[rel] = path;
        }

        return files;
    }

    private static bool FilesEqual(string leftPath, string rightPath)
    {
        var leftInfo = new FileInfo(leftPath);
        var rightInfo = new FileInfo(rightPath);
        if (leftInfo.Length != rightInfo.Length)
        {
            return false;
        }

        if (leftInfo.Length == 0)
        {
            return true;
        }

        using var leftStream = File.OpenRead(leftPath);
        using var rightStream = File.OpenRead(rightPath);
        var leftBuffer = new byte[FileBufferSize];
        var rightBuffer = new byte[FileBufferSize];

        while (true)
        {
            int leftRead = leftStream.Read(leftBuffer, 0, leftBuffer.Length);
            int rightRead = rightStream.Read(rightBuffer, 0, rightBuffer.Length);
            if (leftRead != rightRead)
            {
                return false;
            }

            if (leftRead == 0)
            {
                return true;
            }

            if (!leftBuffer.AsSpan(0, leftRead).SequenceEqual(rightBuffer.AsSpan(0, rightRead)))
            {
                return false;
            }
        }
    }
}
