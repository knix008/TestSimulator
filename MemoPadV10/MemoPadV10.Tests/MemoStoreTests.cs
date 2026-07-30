namespace MemoPadV10.Tests;

public class MemoStoreTests
{
    [Fact]
    public void Save_Then_Load_RoundTrips_PlainAndRtf()
    {
        using var isolation = AppDataIsolation.Begin();

        using RichTextBox editor = new();
        editor.Text = "첫 번째 메모";
        string rtf = editor.Rtf ?? string.Empty;

        MemoStore.Save(["plain note", rtf]);
        List<string> loaded = MemoStore.Load();

        Assert.Equal(2, loaded.Count);
        Assert.Equal("plain note", loaded[0]);
        Assert.Contains("첫 번째 메모", MemoStore.PlainTextForDisplay(loaded[1]));
    }

    [Fact]
    public void Load_MissingFile_ReturnsEmpty()
    {
        using var isolation = AppDataIsolation.Begin();
        Assert.Empty(MemoStore.Load());
    }

    [Fact]
    public void Save_SkipsPersisting_WhenCalledWithEmptyList_StillCreatesFile()
    {
        using var isolation = AppDataIsolation.Begin();
        MemoStore.Save([]);
        Assert.True(File.Exists(MemoStore.MemoFilePath));
        Assert.Empty(MemoStore.Load());
    }

    [Fact]
    public void ApplyContentToEditor_LoadsPlainAndRtf()
    {
        using var isolation = AppDataIsolation.Begin();

        using RichTextBox source = new();
        source.Text = "RTF 본문";
        string rtf = source.Rtf ?? string.Empty;

        using RichTextBox targetPlain = new();
        MemoStore.ApplyContentToEditor(targetPlain, "그냥 텍스트");
        Assert.Equal("그냥 텍스트", targetPlain.Text);

        using RichTextBox targetRtf = new();
        MemoStore.ApplyContentToEditor(targetRtf, rtf);
        Assert.Equal("RTF 본문", targetRtf.Text);
    }

    [Fact]
    public void PlainTextForDisplay_FallsBack_WhenNotRtf()
    {
        Assert.Equal("hello", MemoStore.PlainTextForDisplay("hello"));
    }
}
