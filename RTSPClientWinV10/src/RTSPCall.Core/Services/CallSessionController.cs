using RTSPCall.Core.Models;

namespace RTSPCall.Core.Services;

public sealed class CallSessionController : IAsyncDisposable
{
    private readonly FfmpegPublisher _publisher = new();
    private SignalingClient? _signaling;
    private CancellationTokenSource? _statusCts;

    public CallState State { get; private set; } = CallState.Idle;
    public string? SessionId { get; private set; }
    public string? DeviceRtspUrl { get; private set; }
    public string? LocalRtspUrl { get; private set; }
    public string? LastError { get; private set; }

    public FfmpegPublisher Publisher => _publisher;

    public event Action? StateChanged;
    public event Action<string>? Log;

    public async Task StartCallAsync(AppSettings settings, CancellationToken ct = default)
    {
        if (State is CallState.Connecting or CallState.Publishing or CallState.InCall)
            throw new InvalidOperationException("Call already in progress.");

        LastError = null;
        SetState(CallState.Connecting);

        try
        {
            var pcHost = LanAddressHelper.GetPreferredIPv4(settings.PreferLoopback);
            LocalRtspUrl = $"rtsp://{pcHost}:{settings.LocalRtspPort}/{settings.LocalMountPath.Trim().Trim('/')}";

            _signaling?.Dispose();
            _signaling = new SignalingClient(settings.DeviceBaseUrl);

            WriteLog($"Advertise host: {pcHost} (loopback={settings.PreferLoopback})");
            WriteLog($"Device signaling: {settings.DeviceBaseUrl}");

            if (!await _signaling.PingAsync(ct).ConfigureAwait(false))
                throw new InvalidOperationException(
                    $"Device signaling API is not reachable: GET {settings.DeviceBaseUrl.TrimEnd('/')}/api/call/status\n\n" +
                    "Fix:\n" +
                    "1) Launch RTSPDeviceSimWinV10\n" +
                    "2) Press the Start button (green play) so status becomes listening\n" +
                    "3) In this client, use Local sim (http://127.0.0.1:8080) then Start call");

            SetState(CallState.Publishing);
            WriteLog("Starting local RTSP publisher (ffmpeg listen)...");
            await _publisher.StartAsync(settings, pcHost, ct).ConfigureAwait(false);
            await Task.Delay(800, ct).ConfigureAwait(false);

            var offer = new CallOfferRequest
            {
                CallerId = Environment.MachineName,
                PcHost = pcHost,
                PcRtspUrl = LocalRtspUrl,
                PcRtspPort = settings.LocalRtspPort,
                VideoDevice = settings.VideoDevice,
                AudioDevice = settings.AudioDevice
            };

            WriteLog($"POST /api/call/start pc_rtsp_url={offer.PcRtspUrl}");
            var started = await _signaling.StartCallAsync(offer, ct).ConfigureAwait(false);
            if (!started.Ok)
                throw new InvalidOperationException(started.Message ?? "Device rejected call start.");

            SessionId = started.SessionId;
            DeviceRtspUrl = started.DeviceRtspUrl;
            if (string.IsNullOrWhiteSpace(DeviceRtspUrl))
                throw new InvalidOperationException("Device did not return device_rtsp_url.");

            WriteLog($"Device RTSP: {DeviceRtspUrl}");
            SetState(CallState.InCall);
            StartStatusPolling();
        }
        catch (Exception ex)
        {
            LastError = ex.Message;
            WriteLog($"ERROR: {ex.Message}");
            SetState(CallState.Error);
            await CleanupAsync().ConfigureAwait(false);
            throw;
        }
    }

    public async Task HangupAsync()
    {
        SetState(CallState.Ending);
        try
        {
            if (_signaling is not null)
            {
                try
                {
                    await _signaling.HangupAsync().ConfigureAwait(false);
                    WriteLog("Hangup acknowledged by device.");
                }
                catch (Exception ex)
                {
                    WriteLog($"Hangup signaling warning: {ex.Message}");
                }
            }
        }
        finally
        {
            await CleanupAsync().ConfigureAwait(false);
            SetState(CallState.Idle);
        }
    }

    private void StartStatusPolling()
    {
        _statusCts?.Cancel();
        _statusCts = new CancellationTokenSource();
        var token = _statusCts.Token;
        _ = Task.Run(async () =>
        {
            while (!token.IsCancellationRequested && State == CallState.InCall && _signaling is not null)
            {
                try
                {
                    var status = await _signaling.GetStatusAsync(token).ConfigureAwait(false);
                    if (status.State is "idle" or "ended" or "error")
                    {
                        WriteLog($"Remote call state={status.State}: {status.Message}");
                        await CleanupAsync().ConfigureAwait(false);
                        SetState(CallState.Idle);
                        break;
                    }
                }
                catch (OperationCanceledException)
                {
                    break;
                }
                catch (Exception ex)
                {
                    WriteLog($"Status poll: {ex.Message}");
                }

                try
                {
                    await Task.Delay(2000, token).ConfigureAwait(false);
                }
                catch (OperationCanceledException)
                {
                    break;
                }
            }
        }, token);
    }

    private async Task CleanupAsync()
    {
        _statusCts?.Cancel();
        _statusCts?.Dispose();
        _statusCts = null;

        await _publisher.StopAsync().ConfigureAwait(false);

        _signaling?.Dispose();
        _signaling = null;

        SessionId = null;
        DeviceRtspUrl = null;
        LocalRtspUrl = null;
    }

    private void SetState(CallState state)
    {
        State = state;
        StateChanged?.Invoke();
    }

    private void WriteLog(string message) => Log?.Invoke(message);

    public async ValueTask DisposeAsync()
    {
        await HangupAsync().ConfigureAwait(false);
        await _publisher.DisposeAsync().ConfigureAwait(false);
    }
}
