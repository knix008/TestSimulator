namespace YOLO11BrainV10.Services;

internal static class ModelAssetStorage
{
    /// <summary>
    /// If the file is not already under the app models directory, copies it there (overwrite).
    /// Returns the path to the file under models, or the original path if copy fails or already in models.
    /// </summary>
    internal static string EnsureCopyInModelsDirectory(string sourcePath)
    {
        if (string.IsNullOrWhiteSpace(sourcePath) || !File.Exists(sourcePath))
            return sourcePath;

        var modelsDir = AppDataPaths.GetModelsDirectory();
        var destPath = Path.Combine(modelsDir, Path.GetFileName(sourcePath));
        var fullSrc = Path.GetFullPath(sourcePath);
        var fullDest = Path.GetFullPath(destPath);

        if (string.Equals(fullSrc, fullDest, StringComparison.OrdinalIgnoreCase))
            return fullSrc;

        try
        {
            File.Copy(sourcePath, destPath, overwrite: true);
            return fullDest;
        }
        catch
        {
            return fullSrc;
        }
    }
}
