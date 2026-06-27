namespace DiffMergeWinV10.App.Core;

/// <summary>
/// Loads the inputs for a merge (either BASE/LOCAL/REMOTE files, or a single file already
/// containing git conflict markers) into a <see cref="MergeDocument"/>, and writes the
/// resolved result back out preserving the original line-ending style.
/// </summary>
public sealed class MergeSession
{
    public string? BasePath { get; }
    public string? LocalPath { get; }
    public string? RemotePath { get; }
    public string MergedPath { get; }
    public MergeDocument Document { get; }

    private readonly string _newline;

    private MergeSession(string? basePath, string? localPath, string? remotePath, string mergedPath, MergeDocument document, string newline)
    {
        BasePath = basePath;
        LocalPath = localPath;
        RemotePath = remotePath;
        MergedPath = mergedPath;
        Document = document;
        _newline = newline;
    }

    public static MergeSession FromThreeFiles(string basePath, string localPath, string remotePath, string mergedPath)
    {
        var baseLines = ReadLines(basePath, out string newline);
        var localLines = ReadLines(localPath, out _);
        var remoteLines = ReadLines(remotePath, out _);

        var doc = ThreeWayDiff.Merge(baseLines, localLines, remoteLines);
        return new MergeSession(basePath, localPath, remotePath, mergedPath, doc, newline);
    }

    public static MergeSession FromConflictedFile(string conflictedPath, string mergedPath)
    {
        var lines = ReadLines(conflictedPath, out string newline);
        var doc = ConflictMarkerParser.Parse(lines);
        return new MergeSession(basePath: null, localPath: null, remotePath: null, mergedPath, doc, newline);
    }

    public void Save()
    {
        var lines = Document.BuildResultLines();
        File.WriteAllText(MergedPath, string.Join(_newline, lines) + _newline);
    }

    public void SaveAs(string path)
    {
        var lines = Document.BuildResultLines();
        File.WriteAllText(path, string.Join(_newline, lines) + _newline);
    }

    private static List<string> ReadLines(string path, out string newline)
    {
        string text = File.ReadAllText(path);
        newline = text.Contains("\r\n") ? "\r\n" : "\n";
        if (text.Length == 0)
        {
            return new List<string>();
        }
        var lines = text.Replace("\r\n", "\n").Split('\n').ToList();
        if (lines.Count > 0 && lines[^1].Length == 0)
        {
            lines.RemoveAt(lines.Count - 1);
        }
        return lines;
    }
}
