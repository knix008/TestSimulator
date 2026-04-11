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
}
