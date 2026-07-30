namespace MemoPadV10.Tests;

/// <summary>작성 → 저장 → 목록 조회 → 불러오기 등 사용자 시나리오.</summary>
public class MemoWorkflowScenarioTests
{
    [Fact]
    public void Scenario_Write_Save_List_Load()
    {
        using var isolation = AppDataIsolation.Begin();

        // 1) 새 메모 작성
        using RichTextBox writer = new();
        writer.Text = "장보기: 우유, 계란";
        string rtf = writer.Rtf ?? string.Empty;

        List<string> items = [];
        int sourceIndex = -1;
        string? sourceMemo = null;
        Assert.False(MemoEditing.Save(items, ref sourceIndex, ref sourceMemo, rtf));
        MemoStore.Save(items);

        // 2) 목록에서 보기(미리보기)
        List<string> listed = MemoStore.Load();
        Assert.Single(listed);
        string preview = MemoStore.PlainTextForDisplay(listed[0]);
        Assert.Contains("장보기", preview);
        Assert.Contains("우유", preview);

        // 3) 목록에서 불러오기(에디터에 적용)
        using RichTextBox reader = new();
        MemoStore.ApplyContentToEditor(reader, listed[0]);
        Assert.Equal("장보기: 우유, 계란", reader.Text);

        // 4) 같은 카드로 다시 저장된 것으로 인식
        Assert.Equal(0, sourceIndex);
        Assert.NotNull(sourceMemo);
    }

    [Fact]
    public void Scenario_EditExisting_UpdatesSameListItem()
    {
        using var isolation = AppDataIsolation.Begin();

        List<string> items = [];
        int sourceIndex = -1;
        string? sourceMemo = null;

        using RichTextBox editor = new();
        editor.Text = "초안";
        MemoEditing.Save(items, ref sourceIndex, ref sourceMemo, editor.Rtf ?? "");
        MemoStore.Save(items);

        editor.Text = "수정본";
        Assert.True(MemoEditing.Save(items, ref sourceIndex, ref sourceMemo, editor.Rtf ?? ""));
        MemoStore.Save(items);

        List<string> listed = MemoStore.Load();
        Assert.Single(listed);
        Assert.Equal("수정본", MemoStore.PlainTextForDisplay(listed[0]).Trim());
    }

    [Fact]
    public void Scenario_MultipleMemos_OpenByIndex()
    {
        using var isolation = AppDataIsolation.Begin();

        MemoStore.Save(["첫번째", "두번째", "세번째"]);
        List<string> listed = MemoStore.Load();
        Assert.Equal(3, listed.Count);

        using RichTextBox editor = new();
        MemoStore.ApplyContentToEditor(editor, listed[1]);
        Assert.Equal("두번째", editor.Text);
    }

    [Fact]
    public void Scenario_DeleteFromList_RemovesItem()
    {
        using var isolation = AppDataIsolation.Begin();

        List<string> items = ["keep", "drop", "also-keep"];
        int sourceIndex = 1;
        string? sourceMemo = "drop";
        Assert.True(MemoEditing.TryDelete(items, ref sourceIndex, ref sourceMemo, null));
        MemoStore.Save(items);

        Assert.Equal(["keep", "also-keep"], MemoStore.Load());
    }

    [Fact]
    public void Scenario_NewMemo_PendingFlag_IsConsumedOnce()
    {
        using var isolation = AppDataIsolation.Begin();

        Directory.CreateDirectory(AppPaths.Root);
        File.WriteAllText(AppIpc.PendingNewMemoPath, "1");
        Assert.True(AppIpc.TryConsumePendingNewMemo());
        Assert.False(AppIpc.TryConsumePendingNewMemo());
    }

    [Fact]
    public void Scenario_PendingOpenIndex_WriteAndRead()
    {
        using var isolation = AppDataIsolation.Begin();

        Directory.CreateDirectory(AppPaths.Root);
        File.WriteAllText(AppIpc.PendingOpenPath, "2");
        Assert.True(AppIpc.TryReadPendingOpenIndex(out int index));
        Assert.Equal(2, index);
        Assert.False(AppIpc.TryReadPendingOpenIndex(out _));
    }

    [Fact]
    public void Scenario_OpenMemo_ClearsStaleNewMemoPending()
    {
        using var isolation = AppDataIsolation.Begin();
        Directory.CreateDirectory(AppPaths.Root);
        File.WriteAllText(AppIpc.PendingNewMemoPath, "1");
        File.WriteAllText(AppIpc.PendingOpenPath, "1");

        // RequestOpenMemo 경로와 동일하게 open을 남기고 new를 지우는 정리
        typeof(AppIpc)
            .GetMethod("ClearPendingExcept", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Static)!
            .Invoke(null, [AppIpc.PendingOpenPath]);

        Assert.True(File.Exists(AppIpc.PendingOpenPath));
        Assert.False(File.Exists(AppIpc.PendingNewMemoPath));
        Assert.True(AppIpc.TryReadPendingOpenIndex(out int idx));
        Assert.Equal(1, idx);
    }
}
