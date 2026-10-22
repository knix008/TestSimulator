using System.Diagnostics;
using System.Runtime.InteropServices;
using Microsoft.Win32;

namespace DeskSearch.Services;

public static class StartupService
{
    public const string TaskName = "DeskSearch";
    public const string AutostartArgument = "--autostart";

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

    // The value must match exactly (path + autostart flag), so entries written by older
    // versions without the flag are rewritten on the next launch.
    private static bool IsRegisteredFor(string exePath)
    {
        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(RunKeyPath, writable: false);
            return key?.GetValue(ValueName) is string value
                && string.Equals(value.Trim(), BuildRunValue(exePath), StringComparison.OrdinalIgnoreCase);
        }
        catch
        {
            return false;
        }
    }

    private static string BuildRunValue(string exePath) =>
        $"\"{Path.GetFullPath(exePath)}\" {AutostartArgument}";

    public static bool IsAutostartLaunch(IEnumerable<string> args) =>
        args.Any(arg => string.Equals(arg, AutostartArgument, StringComparison.OrdinalIgnoreCase));

    // At logon the Run key fires before the shell and the text input service (ctfmon/TSF)
    // are up. A WPF TextBox that takes keyboard focus before TSF is ready never accepts
    // typing (the IME in particular), so wait for both before creating any window.
    public static void WaitForInteractiveDesktop(TimeSpan timeout)
    {
        var deadline = DateTime.UtcNow + timeout;
        while (DateTime.UtcNow < deadline)
        {
            if (IsShellReady() && IsTextInputServiceRunning())
                return;

            Thread.Sleep(500);
        }
    }

    private static bool IsShellReady() =>
        FindWindow("Shell_TrayWnd", null) != nint.Zero && GetShellWindow() != nint.Zero;

    private static bool IsTextInputServiceRunning()
    {
        var sessionId = Process.GetCurrentProcess().SessionId;
        var processes = Process.GetProcessesByName("ctfmon");
        try
        {
            return processes.Any(p => p.SessionId == sessionId);
        }
        finally
        {
            foreach (var process in processes)
                process.Dispose();
        }
    }

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern nint FindWindow(string? lpClassName, string? lpWindowName);

    [DllImport("user32.dll")]
    private static extern nint GetShellWindow();

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
