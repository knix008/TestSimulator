using System.Diagnostics;
using System.Net;
using System.Net.Http.Headers;

namespace OCRWinV10.Ocr;

public static class EngineDownloadHelper
{
    public static string EnginesRoot =>
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "OCRWinV10", "engines");

    private static readonly Lazy<HttpClient> SharedHttp = new(CreateSharedHttpClient);

    private static HttpClient CreateSharedHttpClient()
    {
        var handler = new SocketsHttpHandler
        {
            AutomaticDecompression = DecompressionMethods.All,
            PooledConnectionLifetime = TimeSpan.FromMinutes(10),
            ConnectTimeout = TimeSpan.FromSeconds(30)
        };

        var client = new HttpClient(handler)
        {
            Timeout = TimeSpan.FromMinutes(30)
        };
        client.DefaultRequestHeaders.UserAgent.ParseAdd("OCRWinV10/1.0 (Windows; PaddleOCR model download)");
        client.DefaultRequestHeaders.Accept.ParseAdd("*/*");
        return client;
    }

    public static async Task DownloadFileAsync(
        string url,
        string destinationPath,
        IProgress<InstallProgressReport>? progress,
        CancellationToken cancellationToken,
        int maxAttempts = 3)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(destinationPath)!);
        var fileName = Path.GetFileName(destinationPath);
        Exception? lastError = null;

        for (var attempt = 1; attempt <= maxAttempts; attempt++)
        {
            cancellationToken.ThrowIfCancellationRequested();

            if (attempt > 1)
            {
                progress?.Report(InstallProgressReport.Indeterminate(
                    $"{fileName} 재시도 ({attempt}/{maxAttempts})..."));
                await Task.Delay(TimeSpan.FromSeconds(attempt), cancellationToken);
            }
            else
            {
                progress?.Report(InstallProgressReport.Indeterminate($"{fileName} 다운로드 준비..."));
            }

            try
            {
                await DownloadFileCoreAsync(url, destinationPath, fileName, progress, cancellationToken);
                return;
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                lastError = ex;
                try { if (File.Exists(destinationPath)) File.Delete(destinationPath); } catch { }
            }
        }

        throw new IOException(
            $"{fileName} 다운로드에 실패했습니다. ({lastError?.Message ?? "알 수 없는 오류"})",
            lastError);
    }

    private static async Task DownloadFileCoreAsync(
        string url,
        string destinationPath,
        string fileName,
        IProgress<InstallProgressReport>? progress,
        CancellationToken cancellationToken)
    {
        using var response = await SharedHttp.Value.GetAsync(
            url, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
        response.EnsureSuccessStatusCode();

        var total = response.Content.Headers.ContentLength ?? -1;
        await using var input = await response.Content.ReadAsStreamAsync(cancellationToken);
        await using var output = File.Create(destinationPath);

        var buffer = new byte[81920];
        long read = 0;
        int count;
        int lastPct = -1;

        while ((count = await input.ReadAsync(buffer, cancellationToken)) > 0)
        {
            await output.WriteAsync(buffer.AsMemory(0, count), cancellationToken);
            read += count;

            if (total > 0)
            {
                var pct = (int)(read * 100 / total);
                if (pct != lastPct)
                {
                    lastPct = pct;
                    progress?.Report(InstallProgressReport.Determinate($"{fileName} 다운로드 중... {pct}%", pct));
                }
            }
            else
            {
                progress?.Report(InstallProgressReport.Indeterminate(
                    $"{fileName} 다운로드 중... {read / 1024 / 1024} MB"));
            }
        }

        progress?.Report(InstallProgressReport.Determinate($"{fileName} 다운로드 완료", 100));
    }

    public static async Task<bool> RunProcessAsync(
        string fileName,
        string arguments,
        IProgress<InstallProgressReport>? progress,
        CancellationToken cancellationToken,
        int timeoutMs = 600_000)
    {
        progress?.Report(InstallProgressReport.Indeterminate($"실행: {Path.GetFileName(fileName)}"));

        using var process = new Process
        {
            StartInfo = new ProcessStartInfo
            {
                FileName = fileName,
                Arguments = arguments,
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true
            }
        };

        process.Start();

        using var cts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        cts.CancelAfter(timeoutMs);

        try
        {
            await process.WaitForExitAsync(cts.Token);
            return process.ExitCode == 0;
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            try { process.Kill(entireProcessTree: true); } catch { }
            return false;
        }
    }
}
