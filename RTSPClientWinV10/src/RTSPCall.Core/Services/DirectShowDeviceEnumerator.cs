using System.Diagnostics;
using System.Text.RegularExpressions;
using RTSPCall.Core.Models;

namespace RTSPCall.Core.Services;

public sealed record CaptureDevice(string Name, string Kind);

public static class DirectShowDeviceEnumerator
{
    private static readonly Regex DeviceLine = new(
        @"^\[dshow\s*@\s*[^\]]+\]\s*""(?<name>[^""]+)""\s*\((?<kind>video|audio)\)\s*$",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    public static async Task<IReadOnlyList<CaptureDevice>> ListAsync(string ffmpegPath, CancellationToken ct = default)
    {
        var psi = new ProcessStartInfo
        {
            FileName = ffmpegPath,
            Arguments = "-hide_banner -list_devices true -f dshow -i dummy",
            RedirectStandardError = true,
            RedirectStandardOutput = true,
            UseShellExecute = false,
            CreateNoWindow = true
        };

        using var process = new Process { StartInfo = psi };
        if (!process.Start())
            throw new InvalidOperationException("Failed to start ffmpeg for device enumeration.");

        var stderrTask = process.StandardError.ReadToEndAsync(ct);
        var stdoutTask = process.StandardOutput.ReadToEndAsync(ct);
        await process.WaitForExitAsync(ct).ConfigureAwait(false);

        var text = await stderrTask.ConfigureAwait(false) + Environment.NewLine + await stdoutTask.ConfigureAwait(false);
        var devices = new List<CaptureDevice>
        {
            new(CaptureSources.TestPattern, "video")
        };

        foreach (var raw in text.Split(['\r', '\n'], StringSplitOptions.RemoveEmptyEntries))
        {
            var line = raw.Trim();
            var m = DeviceLine.Match(line);
            if (!m.Success)
                continue;

            devices.Add(new CaptureDevice(m.Groups["name"].Value, m.Groups["kind"].Value.ToLowerInvariant()));
        }

        return devices;
    }
}
