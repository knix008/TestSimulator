using System.IO;
using System.Net.Http;
using System.Net.Http.Headers;

namespace STTWinV20.Services;

public record ModelInfo(
    string DisplayName,
    string FileName,
    string SizeLabel,
    string Description);

public sealed class WhisperModelManager
{
    private static readonly string ModelDir = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "STTWinV20", "models");

    // Mirrors STTGTKV10 model list, downloaded from Hugging Face whisper.cpp repo
    public static readonly IReadOnlyList<ModelInfo> Models =
    [
        new("Tiny",           "ggml-tiny.bin",            "~75 MB",   "가장 빠름"),
        new("Base",           "ggml-base.bin",            "~142 MB",  "속도/정확도 균형"),
        new("Small",          "ggml-small.bin",           "~466 MB",  "권장 – 한국어 최적"),
        new("Medium",         "ggml-medium.bin",          "~1.5 GB",  "고정확도"),
        new("Large-v3-Turbo", "ggml-large-v3-turbo.bin",  "~1.6 GB",  "빠른 대형 모델"),
        new("Large-v3",       "ggml-large-v3.bin",        "~3.1 GB",  "최고 정확도"),
    ];

    private const string HfBase =
        "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/";

    public static string GetModelPath(ModelInfo model)
    {
        Directory.CreateDirectory(ModelDir);
        return Path.Combine(ModelDir, model.FileName);
    }

    public static bool IsDownloaded(ModelInfo model) =>
        File.Exists(GetModelPath(model));

    // Downloads model with progress (0.0–1.0). Throws on failure.
    public static async Task DownloadAsync(
        ModelInfo model,
        IProgress<double> progress,
        CancellationToken ct = default)
    {
        string dest = GetModelPath(model);
        string tmp = dest + ".tmp";
        string url = HfBase + model.FileName;

        Directory.CreateDirectory(ModelDir);

        using var http = new HttpClient();
        http.DefaultRequestHeaders.UserAgent.Add(
            new ProductInfoHeaderValue("STTWinV20", "2.0"));
        http.Timeout = TimeSpan.FromMinutes(60);

        using var resp = await http.GetAsync(url, HttpCompletionOption.ResponseHeadersRead, ct);
        resp.EnsureSuccessStatusCode();

        long? total = resp.Content.Headers.ContentLength;
        await using var src = await resp.Content.ReadAsStreamAsync(ct);
        await using var dst = File.Create(tmp);

        var buf = new byte[81920];
        long downloaded = 0;
        int read;

        while ((read = await src.ReadAsync(buf, ct)) > 0)
        {
            await dst.WriteAsync(buf.AsMemory(0, read), ct);
            downloaded += read;
            if (total.HasValue)
                progress.Report((double)downloaded / total.Value);
        }

        await dst.FlushAsync(ct);
        dst.Close();

        // Atomic rename after complete download
        if (File.Exists(dest)) File.Delete(dest);
        File.Move(tmp, dest);
    }
}
