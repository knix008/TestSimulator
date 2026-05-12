using System;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using Whisper.net;
using Whisper.net.Ggml;

namespace STTWinV10.Services
{
    /// <summary>
    /// Whisper 모델을 사용한 STT 서비스
    /// </summary>
    public class WhisperSTTService : IDisposable
    {
        private WhisperProcessor? _processor;
        private readonly string _modelPath;
        private bool _isInitialized;
        private readonly SemaphoreSlim _processingLock = new(1, 1);

        // 성능 최적화 옵션
        public int ThreadCount { get; set; } = Environment.ProcessorCount;
        public int BeamSize { get; set; } = 1;
        public bool UseVadFilter { get; set; } = true;
        public bool UseGpu { get; set; } = false;

        // 할루시네이션 방지 옵션
        public float NoSpeechThreshold { get; set; } = 0.6f;  // 이 값 이상이면 무음으로 판단
        public float MinAudioRms { get; set; } = 0.01f;       // 이 에너지 미만이면 Whisper 호출 생략
        public float MinSegmentProbability { get; set; } = -1.0f; // 평균 로그 확률 하한 (미만이면 할루시네이션으로 간주)

        // Whisper가 무음/잡음에서 생성하는 흔한 한국어 할루시네이션 목록
        private static readonly HashSet<string> _hallucinationPhrases = new(StringComparer.OrdinalIgnoreCase)
        {
            "감사합니다", "고맙습니다", "수고하셨습니다", "수고했습니다",
            "구독", "좋아요", "알림 설정", "구독과 좋아요",
            "시청해 주셔서 감사합니다", "시청해주셔서 감사합니다",
            "MBC 뉴스", "KBS 뉴스", "SBS 뉴스",
            "자막 제공", "자막 서비스",
        };

        public event EventHandler<TranscriptionEventArgs>? TranscriptionReceived;
        public event EventHandler<string>? ErrorOccurred;

        public bool IsInitialized => _isInitialized;

        public WhisperSTTService(string modelPath)
        {
            _modelPath = modelPath;
        }

        /// <summary>
        /// Whisper 모델 초기화
        /// </summary>
        public async Task InitializeAsync()
        {
            if (_isInitialized)
                return;

            try
            {
                // 모델 파일이 없으면 자동 다운로드
                if (!File.Exists(_modelPath))
                {
                    var modelDir = Path.GetDirectoryName(_modelPath);
                    if (!string.IsNullOrEmpty(modelDir) && !Directory.Exists(modelDir))
                    {
                        Directory.CreateDirectory(modelDir);
                    }

                    // Whisper base 모델 다운로드 (한국어 지원)
                    await DownloadModelAsync();
                }

                var factory = WhisperFactory.FromPath(_modelPath);
                _processor = factory.CreateBuilder()
                    .WithLanguage("ko")
                    .WithNoSpeechThreshold(NoSpeechThreshold)
                    .WithProbabilities()               // segment.Probability 계산 활성화
                    .Build();

                _isInitialized = true;
            }
            catch (Exception ex)
            {
                ErrorOccurred?.Invoke(this, $"Whisper 초기화 실패: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// Whisper 모델 다운로드
        /// </summary>
        private async Task DownloadModelAsync()
        {
            try
            {
                ErrorOccurred?.Invoke(this, "Whisper 모델 다운로드 중...");
                
                // ggml-base 모델 다운로드 (약 140MB)
                using var modelStream = await WhisperGgmlDownloader.GetGgmlModelAsync(GgmlType.Base);
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

        /// <summary>
        /// 오디오 데이터를 텍스트로 변환 (실시간)
        /// </summary>
        public async Task<string> TranscribeAsync(float[] audioData, CancellationToken cancellationToken = default)
        {
            if (!_isInitialized || _processor == null)
            {
                throw new InvalidOperationException("WhisperSTTService가 초기화되지 않았습니다.");
            }

            // 오디오 에너지가 너무 낮으면 Whisper 호출 자체를 생략 (할루시네이션 방지)
            if (!HasSufficientAudioEnergy(audioData))
                return string.Empty;

            await _processingLock.WaitAsync(cancellationToken);
            try
            {
                var result = "";
                await foreach (var segment in _processor.ProcessAsync(audioData, cancellationToken))
                {
                    // 평균 로그 확률이 너무 낮은 세그먼트는 할루시네이션으로 간주
                    if (segment.Probability < MinSegmentProbability)
                        continue;

                    var cleanedText = CleanTranscriptionText(segment.Text);

                    if (!string.IsNullOrWhiteSpace(cleanedText))
                    {
                        result += cleanedText;

                        TranscriptionReceived?.Invoke(this, new TranscriptionEventArgs
                        {
                            Text = cleanedText,
                            StartTime = segment.Start,
                            EndTime = segment.End,
                            IsPartial = false
                        });
                    }
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

        /// <summary>
        /// 오디오 파일을 텍스트로 변환
        /// </summary>
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
                    var cleanedText = CleanTranscriptionText(segment.Text);
                    
                    if (!string.IsNullOrWhiteSpace(cleanedText))
                    {
                        result += cleanedText;
                        
                        TranscriptionReceived?.Invoke(this, new TranscriptionEventArgs
                        {
                            Text = cleanedText,
                            StartTime = segment.Start,
                            EndTime = segment.End,
                            IsPartial = false
                        });
                    }
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

        /// <summary>
        /// 오디오 RMS 에너지가 최소 임계값 이상인지 확인
        /// </summary>
        private bool HasSufficientAudioEnergy(float[] audioData)
        {
            if (audioData.Length == 0) return false;

            double sumSquares = 0;
            foreach (var sample in audioData)
                sumSquares += sample * sample;

            var rms = Math.Sqrt(sumSquares / audioData.Length);
            return rms >= MinAudioRms;
        }

        /// <summary>
        /// 인식 텍스트 정리 (대괄호 제거, 할루시네이션 필터링)
        /// </summary>
        private string CleanTranscriptionText(string text)
        {
            if (string.IsNullOrWhiteSpace(text))
                return string.Empty;

            // 대괄호/소괄호 안의 내용 제거 ([음악], (박수) 등)
            var cleaned = System.Text.RegularExpressions.Regex.Replace(text, @"[\[\(].*?[\]\)]", "");

            // 연속된 공백을 하나로, 양쪽 공백 제거
            cleaned = System.Text.RegularExpressions.Regex.Replace(cleaned, @"\s+", " ").Trim();

            // 알려진 할루시네이션 문구와 정확히 일치하면 제거
            if (_hallucinationPhrases.Contains(cleaned))
                return string.Empty;

            // 구두점/특수문자만 남은 경우 제거
            if (System.Text.RegularExpressions.Regex.IsMatch(cleaned, @"^[\s\.\,\-\!\?\~\*]+$"))
                return string.Empty;

            return cleaned;
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
