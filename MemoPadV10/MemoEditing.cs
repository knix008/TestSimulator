namespace MemoPadV10;

/// <summary>저장 목록에 대한 추가/수정/삭제 규칙(패드 저장·삭제와 동일).</summary>
internal static class MemoEditing
{
    /// <summary>기존 항목을 덮어쓰면 true, 새로 추가하면 false.</summary>
    public static bool Save(List<string> items, ref int sourceIndex, ref string? sourceMemo, string rtf)
    {
        if (sourceIndex >= 0 && sourceIndex < items.Count)
        {
            items[sourceIndex] = rtf;
            sourceMemo = rtf;
            return true;
        }

        if (sourceMemo is not null)
        {
            string match = sourceMemo;
            int idx = items.FindIndex(m => string.Equals(m, match, StringComparison.Ordinal));
            if (idx >= 0)
            {
                items[idx] = rtf;
                sourceIndex = idx;
                sourceMemo = rtf;
                return true;
            }
        }

        items.Add(rtf);
        sourceIndex = items.Count - 1;
        sourceMemo = rtf;
        return false;
    }

    public static bool TryDelete(List<string> items, ref int sourceIndex, ref string? sourceMemo, string? currentRtf)
    {
        int idx = -1;
        if (sourceMemo is not null)
        {
            string match = sourceMemo;
            idx = items.FindIndex(m => string.Equals(m, match, StringComparison.Ordinal));
        }

        if (idx < 0 && sourceIndex >= 0 && sourceIndex < items.Count)
        {
            idx = sourceIndex;
        }

        if (idx < 0 && !string.IsNullOrWhiteSpace(currentRtf))
        {
            idx = items.FindIndex(m => string.Equals(m, currentRtf, StringComparison.Ordinal));
        }

        if (idx < 0)
        {
            return false;
        }

        items.RemoveAt(idx);
        sourceMemo = null;
        sourceIndex = -1;
        return true;
    }
}
