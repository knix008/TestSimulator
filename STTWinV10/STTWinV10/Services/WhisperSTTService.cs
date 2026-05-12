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
    /// Whisper 모델 STT. 한국어 전사(Transcribe)만 사용합니다.
    /// 디코더 출력에서 대괄호 메타 구간(예: [끝], [모두], [음악])만 제거합니다.
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

        /// <summary>반각/전각 대괄호 블록 (Whisper 메타·자막 태그).</summary>
        private static readonly Regex SquareBracketBlock = new(
            @"[\[［][^\]］]*[\]］]",
            RegexOptions.Compiled | RegexOptions.CultureInvariant);

        public int ThreadCount { get; set; } = Environment.ProcessorCount;
        public int BeamSize { get; set; } = 1;
        public bool UseVadFilter { get; set; } = true;
        public bool UseGpu { get; set; } = false;

        /// <summary>Whisper no_speech 임계값(모델 옵션).</summary>
        public float NoSpeechThreshold { get; set; } = 0.6f;

        /// <summary>
        /// true이면 RMS가 <see cref="MinAudioRms"/> 미만일 때 디코더를 호출하지 않습니다(무음·거의 무음).
        /// 실시간 마이크 STT에서 기본값은 true입니다.
        /// </summary>
        public bool SkipDecodeWhenSilent { get; set; } = true;

        /// <summary>SkipDecodeWhenSilent가 true일 때만 사용하는 RMS 하한.</summary>
        public float MinAudioRms { get; set; } = 0.01f;

        /// <summary>
        /// true이면 <c>[...]</c> / 전각 <c>［...］</c> 로 둘러싼 구간을 제거합니다(Whisper 자막·메타·잡음 태그).
        /// </summary>
        public bool RemoveSquareBracketAnnotations { get; set; } = true;

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
                    .WithThreads(ThreadCount)
                    .WithNoSpeechThreshold(NoSpeechThreshold)
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

            if (SkipDecodeWhenSilent && !HasSufficientAudioEnergy(audioData))
                return string.Empty;

            await _processingLock.WaitAsync(cancellationToken);
            try
            {
                var result = "";
                await foreach (var segment in _processor.ProcessAsync(audioData, cancellationToken))
                {
                    var text = FormatSegmentText(segment.Text);
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
                    var text = FormatSegmentText(segment.Text);
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

        private bool HasSufficientAudioEnergy(float[] audioData)
        {
            if (audioData.Length == 0) return false;

            double sumSquares = 0;
            foreach (var sample in audioData)
                sumSquares += sample * sample;

            var rms = Math.Sqrt(sumSquares / audioData.Length);
            return rms >= MinAudioRms;
        }

        private string FormatSegmentText(string raw)
        {
            if (string.IsNullOrWhiteSpace(raw))
                return string.Empty;

            var text = raw.Trim();
            if (!RemoveSquareBracketAnnotations)
                return text;

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
