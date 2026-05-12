using System;
using System.IO;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using Whisper.net;
using Whisper.net.Ggml;

namespace STTWinV10.Services
{
    /// <summary>
    /// Whisper.net 기본 디코더에 가깝게 두고 언어만 <c>ko</c>로 고정합니다.
    /// 출력에서 반각/전각 <b>대괄호 메타 블록</b>만 구조적으로 제거합니다(내용 추측 없음).
    /// </summary>
    public class WhisperSTTService : IDisposable
    {
        /// <summary>Whisper 언어 코드: 한국어.</summary>
        public const string RecognitionLanguage = "ko";

        /// <summary>반각/전각 대괄호 한 블록(자막·이벤트 메타). 말한 텍스트는 건드리지 않음.</summary>
        private static readonly Regex SquareBracketBlock = new(
            @"[\[［][^\]］]*[\]］]",
            RegexOptions.Compiled | RegexOptions.CultureInvariant);

        private WhisperProcessor? _processor;
        private readonly string _modelPath;
        private readonly GgmlType _ggmlType;
        private bool _isInitialized;
        private volatile bool _disposed;
        private readonly SemaphoreSlim _processingLock = new(1, 1);

        public event EventHandler<TranscriptionEventArgs>? TranscriptionReceived;
        public event EventHandler<string>? ErrorOccurred;

        public bool IsInitialized => _isInitialized;

        public WhisperSTTService(string modelPath, GgmlType ggmlType = GgmlType.Base)
        {
            _modelPath = modelPath;
            _ggmlType = ggmlType;
        }

        public async Task InitializeAsync()
        {
            if (_isInitialized)
                return;

            try
            {
                if (!File.Exists(_modelPath))
                {
                    var modelDir = Path.GetDirectoryName(_modelPath);
                    if (!string.IsNullOrEmpty(modelDir) && !Directory.Exists(modelDir))
                    {
                        Directory.CreateDirectory(modelDir);
                    }

                    await DownloadModelAsync();
                }

                var factory = WhisperFactory.FromPath(_modelPath);
                _processor = factory.CreateBuilder()
                    .WithLanguage(RecognitionLanguage)
                    .Build();

                _isInitialized = true;
            }
            catch (Exception ex)
            {
                ErrorOccurred?.Invoke(this, $"Whisper 초기화 실패: {ex.Message}");
                throw;
            }
        }

        private async Task DownloadModelAsync()
        {
            try
            {
                ErrorOccurred?.Invoke(this, "Whisper 모델 다운로드 중...");

                using var modelStream = await WhisperGgmlDownloader.GetGgmlModelAsync(_ggmlType);
                using var fileStream = File.Create(_modelPath);
                await modelStream.CopyToAsync(fileStream);

                ErrorOccurred?.Invoke(this, "모델 다운로드 완료!");
            }
            catch (Exception ex)
            {
                ErrorOccurred?.Invoke(this, $"모델 다운로드 실패: {ex.Message}");
                throw;
            }
        }

        public async Task<string> TranscribeAsync(float[] audioData, CancellationToken cancellationToken = default)
        {
            if (_disposed)
                throw new ObjectDisposedException(nameof(WhisperSTTService));
            if (!_isInitialized || _processor == null)
            {
                throw new InvalidOperationException("WhisperSTTService가 초기화되지 않았습니다.");
            }

            await _processingLock.WaitAsync(cancellationToken).ConfigureAwait(false);
            try
            {
                if (_disposed || _processor == null)
                    return string.Empty;

                var result = "";
                await foreach (var segment in _processor.ProcessAsync(audioData, cancellationToken).ConfigureAwait(false))
                {
                    var text = RemoveBracketMetaOnly(segment.Text);
                    if (string.IsNullOrEmpty(text))
                        continue;

                    result += text;

                    TranscriptionReceived?.Invoke(this, new TranscriptionEventArgs
                    {
                        Text = text,
                        StartTime = segment.Start,
                        EndTime = segment.End,
                        IsPartial = false
                    });
                }

                return result;
            }
            catch (Exception ex)
            {
                ErrorOccurred?.Invoke(this, $"음성 인식 오류: {ex.Message}");
                return string.Empty;
            }
            finally
            {
                ReleaseProcessingLockOnce();
            }
        }

