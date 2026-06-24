using System.Diagnostics;

namespace DeskSearch.Services;

public static class StartupService
{
    public const string TaskName = "DeskSearch";

    public static bool IsRegistered()
    {
        try
        {
            using var process = StartSchTasks($"/Query /TN \"{TaskName}\"");
            process.WaitForExit();
            return process.ExitCode == 0;
        }
        catch
        {
            return false;
        }
    }

    public static bool Sync(bool enabled)
    {
        return enabled ? TryRegister() : TryUnregister();
    }

    private static bool TryRegister()
    {
        var exePath = Environment.ProcessPath;
        if (string.IsNullOrWhiteSpace(exePath))
            return false;

        var quotedExe = $"\\\"{exePath}\\\"";
        var arguments =
            $"/Create /TN \"{TaskName}\" /TR {quotedExe} /SC ONLOGON /RL HIGHEST /F";

        try
        {
            using var process = StartSchTasks(arguments);
            process.WaitForExit();
            return process.ExitCode == 0;
        }
        catch
        {
            return false;
        }
    }

    private static bool TryUnregister()
    {
        if (!IsRegistered())
            return true;

        try
        {
            using var process = StartSchTasks($"/Delete /TN \"{TaskName}\" /F");
            process.WaitForExit();
            return process.ExitCode == 0;
        }
        catch
        {
            return false;
        }
    }

    private static Process StartSchTasks(string arguments) =>
        Process.Start(new ProcessStartInfo
        {
            FileName = "schtasks.exe",
            Arguments = arguments,
            UseShellExecute = false,
            CreateNoWindow = true
        }) ?? throw new InvalidOperationException("Failed to start schtasks.exe.");
}
