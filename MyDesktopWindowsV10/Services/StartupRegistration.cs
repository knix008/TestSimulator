using Microsoft.Win32;

namespace MyDesktop.Services;

/// <summary>
/// Adds or removes the per-user Run entry so fences come back after a reboot.
///
/// The entry is per-user on purpose. It is the one place a signed-in user can switch MyDesktop's
/// own startup on and off without being an administrator, which is what the settings window and
/// the tray menu need. The installer therefore does not write a Run entry of its own; it records
/// the choice made during setup as a machine-wide default under <see cref="InstallerKey"/>, and the
/// first run under each user account turns that default into that user's own entry.
/// </summary>
public static class StartupRegistration
{
    private const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
    private const string InstallerKey = @"Software\MyDesktop";
    private const string ValueName = "MyDesktop";

    public static bool IsRegistered() => ReadCommand() is { Length: > 0 };

    /// <summary>
    /// What the installer was told to do about starting with Windows, or null when MyDesktop was
    /// not installed by it — a build run straight out of the project folder, say.
    /// </summary>
    public static bool? InstallerDefault()
    {
        try
        {
            using var key = Registry.LocalMachine.OpenSubKey(InstallerKey);
            return key?.GetValue("LaunchAtLogin") switch
            {
                int value => value != 0,
                string text when int.TryParse(text, out var value) => value != 0,
                _ => null
            };
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException or System.Security.SecurityException)
        {
            return null;
        }
    }

    /// <summary>
    /// Points an existing entry back at the running program. Installing over a copy that ran from
    /// somewhere else — a build folder, an older install location — leaves the Run entry naming an
    /// executable that is no longer there, and Windows passes over a missing one in silence. The
    /// user would be left with startup switched on in two places and nothing starting.
    /// </summary>
    public static void RepairPath()
    {
        var path = Environment.ProcessPath;
        if (string.IsNullOrEmpty(path) || ReadCommand() is not { Length: > 0 } command)
        {
            return;
        }

        var expected = Command(path);
        if (!string.Equals(command, expected, StringComparison.OrdinalIgnoreCase))
        {
            Diagnostics.Write($"startup entry pointed at {command}, repointing it at {expected}");
            Apply(true);
        }
    }

    public static void Apply(bool enabled)
    {
        try
        {
            using var key = Registry.CurrentUser.CreateSubKey(RunKey, writable: true);
            if (key is null)
            {
                return;
            }

            if (enabled)
            {
                var path = Environment.ProcessPath;
                if (!string.IsNullOrEmpty(path))
                {
                    key.SetValue(ValueName, Command(path));
                }
            }
            else
            {
                key.DeleteValue(ValueName, throwOnMissingValue: false);
            }
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
        {
        }
    }

    private static string Command(string path) => $"\"{path}\"";

    private static string? ReadCommand()
    {
        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(RunKey);
            return key?.GetValue(ValueName) as string;
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
        {
            return null;
        }
    }
}
