using System.Diagnostics;
using MyDesktop.Models;

namespace MyDesktop.Services;

/// <summary>
/// Dropping something onto an icon should do what that icon is for, the way it does on the desktop:
/// the Recycle Bin swallows it, a program opens it, a folder takes it in.
/// </summary>
public static class ShellDrop
{
    private const string RecycleBin = "::{645FF040-5081-101B-9F08-00AA002F954E}";

    private static readonly string[] Executables = [".exe", ".com", ".bat", ".cmd", ".ps1", ".appref-ms"];

    /// <summary>
    /// Returns true when the drop was consumed by the target, so the caller leaves the layout alone.
    /// </summary>
    public static bool Perform(FenceItem target, IEnumerable<string> dropped, IntPtr owner)
    {
        var payload = dropped
            .Where(path => !string.IsNullOrWhiteSpace(path))
            .Where(path => !string.Equals(path, target.Path, StringComparison.OrdinalIgnoreCase))
            .ToArray();

        if (payload.Length == 0)
        {
            return false;
        }

        if (string.Equals(target.Path, RecycleBin, StringComparison.OrdinalIgnoreCase))
        {
            Diagnostics.Write($"drop on the Recycle Bin: {payload.Length} item(s)");
            ShellFileOperations.Recycle(payload, owner);
            return true;
        }

        if (target.IsShellPlace)
        {
            return false;
        }

        var destination = FolderBehind(target.Path);
        if (destination is not null)
        {
            Diagnostics.Write($"drop on folder '{destination}': {payload.Length} item(s)");
            MoveInto(destination, payload);
            return true;
        }

        var program = ProgramBehind(target.Path);
        if (program is not null)
        {
            Diagnostics.Write($"drop on program '{program}': {payload.Length} item(s)");
            RunWith(program, payload);
            return true;
        }

        return false;
    }

    /// <summary>The folder an icon stands for, following a shortcut when there is one.</summary>
    private static string? FolderBehind(string path)
    {
        if (Directory.Exists(path))
        {
            return path;
        }

        var target = ResolveShortcut(path);
        return target is not null && Directory.Exists(target) ? target : null;
    }

    /// <summary>The program an icon stands for, following a shortcut when there is one.</summary>
    private static string? ProgramBehind(string path)
    {
        if (Executables.Contains(Path.GetExtension(path), StringComparer.OrdinalIgnoreCase))
        {
            return path;
        }

        var target = ResolveShortcut(path);
        return target is not null && File.Exists(target)
            && Executables.Contains(Path.GetExtension(target), StringComparer.OrdinalIgnoreCase)
            ? target
            : null;
    }

    private static string? ResolveShortcut(string path)
    {
        if (!string.Equals(Path.GetExtension(path), ".lnk", StringComparison.OrdinalIgnoreCase) || !File.Exists(path))
        {
            return null;
        }

        try
        {
            var shellType = Type.GetTypeFromProgID("WScript.Shell");
            if (shellType is null || Activator.CreateInstance(shellType) is not { } shell)
            {
                return null;
            }

            try
            {
                var shortcut = shellType.InvokeMember("CreateShortcut",
                    System.Reflection.BindingFlags.InvokeMethod, null, shell, [path]);
                var target = shortcut?.GetType().InvokeMember("TargetPath",
                    System.Reflection.BindingFlags.GetProperty, null, shortcut, null) as string;
                return string.IsNullOrWhiteSpace(target) ? null : target;
            }
            finally
            {
                System.Runtime.InteropServices.Marshal.FinalReleaseComObject(shell);
            }
        }
        catch (Exception exception) when (exception is System.Reflection.TargetInvocationException
                                              or System.Runtime.InteropServices.COMException
                                              or MissingMethodException)
        {
            return null;
        }
    }

    private static void MoveInto(string folder, IEnumerable<string> paths)
    {
        foreach (var path in paths)
        {
            try
            {
                var isFolder = Directory.Exists(path);
                if (!isFolder && !File.Exists(path))
                {
                    continue;
                }

                var destination = Path.Combine(folder, Path.GetFileName(path.TrimEnd(Path.DirectorySeparatorChar)));
                if (File.Exists(destination) || Directory.Exists(destination))
                {
                    continue;
                }

                if (isFolder)
                {
                    Directory.Move(path, destination);
                }
                else
                {
                    File.Move(path, destination);
                }
            }
            catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
            {
            }
        }
    }

    private static void RunWith(string program, IEnumerable<string> paths)
    {
        try
        {
            var start = new ProcessStartInfo(program) { UseShellExecute = true };
            foreach (var path in paths)
            {
                start.ArgumentList.Add(path);
            }

            Process.Start(start);
        }
        catch (Exception exception) when (exception is System.ComponentModel.Win32Exception or InvalidOperationException)
        {
            Diagnostics.Write($"run with failed: {exception.Message}");
        }
    }
}
