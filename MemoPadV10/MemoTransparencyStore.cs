using System.Text.Json;

namespace MemoPadV10;

/// <summary>
/// 투명도 레거시 API. 실제 저장은 <see cref="MemoSettingsStore"/>가 담당합니다.
/// 기존 memo_transparency.json은 마이그레이션용으로만 읽습니다.
/// </summary>
internal static class MemoTransparencyStore
{
    private static readonly JsonSerializerOptions JsonOptions = new() { WriteIndented = true };

    public static string FilePath => AppPaths.Combine("memo_transparency.json");

    public static int Get(int memoIndex, int memoCount) =>
        MemoSettingsStore.Get(memoIndex, memoCount).TransparencyPercent;

    public static void Set(int memoIndex, int transparencyPercent, int memoCount)
    {
        if (memoIndex < 0)
        {
            return;
        }

        MemoLookData look = MemoSettingsStore.Get(memoIndex, memoCount);
        look.TransparencyPercent = EditorSettings.ClampTransparencyPercent(transparencyPercent);
        MemoSettingsStore.Set(memoIndex, look, memoCount);
    }

    public static void RemoveAt(int memoIndex)
    {
        // MemoSettingsStore.RemoveAt이 설정을 제거합니다. 레거시 파일만 정리합니다.
        RemoveLegacyAt(memoIndex);
    }

    public static int GetLegacy(int memoIndex, int memoCount)
    {
        List<int> values = LoadRawLegacy();
        if (memoIndex < 0 || memoIndex >= values.Count)
        {
            return 0;
        }

        _ = memoCount;
        return EditorSettings.ClampTransparencyPercent(values[memoIndex]);
    }

    public static void SetLegacy(int memoIndex, int transparencyPercent, int memoCount)
    {
        if (memoIndex < 0)
        {
            return;
        }

        int count = Math.Max(memoCount, memoIndex + 1);
        List<int> values = LoadRawLegacy();
        while (values.Count < count)
        {
            values.Add(0);
        }

        values[memoIndex] = EditorSettings.ClampTransparencyPercent(transparencyPercent);
        SaveLegacy(values);
    }

    public static List<int> LoadRawLegacy()
    {
        try
        {
            if (!File.Exists(FilePath))
            {
                return [];
            }

            string json = File.ReadAllText(FilePath);
            List<int> values = JsonSerializer.Deserialize<List<int>>(json) ?? [];
            for (int i = 0; i < values.Count; i++)
            {
                values[i] = EditorSettings.ClampTransparencyPercent(values[i]);
            }

            return values;
        }
        catch
        {
            return [];
        }
    }

    private static void RemoveLegacyAt(int memoIndex)
    {
        if (memoIndex < 0)
        {
            return;
        }

        List<int> values = LoadRawLegacy();
        if (memoIndex >= values.Count)
        {
            return;
        }

        values.RemoveAt(memoIndex);
        SaveLegacy(values);
    }

    private static void SaveLegacy(IReadOnlyList<int> values)
    {
        try
        {
            string? dir = Path.GetDirectoryName(FilePath);
            if (!string.IsNullOrWhiteSpace(dir))
            {
                Directory.CreateDirectory(dir);
            }

            File.WriteAllText(FilePath, JsonSerializer.Serialize(values, JsonOptions));
        }
        catch
        {
            // ignore
        }
    }
}
