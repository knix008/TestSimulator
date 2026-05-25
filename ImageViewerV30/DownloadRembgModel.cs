using System.IO;
using System.Net.Http;
using System.Security.Cryptography;

namespace ImageViewerV30;

/// <summary>
/// rembg 공식 릴리스 ONNX 모델 다운로드 (https://github.com/danielgatis/rembg).
/// </summary>
public static class DownloadRembgModel
{
    public static Task<string> DownloadModelIfNotExistsAsync(string modelsDir) =>
        DownloadModelIfNotExistsAsync(RembgModelInfo.BriaRmbg2, modelsDir, null);

    public static Task<string> DownloadModelIfNotExistsAsync(
        RembgModelInfo model,
        string modelsDir) =>
        DownloadModelIfNotExistsAsync(model, modelsDir, null);

    public static async Task<string> DownloadModelIfNotExistsAsync(
        RembgModelInfo model,
        string modelsDir,
        IProgress<(int percent, string message)>? progress)
    {
        Directory.CreateDirectory(modelsDir);
        string modelPath = RembgModelInfo.GetPath(modelsDir, model);

        if (File.Exists(modelPath))
        {
            if (await VerifyChecksumAsync(modelPath, model))
            {
                progress?.Report((100, $"{model.DisplayName} 준비됨"));
                return modelPath;
            }

            progress?.Report((0, $"손상된 {model.FileName} 재다운로드 중..."));
            TryDelete(modelPath);
        }

        progress?.Report((0, $"{model.DisplayName} 다운로드 준비 중..."));

        string tempPath = modelPath + ".download";
        TryDelete(tempPath);

        using var client = new HttpClient { Timeout = TimeSpan.FromMinutes(90) };
        client.DefaultRequestHeaders.UserAgent.ParseAdd("ImageViewerV30/1.0");

        using var response = await client.GetAsync(model.DownloadUrl, HttpCompletionOption.ResponseHeadersRead);
        response.EnsureSuccessStatusCode();

        long? totalBytes = response.Content.Headers.ContentLength;
        await using var httpStream = await response.Content.ReadAsStreamAsync();
        await using var fs = new FileStream(tempPath, FileMode.Create, FileAccess.Write, FileShare.None);

        var buffer = new byte[81920];
        long downloaded = 0;
        int read;
        while ((read = await httpStream.ReadAsync(buffer)) > 0)
        {
            await fs.WriteAsync(buffer.AsMemory(0, read));
            downloaded += read;

            if (totalBytes > 0)
            {
                int pct = (int)Math.Clamp(downloaded * 100 / totalBytes.Value, 0, 99);
                progress?.Report((pct,
                    $"{model.DisplayName} 다운로드 중... ({FormatBytes(downloaded)} / {FormatBytes(totalBytes.Value)})"));
            }
            else
            {
                progress?.Report((0, $"{model.DisplayName} 다운로드 중... ({FormatBytes(downloaded)})"));
            }
        }

        await fs.FlushAsync();
        fs.Close();

        if (File.Exists(modelPath))
            File.Delete(modelPath);
        File.Move(tempPath, modelPath);

        if (!await VerifyChecksumAsync(modelPath, model))
            throw new InvalidOperationException($"{model.DisplayName} 다운로드 후 checksum 검증에 실패했습니다. 다시 시도해 주세요.");

        progress?.Report((100, $"{model.DisplayName} 다운로드 완료"));
        return modelPath;
    }

    private static async Task<bool> VerifyChecksumAsync(string filePath, RembgModelInfo model)
    {
        try
        {
            await using var stream = File.OpenRead(filePath);
            if (!string.IsNullOrEmpty(model.Sha256Hex))
            {
                byte[] hash = await SHA256.HashDataAsync(stream);
                string hex = Convert.ToHexString(hash).ToLowerInvariant();
                return hex == model.Sha256Hex.ToLowerInvariant();
            }

            if (!string.IsNullOrEmpty(model.Md5Hex))
            {
                using var md5 = MD5.Create();
                byte[] hash = await md5.ComputeHashAsync(stream);
                string hex = Convert.ToHexString(hash).ToLowerInvariant();
                return hex == model.Md5Hex.ToLowerInvariant();
            }

            return true;
        }
        catch
        {
            return false;
        }
    }

    private static void TryDelete(string path)
    {
        try { if (File.Exists(path)) File.Delete(path); } catch { }
    }

    private static string FormatBytes(long bytes) =>
        bytes >= 1_048_576 ? $"{bytes / 1_048_576.0:0.1} MB" :
        bytes >= 1024 ? $"{bytes / 1024.0:0.1} KB" : $"{bytes} B";
}
