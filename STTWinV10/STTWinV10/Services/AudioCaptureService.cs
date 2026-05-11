using NAudio.Wave;
using System;
using System.Collections.Generic;
using System.Linq;

namespace STTWinV10.Services
{
    /// <summary>
    /// 실시간 오디오 캡처 서비스
    /// </summary>
    public class AudioCaptureService : IDisposable
    {
        private WaveInEvent? _waveIn;
        private readonly int _sampleRate;
        private readonly int _channels;
        private readonly List<float> _audioBuffer;
        private readonly object _bufferLock = new();
        private bool _isCapturing;

        public event EventHandler<AudioDataEventArgs>? AudioDataAvailable;
        public event EventHandler<string>? ErrorOccurred;

        public bool IsCapturing => _isCapturing;

        public AudioCaptureService(int sampleRate = 16000, int channels = 1)
        {
            _sampleRate = sampleRate;
            _channels = channels;
            _audioBuffer = new List<float>();
        }

        /// <summary>
        /// 오디오 캡처 시작
        /// </summary>
        public void StartCapture()
        {
            if (_isCapturing)
                return;

            try
            {
                _waveIn = new WaveInEvent
                {
                    WaveFormat = new WaveFormat(_sampleRate, 16, _channels),
                    BufferMilliseconds = 100
                };

                _waveIn.DataAvailable += OnDataAvailable;
                _waveIn.RecordingStopped += OnRecordingStopped;

                _waveIn.StartRecording();
                _isCapturing = true;
            }
            catch (Exception ex)
            {
                ErrorOccurred?.Invoke(this, $"오디오 캡처 시작 실패: {ex.Message}");
            }
        }

        /// <summary>
        /// 오디오 캡처 중지
        /// </summary>
        public void StopCapture()
        {
            if (!_isCapturing)
                return;

            try
            {
                _waveIn?.StopRecording();
                _isCapturing = false;
            }
            catch (Exception ex)
            {
                ErrorOccurred?.Invoke(this, $"오디오 캡처 중지 실패: {ex.Message}");
            }
        }

        /// <summary>
        /// 버퍼된 오디오 데이터 가져오기 및 버퍼 클리어
        /// </summary>
        public float[] GetAndClearBuffer()
        {
            lock (_bufferLock)
            {
                var data = _audioBuffer.ToArray();
                _audioBuffer.Clear();
                return data;
            }
        }

        /// <summary>
        /// 현재 버퍼 크기 (초 단위)
        /// </summary>
        public double GetBufferDurationSeconds()
        {
            lock (_bufferLock)
            {
                return (double)_audioBuffer.Count / _sampleRate;
            }
        }

        private void OnDataAvailable(object? sender, WaveInEventArgs e)
        {
            try
            {
                // 16-bit PCM을 float로 변환
                var floatData = ConvertBytesToFloat(e.Buffer, e.BytesRecorded);

                lock (_bufferLock)
                {
                    _audioBuffer.AddRange(floatData);
                }

                AudioDataAvailable?.Invoke(this, new AudioDataEventArgs(floatData));
            }
            catch (Exception ex)
            {
                ErrorOccurred?.Invoke(this, $"오디오 데이터 처리 오류: {ex.Message}");
            }
        }

        private void OnRecordingStopped(object? sender, StoppedEventArgs e)
        {
            if (e.Exception != null)
            {
                ErrorOccurred?.Invoke(this, $"녹음 중지됨: {e.Exception.Message}");
            }
            _isCapturing = false;
        }

        private float[] ConvertBytesToFloat(byte[] buffer, int bytesRecorded)
        {
            var sampleCount = bytesRecorded / 2; // 16-bit = 2 bytes per sample
            var floatBuffer = new float[sampleCount];

            for (int i = 0; i < sampleCount; i++)
            {
                short sample = BitConverter.ToInt16(buffer, i * 2);
                floatBuffer[i] = sample / 32768f; // Normalize to [-1, 1]
            }

            return floatBuffer;
        }

        public void Dispose()
        {
            StopCapture();
            if (_waveIn != null)
            {
                _waveIn.DataAvailable -= OnDataAvailable;
                _waveIn.RecordingStopped -= OnRecordingStopped;
                _waveIn.Dispose();
                _waveIn = null;
            }
            _audioBuffer.Clear();
        }
    }

    public class AudioDataEventArgs : EventArgs
    {
        public float[] AudioData { get; }

        public AudioDataEventArgs(float[] audioData)
        {
            AudioData = audioData;
        }
    }
}
