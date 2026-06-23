namespace MyProject;

/// <summary>
/// Ensures the process exits cleanly. MPXJ.Net (IKVM) can leave JVM threads running after
/// the WinForms message loop ends, which makes Visual Studio's debugger appear frozen.
/// </summary>
internal static class ApplicationShutdown
{
    private static int _exitRequested;

    public static void RequestProcessExit()
    {
        if (Interlocked.Exchange(ref _exitRequested, 1) != 0)
            return;

        Environment.Exit(0);
    }
}
