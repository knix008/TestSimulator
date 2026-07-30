namespace MemoPadV10.Tests;

public class MemoPadFormEditorTests
{
    [Fact]
    public void Editor_AcceptsText_And_LoadsStoredMemo()
    {
        using var isolation = AppDataIsolation.Begin();
        MemoStore.Save(["불러온 내용"]);

        using MemoPadForm form = new();
        form.Show();
        Application.DoEvents();

        form.memoEditor.Focus();
        form.memoEditor.Text = "직접 입력";
        Assert.Equal("직접 입력", form.memoEditor.Text);
        Assert.True(form.memoEditor.Enabled);
        Assert.False(form.memoEditor.ReadOnly);

        MemoStore.ApplyContentToEditor(form.memoEditor, MemoStore.Load()[0]);
        Assert.Equal("불러온 내용", form.memoEditor.Text);

        form.Close();
    }
}
