namespace MemoPadV10.Tests;

public class MemoPadFormEditorTests
{
    private static void PumpEvents(int count = 10)
    {
        for (int i = 0; i < count; i++)
        {
            Application.DoEvents();
        }
    }

    private static IEnumerable<T> DescendantsOfType<T>(Control root) where T : Control
    {
        foreach (Control child in root.Controls)
        {
            if (child is T typed)
            {
                yield return typed;
            }

            foreach (T descendant in DescendantsOfType<T>(child))
            {
                yield return descendant;
            }
        }
    }

    [Fact]
    public void Editor_AcceptsText_And_LoadsStoredMemo()
    {
        using var isolation = AppDataIsolation.Begin();
        MemoStore.Save(["불러온 내용"]);

        using MemoPadForm form = new();
        form.Show();
        PumpEvents();

        form.memoEditor.Focus();
        form.memoEditor.Text = "직접 입력";
        Assert.Equal("직접 입력", form.memoEditor.Text);
        Assert.True(form.memoEditor.Enabled);
        Assert.False(form.memoEditor.ReadOnly);

        MemoStore.ApplyContentToEditor(form.memoEditor, MemoStore.Load()[0]);
        Assert.Equal("불러온 내용", form.memoEditor.Text);

        form.Close();
    }

    [Fact]
    public void MainForm_DoesNotShowSaveButtonAtRuntime()
    {
        using var isolation = AppDataIsolation.Begin();

        using MemoPadForm form = new();
        form.Show();
        PumpEvents();

        IEnumerable<Button> buttons = DescendantsOfType<Button>(form);

        Assert.DoesNotContain(buttons, button => button.Name.Contains("save", StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain(buttons, button => string.Equals(button.Text, "💾", StringComparison.Ordinal));
    }

    [Fact]
    public void ClosingForm_AutoSavesCurrentMemo()
    {
        using var isolation = AppDataIsolation.Begin();

        using MemoPadForm form = new();
        form.Show();
        PumpEvents();

        form.memoEditor.Text = "닫기 자동 저장";
        form.Close();
        PumpEvents();

        List<string> saved = MemoStore.Load();
        Assert.Single(saved);
        Assert.Equal("닫기 자동 저장", MemoStore.PlainTextForDisplay(saved[0]).Trim());
    }

    [Fact]
    public void ClosingEmptyForm_DoesNotCreateMemo()
    {
        using var isolation = AppDataIsolation.Begin();

        using MemoPadForm form = new();
        form.Show();
        PumpEvents();

        form.Close();
        PumpEvents();

        Assert.Empty(MemoStore.Load());
    }

    [Fact]
    public void ClosingOpenedMemo_UpdatesExistingMemoWithoutAddingDuplicate()
    {
        using var isolation = AppDataIsolation.Begin();
        using RichTextBox seed = new();
        seed.Text = "수정 전";
        MemoStore.Save([seed.Rtf ?? seed.Text]);

        using MemoPadForm form = new();
        form.Show();
        PumpEvents();

        form.OpenMemoByIndex(0);
        PumpEvents(30);

        form.memoEditor.Text = "수정 후";
        form.Close();
        PumpEvents();

        List<string> saved = MemoStore.Load();
        Assert.Single(saved);
        Assert.Equal("수정 후", MemoStore.PlainTextForDisplay(saved[0]).Trim());
    }

    [Fact]
    public void ClosingForm_AutoSavesMultilineAndUnicodeText()
    {
        using var isolation = AppDataIsolation.Begin();

        using MemoPadForm form = new();
        form.Show();
        PumpEvents();

        string text = "첫 줄\r\n둘째 줄: 한글, English, 123\r\n마지막 줄";
        form.memoEditor.Text = text;
        form.Close();
        PumpEvents();

        List<string> saved = MemoStore.Load();
        Assert.Single(saved);
        Assert.Equal(text.Replace("\r\n", "\n"), MemoStore.PlainTextForDisplay(saved[0]).Trim().Replace("\r\n", "\n"));
    }

    [Fact]
    public void EditorScrollBar_HidesAfterEnlargeWhenContentFits()
    {
        using var isolation = AppDataIsolation.Begin();

        using MemoPadForm form = new();
        form.Show();
        form.ClientSize = new Size(360, 220);
        PumpEvents(20);

        form.memoEditor.Text = string.Join("\n", Enumerable.Range(1, 16).Select(i => $"줄 {i} 스크롤 테스트"));
        PumpEvents(20);

        Assert.True(
            RichTextScrollInterop.TryReadVertical(form.memoEditor, out _, out int maxBefore),
            "스크롤 정보를 읽지 못함");
        Assert.True(maxBefore > 0, $"축소 상태에서 스크롤이 필요해야 함 (max={maxBefore})");

        ThemedVScrollBar? bar = DescendantsOfType<ThemedVScrollBar>(form).FirstOrDefault();
        Assert.NotNull(bar);
        Assert.True(bar!.Visible, "축소 상태에서 테마 스크롤바가 보여야 함");

        form.ClientSize = new Size(360, 720);
        PumpEvents(30);

        Assert.True(
            RichTextScrollInterop.TryReadVertical(form.memoEditor, out _, out int maxAfter),
            "확대 후 스크롤 정보를 읽지 못함");
        Assert.Equal(0, maxAfter);
        Assert.True(
            RichTextScrollInterop.ContentFitsWithoutVerticalScroll(form.memoEditor),
            "확대 후 내용이 다 보여야 함");
        Assert.False(bar.Visible, "확대 후 내용이 맞으면 테마 스크롤바가 숨겨져야 함");

        form.Close();
    }
}
