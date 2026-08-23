namespace MemoPadV10.Tests;

public class EditorSettingsTests
{
    [Fact]
    public void Save_Then_TryLoad_RoundTrips()
    {
        using var isolation = AppDataIsolation.Begin();

        EditorSettings.Data data = EditorSettings.LoadDefaults();
        data.FontSize = 14f;
        data.Language = "en";
        data.EditorBackColorArgb = Color.LightYellow.ToArgb();
        EditorSettings.Save(data);

        EditorSettings.Data? loaded = EditorSettings.TryLoad();
        Assert.NotNull(loaded);
        Assert.Equal(14f, loaded!.FontSize);
        Assert.Equal("en", loaded.Language);
        Assert.Equal(Color.LightYellow.ToArgb(), loaded.EditorBackColorArgb);
    }

    [Fact]
    public void ApplyToUi_SetsEditorColors()
    {
        using Form form = new();
        using RichTextBox editor = new();
        EditorSettings.Data data = EditorSettings.LoadDefaults();
        data.EditorBackColorArgb = Color.FromArgb(255, 200, 220, 240).ToArgb();
        data.ForeColorArgb = Color.Navy.ToArgb();

        EditorSettings.ApplyToUi(editor, form, data);

        Assert.Equal(Color.FromArgb(data.EditorBackColorArgb), editor.BackColor);
        Assert.Equal(Color.FromArgb(data.ForeColorArgb), editor.ForeColor);
    }

    [Fact]
    public void TransparencyToOpacity_MapsEndsAndClampsFloor()
    {
        Assert.Equal(1.0, EditorSettings.TransparencyToOpacity(0), 3);
        Assert.Equal(0.15, EditorSettings.TransparencyToOpacity(100), 3);
        Assert.Equal(0.5, EditorSettings.TransparencyToOpacity(50), 3);
    }

    [Fact]
    public void Save_Then_TryLoad_RoundTripsGlobalTransparency()
    {
        using var isolation = AppDataIsolation.Begin();

        EditorSettings.Data data = EditorSettings.LoadDefaults();
        data.WindowTransparencyPercent = 45;
        EditorSettings.Save(data);

        EditorSettings.Data? loaded = EditorSettings.TryLoad();
        Assert.NotNull(loaded);
        Assert.Equal(45, loaded!.WindowTransparencyPercent);
        Assert.Equal(45, EditorSettings.ReadTransparencyPercent());
        Assert.Equal(45, MemoLookData.FromEditorSettings(loaded).TransparencyPercent);
    }

    [Fact]
    public void Save_Then_TryLoad_RoundTripsTransparency()
    {
        using var isolation = AppDataIsolation.Begin();

        MemoStore.Save(["memo-a", "memo-b"]);
        MemoLookData lookA = MemoLookData.FromDefaults();
        lookA.TransparencyPercent = 25;
        lookA.EditorBackColorArgb = Color.LightBlue.ToArgb();
        MemoLookData lookB = MemoLookData.FromDefaults();
        lookB.TransparencyPercent = 60;
        lookB.EditorBackColorArgb = Color.LightGreen.ToArgb();
        MemoSettingsStore.Set(0, lookA, 2);
        MemoSettingsStore.Set(1, lookB, 2);

        Assert.Equal(25, MemoSettingsStore.Get(0, 2).TransparencyPercent);
        Assert.Equal(60, MemoSettingsStore.Get(1, 2).TransparencyPercent);
        Assert.Equal(Color.LightBlue.ToArgb(), MemoSettingsStore.Get(0, 2).EditorBackColorArgb);
        Assert.Equal(Color.LightGreen.ToArgb(), MemoSettingsStore.Get(1, 2).EditorBackColorArgb);

        MemoSettingsStore.RemoveAt(0);
        Assert.Equal(60, MemoSettingsStore.Get(0, 1).TransparencyPercent);
        Assert.Equal(Color.LightGreen.ToArgb(), MemoSettingsStore.Get(0, 1).EditorBackColorArgb);
    }

    [Fact]
    public void PresetEditorBackColors_Are24Distinct()
    {
        string[] colors = EditorSettingsForm.PresetEditorBackHexColors;
        Assert.Equal(24, colors.Length);

        HashSet<int> unique = new();
        foreach (string hex in colors)
        {
            Color c = ColorTranslator.FromHtml(hex);
            Assert.True(unique.Add(c.ToArgb()), $"중복 색: {hex}");
        }
    }
}
