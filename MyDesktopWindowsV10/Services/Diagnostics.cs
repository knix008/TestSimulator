namespace MyDesktop.Services;

/// <summary>
/// A few lines about what the desktop gestures are doing. Low volume on purpose: the mouse hook is
/// the one part of MyDesktop that fails silently, so it needs to leave a trace.
/// </summary>
public static class Diagnostics
{
    private static readonly string LogFile = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "MyDesktop", "diagnostics.log");

    private static readonly Lock Gate = new();

    public static void Write(string message)
    {
        try
        {
            lock (Gate)
            {
                Directory.CreateDirectory(Path.GetDirectoryName(LogFile)!);
                File.AppendAllText(LogFile, $"{DateTime.Now:HH:mm:ss.fff}  {message}{Environment.NewLine}");
            }
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
        {
        }
    }

    public static void StartSession()
    {
        try
        {
            if (File.Exists(LogFile) && new FileInfo(LogFile).Length > 200_000)
            {
                File.Delete(LogFile);
            }
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
        {
        }

        Write($"--- session start, pid {Environment.ProcessId} ---");
    }
}
