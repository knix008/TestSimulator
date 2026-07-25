using RTSPCall.Core.Models;
using RTSPCall.Core.Services;

namespace RTSPDeviceSimWinV10.Services;

public sealed class DeviceSimHost : IAsyncDisposable
{
    private readonly SignalingHttpServer _signaling = new();
    private readonly FfmpegPublisher _publisher = new();
    private readonly FfmpegPreviewPublisher _preview = new();
    private readonly RtspPlayerService _player = new();
    private DeviceSimSettings _settings = new();

    public SignalingHttpServer Signaling => _signaling;
    public FfmpegPublisher Publisher => _publisher;
    public RtspPlayerService Player => _player;
    public bool IsListening => _signaling.IsRunning;
    public bool IsInCall => !string.IsNullOrWhiteSpace(PcRtspUrl);
    public string? DeviceRtspUrl { get; private set; }
    public string? PcRtspUrl { get; private set; }
    public string VideoMode { get; private set; } = "idle";

    public event Action<string>? Log;
    public event Action? StateChanged;

    public DeviceSimHost()
    {
        _signaling.Log += msg => Log?.Invoke(msg);
        _publisher.LogLine += msg => Log?.Invoke("[ffmpeg] " + msg);
        _preview.LogLine += msg => Log?.Invoke("[preview] " + msg);
        _signaling.OnStartCall = HandleStartAsync;
        _signaling.OnHangup = HandleHangupAsync;
    }

    public async Task StartAsync(DeviceSimSettings settings)
    {
        _settings = settings;
        if (_signaling.IsRunning)
            throw new InvalidOperationException("Simulator already listening.");

        var host = LanAddressHelper.GetPreferredIPv4(settings.PreferLoopback);
        DeviceRtspUrl = $"rtsp://{host}:{settings.RtspPort}/{settings.RtspMount.Trim().Trim('/')}";
        _signaling.SetDeviceRtspUrl(DeviceRtspUrl);

        var profile = new PublishProfile
        {
            FfmpegPath = settings.FfmpegPath,
            VideoDevice = settings.VideoDevice,
            AudioDevice = settings.AudioDevice,
            Width = settings.VideoWidth,
            Height = settings.VideoHeight,
            VideoBitrateKbps = settings.VideoBitrateKbps,
            AudioBitrateKbps = settings.AudioBitrateKbps,
            RtspPort = settings.RtspPort,
            Mount = settings.RtspMount
        };

        WriteLog($"Device RTSP will be: {DeviceRtspUrl}");

        // Bring up signaling first so the PC client can ping /api/call/status immediately.
        WriteLog($"Starting signaling on port {settings.SignalingPort}...");
        _signaling.Start(settings.SignalingPort);
        StateChanged?.Invoke();

        WriteLog("Starting device RTSP publisher...");
        await _publisher.StartAsync(profile, host).ConfigureAwait(false);

        try
        {
            WriteLog("Starting local video preview...");
            await _preview.StartAsync(profile, udpPort: 18900).ConfigureAwait(false);
            await Task.Delay(600).ConfigureAwait(false);
            _player.Play(_preview.PlayUrl);
            VideoMode = "local preview";
            WriteLog($"Local preview playing {_preview.PlayUrl}");
        }
        catch (Exception ex)
        {
            VideoMode = "preview unavailable";
            WriteLog("Local preview failed (RTSP publish still OK): " + ex.Message);
        }

        StateChanged?.Invoke();
        WriteLog("Device simulator ready (signaling listening). Start the PC client and press Start call.");
    }

    public async Task StopAsync()
    {
        await HandleHangupAsync().ConfigureAwait(false);
        _player.Stop();
        await _preview.StopAsync().ConfigureAwait(false);
        await _signaling.StopAsync().ConfigureAwait(false);
        await _publisher.StopAsync().ConfigureAwait(false);
        DeviceRtspUrl = null;
        PcRtspUrl = null;
        VideoMode = "idle";
        StateChanged?.Invoke();
    }

    private async Task<CallSessionResponse> HandleStartAsync(CallOfferRequest offer)
    {
        try
        {
            PcRtspUrl = offer.PcRtspUrl;
            var sessionId = $"sess-{DateTimeOffset.UtcNow.ToUnixTimeSeconds()}";
            var deviceUrl = DeviceRtspUrl ?? _signaling.DeviceRtspUrl;

            WriteLog($"Pulling PC stream: {offer.PcRtspUrl}");
            _player.Play(offer.PcRtspUrl);
            VideoMode = "remote PC";

            _signaling.MarkActive(sessionId, deviceUrl, offer.PcRtspUrl, "in call (simulator)");
            StateChanged?.Invoke();

            return new CallSessionResponse
            {
                Ok = true,
                State = "active",
                SessionId = sessionId,
                DeviceRtspUrl = deviceUrl,
                DeviceHost = LanAddressHelper.GetPreferredIPv4(_settings.PreferLoopback),
                Message = "started"
            };
        }
        catch (Exception ex)
        {
            WriteLog("Start failed: " + ex.Message);
            _signaling.ResetSession("error", ex.Message);
            await ResumeLocalPreviewAsync().ConfigureAwait(false);
            StateChanged?.Invoke();
            return new CallSessionResponse
            {
                Ok = false,
                State = "error",
                Message = ex.Message
            };
        }
    }

    private async Task HandleHangupAsync()
    {
        PcRtspUrl = null;
        _signaling.ResetSession("idle", "ended");
        await ResumeLocalPreviewAsync().ConfigureAwait(false);
        StateChanged?.Invoke();
        WriteLog("Call ended on device simulator.");
    }

    private Task ResumeLocalPreviewAsync()
    {
        if (_preview.IsRunning && !string.IsNullOrWhiteSpace(_preview.PlayUrl))
        {
            _player.Play(_preview.PlayUrl);
            VideoMode = "local preview";
        }
        else
        {
            _player.Stop();
            VideoMode = _signaling.IsRunning ? "listening" : "idle";
        }

        return Task.CompletedTask;
    }

    private void WriteLog(string msg) => Log?.Invoke(msg);

    public async ValueTask DisposeAsync()
    {
        await StopAsync().ConfigureAwait(false);
        await _preview.DisposeAsync().ConfigureAwait(false);
        await _publisher.DisposeAsync().ConfigureAwait(false);
        await _signaling.DisposeAsync().ConfigureAwait(false);
        _player.Dispose();
    }
}
