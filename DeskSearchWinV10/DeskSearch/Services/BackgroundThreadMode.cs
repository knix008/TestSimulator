using System.Runtime.InteropServices;

namespace DeskSearch.Services;

/// <summary>
/// Wraps Windows' "background mode" thread API. Unlike <see cref="ThreadPriority.Lowest"/>,
/// which only affects CPU scheduling, this also drops disk I/O priority (to "Very Low") and
/// memory/working-set priority for the calling thread — the same mechanism Windows' own
/// background indexers use so disk-heavy background work doesn't stall the foreground UI
/// or make the rest of the system feel slow.
/// </summary>
internal static class BackgroundThreadMode
{
    private const int ThreadModeBackgroundBegin = 0x00010000;
    private const int ThreadModeBackgroundEnd = 0x00020000;

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool SetThreadPriority(IntPtr hThread, int nPriority);

    [DllImport("kernel32.dll")]
    private static extern IntPtr GetCurrentThread();

    /// <summary>Enters background mode for the calling thread. Best-effort; ignored on failure.</summary>
    public static void EnterForCurrentThread()
    {
        try
        {
            SetThreadPriority(GetCurrentThread(), ThreadModeBackgroundBegin);
        }
        catch
        {
            // Not available (e.g. unsupported OS) — Thread.Priority=Lowest still applies.
        }
    }

    /// <summary>Exits background mode for the calling thread.</summary>
    public static void ExitForCurrentThread()
    {
        try
        {
            SetThreadPriority(GetCurrentThread(), ThreadModeBackgroundEnd);
        }
        catch
        {
            // best effort
        }
    }
}
