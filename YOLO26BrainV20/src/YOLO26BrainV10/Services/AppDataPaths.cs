namespace YOLO26BrainV10.Services;

internal static class AppDataPaths
{
    internal static string GetSampleDownloadDirectory()
    {
        var root = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "YOLO26BrainV10",
            "samples");
        Directory.CreateDirectory(root);
        return root;
    }

    /// <summary>
    /// Resolves <paramref name="imageFileName"/> (e.g. brain_tumor_sample.jpg): LocalAppData download first,
    /// then repo <c>samples/</c> (same layout as <c>download_sample_assets.py</c>, found by walking up from the app base dir).
    /// </summary>
    internal static string? TryResolveBrainTumorSampleImagePath(string imageFileName)
    {
        if (string.IsNullOrWhiteSpace(imageFileName))
            return null;

        var inAppData = Path.Combine(GetSampleDownloadDirectory(), imageFileName);
        if (File.Exists(inAppData))
            return inAppData;

        try
        {
            for (var dir = new DirectoryInfo(AppContext.BaseDirectory); dir != null; dir = dir.Parent)
            {
                var marker = Path.Combine(dir.FullName, "samples", "coco80_labels_comma.txt");
                if (!File.Exists(marker))
                    continue;

                var candidate = Path.Combine(dir.FullName, "samples", imageFileName);
                if (File.Exists(candidate))
                    return candidate;
            }
        }
        catch (IOException)
        {
            // ignore
        }
        catch (UnauthorizedAccessException)
        {
            // ignore
        }

        return null;
    }
}
