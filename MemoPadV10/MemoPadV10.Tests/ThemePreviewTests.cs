using System.Drawing;

namespace MemoPadV10.Tests;

public class ThemePreviewTests
{
    [Fact]
    public void ListForm_ApplyPreviewBackColor_UpdatesBackgroundLive()
    {
        using var isolation = AppDataIsolation.Begin();
        MemoStore.Save(["메모 1", "메모 2"]);

        using MemoListForm list = new();
        list.Show();
        Application.DoEvents();

        Color probe = Color.FromArgb(255, 123, 200, 88);
        list.ApplyPreviewBackColor(probe);
        Application.DoEvents();

        Assert.Equal(probe.ToArgb(), list.BackColor.ToArgb());

        list.Close();
    }

    [Fact]
    public void PadForm_PreviewBackColorToAllPads_UpdatesEditorAndFormLive()
    {
        using var isolation = AppDataIsolation.Begin();

        using MemoPadForm pad = new();
        pad.Show();
        Application.DoEvents();

        Color probe = Color.FromArgb(255, 40, 90, 210);
        MemoPadForm.PreviewBackColorToAllPads(probe);
        Application.DoEvents();

        Assert.Equal(probe.ToArgb(), pad.BackColor.ToArgb());
        Assert.Equal(probe.ToArgb(), pad.memoEditor.BackColor.ToArgb());

        pad.Close();
    }
}
