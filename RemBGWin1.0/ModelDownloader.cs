namespace RemBGWin1._0
{
    /// <summary>
    /// U2Net ONNX 모델 파일을 다운로드하고 기본 경로를 제공합니다.
    /// </summary>
    public class ModelDownloader
    {
        // HuggingFace는 인증 필요(401)로 변경됨 → GitHub Releases 사용
        public const string ModelUrl =
            "https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2net.onnx";

        public static string DefaultModelPath =>
            Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                "RemBGWin", "u2net.onnx");

        /// <summary>
        /// 모델 파일을 비동기로 다운로드합니다.
        /// </summary>
        /// <param name="url">다운로드 URL</param>
        /// <param name="destination">저장 경로</param>
        /// <param name="progress">(다운로드된 바이트, 전체 바이트) 진행 보고</param>
        /// <param name="ct">취소 토큰</param>
        public async Task DownloadAsync(
            string url,
            string destination,
            IProgress<(long downloaded, long total)>? progress,
            CancellationToken ct)
        {
            string? dir = Path.GetDirectoryName(destination);
            if (dir != null) Directory.CreateDirectory(dir);

            string tmpPath = destination + ".tmp";

            // 대용량 파일 다운로드: 기본 100초 타임아웃을 무제한으로 설정
            using var handler = new HttpClientHandler { AllowAutoRedirect = true };
            using var client  = new HttpClient(handler) { Timeout = Timeout.InfiniteTimeSpan };
            client.DefaultRequestHeaders.UserAgent.ParseAdd("Mozilla/5.0 RemBGWin/1.0");

            try
            {
                using var response = await client.GetAsync(url, HttpCompletionOption.ResponseHeadersRead, ct);
                response.EnsureSuccessStatusCode();

                long total = response.Content.Headers.ContentLength ?? -1L;

                using var srcStream = await response.Content.ReadAsStreamAsync(ct);
                using var dstStream = new FileStream(
                    tmpPath, FileMode.Create, FileAccess.Write, FileShare.None, 65536, useAsync: true);

                byte[] buffer   = new byte[81920];
                long   received = 0;
                int    read;

                while ((read = await srcStream.ReadAsync(buffer, ct)) > 0)
                {
                    await dstStream.WriteAsync(buffer.AsMemory(0, read), ct);
                    received += read;
                    progress?.Report((received, total));
                }
            }
            catch
            {
                // 실패·취소 시 임시 파일 정리
                if (File.Exists(tmpPath)) File.Delete(tmpPath);
                throw;
            }

            // 성공 시 최종 파일로 이동
            if (File.Exists(destination)) File.Delete(destination);
            File.Move(tmpPath, destination);
        }
    }
}
