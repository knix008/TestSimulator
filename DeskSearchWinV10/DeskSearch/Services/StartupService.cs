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
        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(RunKeyPath, writable: false);
            return key?.GetValue(ValueName) is string value && !string.IsNullOrWhiteSpace(value);
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

        TryRemoveLegacyScheduledTask();

        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(RunKeyPath, writable: true)
                ?? throw new InvalidOperationException("Failed to open startup registry key.");
            key.SetValue(ValueName, $"\"{exePath}\"", RegistryValueKind.String);
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
