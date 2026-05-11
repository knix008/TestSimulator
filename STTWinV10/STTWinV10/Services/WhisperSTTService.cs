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

                // Whisper 프로세서 생성
                var factory = WhisperFactory.FromPath(_modelPath);
                _processor = factory.CreateBuilder()
                    .WithLanguage("ko") // 한국어 설정
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

            await _processingLock.WaitAsync(cancellationToken);
            try
            {
                var result = "";
                await foreach (var segment in _processor.ProcessAsync(audioData, cancellationToken))
                {
                    // 텍스트 필터링 (대괄호 안 내용 제거)
                    var cleanedText = CleanTranscriptionText(segment.Text);
                    
                    if (!string.IsNullOrWhiteSpace(cleanedText))
                    {
                        result += cleanedText;
                        
                        // 세그먼트별로 이벤트 발생 (실시간 피드백)
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
        /// 인식 텍스트 정리 (대괄호 제거, 불필요한 공백 제거)
        /// </summary>
        private string CleanTranscriptionText(string text)
        {
            if (string.IsNullOrWhiteSpace(text))
                return string.Empty;

            // 대괄호와 그 안의 내용 제거
            var cleaned = System.Text.RegularExpressions.Regex.Replace(text, @"\[.*?\]", "");
            
            // 연속된 공백을 하나로
            cleaned = System.Text.RegularExpressions.Regex.Replace(cleaned, @"\s+", " ");
            
            // 양쪽 공백 제거
            cleaned = cleaned.Trim();
            
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
