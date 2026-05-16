using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

namespace VNCServer.VNCServer;

/// <summary>
/// H.264/H.265 비디오 인코더
/// 하드웨어 가속 지원 (Intel QSV, NVIDIA NVENC, AMD VCE)
/// </summary>
public class VideoEncoder : IDisposable
{
    private readonly VideoCodec _codec;
    private readonly VideoQuality _quality;
    private readonly int _width;
    private readonly int _height;
    private readonly int _frameRate;
    private bool _isInitialized;

    public enum VideoCodec
    {
        H264,   // AVC - 널리 지원
        H265,   // HEVC - 더 나은 압축, 느림
        VP8,    // Google WebM
        VP9     // WebM 차세대
    }

    public enum VideoQuality
    {
        Low = 28,       // CRF 28 - 작은 파일, 낮은 품질
        Medium = 23,    // CRF 23 - 균형
        High = 18,      // CRF 18 - 높은 품질
        VeryHigh = 14,  // CRF 14 - 매우 높은 품질
        Lossless = 0    // CRF 0 - 무손실
    }

    public event EventHandler<byte[]>? EncodedFrameAvailable;
    public event EventHandler<string>? EncodingError;

    public VideoEncoder(VideoCodec codec, VideoQuality quality, int width, int height, int frameRate = 30)
    {
        _codec = codec;
        _quality = quality;
        _width = width;
        _height = height;
        _frameRate = frameRate;
    }

    /// <summary>
    /// 인코더 초기화
    /// </summary>
    public void Initialize()
    {
        if (_isInitialized)
            return;

        try
        {
            // TODO: FFmpeg 또는 하드웨어 인코더 라이브러리 초기화
            // - Intel Media SDK (QSV)
            // - NVIDIA Video Codec SDK (NVENC)
            // - AMD Advanced Media Framework (VCE)
            
            _isInitialized = true;
            Console.WriteLine($"Video encoder initialized: {_codec}, {_quality}, {_width}x{_height}@{_frameRate}fps");
        }
        catch (Exception ex)
        {
            EncodingError?.Invoke(this, $"Failed to initialize encoder: {ex.Message}");
            throw;
        }
    }

    /// <summary>
    /// 비트맵을 인코딩
    /// </summary>
    public byte[] EncodeFrame(Bitmap frame)
    {
        if (!_isInitialized)
            Initialize();

        try
        {
            // 간단한 JPEG 폴백 (실제로는 H.264/H.265 인코딩)
            using var ms = new MemoryStream();
            
            // JPEG 인코더 파라미터
            var encoderParams = new EncoderParameters(1);
            var quality = (int)_quality;
            if (quality == 0) quality = 100; // Lossless는 JPEG로 불가능, 최고 품질 사용
            
            encoderParams.Param[0] = new EncoderParameter(
                System.Drawing.Imaging.Encoder.Quality, (long)quality);

            var jpegEncoder = GetEncoder(ImageFormat.Jpeg);
            if (jpegEncoder != null)
            {
                frame.Save(ms, jpegEncoder, encoderParams);
            }
            else
            {
                frame.Save(ms, ImageFormat.Jpeg);
            }

            var encoded = ms.ToArray();
            EncodedFrameAvailable?.Invoke(this, encoded);
            return encoded;
        }
        catch (Exception ex)
        {
            EncodingError?.Invoke(this, $"Encoding error: {ex.Message}");
            return Array.Empty<byte>();
        }
    }

    /// <summary>
    /// H.264 인코딩 (FFmpeg 사용)
    /// </summary>
    public byte[] EncodeFrameH264(Bitmap frame)
    {
        // TODO: FFmpeg 라이브러리 통합
        // - FFmpeg.AutoGen NuGet 패키지 사용
        // - libx264 코덱 사용
        // - 하드웨어 가속 (h264_qsv, h264_nvenc, h264_amf)
        
        throw new NotImplementedException("Requires FFmpeg.AutoGen");
    }

    /// <summary>
    /// H.265 인코딩 (FFmpeg 사용)
    /// </summary>
    public byte[] EncodeFrameH265(Bitmap frame)
    {
        // TODO: FFmpeg 라이브러리 통합
        // - libx265 코덱 사용
        // - 하드웨어 가속 (hevc_qsv, hevc_nvenc, hevc_amf)
        
        throw new NotImplementedException("Requires FFmpeg.AutoGen");
    }

    /// <summary>
    /// 하드웨어 인코더 사용 가능 여부 확인
    /// </summary>
    public static HardwareEncoderInfo GetAvailableEncoders()
    {
        var info = new HardwareEncoderInfo();

        try
        {
            // Intel Quick Sync Video 체크
            info.IntelQSVAvailable = CheckIntelQSV();
            
            // NVIDIA NVENC 체크
            info.NvidiaNVENCAvailable = CheckNvidiaNVENC();
            
            // AMD VCE 체크
            info.AMDVCEAvailable = CheckAMDVCE();
            
            // 소프트웨어 인코더는 항상 사용 가능
            info.SoftwareEncoderAvailable = true;
        }
        catch
        {
            // 에러 시 소프트웨어 인코더만 사용
        }

        return info;
    }

