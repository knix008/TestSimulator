namespace YOLO26BrainV20.Services;

internal static class AppDataPaths
{
    /// <summary>Known sample file name used by CLI smoke test resolution under LocalAppData or repo <c>samples/</c>.</summary>
    internal const string BrainTumorReferenceImageFileName = "brain_tumor_sample.jpg";

    internal static string GetSampleDownloadDirectory()
    {
        var root = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "YOLO26BrainV20",
            "samples");
        Directory.CreateDirectory(root);
        return root;
    }

    /// <summary>
    /// Resolves <paramref name="imageFileName"/> (e.g. brain_tumor_sample.jpg): LocalAppData samples folder first,
    /// then <c>&lt;repo&gt;/samples/</c> by walking parents of the app base dir until
    /// <c>src/YOLO26BrainV20/YOLO26BrainV20.csproj</c> is found (repo root marker).
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
                var repoMarker = Path.Combine(dir.FullName, "src", "YOLO26BrainV20", "YOLO26BrainV20.csproj");
                if (!File.Exists(repoMarker))
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
