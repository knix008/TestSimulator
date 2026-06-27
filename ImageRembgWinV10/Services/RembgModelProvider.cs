using System.Security.Cryptography;
using Microsoft.ML.OnnxRuntime;

using ImageRembgWinV10.Localization;

namespace ImageRembgWinV10.Services;

internal sealed class RembgModelProvider : IDisposable
{
    private const string ModelFileName = "u2net.onnx";
    private const string ModelUrl = "https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2net.onnx";
    private const string ModelMd5Hex = "60024c5c889badc19c04ad937298a77b";

    private static readonly Lock SessionLock = new();
    private static RembgModelProvider? _instance;

    private InferenceSession? _session;
    private string? _inputName;

    public static RembgModelProvider Instance => _instance ??= new RembgModelProvider();

    public string InputName => _inputName ?? throw new InvalidOperationException(L.Get("Exception.RembgNotReady"));

    public InferenceSession Session => _session ?? throw new InvalidOperationException(L.Get("Exception.RembgNotReady"));

    public void EnsureReady(IProgress<string>? progress = null)
    {
        lock (SessionLock)
        {
            if (_session != null)
            {
                return;
            }

            var modelPath = ResolveModelPath(progress);
            progress?.Report(L.Get("Rembg.LoadingModel"));
            try
            {
                _session = new InferenceSession(modelPath);
                _inputName = _session.InputMetadata.Keys.First();
            }
            catch (Exception ex)
            {
                throw new InvalidOperationException(
                    L.F("Exception.RembgLoadFailed", ex.Message, modelPath),
                    ex);
            }
        }
    }

    private static string ResolveModelPath(IProgress<string>? progress)
    {
        var bundledPath = Path.Combine(AppContext.BaseDirectory, "Assets", "Models", ModelFileName);
        if (IsValidModel(bundledPath))
        {
            return bundledPath;
        }

        var cacheDirectory = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "ImageRembgWinV10",
            "models");
        Directory.CreateDirectory(cacheDirectory);

        var cachedPath = Path.Combine(cacheDirectory, ModelFileName);
        if (IsValidModel(cachedPath))
        {
            return cachedPath;
        }

        progress?.Report(L.Get("Rembg.DownloadingModel"));
        try
        {
            DownloadModel(ModelUrl, cachedPath, progress);
        }
        catch (HttpRequestException ex)
        {
            throw new InvalidOperationException(
                L.F("Exception.RembgDownloadFailed", ex.Message),
                ex);
        }
        catch (TaskCanceledException ex)
        {
            throw new InvalidOperationException(
                L.Get("Exception.RembgDownloadTimeout"),
                ex);
        }

        return cachedPath;
    }

    private static bool IsValidModel(string path)
    {
        if (!File.Exists(path))
        {
            return false;
        }

        try
        {
            using var stream = File.OpenRead(path);
            using var md5 = MD5.Create();
            var hash = Convert.ToHexStringLower(md5.ComputeHash(stream));
            return string.Equals(hash, ModelMd5Hex, StringComparison.Ordinal);
        }
        catch
        {
            return false;
        }
    }

    private static void DownloadModel(string url, string destinationPath, IProgress<string>? progress)
    {
        var tempPath = destinationPath + ".download";
        if (File.Exists(tempPath))
        {
            File.Delete(tempPath);
        }

        using var client = new HttpClient();
        client.Timeout = TimeSpan.FromMinutes(30);

        using var response = client.GetAsync(url, HttpCompletionOption.ResponseHeadersRead).GetAwaiter().GetResult();
        response.EnsureSuccessStatusCode();

        var totalBytes = response.Content.Headers.ContentLength;
        using var input = response.Content.ReadAsStream();
        using var output = File.Create(tempPath);

        var buffer = new byte[81920];
        long downloaded = 0;
        int read;
        while ((read = input.Read(buffer, 0, buffer.Length)) > 0)
        {
            output.Write(buffer, 0, read);
            downloaded += read;

            if (totalBytes > 0)
            {
                var percent = downloaded * 100 / totalBytes;
                progress?.Report(L.F("Rembg.DownloadProgress", percent));
            }
        }

        output.Flush(true);
        output.Close();

        if (!IsValidModel(tempPath))
        {
            File.Delete(tempPath);
            throw new InvalidOperationException(L.Get("Exception.RembgDownloadCorrupt"));
        }

        if (File.Exists(destinationPath))
        {
            File.Delete(destinationPath);
        }

        File.Move(tempPath, destinationPath);
    }

    public void Dispose()
    {
        _session?.Dispose();
        _session = null;
    }
}
