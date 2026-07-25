using System.Diagnostics;
using System.Text;
using RTSPCall.Core.Models;

namespace RTSPCall.Core.Services;

/// <summary>
/// Publishes camera/mic or lavfi test pattern as RTSP server (ffmpeg -rtsp_flags listen).
/// </summary>
public sealed class FfmpegPublisher : IAsyncDisposable
{
    private Process? _process;
    private readonly StringBuilder _log = new();

    public bool IsRunning => _process is { HasExited: false };
    public string ListenUrl { get; private set; } = "";
    public string RecentLog => _log.ToString();

    public event Action<string>? LogLine;
    public event Action<int>? Exited;

    public Task StartAsync(AppSettings settings, string bindHost, CancellationToken ct = default)
    {
        var publish = new PublishProfile
        {
            FfmpegPath = settings.FfmpegPath,
            VideoDevice = settings.VideoDevice,
            AudioDevice = settings.AudioDevice,
            Width = settings.VideoWidth,
            Height = settings.VideoHeight,
            VideoBitrateKbps = settings.VideoBitrateKbps,
            AudioBitrateKbps = settings.AudioBitrateKbps,
            RtspPort = settings.LocalRtspPort,
            Mount = settings.LocalMountPath
        };
        return StartAsync(publish, bindHost, ct);
    }

    public Task StartAsync(PublishProfile settings, string bindHost, CancellationToken ct = default)
    {
        if (IsRunning)
            throw new InvalidOperationException("Publisher already running.");

        if (string.IsNullOrWhiteSpace(settings.VideoDevice))
            throw new InvalidOperationException("Video device is not selected.");

        var mount = settings.Mount.Trim().Trim('/');
        ListenUrl = $"rtsp://{bindHost}:{settings.RtspPort}/{mount}";
        var listenAny = $"rtsp://0.0.0.0:{settings.RtspPort}/{mount}";
        var useTest = string.Equals(settings.VideoDevice, CaptureSources.TestPattern, StringComparison.Ordinal);

        var args = new StringBuilder();
        args.Append("-hide_banner -loglevel info ");

        if (useTest)
        {
            // Avoid camera contention when two apps run on one PC.
            args.Append($"-f lavfi -i testsrc2=size={settings.Width}x{settings.Height}:rate=30 ");
            args.Append("-f lavfi -i sine=frequency=880:sample_rate=44100 ");
            args.Append("-map 0:v:0 -map 1:a:0 ");
        }
        else
        {
            var input = string.IsNullOrWhiteSpace(settings.AudioDevice)
                ? $"video={EscapeDshow(settings.VideoDevice)}"
                : $"video={EscapeDshow(settings.VideoDevice)}:audio={EscapeDshow(settings.AudioDevice)}";
            args.Append("-f dshow -rtbufsize 100M ");
            args.Append($"-video_size {settings.Width}x{settings.Height} ");
            args.Append($"-i \"{input}\" ");
        }

        args.Append("-c:v libx264 -preset ultrafast -tune zerolatency -profile:v baseline ");
        args.Append($"-b:v {settings.VideoBitrateKbps}k -maxrate {settings.VideoBitrateKbps}k -bufsize {settings.VideoBitrateKbps * 2}k ");
        args.Append("-g 30 -keyint_min 30 -bf 0 -pix_fmt yuv420p ");

        if (useTest || !string.IsNullOrWhiteSpace(settings.AudioDevice))
            args.Append($"-c:a aac -b:a {settings.AudioBitrateKbps}k -ar 44100 -ac 1 ");
        else
            args.Append("-an ");

        args.Append($"-f rtsp -rtsp_transport tcp -rtsp_flags listen \"{listenAny}\"");

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
        _process.Exited += (_, _) =>
        {
            var code = _process?.ExitCode ?? -1;
            AppendLog($"[ffmpeg exited] code={code}");
            Exited?.Invoke(code);
        };

        AppendLog($"[start] {psi.FileName} {psi.Arguments}");
        if (!_process.Start())
            throw new InvalidOperationException("Failed to start ffmpeg publisher.");

        _process.BeginOutputReadLine();
        _process.BeginErrorReadLine();
        return Task.CompletedTask;
    }

    public async Task StopAsync()
    {
        var p = _process;
        _process = null;
        if (p is null)
            return;

        try
        {
            if (!p.HasExited)
            {
                var exited = await WaitForExitAsync(p, TimeSpan.FromMilliseconds(400)).ConfigureAwait(false);
                if (!exited && !p.HasExited)
                {
                    p.Kill(entireProcessTree: true);
                    await p.WaitForExitAsync().ConfigureAwait(false);
                }
            }
        }
        finally
        {
            p.Dispose();
        }
    }

    private void AppendLog(string? line)
    {
        if (string.IsNullOrWhiteSpace(line))
            return;
        lock (_log)
        {
            if (_log.Length > 64_000)
                _log.Remove(0, _log.Length - 48_000);
            _log.AppendLine(line);
        }
        LogLine?.Invoke(line);
    }

    private static string EscapeDshow(string name) => name.Replace("\"", "\\\"");

    private static async Task<bool> WaitForExitAsync(Process process, TimeSpan timeout)
    {
        using var cts = new CancellationTokenSource(timeout);
        try
        {
            await process.WaitForExitAsync(cts.Token).ConfigureAwait(false);
            return true;
        }
        catch (OperationCanceledException)
        {
            return false;
        }
    }

    public async ValueTask DisposeAsync() => await StopAsync().ConfigureAwait(false);
}

public sealed class PublishProfile
{
    public string FfmpegPath { get; set; } = "ffmpeg";
    public string? VideoDevice { get; set; }
    public string? AudioDevice { get; set; }
    public int Width { get; set; } = 1280;
    public int Height { get; set; } = 720;
    public int VideoBitrateKbps { get; set; } = 1500;
    public int AudioBitrateKbps { get; set; } = 64;
    public int RtspPort { get; set; } = 8554;
    public string Mount { get; set; } = "live";
}
