namespace MemoPadV10.Tests;

public class MemoEditingTests
{
    [Fact]
    public void Save_AddsNewMemo_WhenNoSource()
    {
        List<string> items = [];
        int sourceIndex = -1;
        string? sourceMemo = null;

        bool updated = MemoEditing.Save(items, ref sourceIndex, ref sourceMemo, "{\\rtf1 new}");

        Assert.False(updated);
        Assert.Single(items);
        Assert.Equal(0, sourceIndex);
        Assert.Equal("{\\rtf1 new}", sourceMemo);
    }

    [Fact]
    public void Save_UpdatesInPlace_BySourceIndex()
    {
        List<string> items = ["old-a", "old-b"];
        int sourceIndex = 1;
        string? sourceMemo = "old-b";

        bool updated = MemoEditing.Save(items, ref sourceIndex, ref sourceMemo, "new-b");

        Assert.True(updated);
        Assert.Equal(["old-a", "new-b"], items);
        Assert.Equal(1, sourceIndex);
    }

    [Fact]
    public void Save_UpdatesInPlace_BySourceMemoContent()
    {
        List<string> items = ["keep", "match-me"];
        int sourceIndex = -1;
        string? sourceMemo = "match-me";

        bool updated = MemoEditing.Save(items, ref sourceIndex, ref sourceMemo, "changed");

        Assert.True(updated);
        Assert.Equal(["keep", "changed"], items);
        Assert.Equal(1, sourceIndex);
    }

    [Fact]
    public void Save_UpdatesBySourceMemo_WhenSourceIndexIsStale()
    {
        List<string> items = ["keep", "match-me"];
        int sourceIndex = 99;
        string? sourceMemo = "match-me";

        bool updated = MemoEditing.Save(items, ref sourceIndex, ref sourceMemo, "changed");

        Assert.True(updated);
        Assert.Equal(["keep", "changed"], items);
        Assert.Equal(1, sourceIndex);
        Assert.Equal("changed", sourceMemo);
    }

    [Fact]
    public void Save_AppendsNewMemo_WhenSourceDoesNotMatch()
    {
        List<string> items = ["keep"];
        int sourceIndex = -1;
        string? sourceMemo = "missing";

        bool updated = MemoEditing.Save(items, ref sourceIndex, ref sourceMemo, "new memo");

        Assert.False(updated);
        Assert.Equal(["keep", "new memo"], items);
        Assert.Equal(1, sourceIndex);
        Assert.Equal("new memo", sourceMemo);
    }

    [Fact]
    public void TryDelete_RemovesByIndex_AndClearsSource()
    {
        List<string> items = ["a", "b", "c"];
        int sourceIndex = 1;
        string? sourceMemo = "b";

        bool deleted = MemoEditing.TryDelete(items, ref sourceIndex, ref sourceMemo, currentRtf: null);

        Assert.True(deleted);
        Assert.Equal(["a", "c"], items);
        Assert.Equal(-1, sourceIndex);
        Assert.Null(sourceMemo);
    }

    [Fact]
    public void TryDelete_ReturnsFalse_WhenNothingMatches()
    {
        List<string> items = ["only"];
        int sourceIndex = -1;
        string? sourceMemo = null;

        bool deleted = MemoEditing.TryDelete(items, ref sourceIndex, ref sourceMemo, currentRtf: "missing");

        Assert.False(deleted);
        Assert.Single(items);
    }

    [Fact]
    public void TryDelete_RemovesByCurrentRtf_WhenNoSourceMatches()
    {
        List<string> items = ["keep", "current", "also-keep"];
        int sourceIndex = -1;
        string? sourceMemo = null;

        bool deleted = MemoEditing.TryDelete(items, ref sourceIndex, ref sourceMemo, currentRtf: "current");

        Assert.True(deleted);
        Assert.Equal(["keep", "also-keep"], items);
        Assert.Equal(-1, sourceIndex);
        Assert.Null(sourceMemo);
    }
}
