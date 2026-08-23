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
    public void TopBar_IsNotCoveredByEditorHost()
    {
        using var isolation = AppDataIsolation.Begin();

        using MemoPadForm form = new();
        form.Show();
        PumpEvents(20);

        Control bar = form.Controls.Find("topBarPanel", searchAllChildren: false).Single();
        Control host = form.Controls.Find("editorHost", searchAllChildren: false).Single();

        Assert.True(
            form.Controls.GetChildIndex(bar) > form.Controls.GetChildIndex(host),
            $"툴바가 에디터보다 앞(z-order)에 있어야 하단이 가려지지 않음 (bar={form.Controls.GetChildIndex(bar)}, host={form.Controls.GetChildIndex(host)}, count={form.Controls.Count})");
        Assert.True(
            host.Top >= bar.Bottom,
            $"에디터가 툴바와 겹치면 안 됨 (bar.Bounds={bar.Bounds}, host.Bounds={host.Bounds}, padding={form.Padding})");

        form.Close();
    }

    [Fact]
    public void Settings_ShowsOpacitySliderWithRangeLabels()
    {
        using var isolation = AppDataIsolation.Begin();

        using MemoPadForm form = new();
        form.Show();
        PumpEvents(20);

        using EditorSettingsForm dlg = new(form.memoEditor, form);
        dlg.Show();
        PumpEvents(10);

        Control group = dlg.Controls.Find("opacityGroupBox", searchAllChildren: true).Single();
        Assert.True(group.Visible);
        TrackBar track = group.Controls.OfType<TrackBar>().Single();
        Assert.Equal(0, track.Minimum);
        Assert.Equal(100, track.Maximum);

        Label[] labels = group.Controls.OfType<Label>().ToArray();
        Assert.Contains(labels, l => l.Text == "0%");
        Assert.Contains(labels, l => l.Text == "100%");

        track.Value = 35;
        PumpEvents(10);
        Assert.Equal(35, form.TransparencyPercent);
        Assert.True(form.Opacity < 1.0);

        form.SaveSettingsFromDialog();
        // 설정 확인 직후 ApplyBoundMemoLook이 다시 호출되어도 투명도가 유지되어야 함
        MemoPadForm.ApplyThemeToAllOpenPads();
        PumpEvents(10);
        Assert.Equal(35, form.TransparencyPercent);
        Assert.Equal(EditorSettings.TransparencyToOpacity(35), form.Opacity, 2);
        Assert.Equal(35, EditorSettings.ReadTransparencyPercent());

        dlg.Close();
        form.Close();
    }

    [Fact]
    public void UnboundMemo_SettingsOk_PersistsWindowTransparency()
    {
        using var isolation = AppDataIsolation.Begin();

        using MemoPadForm form = new();
        form.Show();
        PumpEvents(20);

        form.TransparencyPercent = 40;
        form.SaveSettingsFromDialog();
        MemoPadForm.ApplyThemeToAllOpenPads();
        PumpEvents(10);

        Assert.Equal(40, EditorSettings.ReadTransparencyPercent());
        Assert.Equal(40, form.TransparencyPercent);
        Assert.Equal(EditorSettings.TransparencyToOpacity(40), form.Opacity, 2);

        using MemoPadForm second = new();
        second.Show();
        PumpEvents(20);
        Assert.Equal(40, second.TransparencyPercent);
        Assert.Equal(EditorSettings.TransparencyToOpacity(40), second.Opacity, 2);

        second.Close();
        form.Close();
    }

    [Fact]
    public void Opacity_IsIndependentPerMemoWindow()
    {
        using var isolation = AppDataIsolation.Begin();
        MemoStore.Save(["첫번째", "두번째"]);
        MemoLookData look0 = MemoLookData.FromDefaults();
        look0.TransparencyPercent = 20;
        look0.EditorBackColorArgb = Color.FromArgb(255, 255, 200, 200).ToArgb();
        MemoLookData look1 = MemoLookData.FromDefaults();
        look1.TransparencyPercent = 55;
        look1.EditorBackColorArgb = Color.FromArgb(255, 200, 255, 200).ToArgb();
        MemoSettingsStore.Set(0, look0, 2);
        MemoSettingsStore.Set(1, look1, 2);

        using MemoPadForm host = new();
        host.Show();
        PumpEvents(20);

        host.OpenMemoByIndex(0);
        PumpEvents(20);
        MemoPadForm? first = Application.OpenForms.OfType<MemoPadForm>()
            .FirstOrDefault(p => p.memoEditor.Text.Contains("첫번째"));
        Assert.NotNull(first);

        host.OpenMemoByIndex(1);
        PumpEvents(20);
        MemoPadForm? second = Application.OpenForms.OfType<MemoPadForm>()
            .FirstOrDefault(p => p.memoEditor.Text.Contains("두번째"));
        Assert.NotNull(second);
        Assert.False(ReferenceEquals(first, second));

        double op0 = EditorSettings.TransparencyToOpacity(20);
        double op1 = EditorSettings.TransparencyToOpacity(55);
        Assert.Equal(op0, first!.Opacity, 2);
        Assert.Equal(op1, second!.Opacity, 2);
        Assert.Equal(look0.EditorBackColorArgb, first.memoEditor.BackColor.ToArgb());
        Assert.Equal(look1.EditorBackColorArgb, second.memoEditor.BackColor.ToArgb());

        second.TransparencyPercent = 70;
        second.SaveSettingsFromDialog();
        PumpEvents(10);

        Assert.Equal(70, MemoSettingsStore.Get(1, 2).TransparencyPercent);
        Assert.Equal(20, MemoSettingsStore.Get(0, 2).TransparencyPercent);
        Assert.Equal(op0, first.Opacity, 2);
        Assert.Equal(look0.EditorBackColorArgb, first.memoEditor.BackColor.ToArgb());

        first.Close();
        second.Close();
        host.Close();
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
