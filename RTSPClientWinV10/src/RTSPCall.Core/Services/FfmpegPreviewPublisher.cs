using System.Diagnostics;
using System.Text;
using RTSPCall.Core.Models;

namespace RTSPCall.Core.Services;

/// <summary>
/// Local-only MPEG-TS preview over HTTP listen so the UI can show the capture source
/// without sharing the call publisher socket.
/// </summary>
public sealed class FfmpegPreviewPublisher : IAsyncDisposable
{
    public const int DefaultPort = 18900;

    private Process? _process;
    private string _lastArgs = "";
    private string _ffmpegPath = "ffmpeg";
    private int _port;
    private bool _stopping;

    public bool IsRunning => _process is { HasExited: false };
    public string PlayUrl { get; private set; } = "";

    public event Action<string>? LogLine;
    public event Action? ExitedUnexpectedly;

    public Task StartAsync(PublishProfile settings, int tcpPort = DefaultPort)
    {
        if (IsRunning)
            throw new InvalidOperationException("Preview publisher already running.");
        if (string.IsNullOrWhiteSpace(settings.VideoDevice))
            throw new InvalidOperationException("Video device is not selected.");

        _port = tcpPort;
        PlayUrl = $"http://127.0.0.1:{tcpPort}/live.ts";
        var useTest = string.Equals(settings.VideoDevice, CaptureSources.TestPattern, StringComparison.Ordinal);
        _ffmpegPath = ProcessPortCleanup.ResolveFfmpegPath(settings.FfmpegPath);

        var args = new StringBuilder();
        args.Append("-hide_banner -loglevel warning ");

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

        args.Append("-c:v libx264 -preset ultrafast -tune zerolatency -pix_fmt yuv420p ");
        args.Append("-g 15 -keyint_min 15 -bf 0 ");
        args.Append($"-b:v {Math.Min(settings.VideoBitrateKbps, 1200)}k ");
        if (useTest || !string.IsNullOrWhiteSpace(settings.AudioDevice))
            args.Append($"-c:a aac -b:a {settings.AudioBitrateKbps}k -ar 44100 -ac 1 ");
        else
            args.Append("-an ");
        args.Append($"-listen 1 -f mpegts \"http://127.0.0.1:{tcpPort}/live.ts\"");

        _lastArgs = args.ToString();
        _stopping = false;
        StartProcess();
        return Task.CompletedTask;
    }

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
            try { AppendLog($"[preview ffmpeg exited] code={_process?.ExitCode ?? -1}"); }
            catch { /* ignore */ }

            if (_stopping || string.IsNullOrEmpty(_lastArgs))
                return;

            _ = Task.Run(() =>
            {
                try
                {
                    Thread.Sleep(400);
                    if (_stopping || string.IsNullOrEmpty(_lastArgs) || IsRunning)
                        return;
                    AppendLog("[preview] restarting after disconnect...");
                    StartProcess();
                    ExitedUnexpectedly?.Invoke();
                }
                catch (Exception ex)
                {
                    AppendLog("[preview] restart failed: " + ex.Message);
                }
            });
        };

        AppendLog($"[preview] {psi.FileName} {psi.Arguments}");
        if (!_process.Start())
            throw new InvalidOperationException("Failed to start ffmpeg preview.");

        _process.BeginOutputReadLine();
        _process.BeginErrorReadLine();
    }

    public async Task StopAsync()
    {
        _stopping = true;
        _lastArgs = "";
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
            _stopping = false;
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
