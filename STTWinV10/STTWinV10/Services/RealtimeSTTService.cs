using System;
using System.Threading;
using System.Threading.Tasks;

namespace STTWinV10.Services
{
    /// <summary>
    /// 실시간 STT 처리 파이프라인
    /// </summary>
    public class RealtimeSTTService : IDisposable
    {
        private readonly AudioCaptureService _audioCaptureService;
        private readonly WhisperSTTService _whisperService;
        private readonly Timer _processingTimer;
        private readonly double _processingIntervalSeconds;
        private bool _isRunning;
        private bool _isProcessing;

        /// <summary>주기 처리 시 최소 오디오 길이(샘플). 16kHz 기준 8000 = 0.5초.</summary>
        public int MinSamplesForPeriodicDecode { get; set; } = 8000;

        public event EventHandler<string>? TranscriptionReceived;
        public event EventHandler<string>? StatusChanged;
        public event EventHandler<string>? ErrorOccurred;
        public event EventHandler<float>? AudioLevelChanged;

        public bool IsRunning => _isRunning;

        /// <summary>
        /// 실시간 STT 서비스 생성자
        /// </summary>
        /// <param name="whisperService">Whisper STT 서비스</param>
        /// <param name="processingIntervalSeconds">처리 간격 (초)</param>
        public RealtimeSTTService(WhisperSTTService whisperService, double processingIntervalSeconds = 3.0)
        {
            _whisperService = whisperService;
            _audioCaptureService = new AudioCaptureService(sampleRate: 16000, channels: 1);
            _processingIntervalSeconds = processingIntervalSeconds;
            
            // 타이머 설정 (처리 간격마다 오디오 처리)
            _processingTimer = new Timer(ProcessAudioCallback, null, Timeout.Infinite, Timeout.Infinite);

            // 이벤트 연결
            _audioCaptureService.ErrorOccurred += (s, e) => ErrorOccurred?.Invoke(this, e);
            _audioCaptureService.AudioLevelChanged += (s, level) => AudioLevelChanged?.Invoke(this, level);
            _whisperService.ErrorOccurred += (s, e) => ErrorOccurred?.Invoke(this, e);
            _whisperService.TranscriptionReceived += (s, e) => TranscriptionReceived?.Invoke(this, e.Text);
        }

        /// <summary>
        /// 마이크 장치 설정
        /// </summary>
        public void SetMicrophoneDevice(int deviceNumber)
        {
            if (_isRunning)
            {
                StatusChanged?.Invoke(this, "실행 중에는 마이크를 변경할 수 없습니다.");
                return;
            }

            _audioCaptureService.DeviceNumber = deviceNumber;
        }

        /// <summary>
        /// 마이크 볼륨 설정 (0.0 ~ 2.0)
        /// </summary>
        public void SetMicrophoneVolume(float volume)
        {
            _audioCaptureService.VolumeGain = volume;
        }

        /// <summary>
        /// 실시간 STT 시작
        /// </summary>
        public async Task StartAsync()
        {
            if (_isRunning)
                return;

            try
            {
                StatusChanged?.Invoke(this, "초기화 중...");

                // Whisper 모델 초기화
                if (!_whisperService.IsInitialized)
                {
                    await _whisperService.InitializeAsync();
                }

                // 오디오 캡처 시작
                _audioCaptureService.StartCapture();

                // 처리 타이머 시작
                var intervalMs = (int)(_processingIntervalSeconds * 1000);
                _processingTimer.Change(intervalMs, intervalMs);

                _isRunning = true;
                StatusChanged?.Invoke(this, "실시간 STT 실행 중...");
            }
            catch (Exception ex)
            {
                ErrorOccurred?.Invoke(this, $"STT 시작 실패: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// 실시간 STT 중지
        /// </summary>
        public void Stop()
        {
            if (!_isRunning)
                return;

            try
            {
                // 타이머 중지
                _processingTimer.Change(Timeout.Infinite, Timeout.Infinite);

                // 오디오 캡처 중지
                _audioCaptureService.StopCapture();

                _isRunning = false;
                StatusChanged?.Invoke(this, "중지됨");
            }
            catch (Exception ex)
            {
                ErrorOccurred?.Invoke(this, $"STT 중지 실패: {ex.Message}");
            }
        }

        /// <summary>
        /// 주기적으로 호출되어 버퍼된 오디오를 처리
        /// </summary>
        private async void ProcessAudioCallback(object? state)
        {
            if (_isProcessing || !_isRunning)
                return;

            _isProcessing = true;

            try
            {
                // 버퍼된 오디오 데이터 가져오기
                var audioData = _audioCaptureService.GetAndClearBuffer();

                // 최소 오디오 길이 (16kHz 기준 약 0.5초)
                if (audioData.Length < MinSamplesForPeriodicDecode)
                {
                    return;
                }

                StatusChanged?.Invoke(this, $"처리 중... ({audioData.Length / 16000.0:F1}초)");

                // Whisper로 음성 인식 수행
                var transcription = await _whisperService.TranscribeAsync(audioData);

                // 결과가 있으면 이벤트 발생
                if (!string.IsNullOrWhiteSpace(transcription))
                {
                    StatusChanged?.Invoke(this, "인식 완료");
                }
            }
            catch (Exception ex)
            {
                ErrorOccurred?.Invoke(this, $"오디오 처리 오류: {ex.Message}");
            }
            finally
            {
                _isProcessing = false;
            }
        }

        /// <summary>
        /// 수동으로 현재 버퍼 처리
        /// </summary>
        public async Task ProcessCurrentBufferAsync()
        {
            if (_isProcessing)
            {
                StatusChanged?.Invoke(this, "이미 처리 중입니다...");
                return;
            }

            _isProcessing = true;

            try
            {
                var audioData = _audioCaptureService.GetAndClearBuffer();

                if (audioData.Length == 0)
                {
                    StatusChanged?.Invoke(this, "처리할 오디오가 없습니다.");
                    return;
                }

                StatusChanged?.Invoke(this, $"처리 중... ({audioData.Length / 16000.0:F1}초)");
                
                var transcription = await _whisperService.TranscribeAsync(audioData);

                if (!string.IsNullOrWhiteSpace(transcription))
                {
                    StatusChanged?.Invoke(this, "인식 완료");
                }
                else
                {
                    StatusChanged?.Invoke(this, "음성이 감지되지 않았습니다.");
                }
            }
            catch (Exception ex)
            {
                ErrorOccurred?.Invoke(this, $"오디오 처리 오류: {ex.Message}");
            }
            finally
            {
                _isProcessing = false;
            }
        }

        public void Dispose()
        {
            Stop();
            _processingTimer?.Dispose();
            _audioCaptureService?.Dispose();
            _whisperService?.Dispose();
        }
    }
}
