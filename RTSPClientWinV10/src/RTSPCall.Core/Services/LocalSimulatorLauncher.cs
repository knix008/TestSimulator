using System.Diagnostics;

namespace RTSPCall.Core.Services;

/// <summary>
/// Finds/launches RTSPDeviceSimWinV10 for same-PC testing when signaling is down.
/// </summary>
public static class LocalSimulatorLauncher
{
    public const string ExeName = "RTSPDeviceSimWinV10.exe";

    public static bool IsProcessRunning()
    {
        try
        {
            return Process.GetProcessesByName("RTSPDeviceSimWinV10").Length > 0;
        }
        catch
        {
            return false;
        }
    }

    public static string? FindExecutable()
    {
        var baseDir = AppContext.BaseDirectory;
        var candidates = new List<string>
        {
            Path.Combine(baseDir, ExeName),
            // Dev layout: .../src/RTSPClientWinV10/bin/Debug/net8.0-windows
            Path.GetFullPath(Path.Combine(baseDir, "..", "..", "..", "..", "RTSPDeviceSimWinV10", "bin", "Debug", "net8.0-windows", ExeName)),
            Path.GetFullPath(Path.Combine(baseDir, "..", "..", "..", "..", "RTSPDeviceSimWinV10", "bin", "Release", "net8.0-windows", ExeName)),
            Path.GetFullPath(Path.Combine(baseDir, "..", "..", "..", "RTSPDeviceSimWinV10", "bin", "Debug", "net8.0-windows", ExeName)),
            Path.GetFullPath(Path.Combine(baseDir, "..", "..", "..", "RTSPDeviceSimWinV10", "bin", "Release", "net8.0-windows", ExeName)),
        };

        // Walk up a few levels and look for common output folders.
        var dir = new DirectoryInfo(baseDir);
        for (var i = 0; i < 6 && dir is not null; i++, dir = dir.Parent)
        {
            candidates.Add(Path.Combine(dir.FullName, "src", "RTSPDeviceSimWinV10", "bin", "Debug", "net8.0-windows", ExeName));
            candidates.Add(Path.Combine(dir.FullName, "src", "RTSPDeviceSimWinV10", "bin", "Release", "net8.0-windows", ExeName));
            candidates.Add(Path.Combine(dir.FullName, "RTSPDeviceSimWinV10", "bin", "Debug", "net8.0-windows", ExeName));
        }

        foreach (var path in candidates.Distinct(StringComparer.OrdinalIgnoreCase))
        {
            if (File.Exists(path))
                return path;
        }

        return null;
    }

    public static bool TryLaunch(out string? launchedPath, out string? error)
    {
        launchedPath = FindExecutable();
        error = null;
        if (launchedPath is null)
        {
            error = $"Could not find {ExeName} near the client.";
            return false;
        }

        try
        {
            if (!IsProcessRunning())
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = launchedPath,
                    WorkingDirectory = Path.GetDirectoryName(launchedPath)!,
                    UseShellExecute = true
                });
            }

            return true;
        }
        catch (Exception ex)
        {
            error = ex.Message;
            return false;
        }
    }

    public static async Task<bool> WaitUntilReachableAsync(string deviceBaseUrl, TimeSpan timeout, CancellationToken ct = default)
    {
        using var signaling = new SignalingClient(deviceBaseUrl);
        var deadline = DateTime.UtcNow + timeout;
        while (DateTime.UtcNow < deadline)
        {
            ct.ThrowIfCancellationRequested();
            if (await signaling.PingAsync(ct).ConfigureAwait(false))
                return true;
            await Task.Delay(400, ct).ConfigureAwait(false);
        }

        return await signaling.PingAsync(ct).ConfigureAwait(false);
    }
}