        public async Task<string> TranscribeFileAsync(string audioFilePath, CancellationToken cancellationToken = default)
        {
            if (_disposed)
                throw new ObjectDisposedException(nameof(WhisperSTTService));
            if (!_isInitialized || _processor == null)
            {
                throw new InvalidOperationException("WhisperSTTService가 초기화되지 않았습니다.");
            }

            if (!File.Exists(audioFilePath))
            {
                throw new FileNotFoundException("오디오 파일을 찾을 수 없습니다.", audioFilePath);
            }

            await _processingLock.WaitAsync(cancellationToken).ConfigureAwait(false);
            try
            {
                if (_disposed || _processor == null)
                    return string.Empty;

                var result = "";
                using var fileStream = File.OpenRead(audioFilePath);

                await foreach (var segment in _processor.ProcessAsync(fileStream, cancellationToken).ConfigureAwait(false))
                {
                    var text = RemoveBracketMetaOnly(segment.Text);
                    if (string.IsNullOrEmpty(text))
                        continue;

                    result += text;

                    TranscriptionReceived?.Invoke(this, new TranscriptionEventArgs
                    {
                        Text = text,
                        StartTime = segment.Start,
                        EndTime = segment.End,
                        IsPartial = false
                    });
                }

                return result;
            }
            catch (Exception ex)
            {
                ErrorOccurred?.Invoke(this, $"파일 음성 인식 오류: {ex.Message}");
                return string.Empty;
            }
            finally
            {
                ReleaseProcessingLockOnce();
            }
        }

        /// <summary>
        /// 대괄호로 둘러싼 구간만 제거합니다. 괄호 밖의 전사는 그대로 둡니다.
        /// </summary>
        private static string RemoveBracketMetaOnly(string? raw)
        {
            if (string.IsNullOrWhiteSpace(raw))
                return string.Empty;

            var text = raw.Trim();
            string prev;
            do
            {
                prev = text;
                text = SquareBracketBlock.Replace(text, " ");
            }
            while (prev != text);

            text = Regex.Replace(text, @"\s+", " ").Trim();
            return text;
        }

        /// <summary>
        /// <see cref="SemaphoreSlim.Release"/>는 Dispose 경합·이중 호출 시 예외가 날 수 있어 한곳에서만 안전하게 호출합니다.
        /// </summary>
        private void ReleaseProcessingLockOnce()
        {
            try
            {
                _processingLock.Release();
            }
            catch (ObjectDisposedException)
            {
                // 이미 Dispose된 세마포어
            }
            catch (SemaphoreFullException)
            {
                // Wait 없이 Release된 경우(논리 오류 방지용)
            }
        }

        public void Dispose()
        {
            if (_disposed)
                return;
            _disposed = true;

            try
            {
                // 진행 중인 Transcribe가 세마포어를 내려놓을 때까지 대기 후 프로세서 정리
                _processingLock.Wait();
            }
            catch (ObjectDisposedException)
            {
                return;
            }

            try
            {
                _processor?.Dispose();
                _processor = null;
                _isInitialized = false;
            }
            finally
            {
                ReleaseProcessingLockOnce();
            }

            try
            {
                _processingLock.Dispose();
            }
            catch (ObjectDisposedException)
            {
                // 이미 해제됨
            }
        }
    }

    public class TranscriptionEventArgs : EventArgs
    {
        public string Text { get; set; } = string.Empty;
        public TimeSpan StartTime { get; set; }
        public TimeSpan EndTime { get; set; }
        public bool IsPartial { get; set; }
    }
}
