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
}