    private static bool CheckIntelQSV()
    {
        // Intel GPU 존재 확인
        // TODO: WMI 또는 DirectX API로 확인
        return false;
    }

    private static bool CheckNvidiaNVENC()
    {
        // NVIDIA GPU 존재 확인
        // TODO: CUDA API 또는 WMI로 확인
        return false;
    }

    private static bool CheckAMDVCE()
    {
        // AMD GPU 존재 확인
        // TODO: WMI로 확인
        return false;
    }

    private ImageCodecInfo? GetEncoder(ImageFormat format)
    {
        var codecs = ImageCodecInfo.GetImageEncoders();
        foreach (var codec in codecs)
        {
            if (codec.FormatID == format.Guid)
                return codec;
        }
        return null;
    }

    /// <summary>
    /// 프레임 레이트 기반 비트레이트 계산
    /// </summary>
    public int CalculateBitrate(VideoQuality quality)
    {
        // 해상도와 품질에 따른 비트레이트 (kbps)
        int pixelCount = _width * _height;
        
        return quality switch
        {
            VideoQuality.Low => pixelCount / 1000,           // ~1 Mbps for 1080p
            VideoQuality.Medium => pixelCount / 500,         // ~2 Mbps for 1080p
            VideoQuality.High => pixelCount / 250,           // ~4 Mbps for 1080p
            VideoQuality.VeryHigh => pixelCount / 125,       // ~8 Mbps for 1080p
            VideoQuality.Lossless => pixelCount / 50,        // ~20 Mbps for 1080p
            _ => pixelCount / 500
        };
    }

    /// <summary>
    /// GOP (Group of Pictures) 크기 설정
    /// </summary>
    public int GetGOPSize()
    {
        // GOP 크기 = 프레임레이트 * 2 (2초마다 I-프레임)
        return _frameRate * 2;
    }

    public void Dispose()
    {
        // TODO: 인코더 리소스 해제
    }
}

/// <summary>
/// 하드웨어 인코더 정보
/// </summary>
public class HardwareEncoderInfo
{
    public bool IntelQSVAvailable { get; set; }
    public bool NvidiaNVENCAvailable { get; set; }
    public bool AMDVCEAvailable { get; set; }
    public bool SoftwareEncoderAvailable { get; set; }

    public string GetPreferredEncoder()
    {
        if (NvidiaNVENCAvailable)
            return "NVIDIA NVENC (하드웨어 가속)";
        if (IntelQSVAvailable)
            return "Intel Quick Sync Video (하드웨어 가속)";
        if (AMDVCEAvailable)
            return "AMD VCE (하드웨어 가속)";
        return "Software x264 (소프트웨어)";
    }

    public override string ToString()
    {
        return $"Intel QSV: {IntelQSVAvailable}, " +
               $"NVIDIA NVENC: {NvidiaNVENCAvailable}, " +
               $"AMD VCE: {AMDVCEAvailable}, " +
               $"Software: {SoftwareEncoderAvailable}";
    }
}

/// <summary>
/// 비디오 스트림 관리자
/// </summary>
public class VideoStreamManager
{
    private readonly VideoEncoder _encoder;
    private readonly Queue<byte[]> _frameBuffer;
    private readonly int _bufferSize;
    private long _totalFramesEncoded;
    private long _totalBytesEncoded;

    public long TotalFramesEncoded => _totalFramesEncoded;
    public long TotalBytesEncoded => _totalBytesEncoded;
    public double AverageBitrate => _totalFramesEncoded > 0 
        ? (_totalBytesEncoded * 8.0) / (_totalFramesEncoded / _encoder.GetGOPSize()) / 1000.0 
        : 0;

    public VideoStreamManager(VideoEncoder encoder, int bufferSize = 30)
    {
        _encoder = encoder;
        _bufferSize = bufferSize;
        _frameBuffer = new Queue<byte[]>(bufferSize);
    }

    /// <summary>
    /// 프레임 추가
    /// </summary>
    public void AddFrame(byte[] encodedFrame)
    {
        lock (_frameBuffer)
        {
            if (_frameBuffer.Count >= _bufferSize)
            {
                _frameBuffer.Dequeue();
            }
            _frameBuffer.Enqueue(encodedFrame);
            
            _totalFramesEncoded++;
            _totalBytesEncoded += encodedFrame.Length;
        }
    }

    /// <summary>
    /// 최신 프레임 가져오기
    /// </summary>
    public byte[]? GetLatestFrame()
    {
        lock (_frameBuffer)
        {
            return _frameBuffer.Count > 0 ? _frameBuffer.Last() : null;
        }
    }

    /// <summary>
    /// 통계 정보
    /// </summary>
    public VideoStreamStats GetStats()
    {
        return new VideoStreamStats
        {
            TotalFrames = _totalFramesEncoded,
            TotalBytes = _totalBytesEncoded,
            AverageBitrate = AverageBitrate,
            BufferedFrames = _frameBuffer.Count
        };
    }
}

public class VideoStreamStats
{
    public long TotalFrames { get; set; }
    public long TotalBytes { get; set; }
    public double AverageBitrate { get; set; }
    public int BufferedFrames { get; set; }
}
