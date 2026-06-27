namespace DiffMergeWinV10.App.Core;

public enum ConflictResolution
{
    Unresolved,
    Base,
    Local,
    Remote,
    Both,
}

public sealed class ConflictHunk
{
    public List<string> BaseLines { get; }
    public List<string> LocalLines { get; }
    public List<string> RemoteLines { get; }
    public bool HasBase { get; }
    public ConflictResolution Resolution { get; set; } = ConflictResolution.Unresolved;

    public ConflictHunk(List<string> baseLines, List<string> localLines, List<string> remoteLines, bool hasBase)
    {
        BaseLines = baseLines;
        LocalLines = localLines;
        RemoteLines = remoteLines;
        HasBase = hasBase;
    }

    public List<string> GetResolvedLines() => Resolution switch
    {
        ConflictResolution.Base => BaseLines,
        ConflictResolution.Local => LocalLines,
        ConflictResolution.Remote => RemoteLines,
        ConflictResolution.Both => LocalLines.Concat(RemoteLines).ToList(),
        _ => MarkerLines(),
    };

    private List<string> MarkerLines()
    {
        var lines = new List<string> { "<<<<<<< LOCAL" };
        lines.AddRange(LocalLines);
        if (HasBase)
        {
            lines.Add("||||||| BASE");
            lines.AddRange(BaseLines);
        }
        lines.Add("=======");
        lines.AddRange(RemoteLines);
        lines.Add(">>>>>>> REMOTE");
        return lines;
    }
}

public sealed class MergeRegion
{
    public List<string>? CleanLines { get; init; }
    public ConflictHunk? Hunk { get; init; }
    public bool IsConflict => Hunk != null;
}

public sealed class MergeDocument
{
    public List<MergeRegion> Regions { get; } = new();

    public IEnumerable<ConflictHunk> Conflicts => Regions.Where(r => r.Hunk != null).Select(r => r.Hunk!);

    public int ConflictCount => Conflicts.Count();

    public int ResolvedCount => Conflicts.Count(c => c.Resolution != ConflictResolution.Unresolved);

    public List<string> BuildResultLines()
    {
        var result = new List<string>();
        foreach (var region in Regions)
        {
            if (region.Hunk != null)
            {
                result.AddRange(region.Hunk.GetResolvedLines());
            }
            else if (region.CleanLines != null)
            {
                result.AddRange(region.CleanLines);
            }
        }
        return result;
    }
}
