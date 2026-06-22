using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace ReqTrace.Importing;

public sealed class OllamaClient : IDisposable
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    private readonly HttpClient _http;
    private readonly string _baseUrl;

    public OllamaClient(string baseUrl)
    {
        _baseUrl = baseUrl.TrimEnd('/');
        _http = new HttpClient
        {
            BaseAddress = new Uri(_baseUrl + "/"),
            Timeout = TimeSpan.FromMinutes(15)
        };
    }

    public async Task<bool> IsAvailableAsync(CancellationToken cancellationToken = default)
    {
        try
        {
            using var response = await _http.GetAsync("api/tags", cancellationToken);
            return response.IsSuccessStatusCode;
        }
        catch
        {
            return false;
        }
    }

    public async Task<IReadOnlyList<string>> ListModelsAsync(CancellationToken cancellationToken = default)
    {
        using var response = await _http.GetAsync("api/tags", cancellationToken);
        response.EnsureSuccessStatusCode();

        var payload = await response.Content.ReadFromJsonAsync<OllamaTagsResponse>(JsonOptions, cancellationToken);
        return payload?.Models?
            .Select(m => m.Name)
            .Where(n => !string.IsNullOrWhiteSpace(n))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList()
            ?? [];
    }

    public async Task<string> ResolveModelAsync(string? preferredModel, CancellationToken cancellationToken = default)
    {
        var models = await ListModelsAsync(cancellationToken);
        if (models.Count == 0)
            throw new InvalidOperationException("No Ollama models are installed. Run 'ollama pull <model>' first.");

        if (!string.IsNullOrWhiteSpace(preferredModel))
        {
            var match = models.FirstOrDefault(m =>
                string.Equals(m, preferredModel.Trim(), StringComparison.OrdinalIgnoreCase));
            if (match is null)
                throw new InvalidOperationException(
                    $"Ollama model '{preferredModel.Trim()}' is not installed. Available: {string.Join(", ", models)}");

            return match;
        }

        return models[0];
    }

    public async Task<string> ChatJsonAsync(
        string model,
        string systemPrompt,
        string userPrompt,
        CancellationToken cancellationToken = default,
        int maxTokens = 8192)
    {
        var request = new OllamaChatRequest
        {
            Model = model,
            Stream = false,
            Format = "json",
            Options = new OllamaRequestOptions
            {
                Temperature = 0.1f,
                NumPredict = maxTokens
            },
            Messages =
            [
                new OllamaChatMessage { Role = "system", Content = systemPrompt },
                new OllamaChatMessage { Role = "user", Content = userPrompt }
            ]
        };

        using var response = await _http.PostAsJsonAsync("api/chat", request, JsonOptions, cancellationToken);
        response.EnsureSuccessStatusCode();

        var payload = await response.Content.ReadFromJsonAsync<OllamaChatResponse>(JsonOptions, cancellationToken);
        var content = payload?.Message?.Content?.Trim();
        if (string.IsNullOrWhiteSpace(content))
            throw new InvalidOperationException("Ollama returned an empty response.");

        return content;
    }

    public void Dispose() => _http.Dispose();

    private sealed class OllamaTagsResponse
    {
        [JsonPropertyName("models")]
        public List<OllamaModelInfo>? Models { get; set; }
    }

    private sealed class OllamaModelInfo
    {
        [JsonPropertyName("name")]
        public string Name { get; set; } = string.Empty;
    }

    private sealed class OllamaChatRequest
    {
        [JsonPropertyName("model")]
        public string Model { get; set; } = string.Empty;

        [JsonPropertyName("stream")]
        public bool Stream { get; set; }

        [JsonPropertyName("format")]
        public string Format { get; set; } = "json";

        [JsonPropertyName("messages")]
        public List<OllamaChatMessage> Messages { get; set; } = [];

        [JsonPropertyName("options")]
        public OllamaRequestOptions? Options { get; set; }
    }

    private sealed class OllamaRequestOptions
    {
        [JsonPropertyName("temperature")]
        public float Temperature { get; set; }

        [JsonPropertyName("num_predict")]
        public int NumPredict { get; set; }
    }

    private sealed class OllamaChatMessage
    {
        [JsonPropertyName("role")]
        public string Role { get; set; } = string.Empty;

        [JsonPropertyName("content")]
        public string Content { get; set; } = string.Empty;
    }

    private sealed class OllamaChatResponse
    {
        [JsonPropertyName("message")]
        public OllamaChatMessage? Message { get; set; }
    }
}
