using HWP2DocWinV10.Services;

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

    private static readonly string WebView2DataDirectory = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "HWP2DocWinV10",
        "WebView2");

    private static readonly string SettingsPath = Path.Combine(SettingsDirectory, "settings.txt");

    public static StructurePanelSide StructurePanelSide { get; private set; } = StructurePanelSide.Right;

    public static bool StructurePanelVisible { get; private set; } = false;

    public static float FontSize { get; private set; } = DefaultFontSize;

    public static string? LastDirectory { get; private set; }

    public static bool LlmEnabled { get; private set; }

    public static bool LlmFastMode { get; private set; } = true;

    public static bool RhwpEnabled { get; private set; }

    public static HwpConversionEngine ConversionEngine { get; private set; } = HwpConversionEngine.Unhwp;

    public static string LlmModel { get; private set; } = string.Empty;

    public static LlmProcessingTargets LlmProcessingTargets { get; private set; } = LlmProcessingTargetCatalog.Default;

    /// <summary>WebView2 cache/profile folder (writable; not under Program Files).</summary>
    public static string GetWebView2UserDataFolder()
    {
        Directory.CreateDirectory(WebView2DataDirectory);
        return WebView2DataDirectory;
    }

    public static void Load()
    {
        StructurePanelSide = StructurePanelSide.Right;
        StructurePanelVisible = false;
        FontSize = DefaultFontSize;
        LastDirectory = null;
        LlmEnabled = false;
        LlmFastMode = true;
        RhwpEnabled = false;
        ConversionEngine = HwpConversionEngine.Unhwp;
        LlmModel = string.Empty;
        LlmProcessingTargets = LlmProcessingTargetCatalog.Default;

        try
        {
            if (!File.Exists(SettingsPath))
                return;

            bool conversionEngineSet = false;

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
                else if (line.StartsWith("LlmEnabled=", StringComparison.OrdinalIgnoreCase))
                {
                    string enabled = line["LlmEnabled=".Length..].Trim();
                    if (bool.TryParse(enabled, out bool parsedEnabled))
                        LlmEnabled = parsedEnabled;
                }
                else if (line.StartsWith("LlmFastMode=", StringComparison.OrdinalIgnoreCase))
                {
                    string enabled = line["LlmFastMode=".Length..].Trim();
                    if (bool.TryParse(enabled, out bool parsedEnabled))
                        LlmFastMode = parsedEnabled;
                }
                else if (line.StartsWith("RhwpEnabled=", StringComparison.OrdinalIgnoreCase))
                {
                    string enabled = line["RhwpEnabled=".Length..].Trim();
                    if (bool.TryParse(enabled, out bool parsedEnabled))
                        RhwpEnabled = parsedEnabled;
                }
                else if (line.StartsWith("ConversionEngine=", StringComparison.OrdinalIgnoreCase))
                {
                    string value = line["ConversionEngine=".Length..].Trim();
                    if (Enum.TryParse(value, ignoreCase: true, out HwpConversionEngine parsedEngine))
                    {
                        ConversionEngine = parsedEngine;
                        conversionEngineSet = true;
                    }
                }
                else if (line.StartsWith("LlmModel=", StringComparison.OrdinalIgnoreCase))
                {
                    LlmModel = line["LlmModel=".Length..].Trim();
                }
                else if (line.StartsWith("LlmTargets=", StringComparison.OrdinalIgnoreCase))
                {
                    LlmProcessingTargets = ParseLlmProcessingTargets(line["LlmTargets=".Length..].Trim());
                }
            }

            if (!conversionEngineSet)
                ConversionEngine = HwpConversionEngine.Unhwp;
        }
        catch
        {
            StructurePanelSide = StructurePanelSide.Right;
            StructurePanelVisible = false;
            FontSize = DefaultFontSize;
            LastDirectory = null;
            LlmEnabled = false;
            RhwpEnabled = false;
            ConversionEngine = HwpConversionEngine.Unhwp;
            LlmModel = string.Empty;
            LlmProcessingTargets = LlmProcessingTargetCatalog.Default;
        }
    }

    private static LlmProcessingTargets ParseLlmProcessingTargets(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return LlmProcessingTargetCatalog.Default;

        if (int.TryParse(value, out int flags))
        {
            var parsed = (LlmProcessingTargets)flags;
            return parsed == LlmProcessingTargets.None
                ? LlmProcessingTargetCatalog.Default
                : parsed;
        }

        LlmProcessingTargets result = LlmProcessingTargets.None;
        foreach (string part in value.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            if (Enum.TryParse(part, ignoreCase: true, out LlmProcessingTargets flag))
                result |= flag;
        }

        return result == LlmProcessingTargets.None
            ? LlmProcessingTargetCatalog.Default
            : result;
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

    public static void SetLlmEnabled(bool enabled)
    {
        LlmEnabled = enabled;
        Save();
    }

    public static void SetLlmFastMode(bool enabled)
    {
        LlmFastMode = enabled;
        Save();
    }

    public static void SetRhwpEnabled(bool enabled)
    {
        RhwpEnabled = enabled;
        Save();
    }

    public static void SetConversionEngine(HwpConversionEngine engine)
    {
        ConversionEngine = engine;
        RhwpEnabled = engine == HwpConversionEngine.Rhwp;
        Save();
    }

    public static void SetLlmModel(string model)
    {
        LlmModel = model.Trim();
        Save();
    }

    public static void SetLlmProcessingTargets(LlmProcessingTargets targets)
    {
        LlmProcessingTargets = targets == LlmProcessingTargets.None
            ? LlmProcessingTargetCatalog.Default
            : targets;
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
                    $"LastDirectory={LastDirectory ?? string.Empty}",
                    $"LlmEnabled={LlmEnabled}",
                    $"LlmFastMode={LlmFastMode}",
                    $"RhwpEnabled={RhwpEnabled}",
                    $"ConversionEngine={ConversionEngine}",
                    $"LlmModel={LlmModel}",
                    $"LlmTargets={(int)LlmProcessingTargets}"
                ]);
        }
        catch
        {
            // 설정 저장 실패 시에도 실행은 계속합니다.
        }
    }
}
