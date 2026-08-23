using System.Text.Json;

namespace MemoPadV10;

/// <summary>저장된 메모 한 건의 모양 설정(글꼴·색·투명도).</summary>
internal sealed class MemoLookData
{
    public string FontName { get; set; } = "맑은 고딕";
    public float FontSize { get; set; } = 12f;
    public string FontStyle { get; set; } = "Regular";
    public int ForeColorArgb { get; set; } = Color.Black.ToArgb();
    public int EditorBackColorArgb { get; set; } = Color.FromArgb(255, 248, 225, 140).ToArgb();
    public int FormBackColorArgb { get; set; } = Color.FromArgb(255, 248, 225, 140).ToArgb();
    public int TransparencyPercent { get; set; }

    public static MemoLookData FromDefaults() => FromEditorSettings(EditorSettings.LoadDefaults());

    public static MemoLookData FromEditorSettings(EditorSettings.Data data) => new()
    {
        FontName = data.FontName,
        FontSize = data.FontSize,
        FontStyle = data.FontStyle,
        ForeColorArgb = data.ForeColorArgb,
        EditorBackColorArgb = data.EditorBackColorArgb,
        FormBackColorArgb = data.FormBackColorArgb,
        TransparencyPercent = EditorSettings.ClampTransparencyPercent(data.WindowTransparencyPercent)
    };

    public static MemoLookData Capture(RichTextBox editor, Form form, int transparencyPercent) => new()
    {
        FontName = editor.Font.FontFamily.Name,
        FontSize = editor.Font.SizeInPoints,
        FontStyle = EditorSettings.FontStyleToString(editor.Font.Style),
        ForeColorArgb = editor.ForeColor.ToArgb(),
        EditorBackColorArgb = editor.BackColor.ToArgb(),
        FormBackColorArgb = form.BackColor.ToArgb(),
        TransparencyPercent = EditorSettings.ClampTransparencyPercent(transparencyPercent)
    };

    public EditorSettings.Data ToEditorSettings(string language) => new()
    {
        FontName = FontName,
        FontSize = FontSize,
        FontStyle = FontStyle,
        ForeColorArgb = ForeColorArgb,
        EditorBackColorArgb = EditorBackColorArgb,
        FormBackColorArgb = FormBackColorArgb,
        Language = language,
        WindowTransparencyPercent = EditorSettings.ClampTransparencyPercent(TransparencyPercent)
    };

    public MemoLookData Clone() => new()
    {
        FontName = FontName,
        FontSize = FontSize,
        FontStyle = FontStyle,
        ForeColorArgb = ForeColorArgb,
        EditorBackColorArgb = EditorBackColorArgb,
        FormBackColorArgb = FormBackColorArgb,
        TransparencyPercent = TransparencyPercent
    };
}

/// <summary>
/// 메모 목록 인덱스와 같은 순서의 모양 설정을 저장합니다.
/// 언어·자동실행은 전역(EditorSettings/AutoStart)에 두고, 글꼴·색·투명도만 메모별로 둡니다.
/// </summary>
internal static class MemoSettingsStore
{
    private static readonly JsonSerializerOptions JsonOptions = new() { WriteIndented = true };

    public static string FilePath => AppPaths.Combine("memo_settings.json");

    public static List<MemoLookData?> LoadAligned(int memoCount)
    {
        List<MemoLookData?> values = LoadRaw();
        MigrateTransparencyInto(values);

        while (values.Count < memoCount)
        {
            values.Add(null);
        }

        if (values.Count > memoCount)
        {
            values.RemoveRange(memoCount, values.Count - memoCount);
        }

        return values;
    }

    public static MemoLookData Get(int memoIndex, int memoCount)
    {
        if (memoIndex < 0)
        {
            return MemoLookData.FromEditorSettings(EditorSettings.TryLoad() ?? EditorSettings.LoadDefaults());
        }

        List<MemoLookData?> values = LoadAligned(Math.Max(memoCount, memoIndex + 1));
        MemoLookData? stored = memoIndex < values.Count ? values[memoIndex] : null;
        if (stored != null)
        {
            stored.TransparencyPercent = EditorSettings.ClampTransparencyPercent(stored.TransparencyPercent);
            return stored.Clone();
        }

        MemoLookData fallback = MemoLookData.FromEditorSettings(EditorSettings.TryLoad() ?? EditorSettings.LoadDefaults());
        // 예전 memo_transparency.json 값만 있을 수 있음
        fallback.TransparencyPercent = MemoTransparencyStore.GetLegacy(memoIndex, memoCount);
        return fallback;
    }

    public static void Set(int memoIndex, MemoLookData look, int memoCount)
    {
        if (memoIndex < 0 || look is null)
        {
            return;
        }

        int count = Math.Max(memoCount, memoIndex + 1);
        List<MemoLookData?> values = LoadAligned(count);
        MemoLookData copy = look.Clone();
        copy.TransparencyPercent = EditorSettings.ClampTransparencyPercent(copy.TransparencyPercent);
        values[memoIndex] = copy;
        Save(values);
        // 레거시 투명도 파일도 맞춰 둡니다.
        MemoTransparencyStore.SetLegacy(memoIndex, copy.TransparencyPercent, count);
    }

    public static void RemoveAt(int memoIndex)
    {
        if (memoIndex < 0)
        {
            return;
        }

        List<MemoLookData?> values = LoadRaw();
        MigrateTransparencyInto(values);
        if (memoIndex < values.Count)
        {
            values.RemoveAt(memoIndex);
            Save(values);
        }

        MemoTransparencyStore.RemoveAt(memoIndex);
    }

    public static void Save(IReadOnlyList<MemoLookData?> values)
    {
        try
        {
            string? dir = Path.GetDirectoryName(FilePath);
            if (!string.IsNullOrWhiteSpace(dir))
            {
                Directory.CreateDirectory(dir);
            }

            string json = JsonSerializer.Serialize(values, JsonOptions);
            File.WriteAllText(FilePath, json);
        }
        catch
        {
            // 메모 설정 저장 실패는 치명적이지 않음
        }
    }

    private static List<MemoLookData?> LoadRaw()
    {
        try
        {
            if (!File.Exists(FilePath))
            {
                return [];
            }

            string json = File.ReadAllText(FilePath);
            return JsonSerializer.Deserialize<List<MemoLookData?>>(json) ?? [];
        }
        catch
        {
            return [];
        }
    }

    private static void MigrateTransparencyInto(List<MemoLookData?> values)
    {
        List<int> legacy = MemoTransparencyStore.LoadRawLegacy();
        if (legacy.Count == 0)
        {
            return;
        }

        while (values.Count < legacy.Count)
        {
            values.Add(null);
        }

        for (int i = 0; i < legacy.Count; i++)
        {
            int t = EditorSettings.ClampTransparencyPercent(legacy[i]);
            if (t == 0)
            {
                continue;
            }

            if (values[i] is null)
            {
                values[i] = MemoLookData.FromDefaults();
            }

            if (values[i]!.TransparencyPercent == 0)
            {
                values[i]!.TransparencyPercent = t;
            }
        }
    }
}
