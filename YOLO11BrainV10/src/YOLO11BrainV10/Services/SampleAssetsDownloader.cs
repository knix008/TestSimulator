using System.Net;
using System.Net.Http;

namespace YOLO11BrainV10.Services;

internal static class SampleAssetsDownloader
{
    private static readonly HttpClient Http = CreateClient();

    /// <summary>Ultralytics brain-tumor demo slice (MRI/CT-style axial; not a model file).</summary>
    internal const string ReferenceImageFileName = "brain_tumor_sample.jpg";

    /// <summary>Try in order: GitHub release, Ultralytics CDN, raw GitHub.</summary>
    private static readonly string[] BrainSampleImageUrls =
    [
        "https://github.com/ultralytics/assets/releases/download/v0.0.0/brain-tumor-sample.jpg",
        "https://ultralytics.com/assets/brain-tumor-sample.jpg",
        "https://raw.githubusercontent.com/ultralytics/assets/main/brain-tumor-sample.jpg",
    ];

    /// <summary>Ultralytics brain-tumor.yaml class order: 0 negative, 1 positive.</summary>
    internal const string BrainTumorLabelsComma = "negative,positive";

    private static HttpClient CreateClient()
    {
        var handler = new SocketsHttpHandler
        {
            PooledConnectionLifetime = TimeSpan.FromMinutes(2),
            AutomaticDecompression = DecompressionMethods.All,
        };
        var h = new HttpClient(handler)
        {
            Timeout = TimeSpan.FromMinutes(15),
        };
        h.DefaultRequestHeaders.UserAgent.ParseAdd(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) YOLO11BrainV10/1.0 (CT sample download)");
        return h;
    }

    internal sealed record BrainCtSampleDownloadResult(string ImagePath, string SuggestedLabelsComma);

    /// <summary>Downloads a brain tumor sample slice for testing. Does not download any ONNX (train/export separately).</summary>
    /// <param name="destinationDirectory">Folder to write image and ATTRIBUTION.txt (created if needed).</param>
    internal static async Task<BrainCtSampleDownloadResult> DownloadBrainCtSampleAsync(
        string destinationDirectory,
        IProgress<string>? status,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(destinationDirectory))
            throw new ArgumentException("저장 폴더가 비어 있습니다.", nameof(destinationDirectory));

        Directory.CreateDirectory(destinationDirectory);
        var dir = Path.GetFullPath(destinationDirectory.Trim());
        EnsureDirectoryIsWritable(dir);

        var imagePath = Path.Combine(dir, ReferenceImageFileName);
        var attributionPath = Path.Combine(dir, "ATTRIBUTION.txt");

        status?.Report("뇌 종양 샘플 이미지 다운로드 중…");
        await DownloadImageWithFallbackAsync(imagePath, status, cancellationToken).ConfigureAwait(false);

        await File.WriteAllTextAsync(attributionPath, AttributionText, cancellationToken).ConfigureAwait(false);

        return new BrainCtSampleDownloadResult(imagePath, BrainTumorLabelsComma);
    }

    private static void EnsureDirectoryIsWritable(string directory)
    {
        var probe = Path.Combine(directory, ".yolo11brainv10_write_probe.tmp");
        try
        {
            File.WriteAllText(probe, "ok");
            File.Delete(probe);
        }
        catch (Exception ex)
        {
            throw new InvalidOperationException(
                "CT 데이터를 저장할 폴더에 쓸 수 없습니다. 다른 폴더를 선택하거나 권한·백신 소프트웨어를 확인하세요.\n\n" +
                directory,
                ex);
        }
    }

    private static async Task DownloadImageWithFallbackAsync(
        string destPath,
        IProgress<string>? status,
        CancellationToken cancellationToken)
    {
        Exception? last = null;
        for (var i = 0; i < BrainSampleImageUrls.Length; i++)
        {
            var url = BrainSampleImageUrls[i];
            try
            {
                status?.Report($"다운로드 시도 ({i + 1}/{BrainSampleImageUrls.Length})…");
                await DownloadToFileAsync(url, destPath, status, cancellationToken).ConfigureAwait(false);
                return;
            }
            catch (Exception ex)
            {
                last = ex;
                TryDeleteFile(destPath);
            }
        }

        throw new InvalidOperationException(
            "샘플 이미지를 받지 못했습니다. 인터넷 연결·방화벽·프록시를 확인하세요.",
            last);
    }

    private static void TryDeleteFile(string path)
    {
        try
        {
            if (File.Exists(path))
                File.Delete(path);
        }
        catch
        {
            // ignore
        }
    }

    private static async Task DownloadToFileAsync(
        string url,
        string destPath,
        IProgress<string>? status,
        CancellationToken cancellationToken)
    {
        using var response = await Http.GetAsync(url, HttpCompletionOption.ResponseHeadersRead, cancellationToken)
            .ConfigureAwait(false);
        response.EnsureSuccessStatusCode();

        var total = response.Content.Headers.ContentLength;
        await using var input = await response.Content.ReadAsStreamAsync(cancellationToken).ConfigureAwait(false);
        await using var output = new FileStream(destPath, FileMode.Create, FileAccess.Write, FileShare.None);

        var buffer = new byte[65536];
        long read = 0;
        int n;
        while ((n = await input.ReadAsync(buffer.AsMemory(0, buffer.Length), cancellationToken).ConfigureAwait(false)) > 0)
        {
            await output.WriteAsync(buffer.AsMemory(0, n), cancellationToken).ConfigureAwait(false);
            read += n;
            if (total is > 0 and var t)
                status?.Report($"{Path.GetFileName(destPath)} … {read * 100 / t}%");
        }
    }

    private const string AttributionText =
        """
        Sample assets (downloaded from YOLO11BrainV10)

        1) brain_tumor_sample.jpg
           Mirrors tried: GitHub release, ultralytics.com/assets, raw GitHub (ultralytics/assets).
           (Ultralytics brain-tumor dataset / documentation sample; AGPL-3.0 applies to the dataset.)
           Medical imaging slice used in Ultralytics tutorials; modality may be MRI or CT.

        2) Class labels for Ultralytics brain-tumor.yaml: negative,positive (comma-separated, in that order).

        3) ONNX: not included. Train YOLO11n-seg on brain CT/MRI segmentation data, then export ONNX
           (see tools/train_yolo11n_seg_brain_ct.py and tools/export_yolo11_brain_onnx.py).

        4) YOLO11BrainV10 stores app downloads by default under:
           %LocalAppData%\YOLO11BrainV10\data\ct (overridable in Tools menu).
        """;
}
