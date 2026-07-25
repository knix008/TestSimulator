using System.Diagnostics;
using System.Text;
using RTSPCall.Core.Models;

namespace RTSPCall.Core.Services;

/// <summary>
/// Publishes camera/mic or lavfi test pattern.
/// Loopback/local-sim uses MPEG-TS over TCP listen (reliable A/V with LibVLC).
/// LAN peers use ffmpeg RTSP listen.
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
        var host = string.IsNullOrWhiteSpace(bindHost) ? "127.0.0.1" : bindHost;
        var loopback = host is "127.0.0.1" or "::1" or "localhost";
        var useTest = string.Equals(settings.VideoDevice, CaptureSources.TestPattern, StringComparison.Ordinal);
        var ffmpegPath = ProcessPortCleanup.ResolveFfmpegPath(settings.FfmpegPath);

        // Local sim: HTTP MPEG-TS listen (LibVLC-friendly). LAN: RTSP listen.
        if (loopback)
            ListenUrl = $"http://127.0.0.1:{settings.RtspPort}/live.ts";
        else
            ListenUrl = $"rtsp://{host}:{settings.RtspPort}/{mount}";

        var args = new StringBuilder();
        args.Append("-hide_banner -loglevel info ");

        if (useTest)
        {
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
        args.Append("-g 15 -keyint_min 15 -bf 0 -pix_fmt yuv420p ");

        if (useTest || !string.IsNullOrWhiteSpace(settings.AudioDevice))
            args.Append($"-c:a aac -b:a {settings.AudioBitrateKbps}k -ar 44100 -ac 1 ");
        else
            args.Append("-an ");

        if (loopback)
            args.Append($"-listen 1 -f mpegts \"http://127.0.0.1:{settings.RtspPort}/live.ts\"");
        else
            args.Append($"-f rtsp -rtsp_transport tcp -rtsp_flags listen \"{ListenUrl}\"");

        _lastArgs = args.ToString();
        _ffmpegPath = ffmpegPath;
        _port = settings.RtspPort;
        _stopping = false;

        StartProcess();
        return Task.CompletedTask;
    }

    private string _lastArgs = "";
    private string _ffmpegPath = "ffmpeg";
    private int _port;
    private bool _stopping;

    private void StartProcess()
    {
        ProcessPortCleanup.KillFfmpegUsingPort(_port);

        var psi = new ProcessStartInfo
        {
            FileName = _ffmpegPath,
            Arguments = _lastArgs,
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
            var code = 0;
            try { code = _process?.ExitCode ?? -1; } catch { /* ignore */ }
            AppendLog($"[ffmpeg exited] code={code}");
            Exited?.Invoke(code);

            // HTTP/TCP listen exits when the player disconnects; restart while session is active.
            if (_stopping || string.IsNullOrEmpty(_lastArgs))
                return;

            _ = Task.Run(() =>
            {
                try
                {
                    Thread.Sleep(400);
                    if (_stopping || string.IsNullOrEmpty(_lastArgs))
                        return;
                    if (IsRunning)
                        return;
                    AppendLog("[ffmpeg] restarting publisher after disconnect...");
                    StartProcess();
                }
                catch (Exception ex)
                {
                    AppendLog("[ffmpeg] restart failed: " + ex.Message);
                }
            });
        };

        AppendLog($"[start] {psi.FileName} {psi.Arguments}");
        if (!_process.Start())
            throw new InvalidOperationException("Failed to start ffmpeg publisher.");

        _process.BeginOutputReadLine();
        _process.BeginErrorReadLine();
    }

    public async Task StopAsync()
    {
        _stopping = true;
        _lastArgs = "";
        var p = _process;
        _process = null;
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
            _stopping = false;
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
