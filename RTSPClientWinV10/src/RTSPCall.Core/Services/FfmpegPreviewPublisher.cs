using System.Diagnostics;
using System.Text;
using RTSPCall.Core.Models;

namespace RTSPCall.Core.Services;

/// <summary>
/// Local-only MPEG-TS preview over UDP so the UI can show the capture source
/// without consuming the RTSP listen publisher slot.
/// </summary>
public sealed class FfmpegPreviewPublisher : IAsyncDisposable
{
    private Process? _process;

    public bool IsRunning => _process is { HasExited: false };
    public string PlayUrl { get; private set; } = "";

    public event Action<string>? LogLine;

    public Task StartAsync(PublishProfile settings, int udpPort = 18900)
    {
        if (IsRunning)
            throw new InvalidOperationException("Preview publisher already running.");
        if (string.IsNullOrWhiteSpace(settings.VideoDevice))
            throw new InvalidOperationException("Video device is not selected.");

        // LibVLC prefers udp://@:port for local MPEG-TS receive.
        PlayUrl = $"udp://@:{udpPort}";
        var useTest = string.Equals(settings.VideoDevice, CaptureSources.TestPattern, StringComparison.Ordinal);

        var args = new StringBuilder();
        args.Append("-hide_banner -loglevel warning ");

        if (useTest)
        {
            args.Append($"-f lavfi -i testsrc2=size={settings.Width}x{settings.Height}:rate=30 ");
        }
        else
        {
            args.Append("-f dshow -rtbufsize 100M ");
            args.Append($"-video_size {settings.Width}x{settings.Height} ");
            args.Append($"-i \"video={EscapeDshow(settings.VideoDevice)}\" ");
        }

        args.Append("-an -c:v libx264 -preset ultrafast -tune zerolatency -pix_fmt yuv420p ");
        args.Append("-g 15 -keyint_min 15 -bf 0 ");
        args.Append($"-b:v {Math.Min(settings.VideoBitrateKbps, 1200)}k ");
        args.Append($"-f mpegts \"udp://127.0.0.1:{udpPort}?pkt_size=1316\"");

        var psi = new ProcessStartInfo
        {
            FileName = settings.FfmpegPath,
            Arguments = args.ToString(),
            RedirectStandardError = true,
            RedirectStandardOutput = true,
            UseShellExecute = false,
            CreateNoWindow = true
        };

        _process = new Process { StartInfo = psi, EnableRaisingEvents = true };
        _process.OutputDataReceived += (_, e) => AppendLog(e.Data);
        _process.ErrorDataReceived += (_, e) => AppendLog(e.Data);
        _process.Exited += (_, _) => AppendLog($"[preview ffmpeg exited] code={_process?.ExitCode ?? -1}");

        AppendLog($"[preview] {psi.FileName} {psi.Arguments}");
        if (!_process.Start())
            throw new InvalidOperationException("Failed to start ffmpeg preview.");

        _process.BeginOutputReadLine();
        _process.BeginErrorReadLine();
        return Task.CompletedTask;
    }

    public async Task StopAsync()
    {
        var p = _process;
        _process = null;
        PlayUrl = "";
        if (p is null)
            return;

        try
        {
            if (!p.HasExited)
            {
                try { p.Kill(entireProcessTree: true); } catch { /* ignore */ }
                await p.WaitForExitAsync().ConfigureAwait(false);
            }
        }
        finally
        {
            p.Dispose();
        }
    }

    private void AppendLog(string? line)
    {
        if (!string.IsNullOrWhiteSpace(line))
            LogLine?.Invoke(line);
    }

    private static string EscapeDshow(string name) => name.Replace("\"", "\\\"");

    public async ValueTask DisposeAsync() => await StopAsync().ConfigureAwait(false);
}
