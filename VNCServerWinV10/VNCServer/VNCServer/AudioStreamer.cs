using System.Runtime.InteropServices;

namespace VNCServer.VNCServer;

/// <summary>
/// 오디오 캡처 및 스트리밍 기능
/// Windows WASAPI를 사용한 오디오 캡처
/// </summary>
public class AudioStreamer : IDisposable
{
    private Thread? _captureThread;
    private bool _isCapturing;
    private readonly int _sampleRate;
    private readonly int _channels;
    private readonly int _bitsPerSample;
    private byte[] _audioBuffer = new byte[4096];

    public event EventHandler<AudioDataEventArgs>? AudioDataAvailable;
    public event EventHandler<string>? AudioError;

    public class AudioDataEventArgs : EventArgs
    {
        public byte[] Data { get; set; } = Array.Empty<byte>();
        public int SampleRate { get; set; }
        public int Channels { get; set; }
        public int BytesRecorded { get; set; }
    }

    public bool IsCapturing => _isCapturing;
    public int SampleRate => _sampleRate;
    public int Channels => _channels;
    public int BitsPerSample => _bitsPerSample;

    public AudioStreamer(int sampleRate = 44100, int channels = 2, int bitsPerSample = 16)
    {
        _sampleRate = sampleRate;
        _channels = channels;
        _bitsPerSample = bitsPerSample;
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
            _isCapturing = true;
            _captureThread = new Thread(CaptureLoop)
            {
                IsBackground = true,
                Name = "AudioCaptureThread",
                Priority = ThreadPriority.Highest // 오디오는 높은 우선순위
            };
            _captureThread.Start();

            Console.WriteLine($"Audio capture started: {_sampleRate}Hz, {_channels}ch, {_bitsPerSample}bit");
        }
        catch (Exception ex)
        {
            _isCapturing = false;
            AudioError?.Invoke(this, $"Failed to start audio capture: {ex.Message}");
            throw;
        }
    }

    /// <summary>
    /// 오디오 캡처 중지
    /// </summary>
    public void StopCapture()
    {
        if (!_isCapturing)
            return;

        _isCapturing = false;
        _captureThread?.Join(2000);
        Console.WriteLine("Audio capture stopped");
    }

    private void CaptureLoop()
    {
        // Windows WASAPI를 사용한 오디오 캡처
        // 실제 구현에는 NAudio 또는 Windows Core Audio API 필요
        
        try
        {
            // 샘플 데이터 생성 (실제로는 시스템 오디오 캡처)
            var samplesPerBuffer = _sampleRate / 10; // 100ms 버퍼
            var bytesPerBuffer = samplesPerBuffer * _channels * (_bitsPerSample / 8);
            _audioBuffer = new byte[bytesPerBuffer];

            while (_isCapturing)
            {
                try
                {
                    // TODO: 실제 오디오 캡처 구현
                    // 현재는 무음 데이터 전송
                    Array.Clear(_audioBuffer, 0, _audioBuffer.Length);
                    
                    // 오디오 데이터 이벤트 발생
                    AudioDataAvailable?.Invoke(this, new AudioDataEventArgs
                    {
                        Data = _audioBuffer,
                        SampleRate = _sampleRate,
                        Channels = _channels,
                        BytesRecorded = _audioBuffer.Length
                    });

                    // 100ms 대기 (10fps)
                    Thread.Sleep(100);
                }
                catch (Exception ex)
                {
                    System.Diagnostics.Debug.WriteLine($"Audio capture error: {ex.Message}");
                }
            }
        }
        catch (Exception ex)
        {
            AudioError?.Invoke(this, $"Audio capture loop error: {ex.Message}");
        }
    }

    /// <summary>
    /// WAV 헤더 생성
    /// </summary>
    public static byte[] CreateWavHeader(int sampleRate, int channels, int bitsPerSample, int dataLength)
    {
        var header = new byte[44];
        var blockAlign = channels * (bitsPerSample / 8);
        var byteRate = sampleRate * blockAlign;

        // RIFF 헤더
        Array.Copy(System.Text.Encoding.ASCII.GetBytes("RIFF"), 0, header, 0, 4);
        Array.Copy(BitConverter.GetBytes(dataLength + 36), 0, header, 4, 4);
        Array.Copy(System.Text.Encoding.ASCII.GetBytes("WAVE"), 0, header, 8, 4);

        // fmt 청크
        Array.Copy(System.Text.Encoding.ASCII.GetBytes("fmt "), 0, header, 12, 4);
        Array.Copy(BitConverter.GetBytes(16), 0, header, 16, 4); // fmt 청크 크기
        Array.Copy(BitConverter.GetBytes((short)1), 0, header, 20, 2); // 오디오 포맷 (PCM)
        Array.Copy(BitConverter.GetBytes((short)channels), 0, header, 22, 2);
        Array.Copy(BitConverter.GetBytes(sampleRate), 0, header, 24, 4);
        Array.Copy(BitConverter.GetBytes(byteRate), 0, header, 28, 4);
        Array.Copy(BitConverter.GetBytes((short)blockAlign), 0, header, 32, 2);
        Array.Copy(BitConverter.GetBytes((short)bitsPerSample), 0, header, 34, 2);

        // data 청크
        Array.Copy(System.Text.Encoding.ASCII.GetBytes("data"), 0, header, 36, 4);
        Array.Copy(BitConverter.GetBytes(dataLength), 0, header, 40, 4);

        return header;
    }

    /// <summary>
    /// 오디오 데이터 압축 (간단한 ADPCM)
    /// </summary>
    public static byte[] CompressAudio(byte[] pcmData, int channels)
    {
        // 간단한 차분 압축
        var compressed = new List<byte>();
        short prevSample = 0;

        for (int i = 0; i < pcmData.Length; i += 2)
        {
            if (i + 1 >= pcmData.Length)
                break;

            short sample = BitConverter.ToInt16(pcmData, i);
            short diff = (short)(sample - prevSample);
            
            // 차이값을 8비트로 양자화
            sbyte quantized = (sbyte)(diff / 256);
            compressed.Add((byte)quantized);

            prevSample = sample;
        }

        return compressed.ToArray();
    }

    /// <summary>
    /// 압축된 오디오 데이터 복원
    /// </summary>
    public static byte[] DecompressAudio(byte[] compressedData, int channels)
    {
        var decompressed = new List<byte>();
        short prevSample = 0;

        foreach (byte b in compressedData)
        {
            sbyte quantized = (sbyte)b;
            short diff = (short)(quantized * 256);
            short sample = (short)(prevSample + diff);

            decompressed.AddRange(BitConverter.GetBytes(sample));
            prevSample = sample;
        }

        return decompressed.ToArray();
    }

    /// <summary>
    /// 오디오 볼륨 조절
    /// </summary>
    public static byte[] AdjustVolume(byte[] pcmData, float volumeMultiplier)
    {
        var adjusted = new byte[pcmData.Length];

        for (int i = 0; i < pcmData.Length; i += 2)
        {
            if (i + 1 >= pcmData.Length)
                break;

            short sample = BitConverter.ToInt16(pcmData, i);
            sample = (short)(sample * volumeMultiplier);
            
            // 클리핑 방지
            sample = Math.Max((short)-32768, Math.Min((short)32767, sample));

            Array.Copy(BitConverter.GetBytes(sample), 0, adjusted, i, 2);
        }

        return adjusted;
    }

    /// <summary>
    /// 스테레오를 모노로 변환
    /// </summary>
    public static byte[] StereoToMono(byte[] stereoData)
    {
        var monoData = new byte[stereoData.Length / 2];

        for (int i = 0, j = 0; i < stereoData.Length; i += 4, j += 2)
        {
            if (i + 3 >= stereoData.Length)
                break;

            short left = BitConverter.ToInt16(stereoData, i);
            short right = BitConverter.ToInt16(stereoData, i + 2);
            short mono = (short)((left + right) / 2);

            Array.Copy(BitConverter.GetBytes(mono), 0, monoData, j, 2);
        }

        return monoData;
    }

    /// <summary>
    /// 샘플레이트 다운샘플링 (예: 44100Hz -> 22050Hz)
    /// </summary>
    public static byte[] Downsample(byte[] pcmData, int factor)
    {
        var downsampled = new List<byte>();

        for (int i = 0; i < pcmData.Length; i += factor * 2)
        {
            if (i + 1 < pcmData.Length)
            {
                downsampled.Add(pcmData[i]);
                downsampled.Add(pcmData[i + 1]);
            }
        }

        return downsampled.ToArray();
    }

    public void Dispose()
    {
        StopCapture();
    }
}

