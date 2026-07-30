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
}
