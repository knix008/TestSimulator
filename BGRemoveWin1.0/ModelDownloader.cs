namespace BGRemoveWin1._0
{
    public class ModelDownloader
    {
        public const string ModelUrl = "https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2net.onnx";

        public static string DefaultModelPath => Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "BGRemove", "u2net.onnx");

        public async Task DownloadAsync(
            string url,
            string destPath,
            IProgress<(long downloaded, long total)> progress,
            CancellationToken ct)
        {
            Directory.CreateDirectory(Path.GetDirectoryName(destPath)!);
            string tempPath = destPath + ".tmp";

            using var client = new HttpClient();
            client.DefaultRequestHeaders.UserAgent.ParseAdd("BGRemoveWin/1.0");
            client.Timeout = TimeSpan.FromMinutes(10);

            using var response = await client.GetAsync(url, HttpCompletionOption.ResponseHeadersRead, ct);
            response.EnsureSuccessStatusCode();

            long total = response.Content.Headers.ContentLength ?? -1;

            using var stream = await response.Content.ReadAsStreamAsync(ct);
            await using var file = File.Create(tempPath);

            byte[] buffer = new byte[81920];
            long downloaded = 0;
            int read;

            while ((read = await stream.ReadAsync(buffer, ct)) > 0)
            {
                await file.WriteAsync(buffer.AsMemory(0, read), ct);
                downloaded += read;
                progress.Report((downloaded, total));
            }

            await file.FlushAsync(ct);
            file.Close();

            if (File.Exists(destPath)) File.Delete(destPath);
            File.Move(tempPath, destPath);
        }
    }
}
