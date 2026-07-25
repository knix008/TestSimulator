using System.Net;
using System.Text;
using System.Text.Json;
using RTSPCall.Core.Models;

namespace RTSPCall.Core.Services;

/// <summary>
/// Minimal Civetweb-compatible /api/call/* server for the local device simulator.
/// </summary>
public sealed class SignalingHttpServer : IAsyncDisposable
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        PropertyNameCaseInsensitive = true
    };

    private readonly HttpListener _listener = new();
    private CancellationTokenSource? _cts;
    private Task? _loop;
    private readonly object _gate = new();

    public bool IsRunning { get; private set; }
    public int Port { get; private set; }
    public string State { get; private set; } = "idle";
    public string SessionId { get; private set; } = "";
    public string DeviceRtspUrl { get; private set; } = "";
    public string PcRtspUrl { get; private set; } = "";
    public string Message { get; private set; } = "";

    public event Action<string>? Log;
    public Func<CallOfferRequest, Task<CallSessionResponse>>? OnStartCall { get; set; }
    public Func<Task>? OnHangup { get; set; }

    public void Start(int port)
    {
        if (IsRunning)
            throw new InvalidOperationException("Signaling server already running.");

        Port = port;
        _listener.Prefixes.Clear();
        // Loopback-only: no URL ACL elevation needed for same-PC simulator.
        _listener.Prefixes.Add($"http://127.0.0.1:{port}/");
        _listener.Prefixes.Add($"http://localhost:{port}/");

        _listener.Start();
        _cts = new CancellationTokenSource();
        IsRunning = true;
        _loop = Task.Run(() => AcceptLoopAsync(_cts.Token));
        WriteLog($"Signaling listening on http://127.0.0.1:{port}/");
    }

    public async Task StopAsync()
    {
        if (!IsRunning)
            return;

        _cts?.Cancel();
        try { _listener.Stop(); } catch { /* ignore */ }

        if (_loop is not null)
        {
            try { await _loop.ConfigureAwait(false); } catch { /* ignore */ }
        }

        _cts?.Dispose();
        _cts = null;
        _loop = null;
        IsRunning = false;
        ResetSession("idle", "stopped");
        WriteLog("Signaling stopped.");
    }

    public void SetDeviceRtspUrl(string url) => DeviceRtspUrl = url;

    private async Task AcceptLoopAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested && _listener.IsListening)
        {
            HttpListenerContext ctx;
            try
            {
                ctx = await _listener.GetContextAsync().WaitAsync(ct).ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (HttpListenerException)
            {
                break;
            }
            catch (ObjectDisposedException)
            {
                break;
            }

            _ = Task.Run(() => HandleAsync(ctx), ct);
        }
    }

    private async Task HandleAsync(HttpListenerContext ctx)
    {
        try
        {
            var path = ctx.Request.Url?.AbsolutePath.TrimEnd('/').ToLowerInvariant() ?? "";
            var method = ctx.Request.HttpMethod.ToUpperInvariant();

            if (method == "OPTIONS")
            {
                await WriteJsonAsync(ctx, 204, null).ConfigureAwait(false);
                return;
            }

            if (path == "/api/call/status" && method == "GET")
            {
                await WriteJsonAsync(ctx, 200, Snapshot()).ConfigureAwait(false);
                return;
            }

            if (path == "/api/call/start" && method == "POST")
            {
                using var reader = new StreamReader(ctx.Request.InputStream, ctx.Request.ContentEncoding);
                var body = await reader.ReadToEndAsync().ConfigureAwait(false);
                var offer = JsonSerializer.Deserialize<CallOfferRequest>(body, JsonOptions) ?? new CallOfferRequest();
                if (string.IsNullOrWhiteSpace(offer.PcRtspUrl))
                {
                    await WriteJsonAsync(ctx, 400, new CallSessionResponse
                    {
                        Ok = false,
                        State = "error",
                        Message = "pc_rtsp_url required"
                    }).ConfigureAwait(false);
                    return;
                }

                lock (_gate)
                {
                    if (State == "active")
                    {
                        // fall through after lock with conflict response below
                    }
                }

                if (State == "active")
                {
                    await WriteJsonAsync(ctx, 409, new CallSessionResponse
                    {
                        Ok = false,
                        State = "active",
                        Message = "call already active"
                    }).ConfigureAwait(false);
                    return;
                }

                WriteLog($"call/start from {offer.CallerId}: {offer.PcRtspUrl}");
                CallSessionResponse result;
                if (OnStartCall is null)
                {
                    result = new CallSessionResponse
                    {
                        Ok = false,
                        State = "error",
                        Message = "simulator handler not attached"
                    };
                }
                else
                {
                    result = await OnStartCall(offer).ConfigureAwait(false);
                }

                await WriteJsonAsync(ctx, result.Ok ? 200 : 500, result).ConfigureAwait(false);
                return;
            }

            if (path == "/api/call/hangup" && method == "POST")
            {
                WriteLog("call/hangup");
                if (OnHangup is not null)
                    await OnHangup().ConfigureAwait(false);
                ResetSession("idle", "ended");
                await WriteJsonAsync(ctx, 200, new CallSessionResponse
                {
                    Ok = true,
                    State = "idle",
                    Message = "ended"
                }).ConfigureAwait(false);
                return;
            }

            await WriteJsonAsync(ctx, 404, new { ok = false, message = "not found" }).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            WriteLog("HTTP error: " + ex.Message);
            try
            {
                await WriteJsonAsync(ctx, 500, new { ok = false, message = ex.Message }).ConfigureAwait(false);
            }
            catch
            {
                // ignore
            }
        }
    }

    public void MarkActive(string sessionId, string deviceRtspUrl, string pcRtspUrl, string message)
    {
        lock (_gate)
        {
            State = "active";
            SessionId = sessionId;
            DeviceRtspUrl = deviceRtspUrl;
            PcRtspUrl = pcRtspUrl;
            Message = message;
        }
    }

    public void ResetSession(string state, string message)
    {
        lock (_gate)
        {
            State = state;
            SessionId = "";
            PcRtspUrl = "";
            Message = message;
        }
    }

    private object Snapshot()
    {
        lock (_gate)
        {
            return new CallStatusResponse
            {
                Ok = true,
                State = State,
                SessionId = SessionId,
                DeviceRtspUrl = DeviceRtspUrl,
                PcRtspUrl = PcRtspUrl,
                Message = Message
            };
        }
    }

    private static async Task WriteJsonAsync(HttpListenerContext ctx, int status, object? payload)
    {
        ctx.Response.StatusCode = status == 204 ? 204 : status;
        ctx.Response.Headers.Add("Access-Control-Allow-Origin", "*");
        ctx.Response.Headers.Add("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        ctx.Response.Headers.Add("Access-Control-Allow-Headers", "Content-Type");
        ctx.Response.Headers.Add("Cache-Control", "no-store");

        if (status == 204 || payload is null)
        {
            ctx.Response.Close();
            return;
        }

        var json = JsonSerializer.Serialize(payload, JsonOptions);
        var bytes = Encoding.UTF8.GetBytes(json);
        ctx.Response.ContentType = "application/json";
        ctx.Response.ContentEncoding = Encoding.UTF8;
        ctx.Response.ContentLength64 = bytes.Length;
        await ctx.Response.OutputStream.WriteAsync(bytes).ConfigureAwait(false);
        ctx.Response.Close();
    }

    private void WriteLog(string msg) => Log?.Invoke(msg);

    public async ValueTask DisposeAsync() => await StopAsync().ConfigureAwait(false);
}
