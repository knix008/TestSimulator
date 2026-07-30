namespace MemoPadV10.Tests;

public class MemoOpenContentDiagnosisTests
{
    [Fact]
    public void OpenMemoByIndex_PutsFullTextInEditor()
    {
        using var isolation = AppDataIsolation.Begin();

        using RichTextBox seed = new();
        seed.Text = "첫번째줄\n\n\n\n\n두번째줄이 아래에 있습니다\n세번째";
        string rtf = seed.Rtf ?? seed.Text;
        MemoStore.Save([rtf, "짧은메모"]);

        using MemoPadForm host = new();
        host.Show();
        Application.DoEvents();

        host.OpenMemoByIndex(0);
        for (int i = 0; i < 20; i++)
        {
            Application.DoEvents();
        }

        MemoPadForm? opened = null;
        foreach (Form f in Application.OpenForms)
        {
            if (f is MemoPadForm mp && !ReferenceEquals(mp, host) && mp.Visible)
            {
                opened = mp;
                break;
            }
        }

        // always_new: may open new window; if reused host, use host
        opened ??= host;

        string text = opened.memoEditor.Text;
        Assert.False(string.IsNullOrWhiteSpace(text), "에디터 텍스트가 비어 있음");
        Assert.Contains("첫번째줄", text);
        Assert.Contains("두번째줄이 아래에 있습니다", text);
        Assert.Contains("세번째", text);
        Assert.True(opened.memoEditor.ClientSize.Width > 50, $"에디터 폭이 비정상: {opened.memoEditor.ClientSize}");
        Assert.True(opened.memoEditor.ClientSize.Height > 50, $"에디터 높이가 비정상: {opened.memoEditor.ClientSize}");
    }

    [Fact]
    public void ApplyContent_PreservesLongRtfAfterShow()
    {
        using var isolation = AppDataIsolation.Begin();

        string longText = string.Join("\n", Enumerable.Range(1, 40).Select(i => $"줄 {i} 내용입니다"));
        using RichTextBox seed = new();
        seed.Text = longText;
        string rtf = seed.Rtf ?? longText;

        using MemoPadForm form = new();
        form.Show();
        Application.DoEvents();

        MemoStore.ApplyContentToEditor(form.memoEditor, rtf);
        Application.DoEvents();

        Assert.Contains("줄 1 내용입니다", form.memoEditor.Text);
        Assert.Contains("줄 40 내용입니다", form.memoEditor.Text);
        Assert.Equal(longText.Replace("\r\n", "\n"), form.memoEditor.Text.Replace("\r\n", "\n"));
    }

    [Fact]
    public void OpenMemoByIndex_ShowsFirstLineAtTop()
    {
        using var isolation = AppDataIsolation.Begin();

        using RichTextBox seed = new();
        seed.Text = "첫줄보입니다\n\n\n\n\n아래줄";
        MemoStore.Save([seed.Rtf ?? seed.Text]);

        using MemoPadForm host = new();
        host.Show();
        Application.DoEvents();
        host.OpenMemoByIndex(0);
        for (int i = 0; i < 30; i++)
        {
            Application.DoEvents();
        }

        MemoPadForm target = host;
        foreach (Form f in Application.OpenForms)
        {
            if (f is MemoPadForm mp && mp.Visible && mp.memoEditor.Text.Contains("첫줄보입니다"))
            {
                target = mp;
                break;
            }
        }

        Assert.StartsWith("첫줄보입니다", target.memoEditor.Text.Replace("\r\n", "\n").TrimStart());

        // 테마 스크롤바 동기화(표시 전환) 후에도 첫 줄이 맨 위에 있어야 함
        for (int i = 0; i < 10; i++)
        {
            Application.DoEvents();
            Thread.Sleep(30);
        }

        Assert.True(RichTextScrollInterop.TryReadVertical(target.memoEditor, out int pos, out _));
        Assert.Equal(0, pos);
        Assert.True(
            RichTextScrollInterop.TryReadVerticalByLine(target.memoEditor, out int firstLine, out _),
            "첫 가시 줄을 읽지 못함");
        Assert.Equal(0, firstLine);
    }
}