/// <summary>
/// WASAPI를 통한 실제 Windows 오디오 캡처 (고급)
/// </summary>
public class WASAPIAudioCapture
{
    // Windows Core Audio API COM 인터페이스
    // 실제 구현에는 NAudio 라이브러리 또는 P/Invoke 필요

    [ComImport]
    [Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
    private class MMDeviceEnumerator { }

    private const int AUDCLNT_STREAMFLAGS_LOOPBACK = 0x00020000;

    /// <summary>
    /// 시스템 오디오 출력 캡처 (스피커로 나가는 소리)
    /// </summary>
    public static void CaptureSystemAudio()
    {
        // TODO: WASAPI 구현
        // 1. MMDeviceEnumerator로 기본 출력 장치 가져오기
        // 2. IAudioClient 초기화 (LOOPBACK 모드)
        // 3. IAudioCaptureClient로 오디오 버퍼 읽기
        // 4. 오디오 데이터 스트리밍

        throw new NotImplementedException("Requires NAudio or Windows Core Audio API");
    }

    /// <summary>
    /// 마이크 입력 캡처
    /// </summary>
    public static void CaptureMicrophoneAudio()
    {
        // TODO: WASAPI 구현
        // 1. MMDeviceEnumerator로 기본 입력 장치 가져오기
        // 2. IAudioClient 초기화
        // 3. IAudioCaptureClient로 오디오 버퍼 읽기
        // 4. 오디오 데이터 스트리밍

        throw new NotImplementedException("Requires NAudio or Windows Core Audio API");
    }
}
