using System.Diagnostics;

namespace MyProject;

/// <summary>
/// Ensures the process exits cleanly when hosted under the Visual Studio debugger.
/// MPXJ.Net (IKVM) can leave JVM threads running after the WinForms message loop ends,
/// which makes the debugger appear frozen.
/// </summary>
internal static class ApplicationShutdown
{
    private static int _exitRequested;

    public static void RequestProcessExit()
    {
        if (Interlocked.Exchange(ref _exitRequested, 1) != 0)
            return;

        // Only force-terminate when debugging; normal runs should shut down gracefully.
        if (Debugger.IsAttached)
            Environment.Exit(0);
    }
}
