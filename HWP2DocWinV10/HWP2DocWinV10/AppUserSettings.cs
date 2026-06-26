namespace HWP2DocWinV10;

internal enum StructurePanelSide
{
    Left,
    Right
}

internal static class AppUserSettings
{
    public const float DefaultFontSize = 10f;

    private static readonly string SettingsDirectory = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
        "HWP2DocWinV10");

    private static readonly string SettingsPath = Path.Combine(SettingsDirectory, "settings.txt");

    public static StructurePanelSide StructurePanelSide { get; private set; } = StructurePanelSide.Right;

    public static bool StructurePanelVisible { get; private set; } = false;

    public static float FontSize { get; private set; } = DefaultFontSize;

    public static string? LastDirectory { get; private set; }

    public static void Load()
    {
        StructurePanelSide = StructurePanelSide.Right;
        StructurePanelVisible = false;
        FontSize = DefaultFontSize;
        LastDirectory = null;

        try
        {
            if (!File.Exists(SettingsPath))
                return;

            foreach (string rawLine in File.ReadAllLines(SettingsPath))
            {
                string line = rawLine.Trim();
                if (line.StartsWith("StructurePanelSide=", StringComparison.OrdinalIgnoreCase))
                {
                    string side = line["StructurePanelSide=".Length..].Trim();
                    if (Enum.TryParse(side, ignoreCase: true, out StructurePanelSide parsedSide))
                        StructurePanelSide = parsedSide;
                }
                else if (line.StartsWith("FontSize=", StringComparison.OrdinalIgnoreCase))
                {
                    string fontSize = line["FontSize=".Length..].Trim();
                    if (float.TryParse(fontSize, out float parsedFontSize))
                        FontSize = Math.Clamp(parsedFontSize, 8f, 24f);
                }
                else if (line.StartsWith("LastDirectory=", StringComparison.OrdinalIgnoreCase))
                {
                    string directory = line["LastDirectory=".Length..].Trim();
                    if (Directory.Exists(directory))
                        LastDirectory = directory;
                }
            }
        }
        catch
        {
            StructurePanelSide = StructurePanelSide.Right;
            StructurePanelVisible = false;
            FontSize = DefaultFontSize;
            LastDirectory = null;
        }
    }

    public static void SetLastDirectory(string? directory)
    {
        if (string.IsNullOrWhiteSpace(directory) || !Directory.Exists(directory))
            return;

        LastDirectory = directory;
        Save();
    }

    public static void SetStructurePanelSide(StructurePanelSide side)
    {
        StructurePanelSide = side;
        Save();
    }

    public static void SetStructurePanelVisible(bool visible)
    {
        StructurePanelVisible = visible;
    }

    public static void SetFontSize(float fontSize)
    {
        FontSize = Math.Clamp(fontSize, 8f, 24f);
        Save();
    }

    private static void Save()
    {
        try
        {
            Directory.CreateDirectory(SettingsDirectory);
            File.WriteAllLines(
                SettingsPath,
                [
                    $"StructurePanelSide={StructurePanelSide}",
                    $"FontSize={FontSize.ToString(System.Globalization.CultureInfo.InvariantCulture)}",
                    $"LastDirectory={LastDirectory ?? string.Empty}"
                ]);
        }
        catch
        {
            // 설정 저장 실패 시에도 실행은 계속합니다.
        }
    }
}
