using ScreenCamWin.Models;

namespace ScreenCamWin.Core;

internal static class RecordingPathHelper
{
    public static RecordingOutputPaths CreateSessionPaths(
        string userPath,
        bool captureMicrophone,
        VideoCodecKind codec)
    {
        string ext = codec == VideoCodecKind.H264_MF ? ".mp4" : ".avi";

        string sessionDir;
        if (!string.IsNullOrWhiteSpace(userPath) && Directory.Exists(userPath))
        {
            sessionDir = Path.GetFullPath(userPath);
        }
        else
        {
            string parentDir;
            string sessionName;

            if (string.IsNullOrWhiteSpace(userPath))
            {
                parentDir   = Environment.GetFolderPath(Environment.SpecialFolder.MyVideos);
                sessionName = $"ScreenCamWin_{DateTime.Now:yyyy-MM-dd_HH-mm-ss}";
            }
            else if (Path.HasExtension(userPath))
            {
                parentDir   = Path.GetDirectoryName(userPath) ?? Environment.GetFolderPath(Environment.SpecialFolder.MyVideos);
                sessionName = Path.GetFileNameWithoutExtension(userPath);
            }
            else
            {
                parentDir   = Path.GetDirectoryName(userPath) ?? Environment.GetFolderPath(Environment.SpecialFolder.MyVideos);
                sessionName = Path.GetFileName(userPath);
            }

            if (string.IsNullOrEmpty(sessionName))
                sessionName = $"ScreenCamWin_{DateTime.Now:yyyy-MM-dd_HH-mm-ss}";

            sessionDir = Path.Combine(parentDir, sessionName);
        }

        return new RecordingOutputPaths
        {
            SessionDirectory = sessionDir,
            VideoPath        = Path.Combine(sessionDir, "video" + ext),
            AudioPath        = captureMicrophone ? Path.Combine(sessionDir, "audio.wav") : null,
            MergedPath       = captureMicrophone ? Path.Combine(sessionDir, "merged" + ext) : null,
        };
    }
}
