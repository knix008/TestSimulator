using System.Net.Http.Json;
using System.Text.Json;
using RTSPCall.Core.Models;

namespace RTSPCall.Core.Services;

public sealed class SignalingClient : IDisposable
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    private readonly HttpClient _http;

    public SignalingClient(string deviceBaseUrl)
    {
        var baseUrl = deviceBaseUrl.TrimEnd('/') + "/";
        _http = new HttpClient
        {
            BaseAddress = new Uri(baseUrl),
            Timeout = TimeSpan.FromSeconds(10)
        };
    }

    public async Task<CallSessionResponse> StartCallAsync(CallOfferRequest request, CancellationToken ct = default)
    {
        using var response = await _http.PostAsJsonAsync("api/call/start", request, JsonOptions, ct)
            .ConfigureAwait(false);
        return await ReadAsync<CallSessionResponse>(response, ct).ConfigureAwait(false);
    }

    public async Task<CallStatusResponse> GetStatusAsync(CancellationToken ct = default)
    {
        using var response = await _http.GetAsync("api/call/status", ct).ConfigureAwait(false);
        return await ReadAsync<CallStatusResponse>(response, ct).ConfigureAwait(false);
    }

    public async Task<CallSessionResponse> HangupAsync(CancellationToken ct = default)
    {
        using var response = await _http.PostAsync("api/call/hangup", content: null, ct).ConfigureAwait(false);
        return await ReadAsync<CallSessionResponse>(response, ct).ConfigureAwait(false);
    }

    public async Task<bool> PingAsync(CancellationToken ct = default)
    {
        try
        {
            using var response = await _http.GetAsync("api/call/status", ct).ConfigureAwait(false);
            return response.IsSuccessStatusCode;
        }
        catch
        {
            return false;
        }
    }

    private static async Task<T> ReadAsync<T>(HttpResponseMessage response, CancellationToken ct)
    {
        var body = await response.Content.ReadAsStringAsync(ct).ConfigureAwait(false);
        if (!response.IsSuccessStatusCode)
        {
            throw new HttpRequestException(
                $"Signaling HTTP {(int)response.StatusCode}: {Truncate(body)}",
                null,
                response.StatusCode);
        }

        var parsed = JsonSerializer.Deserialize<T>(body, JsonOptions);
        if (parsed is null)
            throw new InvalidOperationException("Empty signaling response.");
        return parsed;
    }

    private static string Truncate(string s) =>
        string.IsNullOrWhiteSpace(s) ? "(empty)" : (s.Length <= 300 ? s : s[..300] + "...");

    public void Dispose() => _http.Dispose();
}
