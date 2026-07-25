using System.Diagnostics;
using System.Text.RegularExpressions;

namespace RTSPCall.Core.Services;

public static class ProcessPortCleanup
{
    /// <summary>
    /// Kills ffmpeg processes that reference the given port in their command line,
    /// and any process LISTENING on that TCP port.
    /// </summary>
    public static void KillFfmpegUsingPort(int port)
    {
        KillListenersOnPort(port);
        KillFfmpegByCommandLinePort(port);
    }

    public static void KillListenersOnPort(int port)
    {
        foreach (var pid in GetListeningPids(port))
            TryKillPid(pid, ffmpegOnly: true);
    }

    private static void KillFfmpegByCommandLinePort(int port)
    {
        try
        {
            var psi = new ProcessStartInfo
            {
                FileName = "wmic",
                Arguments = "process where \"name='ffmpeg.exe'\" get ProcessId,CommandLine /FORMAT:LIST",
                RedirectStandardOutput = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };
            using var p = Process.Start(psi);
            if (p is null) return;
            var output = p.StandardOutput.ReadToEnd();
            p.WaitForExit(4000);

            var marker = $":{port}";
            int? currentPid = null;
            string? currentCmd = null;

            void Flush()
            {
                if (currentPid is int pid &&
                    !string.IsNullOrEmpty(currentCmd) &&
                    currentCmd.Contains(marker, StringComparison.OrdinalIgnoreCase))
                {
                    TryKillPid(pid, ffmpegOnly: false);
                }

                currentPid = null;
                currentCmd = null;
            }

            foreach (var raw in output.Split('\n'))
            {
                var line = raw.Trim();
                if (line.Length == 0)
                {
                    Flush();
                    continue;
                }

                if (line.StartsWith("CommandLine=", StringComparison.OrdinalIgnoreCase))
                    currentCmd = line["CommandLine=".Length..];
                else if (line.StartsWith("ProcessId=", StringComparison.OrdinalIgnoreCase) &&
                         int.TryParse(line["ProcessId=".Length..], out var pid))
                    currentPid = pid;
            }

            Flush();
        }
        catch
        {
            // ignore
        }
    }

    private static IEnumerable<int> GetListeningPids(int port)
    {
        var pids = new HashSet<int>();
        try
        {
            var psi = new ProcessStartInfo
            {
                FileName = "netstat",
                Arguments = "-ano",
                RedirectStandardOutput = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };
            using var p = Process.Start(psi);
            if (p is null) return pids;
            var output = p.StandardOutput.ReadToEnd();
            p.WaitForExit(3000);

            foreach (var line in output.Split('\n'))
            {
                if (!line.Contains("LISTENING", StringComparison.OrdinalIgnoreCase))
                    continue;
                if (!Regex.IsMatch(line, $@"[:\[]{port}\s"))
                    continue;

                var m = Regex.Match(line.Trim(), @"(\d+)\s*$");
                if (m.Success && int.TryParse(m.Groups[1].Value, out var pid) && pid > 4)
                    pids.Add(pid);
            }
        }
        catch
        {
            // ignore
        }

        return pids;
    }

    private static void TryKillPid(int pid, bool ffmpegOnly)
    {
        try
        {
            using var proc = Process.GetProcessById(pid);
            if (ffmpegOnly &&
                !proc.ProcessName.Contains("ffmpeg", StringComparison.OrdinalIgnoreCase))
                return;
            proc.Kill(entireProcessTree: true);
            proc.WaitForExit(2000);
        }
        catch
        {
            // ignore
        }
    }

    /// <summary>
    /// Resolves chocolatey/shim "ffmpeg" to a real executable path when possible.
    /// Never return the chocolatey\bin shim — it leaves duplicate processes.
    /// </summary>
    public static string ResolveFfmpegPath(string configured)
    {
        if (!string.IsNullOrWhiteSpace(configured) &&
            !string.Equals(configured, "ffmpeg", StringComparison.OrdinalIgnoreCase) &&
            File.Exists(configured) &&
            !IsChocolateyShim(configured))
            return configured;

        var candidates = new List<string>();

        try
        {
            var psi = new ProcessStartInfo
            {
                FileName = "where.exe",
                Arguments = "ffmpeg",
                RedirectStandardOutput = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };
            using var p = Process.Start(psi);
            if (p is not null)
            {
                candidates.AddRange(p.StandardOutput.ReadToEnd()
                    .Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries));
                p.WaitForExit(2000);
            }
        }
        catch
        {
            // ignore
        }

        candidates.Add(@"C:\ProgramData\chocolatey\lib\ffmpeg\tools\ffmpeg\bin\ffmpeg.exe");
        candidates.Add(@"C:\tools\ffmpeg\bin\ffmpeg.exe");

        foreach (var line in candidates)
        {
            if (line.Contains(@"tools\ffmpeg\bin\ffmpeg.exe", StringComparison.OrdinalIgnoreCase) &&
                File.Exists(line) &&
                !IsChocolateyShim(line))
                return line;
        }

        foreach (var line in candidates)
        {
            if (File.Exists(line) && !IsChocolateyShim(line))
                return line;
        }

        return string.IsNullOrWhiteSpace(configured) ? "ffmpeg" : configured;
    }

    private static bool IsChocolateyShim(string path) =>
        path.Contains(@"chocolatey\bin\ffmpeg", StringComparison.OrdinalIgnoreCase);
}
