namespace CodeAnalyzer.Models;

/// <summary>하위 디렉터리 선택 목록 항목.</summary>
public sealed class DirectoryListEntry
{
    public DirectoryListEntry(string relativePath)
    {
        RelativePath = relativePath;
    }

    public string RelativePath { get; }

    public override string ToString() =>
        RelativePath == "." ? "(루트)" : RelativePath;
}
