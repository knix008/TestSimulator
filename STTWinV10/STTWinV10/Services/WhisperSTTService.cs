using System;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using Whisper.net;
using Whisper.net.Ggml;

namespace STTWinV10.Services
{
    /// <summary>
    /// Whisper.net 기본 디코더 설정에 가깝게 동작하며, 언어만 한국어(<c>ko</c>)로 고정합니다.
    /// </summary>
    public class WhisperSTTService : IDisposable
    {
        /// <summary>Whisper 언어 코드: 한국어.</summary>
        public const string RecognitionLanguage = "ko";

        private WhisperProcessor? _processor;
        private readonly string _modelPath;
        private readonly GgmlType _ggmlType;
        private bool _isInitialized;
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
            if (!_isInitialized || _processor == null)
            {
                throw new InvalidOperationException("WhisperSTTService가 초기화되지 않았습니다.");
            }

            await _processingLock.WaitAsync(cancellationToken);
            try
            {
                var result = "";
                await foreach (var segment in _processor.ProcessAsync(audioData, cancellationToken))
                {
                    var text = (segment.Text ?? string.Empty).Trim();
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
                _processingLock.Release();
            }
        }

        public async Task<string> TranscribeFileAsync(string audioFilePath, CancellationToken cancellationToken = default)
        {
            if (!_isInitialized || _processor == null)
            {
                throw new InvalidOperationException("WhisperSTTService가 초기화되지 않았습니다.");
            }

            if (!File.Exists(audioFilePath))
            {
                throw new FileNotFoundException("오디오 파일을 찾을 수 없습니다.", audioFilePath);
            }

            await _processingLock.WaitAsync(cancellationToken);
            try
            {
                var result = "";
                using var fileStream = File.OpenRead(audioFilePath);

                await foreach (var segment in _processor.ProcessAsync(fileStream, cancellationToken))
                {
                    var text = (segment.Text ?? string.Empty).Trim();
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
                _processingLock.Release();
            }
        }

        public void Dispose()
        {
            _processor?.Dispose();
            _processor = null;
            _processingLock.Dispose();
            _isInitialized = false;
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
