using System.Diagnostics;
using Microsoft.Win32;

namespace DeskSearch.Services;

public static class StartupService
{
    public const string TaskName = "DeskSearch";

    private const string RunKeyPath = @"Software\Microsoft\Windows\CurrentVersion\Run";
    private const string ValueName = "DeskSearch";

    public static bool IsRegistered()
    {
        var exePath = ResolveExecutablePath();
        return exePath is not null && IsRegisteredFor(exePath);
    }

    public static bool Sync(bool enabled)
    {
        if (!enabled)
            return TryUnregister();

        var exePath = ResolveExecutablePath();
        if (exePath is null)
            return false;

        if (IsRegisteredFor(exePath))
            return true;

        return TryRegister(exePath);
    }

    internal static string? ResolveExecutablePath()
    {
        var processPath = Environment.ProcessPath;
        if (IsExistingExecutable(processPath))
            return Path.GetFullPath(processPath!);

        var commandLinePath = Environment.GetCommandLineArgs().ElementAtOrDefault(0);
        if (IsExistingExecutable(commandLinePath))
            return Path.GetFullPath(commandLinePath!);

        var installedExe = Path.Combine(AppContext.BaseDirectory, "DeskSearch.exe");
        if (File.Exists(installedExe))
            return Path.GetFullPath(installedExe);

        return null;
    }

    private static bool TryRegister(string exePath)
    {
        TryRemoveLegacyScheduledTask();

        var runValue = BuildRunValue(exePath);
        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(RunKeyPath, writable: true)
                ?? throw new InvalidOperationException("Failed to open startup registry key.");
            key.SetValue(ValueName, runValue, RegistryValueKind.String);
            return true;
        }
        catch
        {
            return false;
        }
    }

    private static bool TryUnregister()
    {
        TryRemoveLegacyScheduledTask();

        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(RunKeyPath, writable: true);
            if (key?.GetValue(ValueName) is null)
                return true;

            key.DeleteValue(ValueName, throwOnMissingValue: false);
            return true;
        }
        catch
        {
            return false;
        }
    }

    private static bool IsRegisteredFor(string exePath)
    {
        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(RunKeyPath, writable: false);
            if (key?.GetValue(ValueName) is not string value)
                return false;

            var registeredExe = TryExtractExecutablePath(value);
            return registeredExe is not null
                && string.Equals(registeredExe, Path.GetFullPath(exePath), StringComparison.OrdinalIgnoreCase);
        }
        catch
        {
            return false;
        }
    }

    private static string BuildRunValue(string exePath) =>
        $"\"{Path.GetFullPath(exePath)}\"";

    private static string? TryExtractExecutablePath(string runValue)
    {
        if (string.IsNullOrWhiteSpace(runValue))
            return null;

        var trimmed = runValue.Trim();
        if (trimmed.StartsWith('"'))
        {
            var endQuote = trimmed.IndexOf('"', 1);
            if (endQuote > 1)
            {
                var quoted = trimmed[1..endQuote];
                if (IsExistingExecutable(quoted))
                    return Path.GetFullPath(quoted);
            }
        }

        var firstToken = trimmed.Split(' ', 2, StringSplitOptions.RemoveEmptyEntries).FirstOrDefault();
        if (IsExistingExecutable(firstToken))
            return Path.GetFullPath(firstToken!);

        return null;
    }

    private static bool IsExistingExecutable(string? path) =>
        !string.IsNullOrWhiteSpace(path)
        && path.EndsWith(".exe", StringComparison.OrdinalIgnoreCase)
        && File.Exists(path);

    private static void TryRemoveLegacyScheduledTask()
    {
        try
        {
            using var process = Process.Start(new ProcessStartInfo
            {
                FileName = "schtasks.exe",
                Arguments = $"/Delete /TN \"{TaskName}\" /F",
                UseShellExecute = false,
                CreateNoWindow = true
            });

            process?.WaitForExit();
        }
        catch
        {
            // Best-effort cleanup for upgrades from the schtasks-based version.
        }
    }
}
