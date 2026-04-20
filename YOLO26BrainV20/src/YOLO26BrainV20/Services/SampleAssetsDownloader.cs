using System.Net.Http;

namespace YOLO26BrainV20.Services;

internal static class SampleAssetsDownloader
{
    private static readonly HttpClient Http = CreateClient();

    /// <summary>Ultralytics brain-tumor demo slice (MRI/CT-style axial; not a model file).</summary>
    internal const string ReferenceImageFileName = "brain_tumor_sample.jpg";

    /// <summary>Stable GitHub release asset (redirects from ultralytics.com sample URL).</summary>
    private const string BrainSampleImageUrl =
        "https://github.com/ultralytics/assets/releases/download/v0.0.0/brain-tumor-sample.jpg";

    private static HttpClient CreateClient()
    {
        var h = new HttpClient(new SocketsHttpHandler { PooledConnectionLifetime = TimeSpan.FromMinutes(2) })
        {
            Timeout = TimeSpan.FromMinutes(15),
        };
        h.DefaultRequestHeaders.UserAgent.ParseAdd("YOLO26BrainV20/1.0 (sample download)");
        return h;
    }

    internal sealed record BrainCtSampleDownloadResult(string ImagePath, string SuggestedLabelsComma);

    /// <summary>Downloads a brain tumor sample slice for testing. Does not download any ONNX (train/export separately).</summary>
    internal static async Task<BrainCtSampleDownloadResult> DownloadBrainCtSampleAsync(
        IProgress<string>? status,
        CancellationToken cancellationToken)
    {
        var dir = AppDataPaths.GetSampleDownloadDirectory();
        var imagePath = Path.Combine(dir, ReferenceImageFileName);
        var attributionPath = Path.Combine(dir, "ATTRIBUTION.txt");

        status?.Report("뇌 종양 샘플 이미지 다운로드 중…");
        await DownloadToFileAsync(BrainSampleImageUrl, imagePath, status, cancellationToken).ConfigureAwait(false);

        await File.WriteAllTextAsync(attributionPath, AttributionText, cancellationToken).ConfigureAwait(false);

        return new BrainCtSampleDownloadResult(imagePath, BrainCtInferenceDefaults.RecommendedClassLabelsComma);
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
        Sample assets (downloaded from YOLO26BrainV20)

        1) brain_tumor_sample.jpg
           Source: https://github.com/ultralytics/assets/releases/download/v0.0.0/brain-tumor-sample.jpg
           (Ultralytics brain-tumor dataset / documentation sample; AGPL-3.0 applies to the dataset.)
           Medical imaging slice used in Ultralytics tutorials; modality may be MRI or CT.

        2) Class labels for Ultralytics brain-tumor.yaml: negative,positive (comma-separated, in that order).

        3) ONNX: not included. Train YOLO26n-seg on brain CT/MRI segmentation data, then export ONNX
           (see tools/train_yolo26n_seg_brain_ct.py and tools/export_yolo26_brain_onnx.py).
        """;
}
