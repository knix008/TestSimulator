using ScreenCamWin.Models;

namespace ScreenCamWin.Core;

internal static class RecordingPathHelper
{
    public static string CreateVideoPath(string userPath, VideoCodecKind codec)
    {
        string ext = codec == VideoCodecKind.H264_MF ? ".mp4" : ".avi";

        if (string.IsNullOrWhiteSpace(userPath))
        {
            string dir  = Environment.GetFolderPath(Environment.SpecialFolder.MyVideos);
            string name = $"ScreenCamWin_{DateTime.Now:yyyy-MM-dd_HH-mm-ss}";
            return Path.Combine(dir, name + ext);
        }

        // If path is an existing directory, generate a timestamped filename inside it
        if (Directory.Exists(userPath))
        {
            string name = $"ScreenCamWin_{DateTime.Now:yyyy-MM-dd_HH-mm-ss}";
            return Path.Combine(userPath, name + ext);
        }

        // Strip any existing extension and append the correct one
        string parent = Path.GetDirectoryName(userPath)
            ?? Environment.GetFolderPath(Environment.SpecialFolder.MyVideos);
        string stem   = Path.GetFileNameWithoutExtension(userPath);
        if (string.IsNullOrEmpty(stem))
            stem = $"ScreenCamWin_{DateTime.Now:yyyy-MM-dd_HH-mm-ss}";

        return Path.Combine(parent, stem + ext);
    }
}
