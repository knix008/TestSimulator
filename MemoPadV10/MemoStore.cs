using System.Text.Json;

namespace MemoPadV10;

/// <summary>memos.json 읽기/쓰기와 미리보기용 평문 변환.</summary>
internal static class MemoStore
{
    public static string MemoFilePath => AppPaths.Combine("memos.json");

    public static List<string> Load()
    {
        try
        {
            if (!File.Exists(MemoFilePath))
            {
                return [];
            }

            string json = File.ReadAllText(MemoFilePath);
            List<string>? loaded = JsonSerializer.Deserialize<List<string>>(json);
            if (loaded is null)
            {
                return [];
            }

            return loaded.Where(m => !string.IsNullOrWhiteSpace(m)).ToList();
        }
        catch
        {
            if (!AppPaths.SuppressUiDialogs)
            {
                MessageBox.Show(Loc.T("list.loadFailed"), Loc.T("common.error"), MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }

            return [];
        }
    }

    public static void Save(IReadOnlyList<string> items)
    {
        try
        {
            string? dirPath = Path.GetDirectoryName(MemoFilePath);
            if (!string.IsNullOrWhiteSpace(dirPath))
            {
                Directory.CreateDirectory(dirPath);
            }

            string json = JsonSerializer.Serialize(items, new JsonSerializerOptions { WriteIndented = true });
            File.WriteAllText(MemoFilePath, json);
        }
        catch
        {
            if (!AppPaths.SuppressUiDialogs)
            {
                MessageBox.Show(Loc.T("memo.saveFailed"), Loc.T("common.error"), MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }
    }

    public static string PlainTextForDisplay(string stored)
    {
        if (string.IsNullOrEmpty(stored))
        {
            return stored;
        }

        ReadOnlySpan<char> span = stored.AsSpan().TrimStart();
        if (!span.StartsWith("{\\rtf", StringComparison.OrdinalIgnoreCase))
        {
            return stored;
        }

        using RichTextBox rtb = new();
        try
        {
            rtb.Rtf = stored;
            return rtb.Text;
        }
        catch (ArgumentException)
        {
            return stored;
        }
    }

    public static void ApplyContentToEditor(RichTextBox editor, string stored)
    {
        if (string.IsNullOrEmpty(stored))
        {
            editor.Clear();
            return;
        }

        ReadOnlySpan<char> span = stored.AsSpan().TrimStart();
        if (span.StartsWith("{\\rtf", StringComparison.OrdinalIgnoreCase))
        {
            try
            {
                editor.Rtf = stored;
                if (!string.IsNullOrWhiteSpace(editor.Text))
                {
                    return;
                }
            }
            catch (ArgumentException)
            {
                // Fall through to plain text.
            }
            catch (Exception)
            {
                // 일부 RTF는 ArgumentException 외로도 실패할 수 있음
            }

            // RTF가 비거나 실패하면 평문으로라도 전체 표시
            string plain = PlainTextForDisplay(stored);
            editor.Text = string.IsNullOrWhiteSpace(plain) ? stored : plain;
            return;
        }

        editor.Text = stored;
    }
}
