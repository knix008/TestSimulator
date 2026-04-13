namespace YOLO11BrainV10.Services;

internal static class AppDataPaths
{
    internal static string GetAppDataRoot()
    {
        var root = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "YOLO11BrainV10");
        Directory.CreateDirectory(root);
        return root;
    }

    /// <summary>%LocalAppData%\YOLO11BrainV10\data</summary>
    internal static string GetDataRootDirectory()
    {
        var d = Path.Combine(GetAppDataRoot(), "data");
        Directory.CreateDirectory(d);
        return d;
    }

    /// <summary>Default CT / slice download folder: %LocalAppData%\YOLO11BrainV10\data\ct</summary>
    internal static string GetDefaultCtDataDirectory()
    {
        var d = Path.Combine(GetDataRootDirectory(), "ct");
        Directory.CreateDirectory(d);
        return d;
    }

    /// <summary>
    /// Folder for downloaded CT-style images and ATTRIBUTION.txt.
    /// Uses <see cref="UserPreferences.SampleAssetsDirectory"/> when set; otherwise <see cref="GetDefaultCtDataDirectory"/>.
    /// </summary>
    internal static string GetCtDataDirectory()
    {
        var prefs = UserPreferences.Load();
        if (!string.IsNullOrWhiteSpace(prefs.SampleAssetsDirectory))
        {
            try
            {
                var full = Path.GetFullPath(prefs.SampleAssetsDirectory.Trim());
                Directory.CreateDirectory(full);
                return full;
            }
            catch
            {
                // fall through to default
            }
        }

        return GetDefaultCtDataDirectory();
    }

    /// <summary>ONNX / PyTorch weights: %LocalAppData%\YOLO11BrainV10\models</summary>
    internal static string GetModelsDirectory()
    {
        var d = Path.Combine(GetAppDataRoot(), "models");
        Directory.CreateDirectory(d);
        return d;
    }
}
